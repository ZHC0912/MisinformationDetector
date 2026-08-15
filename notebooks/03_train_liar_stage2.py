"""
=============================================================
STEP 3 — STAGE-2 FINE-TUNE ON LIAR (influential-source adaptation)
File: notebooks/03_train_liar_stage2.py

Pipeline: 01_clean_isot → 02_train_isot → 03_train_liar_stage2 → 04_build_eval_data

Run AFTER 02_train_isot.py. Loads the ISOT-trained model from backend/model
and continues fine-tuning on LIAR train.tsv — short fact-checked statements
by politicians and public figures. After this stage the model has been
trained on influential-source content directly, not just news articles.

Upgrades over the first stage-2 run (2026-07-11):
  1. SPEAKER METADATA — statements are formatted as
       "Barack Obama (Democrat, President) said: <statement>"
     via _liar_meta.format_statement(). The LIAR paper (Wang, 2017) showed
     metadata adds several points, and it directly backs the project's
     "influential sources" claim: the model conditions on WHO said it.
     04_build_eval_data.py uses the same formatter, so train and benchmark
     input formats always match. Plain text (no speaker) still works —
     the prefix is simply absent, as it is for every ISOT article.
  1b. EVIDENCE / JUSTIFICATION (LIAR-PLUS, 2026-07-28) — when USE_JUSTIFICATION
     is on and the LIAR-PLUS tsvs (train2/val2/test2.tsv) are present, each
     statement gets an "Evidence: <justification>" clause appended, e.g.
       "<Speaker> (<party>, <job>) said: <statement> Evidence: <passage>"
     LIAR-PLUS (Alhindi et al., 2018) supplies a short evidence passage per
     claim, extracted from the PolitiFact article with the ruling sentence
     stripped. Published statement+justification models beat statement-only
     by several points. 04_build_eval_data.py appends the SAME clause so the
     benchmark matches. If the LIAR-PLUS files are absent, the loader returns
     empty justifications and the format silently falls back to metadata-only.
     NOTE: the justification is retrieved evidence — this measures the
     evidence-augmented task, distinct from the claim-only task a bare
     user-typed statement represents (report the two separately).
  2. LEARNING-RATE SWEEP — trains once per LR in LEARNING_RATES, up to
     NUM_EPOCHS epochs with per-epoch eval + load_best_model_at_end
     (covers epoch selection), keeps the run with the best valid macro-F1.
  3. DECISION-THRESHOLD TUNING — sweeps P(misleading) cutoffs on the
     VALIDATION set and saves the macro-F1-maximising threshold to
     decision_threshold.json in the model dir. backend/textanalysis.py
     loads it at startup (falls back to config.MISLEADING_THRESHOLD=0.5).

Label mapping (6-class → binary, same as 04_build_eval_data.py):
  misleading (1): pants-fire, false, barely-true
  reliable   (0): mostly-true, true
  excluded:       half-true  (too ambiguous for binary classification)

Honesty rules baked in:
  - Trains on train.tsv only; valid.tsv is used for epoch selection,
    LR selection AND threshold tuning. test.tsv is NEVER touched here —
    it stays the held-out benchmark scored by backend/evaluation.py.
  - Duplicate/leakage fingerprints are computed on the RAW statement
    (before the metadata prefix), so the guards are unaffected by format.
  - After training, the best model is re-scored on the ISOT held-out test
    split (saved by 02_train_isot.py) to measure catastrophic forgetting.

Output:
  - Model saved to backend/model_v2  (stage-1 model in backend/model is kept).
    To deploy: replace the contents of backend/model with backend/model_v2.
  - Metrics saved to backend/model_v2/stage2_metrics.json
  - Tuned cutoff saved to backend/model_v2/decision_threshold.json

Runtime note: 3 LRs x up to 5 epochs ≈ 45–75 min on a GTX 1650.
Trim LEARNING_RATES to [1e-5] for a single ~15-min run.
=============================================================
"""

import csv
import gc
import json
import os
import re
import shutil

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from torch.utils.data import Dataset
from transformers import (
    DistilBertTokenizerFast,
    DistilBertForSequenceClassification,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)

from _liar_meta import format_statement, row_fields, load_justification_map

# ── Config ────────────────────────────────────────────────────────────────────
STAGE1_PATH    = "../backend/model"          # ISOT-trained model from 02_train_isot.py
SAVE_PATH      = "../backend/model_v2"       # stage-2 output (stage-1 left intact)
LIAR_TRAIN     = "../LIAR_Dataset/train.tsv"
LIAR_VALID     = "../LIAR_Dataset/valid.tsv"
LIAR_TEST      = "../LIAR_Dataset/test.tsv"  # NOT trained on — read only to exclude
                                             # the ~5 statements that also sit in train.tsv
ISOT_TEST_CSV  = "../ISOT_Dataset/isot_test_split.csv"   # saved by 02_train_isot.py

# LIAR-PLUS evidence passages (Alhindi et al., 2018). Same rows as plain LIAR,
# joined by statement id. Absent files → empty map → metadata-only fallback.
#
# Default OFF: the 2026-07-29 experiment (backend/liar_test_metrics_v2.json)
# found evidence augmentation only helps WHEN the evidence is supplied at
# inference. The live app receives bare user-typed claims (no evidence), where
# the evidence-trained model is actually WEAKER (LIAR test macro-F1 0.642 vs the
# metadata-only 0.655). So the DEPLOYED model stays metadata-only. Flip to True
# ONLY to reproduce the evidence-augmented experiment (keep 04's flag in sync).
USE_JUSTIFICATION = False
LIAR_PLUS_TRAIN   = "../LIAR_Dataset/train2.tsv"
LIAR_PLUS_VALID   = "../LIAR_Dataset/val2.tsv"
LIAR_PLUS_TEST    = "../LIAR_Dataset/test2.tsv"

MAX_LENGTH     = 256       # justification passages median ~67 words → 128 truncates
                           # them; dynamic padding keeps most batches ~120 tokens
NUM_EPOCHS     = 5         # per-epoch eval + early stopping = epoch selection
EARLY_STOP_PATIENCE = 2    # stop when valid macro-F1 stalls (LIAR overfits fast)
BATCH_SIZE     = 8         # seq 256 + 4 GB VRAM → batch 8 (dynamic padding pads per
                           # batch, so effective length is usually far below 256)
LEARNING_RATES = [5e-6, 1e-5, 2e-5]   # sweep; best run picked by valid macro-F1
MIN_LEN        = 30        # min statement characters (same as 04_build_eval_data.py)
SEED           = 42
SWEEP_BEST_DIR = "./stage2_sweep_best"        # best-so-far checkpoint during the sweep
THRESHOLD_GRID = np.arange(0.05, 0.951, 0.01) # cutoffs swept on the valid set

MISLEADING_LABELS = {"pants-fire", "false", "barely-true"}
RELIABLE_LABELS   = {"mostly-true", "true"}
# half-true is intentionally excluded

# ── Guards: required inputs must exist ────────────────────────────────────────
if not os.path.exists(os.path.join(STAGE1_PATH, "model.safetensors")):
    raise FileNotFoundError(
        f"No stage-1 model found at {STAGE1_PATH}. Run 02_train_isot.py first."
    )
if not os.path.exists(ISOT_TEST_CSV):
    raise FileNotFoundError(
        f"{ISOT_TEST_CSV} not found. Re-run 02_train_isot.py (it saves the test split)."
    )

os.makedirs(SAVE_PATH, exist_ok=True)

# ── Load LIAR ─────────────────────────────────────────────────────────────────
def clean_text(text):
    if not isinstance(text, str):
        return ""
    try:
        text = text.encode("latin-1").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        pass
    text = re.sub(r"http\S+|www\S+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _norm(text):
    """Normalised fingerprint for duplicate/leakage detection."""
    s = re.sub(r"[^a-z0-9 ]", "", text.lower())
    return re.sub(r"\s+", " ", s).strip()


def load_liar_binary(path, exclude=None, justmap=None):
    """Read a LIAR tsv → (texts, labels) with the 6→2 class mapping.

    Texts are metadata-formatted ("<Speaker> (<party>, <job>) said: ...") and,
    when `justmap` (id → justification, from load_justification_map) is given,
    carry an "Evidence: <justification>" clause. Duplicate/leakage fingerprints
    use the RAW statement so neither the metadata prefix nor the evidence clause
    can mask a duplicate. Skips statements whose fingerprint is in `exclude`
    (test-set leakage guard) and dedups within the file.
    """
    justmap = justmap or {}
    texts, labels, seen = [], [], set()
    with open(path, encoding="utf-8") as f:
        for row in csv.reader(f, delimiter="\t"):
            if len(row) < 3:
                continue
            fields    = row_fields(row)
            statement = clean_text(fields["statement"])
            if len(statement) < MIN_LEN:
                continue
            key = _norm(statement)
            if key in seen or (exclude and key in exclude):
                continue
            if fields["label"] in MISLEADING_LABELS:
                label = 1
            elif fields["label"] in RELIABLE_LABELS:
                label = 0
            else:
                continue   # half-true and anything else: skipped
            justification = clean_text(justmap.get(fields["id"], ""))
            texts.append(format_statement(
                statement, fields["speaker"], fields["job"], fields["party"],
                justification=justification,
            ))
            labels.append(label)
            seen.add(key)
    return texts, labels


print("Loading LIAR dataset (with speaker metadata)...")

# LIAR-PLUS justification maps (id → evidence passage). Empty if files absent or
# USE_JUSTIFICATION is off, in which case format_statement falls back to metadata.
if USE_JUSTIFICATION:
    train_just = load_justification_map(LIAR_PLUS_TRAIN)
    valid_just = load_justification_map(LIAR_PLUS_VALID)
    if train_just:
        print(f"LIAR-PLUS justifications: {len(train_just)} train, {len(valid_just)} valid")
    else:
        print("LIAR-PLUS files not found — training on metadata-only (no evidence).")
else:
    train_just, valid_just = {}, {}

# Audit (2026-06-13) found 5 test + 7 valid statements duplicated in train.tsv —
# exclude the test set's fingerprints from training data so the benchmark stays clean.
_test_keys = set()
with open(LIAR_TEST, encoding="utf-8") as f:
    for row in csv.reader(f, delimiter="\t"):
        if len(row) >= 3:
            _test_keys.add(_norm(clean_text(row[2])))

train_texts, train_labels = load_liar_binary(LIAR_TRAIN, exclude=_test_keys, justmap=train_just)
val_texts,   val_labels   = load_liar_binary(LIAR_VALID, exclude=_test_keys, justmap=valid_just)
n_mis = sum(train_labels)
print(f"LIAR train: {len(train_texts)} statements "
      f"({n_mis} misleading / {len(train_labels) - n_mis} reliable)")
print(f"LIAR valid: {len(val_texts)} statements")
print(f"Sample input: {train_texts[0][:120]}...")

# ── Load ISOT held-out test split (forgetting check) ─────────────────────────
isot_test = pd.read_csv(ISOT_TEST_CSV)
isot_texts  = isot_test["text"].fillna("").tolist()
isot_labels = isot_test["label"].tolist()
print(f"ISOT held-out test: {len(isot_texts)} articles")

# ── Tokenise ──────────────────────────────────────────────────────────────────
print(f"Loading tokenizer from: {STAGE1_PATH}")
tokenizer = DistilBertTokenizerFast.from_pretrained(STAGE1_PATH)

# padding=False → variable-length encodings; the DataCollatorWithPadding below
# pads each batch to its own longest member (usually well under MAX_LENGTH), so
# adding justifications doesn't blow up compute on the GTX 1650.
train_encodings     = tokenizer(train_texts, truncation=True, padding=False, max_length=MAX_LENGTH)
val_encodings       = tokenizer(val_texts,   truncation=True, padding=False, max_length=MAX_LENGTH)
isot_test_encodings = tokenizer(isot_texts,  truncation=True, padding=False, max_length=256)

data_collator = DataCollatorWithPadding(tokenizer=tokenizer)


class StatementDataset(Dataset):
    def __init__(self, encodings, labels):
        self.encodings = encodings
        self.labels    = labels

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        item = {key: val[idx] for key, val in self.encodings.items()}  # lists; collator pads
        item["labels"] = self.labels[idx]
        return item


train_dataset     = StatementDataset(train_encodings,     train_labels)
val_dataset       = StatementDataset(val_encodings,       val_labels)
isot_test_dataset = StatementDataset(isot_test_encodings, isot_labels)

# ── Metrics ───────────────────────────────────────────────────────────────────
def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions    = np.argmax(logits, axis=-1)
    # macro averaging — matches 02_train_isot.py and backend/evaluation.py
    return {
        "accuracy":  accuracy_score(labels, predictions),
        "f1":        f1_score(labels, predictions, average="macro"),
        "precision": precision_score(labels, predictions, average="macro", zero_division=0),
        "recall":    recall_score(labels, predictions, average="macro", zero_division=0),
    }


def make_args(lr, output_dir):
    return TrainingArguments(
        output_dir          = output_dir,
        num_train_epochs    = NUM_EPOCHS,
        learning_rate       = lr,
        per_device_train_batch_size = BATCH_SIZE,
        per_device_eval_batch_size  = BATCH_SIZE,
        warmup_steps        = 10,
        weight_decay        = 0.01,
        logging_dir         = "./logs_stage2",
        logging_steps       = 50,
        eval_strategy       = "epoch",
        save_strategy       = "epoch",
        save_total_limit    = 1,       # keep disk usage down; best ckpt is preserved
        load_best_model_at_end = True,
        metric_for_best_model  = "f1",
        fp16                = True,
        report_to           = "none",
        seed                = SEED,
    )


def free_gpu(*objs):
    for o in objs:
        del o
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


# ── Baseline: score the stage-1 model BEFORE stage-2 training ────────────────
# (Evaluated on the SAME metadata-formatted valid set the sweep uses, so the
#  before/after comparison is apples-to-apples.)
baseline_model   = DistilBertForSequenceClassification.from_pretrained(STAGE1_PATH)
baseline_trainer = Trainer(
    model           = baseline_model,
    args            = make_args(1e-5, "./training_output_stage2_baseline"),
    eval_dataset    = val_dataset,
    data_collator   = data_collator,
    compute_metrics = compute_metrics,
)

print("\n=== Baseline: stage-1 (ISOT-only) model on LIAR valid ===")
baseline_liar = baseline_trainer.evaluate(metric_key_prefix="baseline_liar")
for k, v in baseline_liar.items():
    print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

print("\n=== Baseline: stage-1 model on ISOT held-out test ===")
baseline_isot = baseline_trainer.evaluate(eval_dataset=isot_test_dataset, metric_key_prefix="baseline_isot")
for k, v in baseline_isot.items():
    print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

free_gpu(baseline_model, baseline_trainer)

# ── Stage-2 learning-rate sweep ───────────────────────────────────────────────
if os.path.exists(SWEEP_BEST_DIR):
    shutil.rmtree(SWEEP_BEST_DIR)

sweep_results = []   # [{lr, f1, accuracy, ...}]
best_f1, best_lr = -1.0, None

for lr in LEARNING_RATES:
    print(f"\n=== Stage-2 run: LR={lr:g}  (up to {NUM_EPOCHS} epochs, best epoch kept) ===")
    model   = DistilBertForSequenceClassification.from_pretrained(STAGE1_PATH)
    trainer = Trainer(
        model           = model,
        args            = make_args(lr, f"./training_output_stage2_lr{lr:g}"),
        train_dataset   = train_dataset,
        eval_dataset    = val_dataset,
        data_collator   = data_collator,
        compute_metrics = compute_metrics,
        callbacks       = [EarlyStoppingCallback(early_stopping_patience=EARLY_STOP_PATIENCE)],
    )
    trainer.train()
    run_metrics = trainer.evaluate(metric_key_prefix="valid")
    run_f1 = run_metrics.get("valid_f1", 0.0)
    sweep_results.append({
        "lr":       lr,
        "valid_f1": round(run_f1, 4),
        "valid_accuracy": round(run_metrics.get("valid_accuracy", 0.0), 4),
    })
    print(f"  LR={lr:g} → valid macro-F1 {run_f1:.4f}")

    if run_f1 > best_f1:
        best_f1, best_lr = run_f1, lr
        trainer.save_model(SWEEP_BEST_DIR)   # keep best-so-far weights on disk
        print(f"  ↑ new best — checkpoint saved")

    free_gpu(model, trainer)

print("\n=== Sweep summary (valid macro-F1) ===")
for r in sweep_results:
    marker = "  ← best" if r["lr"] == best_lr else ""
    print(f"  LR={r['lr']:g}: F1={r['valid_f1']}  acc={r['valid_accuracy']}{marker}")

# ── Reload best model for final evaluation ────────────────────────────────────
print(f"\nReloading best model (LR={best_lr:g}, valid F1={best_f1:.4f})...")
model   = DistilBertForSequenceClassification.from_pretrained(SWEEP_BEST_DIR)
trainer = Trainer(
    model           = model,
    args            = make_args(best_lr, "./training_output_stage2_final"),
    eval_dataset    = val_dataset,
    data_collator   = data_collator,
    compute_metrics = compute_metrics,
)

print("\n=== Stage-2 (best) model on LIAR valid ===")
stage2_liar = trainer.evaluate(metric_key_prefix="stage2_liar")
for k, v in stage2_liar.items():
    print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

print("\n=== Stage-2 (best) model on ISOT held-out test (forgetting check) ===")
stage2_isot = trainer.evaluate(eval_dataset=isot_test_dataset, metric_key_prefix="stage2_isot")
for k, v in stage2_isot.items():
    print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

drop = baseline_isot.get("baseline_isot_f1", 0) - stage2_isot.get("stage2_isot_f1", 0)
print(f"\nISOT macro-F1 change after stage 2: {-drop:+.4f}")
if drop > 0.05:
    print("WARNING: ISOT F1 dropped by more than 0.05 — consider a lower "
          "learning rate to reduce catastrophic forgetting.")

# ── Decision-threshold tuning (on VALID only — test stays untouched) ─────────
print("\n=== Tuning decision threshold on LIAR valid ===")
val_logits = trainer.predict(val_dataset).predictions
val_probs  = torch.softmax(torch.tensor(val_logits), dim=1)[:, 1].numpy()  # P(misleading)
val_true   = np.array(val_labels)

best_thr, best_thr_f1 = 0.5, f1_score(val_true, (val_probs >= 0.5).astype(int), average="macro")
for thr in THRESHOLD_GRID:
    thr_f1 = f1_score(val_true, (val_probs >= thr).astype(int), average="macro")
    if thr_f1 > best_thr_f1:
        best_thr, best_thr_f1 = float(round(thr, 2)), thr_f1

f1_at_default = f1_score(val_true, (val_probs >= 0.5).astype(int), average="macro")
print(f"  Valid macro-F1 @ 0.50 threshold : {f1_at_default:.4f}")
print(f"  Valid macro-F1 @ {best_thr:.2f} threshold : {best_thr_f1:.4f}  "
      f"({best_thr_f1 - f1_at_default:+.4f})")

decision_threshold = {
    "threshold":  best_thr,
    "tuned_on":   "LIAR valid.tsv (macro-F1 maximising, grid 0.05-0.95 step 0.01)",
    "valid_f1_at_default_0.5": round(float(f1_at_default), 4),
    "valid_f1_at_tuned":       round(float(best_thr_f1), 4),
}

# ── Save (timestamped version + canonical copy) ───────────────────────────────
def _round(d):
    return {k: round(v, 4) if isinstance(v, float) else v for k, v in d.items()}

from _versioning import save_versioned

_evidence_on = bool(USE_JUSTIFICATION and train_just)
stage2_metrics = {
    "input_format":        ("speaker metadata prefix + LIAR-PLUS evidence clause"
                            if _evidence_on else
                            "speaker metadata prefix (see _liar_meta.py)"),
    "uses_justification":  _evidence_on,
    "sweep":               sweep_results,
    "best_lr":             best_lr,
    "decision_threshold":  decision_threshold,
    "baseline_liar_valid": _round(baseline_liar),
    "baseline_isot_test":  _round(baseline_isot),
    "stage2_liar_valid":   _round(stage2_liar),
    "stage2_isot_test":    _round(stage2_isot),
}
version_id, version_path = save_versioned(
    model, tokenizer, SAVE_PATH, stage="liar",
    metrics_files={
        "stage2_metrics.json":     stage2_metrics,
        "decision_threshold.json": decision_threshold,
    },
    registry_summary={
        "input_format":         "speaker-metadata+evidence" if _evidence_on else "speaker-metadata",
        "best_lr":              best_lr,
        "decision_threshold":   best_thr,
        "liar_valid_macro_f1":  _round(stage2_liar).get("stage2_liar_f1"),
        "liar_valid_f1_tuned_thr": round(float(best_thr_f1), 4),
        "isot_test_macro_f1":   _round(stage2_isot).get("stage2_isot_f1"),
        "baseline_liar_macro_f1": _round(baseline_liar).get("baseline_liar_f1"),
    },
)
print(f"\nSnapshot saved: {version_path}")

# Clean up the sweep scratch dir (weights now live in the snapshot + SAVE_PATH)
shutil.rmtree(SWEEP_BEST_DIR, ignore_errors=True)

print(f"""
Done! Stage-2 model saved to {SAVE_PATH}
  - metrics:   stage2_metrics.json
  - threshold: decision_threshold.json  (backend loads this automatically)

Next steps:
  1. Compare stage-1 vs stage-2 numbers above (also in stage2_metrics.json).
  2. Re-run 04_build_eval_data.py — the benchmark must be rebuilt in the
     same speaker-metadata format this model was trained on.
  3. To deploy: replace the contents of backend/model with backend/model_v2,
     then restart the backend and run `python evaluation.py` for the official
     LIAR TEST numbers — test.tsv was never used during training or tuning.
""")

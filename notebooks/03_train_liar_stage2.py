"""
=============================================================
STEP 3 — STAGE-2 FINE-TUNE ON LIAR (influential-source adaptation)
File: notebooks/03_train_liar_stage2.py

Pipeline: 01_clean_isot → 02_train_isot → 03_train_liar_stage2 → 04_build_eval_data

Run AFTER 02_train_isot.py. Loads the ISOT-trained model from backend/model
and continues fine-tuning on LIAR train.tsv — short fact-checked statements
by politicians and public figures. After this stage the model has been
trained on influential-source content directly, not just news articles.

Label mapping (6-class → binary, same as 04_build_eval_data.py):
  misleading (1): pants-fire, false, barely-true
  reliable   (0): mostly-true, true
  excluded:       half-true  (too ambiguous for binary classification)

Honesty rules baked in:
  - Trains on train.tsv only; valid.tsv is used for epoch selection.
  - test.tsv is NEVER touched here — it stays the held-out benchmark
    scored by 04_build_eval_data.py + backend/evaluation.py.
  - After training, the model is re-scored on the ISOT held-out test split
    (saved by 02_train_isot.py) to measure catastrophic forgetting.

Output:
  - Model saved to backend/model_v2  (stage-1 model in backend/model is kept).
    To deploy: replace the contents of backend/model with backend/model_v2.
  - Metrics saved to backend/model_v2/stage2_metrics.json
=============================================================
"""

import csv
import json
import os
import re

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from torch.utils.data import Dataset
from transformers import (
    DistilBertTokenizerFast,
    DistilBertForSequenceClassification,
    Trainer,
    TrainingArguments,
)

# ── Config ────────────────────────────────────────────────────────────────────
STAGE1_PATH    = "../backend/model"          # ISOT-trained model from 02_train_isot.py
SAVE_PATH      = "../backend/model_v2"       # stage-2 output (stage-1 left intact)
LIAR_TRAIN     = "../LIAR_Dataset/train.tsv"
LIAR_VALID     = "../LIAR_Dataset/valid.tsv"
LIAR_TEST      = "../LIAR_Dataset/test.tsv"  # NOT trained on — read only to exclude
                                             # the ~5 statements that also sit in train.tsv
ISOT_TEST_CSV  = "../ISOT_Dataset/isot_test_split.csv"   # saved by 02_train_isot.py

MAX_LENGTH     = 128       # LIAR statements average ~18 words — 128 tokens is plenty
NUM_EPOCHS     = 3
BATCH_SIZE     = 16        # short sequences → larger batch fits in 4 GB VRAM
LEARNING_RATE  = 1e-5      # lower than stage 1 (5e-5 default) to limit forgetting
MIN_LEN        = 30        # min statement characters (same as 04_build_eval_data.py)
SEED           = 42

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


def load_liar_binary(path, exclude=None):
    """Read a LIAR tsv → (texts, labels) with the 6→2 class mapping.
    Skips statements whose normalised form is in `exclude` (leakage guard)
    and deduplicates within the file."""
    texts, labels, seen = [], [], set()
    with open(path, encoding="utf-8") as f:
        for row in csv.reader(f, delimiter="\t"):
            if len(row) < 3:
                continue
            label, statement = row[1].strip().lower(), clean_text(row[2])
            if len(statement) < MIN_LEN:
                continue
            key = _norm(statement)
            if key in seen or (exclude and key in exclude):
                continue
            if label in MISLEADING_LABELS:
                texts.append(statement); labels.append(1); seen.add(key)
            elif label in RELIABLE_LABELS:
                texts.append(statement); labels.append(0); seen.add(key)
            # half-true and anything else: skipped
    return texts, labels


print("Loading LIAR dataset...")
# Audit (2026-06-13) found 5 test + 7 valid statements duplicated in train.tsv —
# exclude the test set's fingerprints from training data so the benchmark stays clean.
_test_keys = set()
with open(LIAR_TEST, encoding="utf-8") as f:
    for row in csv.reader(f, delimiter="\t"):
        if len(row) >= 3:
            _test_keys.add(_norm(clean_text(row[2])))

train_texts, train_labels = load_liar_binary(LIAR_TRAIN, exclude=_test_keys)
val_texts,   val_labels   = load_liar_binary(LIAR_VALID, exclude=_test_keys)
n_mis = sum(train_labels)
print(f"LIAR train: {len(train_texts)} statements "
      f"({n_mis} misleading / {len(train_labels) - n_mis} reliable)")
print(f"LIAR valid: {len(val_texts)} statements")

# ── Load ISOT held-out test split (forgetting check) ─────────────────────────
isot_test = pd.read_csv(ISOT_TEST_CSV)
isot_texts  = isot_test["text"].fillna("").tolist()
isot_labels = isot_test["label"].tolist()
print(f"ISOT held-out test: {len(isot_texts)} articles")

# ── Tokenise ──────────────────────────────────────────────────────────────────
print(f"Loading stage-1 model + tokenizer from: {STAGE1_PATH}")
tokenizer = DistilBertTokenizerFast.from_pretrained(STAGE1_PATH)
model     = DistilBertForSequenceClassification.from_pretrained(STAGE1_PATH)

train_encodings     = tokenizer(train_texts, truncation=True, padding=True, max_length=MAX_LENGTH)
val_encodings       = tokenizer(val_texts,   truncation=True, padding=True, max_length=MAX_LENGTH)
isot_test_encodings = tokenizer(isot_texts,  truncation=True, padding=True, max_length=256)


class StatementDataset(Dataset):
    def __init__(self, encodings, labels):
        self.encodings = encodings
        self.labels    = labels

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        item = {key: torch.tensor(val[idx]) for key, val in self.encodings.items()}
        item["labels"] = torch.tensor(self.labels[idx])
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

# ── Baseline: score the stage-1 model BEFORE stage-2 training ────────────────
training_args = TrainingArguments(
    output_dir          = "./training_output_stage2",
    num_train_epochs    = NUM_EPOCHS,
    learning_rate       = LEARNING_RATE,
    per_device_train_batch_size = BATCH_SIZE,
    per_device_eval_batch_size  = BATCH_SIZE,
    warmup_steps        = 10,
    weight_decay        = 0.01,
    logging_dir         = "./logs_stage2",
    logging_steps       = 10,
    eval_strategy       = "epoch",
    save_strategy       = "epoch",
    load_best_model_at_end = True,
    metric_for_best_model  = "f1",
    fp16                = True,
    report_to           = "none",
    seed                = SEED,
)

trainer = Trainer(
    model           = model,
    args            = training_args,
    train_dataset   = train_dataset,
    eval_dataset    = val_dataset,
    compute_metrics = compute_metrics,
)

print("\n=== Baseline: stage-1 (ISOT-only) model on LIAR valid ===")
baseline_liar = trainer.evaluate(metric_key_prefix="baseline_liar")
for k, v in baseline_liar.items():
    print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

print("\n=== Baseline: stage-1 model on ISOT held-out test ===")
baseline_isot = trainer.evaluate(eval_dataset=isot_test_dataset, metric_key_prefix="baseline_isot")
for k, v in baseline_isot.items():
    print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

# ── Train stage 2 ─────────────────────────────────────────────────────────────
print("\n=== Starting stage-2 fine-tuning on LIAR ===")
print(f"Epochs: {NUM_EPOCHS}  |  Batch: {BATCH_SIZE}  |  LR: {LEARNING_RATE}")
trainer.train()

# ── Evaluate after stage 2 ────────────────────────────────────────────────────
print("\n=== Stage-2 model on LIAR valid ===")
stage2_liar = trainer.evaluate(metric_key_prefix="stage2_liar")
for k, v in stage2_liar.items():
    print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

print("\n=== Stage-2 model on ISOT held-out test (forgetting check) ===")
stage2_isot = trainer.evaluate(eval_dataset=isot_test_dataset, metric_key_prefix="stage2_isot")
for k, v in stage2_isot.items():
    print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

drop = baseline_isot.get("baseline_isot_f1", 0) - stage2_isot.get("stage2_isot_f1", 0)
print(f"\nISOT macro-F1 change after stage 2: {-drop:+.4f}")
if drop > 0.05:
    print("WARNING: ISOT F1 dropped by more than 0.05 — consider lowering "
          "LEARNING_RATE or NUM_EPOCHS to reduce catastrophic forgetting.")

# ── Save (timestamped version + canonical copy) ───────────────────────────────
def _round(d):
    return {k: round(v, 4) if isinstance(v, float) else v for k, v in d.items()}

from _versioning import save_versioned

stage2_metrics = {
    "baseline_liar_valid": _round(baseline_liar),
    "baseline_isot_test":  _round(baseline_isot),
    "stage2_liar_valid":   _round(stage2_liar),
    "stage2_isot_test":    _round(stage2_isot),
}
version_id, version_path = save_versioned(
    model, tokenizer, SAVE_PATH, stage="liar",
    metrics_files={"stage2_metrics.json": stage2_metrics},
    registry_summary={
        "liar_valid_macro_f1": _round(stage2_liar).get("stage2_liar_f1"),
        "isot_test_macro_f1":  _round(stage2_isot).get("stage2_isot_f1"),
        "baseline_liar_macro_f1": _round(baseline_liar).get("baseline_liar_f1"),
    },
)
print(f"\nSnapshot saved: {version_path}")

print(f"""
Done! Stage-2 model saved to {SAVE_PATH} (metrics in stage2_metrics.json).

Next steps:
  1. Compare stage-1 vs stage-2 numbers above (also in stage2_metrics.json).
  2. To deploy the stage-2 model, replace the contents of backend/model
     with backend/model_v2, then restart the backend.
  3. Run 04_build_eval_data.py + backend/evaluation.py for the official
     LIAR TEST benchmark — test.tsv was never used during training.
""")

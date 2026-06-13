"""
=============================================================
STEP 2 — STAGE-1 FINE-TUNE ON ISOT
File: notebooks/02_train_isot.py

Pipeline: 01_clean_isot → 02_train_isot → 03_train_liar_stage2 → 04_build_eval_data
Run this ONCE to fine-tune DistilBERT on fake news data.
It will save the model to: backend/model/
It also saves the held-out test split to ISOT_Dataset/isot_test_split.csv,
reused by 03_train_liar_stage2.py to check for catastrophic forgetting.

What this does:
- Fine-tunes DistilBERT (distilbert-base-uncased) on the ISOT dataset (ISOT_Dataset/True_cleaned.csv + Fake_cleaned.csv)
- Trains for 3 epochs on full 44k articles with fp16 on GPU
- Saves the trained model to disk

Install requirements first:
  pip install transformers torch scikit-learn pandas numpy accelerate
=============================================================
"""

import os
import pandas as pd
import numpy as np
import torch
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from transformers import (
    DistilBertTokenizerFast,
    DistilBertForSequenceClassification,
    Trainer,
    TrainingArguments,
)
from torch.utils.data import Dataset

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_NAME   = "distilbert-base-uncased"   # smaller, faster than bert-base
SAVE_PATH    = "../backend/model"           # where the trained model is saved
MAX_LENGTH   = 256                          # token limit per article
NUM_EPOCHS   = 3
BATCH_SIZE   = 8                            # reduce to 4 if you run out of memory
SEED         = 42

os.makedirs(SAVE_PATH, exist_ok=True)

# ── Step 1: Load data ─────────────────────────────────────────────────────────
# Run 01_clean_isot.py first if True_cleaned.csv / Fake_cleaned.csv don't exist yet.
print("Loading ISOT dataset...")
true_df  = pd.read_csv("../ISOT_Dataset/True_cleaned.csv")
fake_df  = pd.read_csv("../ISOT_Dataset/Fake_cleaned.csv")
true_df["label"]  = 0   # 0 = reliable
fake_df["label"]  = 1   # 1 = misleading
true_df["text"]   = true_df["title"] + " " + true_df["text"]
fake_df["text"]   = fake_df["title"] + " " + fake_df["text"]
df = pd.concat([true_df[["text","label"]], fake_df[["text","label"]]], ignore_index=True)
df = df.sample(frac=1, random_state=SEED).reset_index(drop=True)   # shuffle
print(f"ISOT data loaded: {len(df)} examples")

# ── Step 2: Split data — 70/15/15 train/val/test, stratified ─────────────────
# Val is used for epoch selection; test is held out and only scored once at the end.
trainval_texts, test_texts, trainval_labels, test_labels = train_test_split(
    df["text"].tolist(),
    df["label"].tolist(),
    test_size=0.15,
    random_state=SEED,
    stratify=df["label"].tolist()
)
train_texts, val_texts, train_labels, val_labels = train_test_split(
    trainval_texts,
    trainval_labels,
    test_size=0.15 / 0.85,   # 15% of the full dataset
    random_state=SEED,
    stratify=trainval_labels
)
print(f"Train: {len(train_texts)}  |  Val: {len(val_texts)}  |  Test: {len(test_texts)}")

# Leakage guard: no text may appear in more than one split
_train_set = set(train_texts)
_leak_val  = sum(t in _train_set for t in val_texts)
_leak_test = sum(t in _train_set for t in test_texts)
if _leak_val or _leak_test:
    raise RuntimeError(
        f"Data leakage detected: {_leak_val} val / {_leak_test} test texts also in train. "
        "Re-run 01_clean_isot.py (it deduplicates) before training."
    )
print("Leakage check passed: no overlap between splits.")

# Persist the held-out test split so 03_train_liar_stage2.py can score the
# stage-2 model on the exact same articles (catastrophic-forgetting check).
pd.DataFrame({"text": test_texts, "label": test_labels}).to_csv(
    "../ISOT_Dataset/isot_test_split.csv", index=False, encoding="utf-8"
)
print("Held-out test split saved to ISOT_Dataset/isot_test_split.csv")

# ── Step 3: Tokenise ──────────────────────────────────────────────────────────
print(f"Loading tokenizer: {MODEL_NAME}")
tokenizer = DistilBertTokenizerFast.from_pretrained(MODEL_NAME)

train_encodings = tokenizer(train_texts, truncation=True, padding=True, max_length=MAX_LENGTH)
val_encodings   = tokenizer(val_texts,   truncation=True, padding=True, max_length=MAX_LENGTH)
test_encodings  = tokenizer(test_texts,  truncation=True, padding=True, max_length=MAX_LENGTH)

# ── Step 4: Create PyTorch Dataset ───────────────────────────────────────────
class ArticleDataset(Dataset):
    def __init__(self, encodings, labels):
        self.encodings = encodings
        self.labels    = labels

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        item = {key: torch.tensor(val[idx]) for key, val in self.encodings.items()}
        item["labels"] = torch.tensor(self.labels[idx])
        return item

train_dataset = ArticleDataset(train_encodings, train_labels)
val_dataset   = ArticleDataset(val_encodings,   val_labels)
test_dataset  = ArticleDataset(test_encodings,  test_labels)

# ── Step 5: Load model ───────────────────────────────────────────────────────
print(f"Loading model: {MODEL_NAME}")
model = DistilBertForSequenceClassification.from_pretrained(
    MODEL_NAME,
    num_labels=2          # binary: 0=reliable, 1=misleading
)

# ── Step 6: Define metrics ───────────────────────────────────────────────────
def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions    = np.argmax(logits, axis=-1)
    # macro averaging — matches backend/evaluation.py and treats both classes equally
    return {
        "accuracy":  accuracy_score(labels, predictions),
        "f1":        f1_score(labels, predictions, average="macro"),
        "precision": precision_score(labels, predictions, average="macro", zero_division=0),
        "recall":    recall_score(labels, predictions, average="macro", zero_division=0),
    }

# ── Step 7: Training arguments ───────────────────────────────────────────────
training_args = TrainingArguments(
    output_dir          = "./training_output",
    num_train_epochs    = NUM_EPOCHS,
    per_device_train_batch_size = BATCH_SIZE,
    per_device_eval_batch_size  = BATCH_SIZE,
    warmup_steps        = 10,
    weight_decay        = 0.01,
    logging_dir         = "./logs",
    logging_steps       = 10,
    eval_strategy       = "epoch",
    save_strategy       = "epoch",
    load_best_model_at_end = True,
    metric_for_best_model  = "f1",
    fp16                = True,      # half-precision — faster + less VRAM on GTX 1650
    report_to           = "none",    # disable wandb
    seed                = SEED,
)

# ── Step 8: Train ────────────────────────────────────────────────────────────
trainer = Trainer(
    model           = model,
    args            = training_args,
    train_dataset   = train_dataset,
    eval_dataset    = val_dataset,
    compute_metrics = compute_metrics,
)

print("\n=== Starting fine-tuning ===")
print(f"Model: {MODEL_NAME}  |  Epochs: {NUM_EPOCHS}  |  Batch: {BATCH_SIZE}")
print("This may take a few minutes...\n")
trainer.train()

# ── Step 9: Evaluate ─────────────────────────────────────────────────────────
print("\n=== Evaluation on validation set (used for model selection) ===")
results = trainer.evaluate()
for k, v in results.items():
    print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

print("\n=== Final evaluation on HELD-OUT test set (report these numbers) ===")
test_results = trainer.evaluate(eval_dataset=test_dataset, metric_key_prefix="test")
for k, v in test_results.items():
    print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

# ── Step 10: Save model + tokenizer (timestamped version + canonical copy) ───
from _versioning import save_versioned

test_metrics = {k: round(v, 4) if isinstance(v, float) else v for k, v in test_results.items()}
version_id, version_path = save_versioned(
    model, tokenizer, SAVE_PATH, stage="isot",
    metrics_files={"test_metrics.json": test_metrics},
    registry_summary={
        "dataset":         "ISOT (cleaned/deduped/marker-stripped)",
        "n_train":         len(train_texts),
        "test_macro_f1":   test_metrics.get("test_f1"),
        "test_accuracy":   test_metrics.get("test_accuracy"),
    },
)

print(f"\nDone! Snapshot saved: {version_path}")
print(f"Deployed to: {SAVE_PATH}  (registry: ../backend/model_versions/registry.json)")
print("Next: run 03_train_liar_stage2.py to adapt the model to influential-source statements,")
print("or start the backend now with this stage-1 model: backend/main.py")

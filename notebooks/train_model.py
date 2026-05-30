"""
=============================================================
STEP 1 — TRAIN (FINE-TUNE) THE MODEL
File: notebooks/train_model.py

Run this ONCE to fine-tune DistilBERT on fake news data.
It will save the model to: backend/model/

What this does:
- Fine-tunes DistilBERT (distilbert-base-uncased) on the ISOT dataset (ISOT_Dataset/True_cleaned.csv + Fake_cleaned.csv)
- Trains for 3 epochs on full 44k articles with fp16 on GPU
- Saves the trained model to disk

Install requirements first:
  pip install transformers torch scikit-learn pandas numpy
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
# Run clean_data.py first if True_cleaned.csv / Fake_cleaned.csv don't exist yet.
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

# ── Step 2: Split data ────────────────────────────────────────────────────────
train_texts, val_texts, train_labels, val_labels = train_test_split(
    df["text"].tolist(),
    df["label"].tolist(),
    test_size=0.2,
    random_state=SEED,
    stratify=df["label"].tolist()
)
print(f"Train: {len(train_texts)}  |  Val: {len(val_texts)}")

# ── Step 3: Tokenise ──────────────────────────────────────────────────────────
print(f"Loading tokenizer: {MODEL_NAME}")
tokenizer = DistilBertTokenizerFast.from_pretrained(MODEL_NAME)

train_encodings = tokenizer(train_texts, truncation=True, padding=True, max_length=MAX_LENGTH)
val_encodings   = tokenizer(val_texts,   truncation=True, padding=True, max_length=MAX_LENGTH)

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
    return {
        "accuracy":  accuracy_score(labels, predictions),
        "f1":        f1_score(labels, predictions, average="weighted"),
        "precision": precision_score(labels, predictions, average="weighted", zero_division=0),
        "recall":    recall_score(labels, predictions, average="weighted", zero_division=0),
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
print("\n=== Final evaluation on validation set ===")
results = trainer.evaluate()
for k, v in results.items():
    print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

# ── Step 10: Save model + tokenizer ─────────────────────────────────────────
print(f"\nSaving model to: {SAVE_PATH}")
model.save_pretrained(SAVE_PATH)
tokenizer.save_pretrained(SAVE_PATH)

# Save label mapping
import json
label_map = {"0": "Reliable", "1": "Misleading"}
with open(os.path.join(SAVE_PATH, "label_map.json"), "w") as f:
    json.dump(label_map, f)

print(f"\nDone! Model saved to {SAVE_PATH}")
print("You can now run the backend server: backend/main.py")

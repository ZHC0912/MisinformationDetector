"""
=============================================================
BUILD EVALUATION DATA FROM LIAR DATASET
File: notebooks/build_eval_data.py

Reads LIAR_Dataset/test.tsv and produces backend/eval_data.json
for use by backend/evaluation.py.

LIAR label mapping (6-class → binary):
  misleading (1): pants-fire, false, barely-true
  reliable   (0): mostly-true, true
  excluded:       half-true  (too ambiguous for binary classification)

Run:
  cd notebooks
  python build_eval_data.py

Output: ../backend/eval_data.json
=============================================================
"""

import csv
import json
import os
import random
import re

# ── Config ────────────────────────────────────────────────────────────────────
LIAR_TEST   = "../LIAR_Dataset/test.tsv"
OUTPUT_PATH = "../backend/eval_data.json"
SEED        = 42
MAX_SAMPLES = 1000  # takes all available — capped by smaller class (448 reliable)
MIN_LEN     = 30    # minimum statement character length

# ── Cleaning function ─────────────────────────────────────────────────────────
def clean_text(text):
    if not isinstance(text, str):
        return ""
    try:
        text = text.encode('latin-1').decode('utf-8')
    except (UnicodeDecodeError, UnicodeEncodeError):
        pass
    text = re.sub(r'http\S+|www\S+', '', text)   # remove URLs
    text = re.sub(r'\s+', ' ', text).strip()       # normalise whitespace
    return text

# ── Label mapping ─────────────────────────────────────────────────────────────
MISLEADING_LABELS = {"pants-fire", "false", "barely-true"}
RELIABLE_LABELS   = {"mostly-true", "true"}
# half-true is intentionally excluded

# ── Load + map ────────────────────────────────────────────────────────────────
print(f"Reading {LIAR_TEST}...")

misleading_items = []
reliable_items   = []

with open(LIAR_TEST, encoding="utf-8") as f:
    reader = csv.reader(f, delimiter="\t")
    for row in reader:
        if len(row) < 3:
            continue
        raw_label = row[1].strip().lower()
        statement = clean_text(row[2])

        if len(statement) < MIN_LEN:
            continue

        if raw_label in MISLEADING_LABELS:
            misleading_items.append({"text": statement, "label": 1, "source": "liar-" + raw_label})
        elif raw_label in RELIABLE_LABELS:
            reliable_items.append({"text": statement, "label": 0, "source": "liar-" + raw_label})
        # half-true: skip

print(f"Loaded  : {len(misleading_items)} misleading, {len(reliable_items)} reliable (before balance)")

# ── Balance ───────────────────────────────────────────────────────────────────
random.seed(SEED)
random.shuffle(misleading_items)
random.shuffle(reliable_items)

# Take as many as possible from each class, balanced to the smaller side
half = min(MAX_SAMPLES // 2, len(misleading_items), len(reliable_items))
misleading_sample = misleading_items[:half]
reliable_sample   = reliable_items[:half]

combined = misleading_sample + reliable_sample
random.shuffle(combined)

# Strip 'source' field — evaluation.py only needs 'text' and 'label'
eval_data = [{"text": item["text"], "label": item["label"]} for item in combined]

# ── Save ──────────────────────────────────────────────────────────────────────
with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(eval_data, f, indent=2, ensure_ascii=False)

n_mis = sum(1 for x in eval_data if x["label"] == 1)
n_rel = sum(1 for x in eval_data if x["label"] == 0)

print(f"Saved   : {len(eval_data)} items to {OUTPUT_PATH}")
print(f"Balance : {n_rel} reliable (0), {n_mis} misleading (1)")
print(f"Dataset : LIAR test split — out-of-domain benchmark")
print(f"\nUpdate EvaluationPage.js description to show {len(eval_data)} samples from LIAR.")

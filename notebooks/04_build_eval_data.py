"""
=============================================================
STEP 4 — BUILD EVALUATION DATA FROM LIAR TEST SET
File: notebooks/04_build_eval_data.py

Pipeline: 01_clean_isot → 02_train_isot → 03_train_liar_stage2 → 04_build_eval_data
Reads LIAR_Dataset/test.tsv and produces backend/eval_data.json
for use by backend/evaluation.py.
(test.tsv is never used in training — 03 trains on train.tsv/valid.tsv only.)

Input format (must match training): statements carry the same speaker-metadata
prefix used by 03_train_liar_stage2.py, e.g.
  "Barack Obama (Democrat, President) said: <statement>"
and, when USE_JUSTIFICATION is on and LIAR-PLUS test2.tsv is present, the same
"Evidence: <justification>" clause (LIAR-PLUS, Alhindi et al. 2018), e.g.
  "Barack Obama (Democrat, President) said: <statement> Evidence: <passage>"
Both scripts share _liar_meta.format_statement() so the formats cannot drift.

IMPORTANT: keep this flag in sync with 03's USE_JUSTIFICATION. If 03 trained WITH
evidence, the benchmark must include it (and vice-versa) or the numbers are not
comparable. Regenerating with evidence changes what backend/eval_data.json — and
therefore the live /evaluate dashboard — measures (the evidence-augmented task,
not the claim-only task a bare user statement represents).

LIAR label mapping (6-class → binary):
  misleading (1): pants-fire, false, barely-true
  reliable   (0): mostly-true, true
  excluded:       half-true  (too ambiguous for binary classification)

Run:
  cd notebooks
  python 04_build_eval_data.py

Output: ../backend/eval_data.json
=============================================================
"""

import csv
import json
import os
import random
import re

from _liar_meta import format_statement, row_fields, load_justification_map

# ── Config ────────────────────────────────────────────────────────────────────
LIAR_TEST   = "../LIAR_Dataset/test.tsv"
OUTPUT_PATH = "../backend/eval_data.json"
SEED        = 42
MAX_SAMPLES = 1000  # takes all available — capped by smaller class (448 reliable)
MIN_LEN     = 30    # minimum statement character length

# Append LIAR-PLUS evidence — must match 03_train_liar_stage2.USE_JUSTIFICATION.
# Default OFF: the deployed model is claim-only (see 03's note and
# backend/liar_test_metrics_v2.json). Flip to True ONLY when reproducing the
# evidence-augmented experiment, together with 03's flag.
USE_JUSTIFICATION = False
LIAR_PLUS_TEST    = "../LIAR_Dataset/test2.tsv"

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

# LIAR-PLUS evidence for the test rows (empty if the file is absent / flag off).
test_just = load_justification_map(LIAR_PLUS_TEST) if USE_JUSTIFICATION else {}
if USE_JUSTIFICATION:
    print(f"LIAR-PLUS justifications: {len(test_just)} test rows"
          if test_just else "LIAR-PLUS test2.tsv not found — metadata-only benchmark.")

misleading_items = []
reliable_items   = []

with open(LIAR_TEST, encoding="utf-8") as f:
    reader = csv.reader(f, delimiter="\t")
    for row in reader:
        if len(row) < 3:
            continue
        fields    = row_fields(row)
        raw_label = fields["label"]
        statement = clean_text(fields["statement"])

        # Length filter on the RAW statement (before the metadata prefix),
        # so the selected items are identical to the pre-metadata benchmark.
        if len(statement) < MIN_LEN:
            continue

        # Same speaker-metadata (+ optional evidence) format the model was trained on
        justification = clean_text(test_just.get(fields["id"], ""))
        text = format_statement(statement, fields["speaker"], fields["job"],
                                fields["party"], justification=justification)

        if raw_label in MISLEADING_LABELS:
            misleading_items.append({"text": text, "label": 1, "source": "liar-" + raw_label})
        elif raw_label in RELIABLE_LABELS:
            reliable_items.append({"text": text, "label": 0, "source": "liar-" + raw_label})
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

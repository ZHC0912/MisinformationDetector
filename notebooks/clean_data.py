"""
STEP 0 — CLEAN THE DATASET
File: notebooks/clean_data.py

Run this BEFORE train_model.py
It will save cleaned CSVs to: ISOT_Dataset/True_cleaned.csv and ISOT_Dataset/Fake_cleaned.csv
"""

import pandas as pd
import re
import os

# ── Config ────────────────────────────────────────────────────────────────────
INPUT_TRUE  = "../ISOT_Dataset/True.csv"
INPUT_FAKE  = "../ISOT_Dataset/Fake.csv"
OUTPUT_DIR  = "../ISOT_Dataset"

# ── Cleaning function ─────────────────────────────────────────────────────────
def clean_text(text):
    if not isinstance(text, str):
        return ""
    # Fix encoding artifacts (â€œ, â€™, etc.)
    try:
        text = text.encode('latin-1').decode('utf-8')
    except (UnicodeDecodeError, UnicodeEncodeError):
        pass
    # Remove Reuters location tags e.g. "WASHINGTON (Reuters) -"
    text = re.sub(r'^[A-Z\s,]+\(Reuters\)\s*-\s*', '', text)
    # Remove URLs
    text = re.sub(r'http\S+|www\S+', '', text)
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

# ── Load ──────────────────────────────────────────────────────────────────────
print("Loading CSVs...")
true_df = pd.read_csv(INPUT_TRUE, encoding='utf-8')
fake_df = pd.read_csv(INPUT_FAKE, encoding='utf-8')

print(f"Before cleaning: {len(true_df)} real, {len(fake_df)} fake")

# ── Clean ─────────────────────────────────────────────────────────────────────
print("Cleaning text...")
for df in [true_df, fake_df]:
    df["title"] = df["title"].apply(clean_text)
    df["text"]  = df["text"].apply(clean_text)

# ── Remove bad rows ───────────────────────────────────────────────────────────
true_df = true_df[true_df["text"].str.len() >= 20]
fake_df = fake_df[fake_df["text"].str.len() >= 20]

print(f"After cleaning: {len(true_df)} real, {len(fake_df)} fake")

# ── Save ──────────────────────────────────────────────────────────────────────
true_out = os.path.join(OUTPUT_DIR, "True_cleaned.csv")
fake_out = os.path.join(OUTPUT_DIR, "Fake_cleaned.csv")

true_df.to_csv(true_out, index=False, encoding='utf-8')
fake_df.to_csv(fake_out, index=False, encoding='utf-8')

print(f"Saved cleaned files to:")
print(f"  {true_out}")
print(f"  {fake_out}")
print("Done! Now update train_model.py to use True_cleaned.csv and Fake_cleaned.csv")
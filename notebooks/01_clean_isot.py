"""
STEP 1 — CLEAN THE ISOT DATASET
File: notebooks/01_clean_isot.py

Pipeline: 01_clean_isot → 02_train_isot → 03_train_liar_stage2 → 04_build_eval_data
Run this BEFORE 02_train_isot.py
It will save cleaned CSVs to: ISOT_Dataset/True_cleaned.csv and ISOT_Dataset/Fake_cleaned.csv

Cleaning steps:
1. Fix encoding artifacts
2. Strip publisher/agency markers that leak the label
   ("Reuters" appears in 99.2% of real vs 0.04% of fake articles —
   without this step the model learns the publisher, not the content)
3. Remove URLs and embedded-tweet image links
4. Drop empty / too-short articles
5. Deduplicate (raw ISOT contains ~12.6% duplicate articles,
   mostly in the fake class) and drop any text appearing with both labels
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
    # Remove Reuters location dateline e.g. "WASHINGTON (Reuters) -" / "NEW YORK/LONDON (Reuters) -"
    text = re.sub(r'^[A-Z][A-Za-z\s,./-]*\(Reuters\)\s*-\s*', '', text)
    # Strip class-correlated publisher markers anywhere in the text
    text = re.sub(r'\(Reuters\)', ' ', text)
    text = re.sub(r'\bReuters\b', ' ', text, flags=re.IGNORECASE)
    # no trailing \b — scraped text often glues "Wire" to the next word ("...WireOnce")
    text = re.sub(r'\b21st\s*Century\s*Wire', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'\b21WIRE(\.TV)?\b', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'Featured image via [^.]*\.?', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'via Getty Images', ' ', text, flags=re.IGNORECASE)
    # Remove URLs (incl. bare pic.twitter.com links from embedded tweets)
    text = re.sub(r'http\S+|www\S+|pic\.twitter\.com/\S+', '', text)
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def norm_key(title, text):
    """Normalised fingerprint used for duplicate detection."""
    s = (str(title) + ' ' + str(text)).lower()
    s = re.sub(r'[^a-z0-9 ]', '', s)
    return re.sub(r'\s+', ' ', s).strip()

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
true_df = true_df[true_df["text"].str.len() >= 20].copy()
fake_df = fake_df[fake_df["text"].str.len() >= 20].copy()

print(f"After cleaning: {len(true_df)} real, {len(fake_df)} fake")

# ── Deduplicate ───────────────────────────────────────────────────────────────
# Must happen BEFORE the train/val/test split, otherwise the same article
# lands in multiple splits and inflates the evaluation metrics.
print("Deduplicating...")
true_df["_key"] = [norm_key(t, x) for t, x in zip(true_df["title"], true_df["text"])]
fake_df["_key"] = [norm_key(t, x) for t, x in zip(fake_df["title"], fake_df["text"])]

true_df = true_df.drop_duplicates(subset="_key")
fake_df = fake_df.drop_duplicates(subset="_key")

# Drop any article that appears with BOTH labels — its label is unreliable
conflicts = set(true_df["_key"]) & set(fake_df["_key"])
if conflicts:
    print(f"  Dropping {len(conflicts)} articles labelled both real and fake")
    true_df = true_df[~true_df["_key"].isin(conflicts)]
    fake_df = fake_df[~fake_df["_key"].isin(conflicts)]

true_df = true_df.drop(columns="_key")
fake_df = fake_df.drop(columns="_key")

print(f"After dedup: {len(true_df)} real, {len(fake_df)} fake")

# ── Save ──────────────────────────────────────────────────────────────────────
true_out = os.path.join(OUTPUT_DIR, "True_cleaned.csv")
fake_out = os.path.join(OUTPUT_DIR, "Fake_cleaned.csv")

true_df.to_csv(true_out, index=False, encoding='utf-8')
fake_df.to_csv(fake_out, index=False, encoding='utf-8')

print(f"Saved cleaned files to:")
print(f"  {true_out}")
print(f"  {fake_out}")
print("Done! Now run 02_train_isot.py to retrain on the cleaned data.")

"""
=============================================================
SEED SOURCE RELIABILITY RATINGS  → MongoDB
File: backend/seed_sources.py

Loads the starter ratings from `source_ratings_seed.json` (data lives in the
JSON file, NOT hardcoded in this script) and upserts them into the
`source_ratings` collection, keyed by domain. Ratings/bias follow the publicly
documented Media Bias/Fact Check tiers and are indicative only.

To add or change a source: edit `source_ratings_seed.json` and re-run this.

Run once (with MONGODB_URI set in backend/.env):
  cd backend
  python seed_sources.py
=============================================================
"""

import json
import logging
import os

import source_rating

logging.basicConfig(level=logging.INFO)

SEED_FILE = os.path.join(os.path.dirname(__file__), "source_ratings_seed.json")


def main():
    db = source_rating._get_db()
    if db is None:
        raise SystemExit(
            "MongoDB not reachable. Set MONGODB_URI in backend/.env and ensure the "
            "server is running, then re-run: python seed_sources.py"
        )

    with open(SEED_FILE, encoding="utf-8") as f:
        seeds = json.load(f)

    for s in seeds:
        doc = {
            "_id":      s["domain"],
            "name":     s["name"],
            "rating":   s["rating"],
            "bias":     s["bias"],
            "category": s["category"],
        }
        db.source_ratings.replace_one({"_id": doc["_id"]}, doc, upsert=True)

    total = db.source_ratings.count_documents({})
    print(f"Seeded {len(seeds)} sources from {os.path.basename(SEED_FILE)}. "
          f"Collection now holds {total} ratings.")


if __name__ == "__main__":
    main()

"""
Shared model-versioning helper for the training scripts.
File: notebooks/_versioning.py

Every training run is saved to a timestamped snapshot under
`backend/model_versions/<stage>_<timestamp>/` AND copied to the canonical path
the app/eval load from (so nothing silently overwrites previous runs). Each run
also appends a row to `backend/model_versions/registry.json` — a lightweight
experiment log you can cite in the FYP2 report.

Disk note: each snapshot is a full model (~270 MB). Prune old folders in
`backend/model_versions/` when you no longer need them; `registry.json` keeps
the metrics regardless.
"""

import json
import os
import shutil
from datetime import datetime

VERSIONS_DIR = "../backend/model_versions"


def save_versioned(model, tokenizer, canonical_path, stage,
                   metrics_files=None, registry_summary=None):
    """
    Save model+tokenizer to a timestamped version dir, copy to `canonical_path`
    (what the backend loads), and record the run in registry.json.

    metrics_files    : {filename: dict}  extra JSON files written into the snapshot
    registry_summary : dict              key fields to log in the registry
    Returns (version_id, version_path).
    """
    metrics_files = metrics_files or {}
    registry_summary = registry_summary or {}

    os.makedirs(VERSIONS_DIR, exist_ok=True)
    version_id   = f"{stage}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    version_path = os.path.join(VERSIONS_DIR, version_id)
    os.makedirs(version_path, exist_ok=True)

    # 1. weights + tokenizer → snapshot
    model.save_pretrained(version_path)
    tokenizer.save_pretrained(version_path)

    # 2. label map + any metrics files → snapshot
    with open(os.path.join(version_path, "label_map.json"), "w") as f:
        json.dump({"0": "Reliable", "1": "Misleading"}, f)
    for fname, data in metrics_files.items():
        with open(os.path.join(version_path, fname), "w") as f:
            json.dump(data, f, indent=2)

    # 3. copy snapshot → canonical path (what the app/eval load)
    os.makedirs(canonical_path, exist_ok=True)
    for fname in os.listdir(version_path):
        shutil.copy2(os.path.join(version_path, fname), os.path.join(canonical_path, fname))

    # 4. append to registry.json
    registry_path = os.path.join(VERSIONS_DIR, "registry.json")
    registry = []
    if os.path.exists(registry_path):
        try:
            with open(registry_path) as f:
                registry = json.load(f)
        except (json.JSONDecodeError, OSError):
            registry = []
    registry.append({
        "version_id":  version_id,
        "stage":       stage,
        "timestamp":   datetime.now().isoformat(timespec="seconds"),
        "deployed_to": canonical_path,
        **registry_summary,
    })
    with open(registry_path, "w") as f:
        json.dump(registry, f, indent=2)

    return version_id, version_path

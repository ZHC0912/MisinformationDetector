"""
=============================================================
EVALUATION SCRIPT
File: backend/evaluation.py

Run directly to evaluate the NLP model:
  python evaluation.py

Runs the DistilBERT model against the LIAR benchmark test set
(896 items — 448 reliable, 448 misleading) and prints:
  - Confusion matrix (TP, TN, FP, FN)
  - Accuracy, Precision, Recall, F1 (per-class + macro)
  - AUC-ROC
=============================================================
"""

import json
import os
import numpy as np
import textanalysis

_DATA_PATH = os.path.join(os.path.dirname(__file__), "eval_data.json")


def _load_test_set() -> list:
    if not os.path.exists(_DATA_PATH):
        raise FileNotFoundError(
            f"Evaluation data not found at {_DATA_PATH}. "
            "Run notebooks/04_build_eval_data.py first to generate it."
        )
    with open(_DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)
    if not data:
        raise ValueError("eval_data.json is empty. Re-run notebooks/04_build_eval_data.py.")
    return data


def run_evaluation() -> dict:
    """
    Run the NLP model over the built-in test set and return
    classification metrics, confusion matrix, and ROC curve.
    """
    if not textanalysis.is_model_loaded():
        textanalysis.load_model()
    test_set    = _load_test_set()
    texts       = [item["text"]  for item in test_set]
    true_labels = np.array([item["label"] for item in test_set])  # 0=reliable, 1=misleading

    # ── Get probabilities ──────────────────────────────────
    probs_misleading = np.array([
        textanalysis.predict(t)["misleading_prob"] for t in texts
    ])

    pred_labels = (probs_misleading >= 0.5).astype(int)

    # ── Confusion matrix ───────────────────────────────────
    tp = int(np.sum((pred_labels == 1) & (true_labels == 1)))  # correctly predicted misleading
    tn = int(np.sum((pred_labels == 0) & (true_labels == 0)))  # correctly predicted reliable
    fp = int(np.sum((pred_labels == 1) & (true_labels == 0)))  # reliable predicted as misleading
    fn = int(np.sum((pred_labels == 0) & (true_labels == 1)))  # misleading predicted as reliable

    # ── Per-class metrics ──────────────────────────────────
    # Misleading class (positive class = 1)
    prec_m  = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    rec_m   = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1_m    = 2 * prec_m * rec_m / (prec_m + rec_m) if (prec_m + rec_m) > 0 else 0.0

    # Reliable class (negative class treated as positive)
    prec_r  = tn / (tn + fn) if (tn + fn) > 0 else 0.0
    rec_r   = tn / (tn + fp) if (tn + fp) > 0 else 0.0
    f1_r    = 2 * prec_r * rec_r / (prec_r + rec_r) if (prec_r + rec_r) > 0 else 0.0

    # Macro averages
    accuracy       = (tp + tn) / len(true_labels)
    macro_prec     = (prec_m + prec_r) / 2
    macro_rec      = (rec_m  + rec_r)  / 2
    macro_f1       = (f1_m   + f1_r)   / 2

    support_m = int(np.sum(true_labels == 1))
    support_r = int(np.sum(true_labels == 0))

    # ── ROC curve ──────────────────────────────────────────
    thresholds = np.linspace(0.0, 1.0, 101)
    roc_points = []
    for t in thresholds:
        pred_t = (probs_misleading >= t).astype(int)
        tp_t   = int(np.sum((pred_t == 1) & (true_labels == 1)))
        fp_t   = int(np.sum((pred_t == 1) & (true_labels == 0)))
        fn_t   = int(np.sum((pred_t == 0) & (true_labels == 1)))
        tn_t   = int(np.sum((pred_t == 0) & (true_labels == 0)))
        tpr    = tp_t / (tp_t + fn_t) if (tp_t + fn_t) > 0 else 0.0
        fpr    = fp_t / (fp_t + tn_t) if (fp_t + tn_t) > 0 else 0.0
        roc_points.append({
            "fpr":       round(fpr, 4),
            "tpr":       round(tpr, 4),
            "threshold": round(float(t), 2),
        })

    # AUC — sort by FPR ascending then integrate
    roc_sorted = sorted(roc_points, key=lambda p: p["fpr"])
    fprs = [p["fpr"] for p in roc_sorted]
    tprs = [p["tpr"] for p in roc_sorted]
    auc  = float(np.trapezoid(tprs, fprs))

    return {
        "accuracy":        round(accuracy,   4),
        "macro_precision": round(macro_prec, 4),
        "macro_recall":    round(macro_rec,  4),
        "macro_f1":        round(macro_f1,   4),
        "roc_auc":         round(auc,        4),
        "confusion_matrix": {"tp": tp, "tn": tn, "fp": fp, "fn": fn},
        "roc_curve":       roc_points,
        "per_class": {
            "reliable": {
                "precision": round(prec_r, 4),
                "recall":    round(rec_r,  4),
                "f1":        round(f1_r,   4),
                "support":   support_r,
            },
            "misleading": {
                "precision": round(prec_m, 4),
                "recall":    round(rec_m,  4),
                "f1":        round(f1_m,   4),
                "support":   support_m,
            },
        },
        "total_samples": len(test_set),
        "model_mode":    "AI model" if textanalysis.is_model_loaded() else "heuristic",
        "threshold":     0.5,
    }


if __name__ == "__main__":
    print("Loading model...")
    textanalysis.load_model()

    print("Running evaluation on LIAR benchmark test set...\n")
    r = run_evaluation()

    cm = r["confusion_matrix"]
    pc = r["per_class"]

    print("=" * 48)
    print("  MODEL EVALUATION REPORT")
    print(f"  Mode : {r['model_mode']}  |  Samples: {r['total_samples']}  |  Threshold: {r['threshold']}")
    print("=" * 48)

    print("\nOVERALL METRICS")
    print(f"  Accuracy        : {r['accuracy']*100:.1f}%")
    print(f"  Macro Precision : {r['macro_precision']*100:.1f}%")
    print(f"  Macro Recall    : {r['macro_recall']*100:.1f}%")
    print(f"  Macro F1        : {r['macro_f1']*100:.1f}%")
    print(f"  AUC-ROC         : {r['roc_auc']:.4f}")

    print("\nCONFUSION MATRIX")
    print(f"  {'':16s}  Pred Reliable  Pred Misleading")
    print(f"  {'Actual Reliable':16s}  TN = {cm['tn']:<12}  FP = {cm['fp']}")
    print(f"  {'Actual Misleading':16s}  FN = {cm['fn']:<12}  TP = {cm['tp']}")

    print("\nPER-CLASS REPORT")
    print(f"  {'Class':<12} {'Precision':>10} {'Recall':>8} {'F1':>8} {'Support':>9}")
    print(f"  {'-'*50}")
    for cls in ("reliable", "misleading"):
        p = pc[cls]
        print(f"  {cls.capitalize():<12} {p['precision']*100:>9.1f}% {p['recall']*100:>7.1f}% {p['f1']*100:>7.1f}% {p['support']:>9}")
    print("=" * 48)

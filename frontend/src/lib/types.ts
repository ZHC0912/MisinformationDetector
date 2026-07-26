// ============================================================
// API RESPONSE TYPES
// Mirrors the exact JSON shapes returned by the FastAPI backend.
// These describe the existing contract — do not change field
// names without changing the backend.
// ============================================================

/** One word attribution from LIME or SHAP. */
export interface InfluenceWord {
  word: string;
  direction: "misleading" | "reliable";
  strength: number; // 0..1
}

/** A key stylistic pattern detected by the NLP model. */
export interface KeyFeature {
  type: "warning" | string;
  word: string;
}

/** One scored paragraph when a long text is chunked. */
export interface Chunk {
  text: string;
  verdict: "Misleading" | "Reliable" | string;
  misleading_prob: number;
}

/** Historical track record blended into a source rating. */
export interface SourceHistory {
  count: number;
  avg_credibility: number;
}

/** FR5 source-reliability rating (nullable when the source is unknown). */
export interface SourceRating {
  rating: string;
  tier_index: number | null;
  bias?: string;
  category?: string;
  basis?: "seed" | "history" | "seed+history" | string;
  seed_rating?: string;
  history?: SourceHistory;
}

/** Fact-check result (from Google Fact Check API or Gemini). */
export interface FactCheck {
  verdict: "TRUE" | "FALSE" | "PARTIALLY TRUE" | "UNVERIFIABLE" | string;
  summary: string;
  explanation: string;
  sources?: string[];
  fact_check_source:
    | "google_fact_check_api"
    | "gemini_llm"
    | "not_found"
    | "error"
    | string;
  claim_extracted?: string;
}

/** Full response from POST /analyse. */
export interface AnalyseResult {
  final_verdict: "Reliable" | "Misleading" | "Partially Reliable" | string;
  final_explanation: string;
  style_verdict: string;
  style_explanation: string;
  confidence: number;
  credibility_score: number;
  reliable_prob: number;
  misleading_prob: number;
  mode: string;
  heuristic_mode?: boolean;
  key_features?: KeyFeature[];
  source_name?: string;
  source_rating?: SourceRating | null;
  fact_check: FactCheck;
  lime_explanation?: InfluenceWord[];
  shap_explanation?: InfluenceWord[];
  chunks?: Chunk[];
  processing_time: number;
}

/** Response from POST /fact-check-ai. */
export interface AiFactCheckResult {
  fact_check: FactCheck;
  final_verdict: string;
  final_explanation: string;
}

/** One card in the public "Recently fact-checked" feed (GET /api/fact-checks).
 *  Every field is a real published fact-check from Google's ClaimReview corpus. */
export interface FactCheckItem {
  claim: string;
  claimant: string;
  publisher: string;
  verdict: string; // raw publisher textualRating (chip label / tooltip)
  ratingClass: "TRUE" | "FALSE" | "PARTIALLY TRUE" | "UNVERIFIABLE" | string;
  reviewDate: string; // RFC3339
  url: string;
}

export interface FactChecksResponse {
  query: string;
  region?: string;
  count: number;
  items: FactCheckItem[];
  attribution: string;
}

/** One seeded source-reliability rating (GET /api/sources). */
export interface SourceRatingItem {
  domain: string;
  name: string;
  rating: string;
  bias: string;
  category: string;
  tier_index: number | null;
}

export interface SourcesResponse {
  count: number;
  sources: SourceRatingItem[];
}

/** Per-class metrics in the evaluation report. */
export interface ClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

/** One point on the ROC curve. */
export interface RocPoint {
  fpr: number;
  tpr: number;
  threshold: number;
}

/** Response from GET /evaluate and POST /evaluate/rerun. */
export interface EvaluationResult {
  available?: boolean; // false => nothing persisted yet
  accuracy: number;
  macro_precision: number;
  macro_recall: number;
  macro_f1: number;
  roc_auc: number;
  confusion_matrix: { tp: number; tn: number; fp: number; fn: number };
  roc_curve: RocPoint[];
  per_class: { reliable: ClassMetrics; misleading: ClassMetrics };
  total_samples: number;
  model_mode: string;
  threshold: number;
  generated_at?: number;
}

// ============================================================
// API CLIENT
// Single source of truth for the backend base URL and every
// request. Override the URL per environment with VITE_API_URL
// (.env.development / .env.production).
// ============================================================

import axios from "axios";
import type {
  AnalyseResult,
  AiFactCheckResult,
  EvaluationResult,
  FactChecksResponse,
  SourcesResponse,
} from "./types";

export const API_URL: string =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// Every call tolerates non-2xx so callers can read the error body
// instead of catching a thrown AxiosError (matches the old contract).
const client = axios.create({
  baseURL: API_URL,
  validateStatus: () => true,
});

const CONNECT_ERROR =
  "Cannot connect to backend on port 8000. Make sure the server is running.";

/** Thrown for any non-2xx or network failure with a user-facing message. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface AnalysePayload {
  text: string;
  source_name: string;
  run_lime: boolean;
  run_shap: boolean;
}

export async function analyse(payload: AnalysePayload): Promise<AnalyseResult> {
  try {
    const res = await client.post("/analyse", payload);
    if (res.status >= 400) throw new ApiError("Server error: " + res.status, res.status);
    return res.data as AnalyseResult;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(CONNECT_ERROR);
  }
}

export interface ScrapeResult {
  text: string;
  site_name?: string;
  word_count: number;
  title?: string;
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const res = await client.post("/scrape-url", { url });
  if (res.status >= 400) throw new ApiError(res.data?.detail || "Scraping failed.", res.status);
  if (res.data?.error) throw new ApiError(res.data.error, res.status);
  return res.data as ScrapeResult;
}

export interface OcrResult {
  extracted_text: string;
  word_count: number;
}

export async function extractText(file: File): Promise<OcrResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await client.post("/extract-text", form);
  if (res.status >= 400) throw new ApiError(res.data?.detail || "OCR failed.", res.status);
  if (res.data?.error) throw new ApiError(res.data.error, res.status);
  return res.data as OcrResult;
}

export interface AiFactCheckPayload {
  text: string;
  style_verdict: string;
  style_confidence: number;
}

export async function factCheckAi(
  payload: AiFactCheckPayload
): Promise<AiFactCheckResult> {
  const res = await client.post("/fact-check-ai", {
    text: payload.text,
    style_verdict: payload.style_verdict,
    style_confidence: payload.style_confidence,
  });
  if (res.status >= 400) throw new ApiError(res.data?.detail || `Server error ${res.status}`, res.status);
  return res.data as AiFactCheckResult;
}

/** GET the public "Recently fact-checked" feed. Real Google ClaimReview data;
 *  the backend proxies the key server-side and caches per query. */
export async function getFactChecks(
  query = "",
  opts: { lang?: string; maxAgeDays?: number } = {}
): Promise<FactChecksResponse> {
  const res = await client.get("/api/fact-checks", {
    params: {
      query,
      lang: opts.lang ?? "en",
      max_age_days: opts.maxAgeDays ?? 30,
    },
  });
  if (res.status >= 400)
    throw new ApiError(res.data?.detail || `Server error ${res.status}`, res.status);
  return res.data as FactChecksResponse;
}

/** GET the seeded source-reliability ratings (FR5) for the reliability sidebar. */
export async function getSources(): Promise<SourcesResponse> {
  const res = await client.get("/api/sources");
  if (res.status >= 400)
    throw new ApiError(res.data?.detail || `Server error ${res.status}`, res.status);
  return res.data as SourcesResponse;
}

/** GET the last persisted evaluation, or null when none exists yet. */
export async function getEvaluation(): Promise<EvaluationResult | null> {
  const res = await client.get("/evaluate");
  if (res.status >= 400) throw new ApiError(res.data?.detail || `Server error ${res.status}`, res.status);
  if (res.data && res.data.available === false) return null;
  return res.data as EvaluationResult;
}

/** Trigger a fresh evaluation run and persist it. */
export async function rerunEvaluation(): Promise<EvaluationResult> {
  const res = await client.post("/evaluate/rerun", {});
  if (res.status >= 400) throw new ApiError(res.data?.detail || `Server error ${res.status}`, res.status);
  return res.data as EvaluationResult;
}

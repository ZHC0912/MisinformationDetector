# MIDAS — Misinformation Detection & Analysis

A full-stack web app that assesses the credibility of news articles and social-media
posts. It combines a fine-tuned DistilBERT text classifier with live fact-checking
(Google Fact Check Tools API, with a Gemini fallback), word-level explainability
(LIME and SHAP), local OCR, URL scraping, and MongoDB-backed source-reliability
ratings.

## Features

- **NLP style classifier** — DistilBERT fine-tuned in two stages: stage 1 on the ISOT
  news dataset, stage 2 on LIAR influential-source statements (speaker-conditioned).
  Classifies writing style as Reliable or Misleading and returns a 0–100 credibility score.
- **Hybrid fact-checking** — Google Fact Check Tools API searches human-reviewed
  ClaimReviews first; Gemini (`gemini-2.5-flash`) is an opt-in fallback when no human
  record is found.
- **Explainability (opt-in)** — LIME and SHAP each highlight the words that pushed the
  verdict; both are off by default so the core verdict stays fast, and are toggled per request.
- **Image OCR** — extracts text from screenshots via EasyOCR, fully local (no API key).
- **URL scraper** — pulls article text from a link via trafilatura.
- **Source reliability** — MongoDB-backed ratings that start from a seeded MBFC-style
  baseline and self-adjust from the system's own accumulated verdict history per source.
- **Fact-check feed** — a browsable feed of recent published fact-checks on the analyse page.
- **Evaluation dashboard** — confusion matrix, ROC curve, and metrics for the LIAR benchmark.

## Tech stack

| Layer | Stack |
|-------|-------|
| Frontend | Vite · React 19 · TypeScript · Tailwind CSS · shadcn/ui · React Router · Axios |
| Backend | FastAPI · Python 3.10+ · Uvicorn · slowapi (rate limiting) |
| Model | DistilBERT (Hugging Face Transformers · PyTorch) |
| Explainability | LIME · SHAP |
| Fact-check | Google Fact Check Tools API · Google Gemini |
| OCR / scraping | EasyOCR · trafilatura |
| Data store | MongoDB (source ratings + assessment history) |
| Deployment | Docker · Docker Compose · nginx |

## Project structure

```
MisinformationDetector/
├── backend/                     FastAPI backend
│   ├── main.py                  API routes
│   ├── config.py                Configuration (loads from .env)
│   ├── textanalysis.py          DistilBERT NLP + LIME + SHAP
│   ├── factcheck.py             Fact-check orchestration + verdict fusion
│   ├── fc_google.py             Google Fact Check Tools API
│   ├── fc_gemini.py             Gemini AI fallback
│   ├── ocr.py                   Image OCR via EasyOCR (local, offline)
│   ├── scraper.py               URL article scraper (trafilatura)
│   ├── source_rating.py         MongoDB source ratings + history
│   ├── seed_sources.py          Seed ratings from source_ratings_seed.json
│   ├── evaluation.py            LIAR benchmark evaluation
│   ├── model/                   DistilBERT checkpoint (weights not in repo)
│   ├── Dockerfile
│   └── .env.example             Template for .env (API keys are gitignored)
├── frontend/                    Vite + React 19 + TypeScript SPA
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx              Router (/, /app, /sources, /evaluation)
│       ├── main.tsx             Entry point
│       ├── lib/api.ts           Typed API client (Axios)
│       └── components/          .tsx components + shadcn/ui primitives
│           ├── LandingPage.tsx
│           ├── AnalysePage.tsx      /app — input, fact-check feed, source panel
│           ├── ResultsPage.tsx      verdict, score, explanations
│           ├── SourcesPage.tsx      /sources — all source ratings
│           ├── EvaluationPage.tsx   /evaluation — metrics dashboard
│           └── ...
├── notebooks/                   Training pipeline (run in numbered order)
│   ├── 01_clean_isot.py         Clean + deduplicate ISOT dataset
│   ├── 02_train_isot.py         Stage 1: fine-tune DistilBERT on ISOT
│   ├── 03_train_liar_stage2.py  Stage 2: adapt to LIAR (influential sources)
│   └── 04_build_eval_data.py    Build LIAR test benchmark set
├── docker-compose.yml           mongo + backend + frontend
└── README.md
```

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- MongoDB (optional — the app runs without it; source ratings simply show as unrated)
- A Gemini API key — [get one here](https://aistudio.google.com/app/apikey) *(fact-checking only)*
- A Google Fact Check Tools API key — [enable it here](https://console.cloud.google.com/apis/library/factchecktools.googleapis.com)

> OCR is handled locally by EasyOCR — no API key required for image text extraction.

### 1. Clone

```bash
git clone https://github.com/ZHC0912/MisinformationDetector.git
cd MisinformationDetector
```

### 2. Configure API keys

```bash
cd backend
cp .env.example .env
# Edit .env: GEMINI_API_KEY, GFCT_API_KEY, and (optionally) MONGODB_URI
```

### 3. Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
# API at http://127.0.0.1:8000 · interactive docs at http://127.0.0.1:8000/docs
```

If you use MongoDB, seed the source ratings once:

```bash
python seed_sources.py
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
# App at http://localhost:3000
```

The frontend reads the backend URL from `VITE_API_URL` (defaults to
`http://127.0.0.1:8000`).

### Run with Docker (optional)

```bash
docker compose up --build
docker compose exec backend python seed_sources.py   # first run only
# frontend on :3000, backend on :8000, mongo on :27017
```

## Model weights

`backend/model/model.safetensors` is not in the repo (too large). Without weights the
app falls back to a keyword heuristic and shows a warning banner. To generate the
weights, download the datasets below and run the pipeline from inside `notebooks/`:

```bash
cd notebooks
python 01_clean_isot.py         # clean + deduplicate ISOT
python 02_train_isot.py         # stage 1: fine-tune on ISOT (~20–30 min GPU)
python 03_train_liar_stage2.py  # stage 2: adapt to LIAR (~10 min GPU)
python 04_build_eval_data.py    # build the LIAR test benchmark
```

Stage 1 saves to `backend/model/`; stage 2 saves to `backend/model_v2/`. To deploy the
adapted (stage-2) model, copy `backend/model_v2/` over `backend/model/`.

| Dataset | Purpose | Download | Place at |
|---------|---------|----------|----------|
| ISOT Fake News | Training | [Kaggle](https://www.kaggle.com/datasets/clmentbisaillon/fake-and-real-news-dataset) | `ISOT_Dataset/True.csv`, `ISOT_Dataset/Fake.csv` |
| LIAR | Stage-2 training + benchmark | [HuggingFace](https://huggingface.co/datasets/liar) | `LIAR_Dataset/train.tsv`, `valid.tsv`, `test.tsv` |

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/` | Health check (reports whether model weights are loaded) |
| `POST` | `/analyse` | Analyse text for credibility (`run_lime` / `run_shap` opt-in flags) |
| `POST` | `/scrape-url` | Fetch article text from a URL |
| `POST` | `/extract-text` | Extract text from an uploaded image (OCR) |
| `POST` | `/fact-check-ai` | Run the Gemini AI fact-check (user opt-in) |
| `GET`  | `/evaluate` | Return the saved LIAR benchmark result |
| `POST` | `/evaluate/rerun` | Re-run and overwrite the LIAR benchmark result |
| `GET`  | `/api/fact-checks` | Recent published fact-checks (feed) |
| `GET`  | `/api/sources` | Source reliability ratings |
| `GET`  | `/model-info` | Model details |

### Example: `/analyse`

```json
POST /analyse
{
  "text": "Scientists confirmed that...",
  "source_name": "BBC News",
  "run_lime": false,
  "run_shap": false
}
```

Set `run_lime` or `run_shap` to `true` to include word-level explanations (each adds
several seconds).

## Model performance

Two numbers are reported, on two different test sets, and should be read together:

| Test set | Macro F1 | Accuracy | AUC-ROC | Notes |
|----------|----------|----------|---------|-------|
| ISOT held-out test (in-domain) | **0.9984** | — | — | 70/15/15 stratified split, deduplicated, publisher markers stripped, leakage-guarded |
| LIAR test (**out-of-domain**) | **0.655** | 0.655 | **0.733** | 896 balanced items; short political statements by named public figures — a much harder task the model was not primarily trained on |

The high ISOT score reflects that ISOT-style news classification (once publisher
fingerprints are removed) is an easier task than general misinformation detection. The
LIAR result is the more meaningful generalisation figure and is reported alongside it,
never on its own. LIAR `test.tsv` is never used during training.

Run `GET /evaluate` or open the **Model evaluation** page in the app for the live
dashboard (confusion matrix, ROC curve, per-class report).

## Notes

- Model weights (`model.safetensors`) are excluded from the repo due to size; generate
  them with the `notebooks/` pipeline or obtain a pre-trained checkpoint from the author.
- API keys are loaded from `backend/.env` (via python-dotenv) and are never committed.
- LIME and SHAP are opt-in so the default analyse path stays fast; enabling either adds
  a few seconds per request.
- Long inputs are chunked at sentence boundaries and averaged (DistilBERT's 256-token limit).
```

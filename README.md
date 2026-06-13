# Misinformation Detector

AI-powered credibility assessment for news articles and social media posts, combining DistilBERT NLP, Google Fact Check Tools API, and Gemini AI.

## Features

- **NLP style analysis** — fine-tuned DistilBERT classifies writing style as Reliable or Misleading
- **Fact-checking** — Google Fact Check Tools API searches human-reviewed fact-checks; Gemini AI as opt-in fallback
- **LIME explainability** — word-level influence highlighting (opt-in)
- **Image OCR** — extract text from screenshots via EasyOCR (fully local, no API)
- **URL scraper** — fetch and analyse articles directly from a link
- **Model evaluation** — benchmark against the LIAR dataset

---

## Project Structure

```
MisinformationDetector/
├── backend/          FastAPI backend
│   ├── main.py       API routes
│   ├── config.py     Configuration (loads from .env)
│   ├── textanalysis.py  DistilBERT NLP + LIME
│   ├── factcheck.py  Fact-check orchestration
│   ├── fc_google.py  Google Fact Check API
│   ├── fc_gemini.py  Gemini AI fallback
│   ├── ocr.py        Image OCR via EasyOCR (local, offline)
│   ├── scraper.py    URL article scraper
│   ├── evaluation.py LIAR benchmark evaluation
│   ├── model/        DistilBERT checkpoint (weights not in repo)
│   ├── .env          API keys (gitignored — copy from .env.example)
│   └── .env.example  Template for .env
├── frontend/         React frontend
│   └── src/
│       ├── App.js         Input page
│       ├── ResultsPage.js Results display
│       └── EvaluationPage.js Model evaluation dashboard
├── notebooks/        Training pipeline (run in numbered order)
│   ├── 01_clean_isot.py        Clean + deduplicate ISOT dataset
│   ├── 02_train_isot.py        Stage 1: fine-tune DistilBERT on ISOT
│   ├── 03_train_liar_stage2.py Stage 2: adapt to LIAR (influential sources)
│   └── 04_build_eval_data.py   Build LIAR test benchmark set
└── README.md
```

---

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- A Gemini API key — [get one here](https://aistudio.google.com/app/apikey) *(used for fact-checking only)*
- A Google Fact Check Tools API key — [enable it here](https://console.cloud.google.com/apis/library/factchecktools.googleapis.com)

> OCR is handled locally by EasyOCR — no API key required for image text extraction.

### 1. Clone the repo

```bash
git clone https://github.com/ZHC0912/MisinformationDetector.git
cd MisinformationDetector
```

### 2. Configure API keys

```bash
cd backend
cp .env.example .env
# Edit .env and fill in GEMINI_API_KEY and GFCT_API_KEY
```

### 3. Install backend dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 4. Download datasets (required for training only)

| Dataset | Link | Place at |
|---------|------|----------|
| ISOT Fake News | [Kaggle](https://www.kaggle.com/datasets/clmentbisaillon/fake-and-real-news-dataset) | `ISOT_Dataset/True.csv` and `ISOT_Dataset/Fake.csv` |
| LIAR | [HuggingFace](https://huggingface.co/datasets/liar) | `LIAR_Dataset/train.tsv`, `valid.tsv`, `test.tsv` |

### 5. Train the model

Skip this if you already have `backend/model/model.safetensors`.

Run from inside `notebooks/` (scripts use relative paths):

```bash
cd notebooks

# Step 1 — clean + deduplicate ISOT data
python 01_clean_isot.py

# Step 2 — stage-1 fine-tune on ISOT (~20-30 min on GPU)
python 02_train_isot.py

# Step 3 — stage-2 fine-tune on LIAR influential-source statements (~10 min)
python 03_train_liar_stage2.py

# Step 4 — build LIAR test benchmark set
python 04_build_eval_data.py
```

Stage 1 saves to `backend/model/`; stage 2 saves to `backend/model_v2/`
(copy its contents over `backend/model/` to deploy the adapted model).

### 6. Start the backend

```bash
cd backend
python main.py
# API available at http://127.0.0.1:8000
# Interactive docs at http://127.0.0.1:8000/docs
```

### 7. Start the frontend

```bash
cd frontend
npm install
npm start
# App available at http://localhost:3000
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/analyse` | Analyse article text for credibility |
| `POST` | `/scrape-url` | Fetch article text from a URL |
| `POST` | `/extract-text` | Extract text from an uploaded image |
| `POST` | `/fact-check-ai` | Run Gemini AI fact-check (user opt-in) |
| `GET` | `/evaluate` | Run LIAR benchmark evaluation |
| `GET` | `/model-info` | Model details |

### Example: `/analyse`

```json
POST /analyse
{
  "text": "Scientists confirmed that...",
  "source_name": "BBC News",
  "run_lime": false
}
```

Set `run_lime: true` to include word-level LIME explainability (adds ~5–10s).

---

## Architecture

```
User Input (text / URL / image)
    │
    ├─ /scrape-url   → trafilatura extracts article body
    ├─ /extract-text → EasyOCR (local) extracts text from image
    │
    └─ /analyse
         ├─ DistilBERT NLP  → style verdict + credibility score
         ├─ LIME (opt-in)   → word influence explanation
         ├─ Google GFCT API → human-reviewed fact-checks
         └─ combine_verdicts → final verdict + explanation

Optional (user clicks "Check with AI"):
    └─ /fact-check-ai → Gemini AI fact-check fallback
```

---

## Model Performance

Evaluated on 896 samples from the LIAR benchmark (out-of-domain — model trained on ISOT full articles, tested on short political claims).

| Metric | Score |
|--------|-------|
| Accuracy | see `/evaluate` |
| Macro F1 | see `/evaluate` |
| AUC-ROC | see `/evaluate` |

Run `GET /evaluate` or visit the **Model Evaluation** page in the app for live results.

---

## Notes

- The model weights (`model.safetensors`) are not included in the repo due to file size. Run the numbered scripts in `notebooks/` to generate them, or contact the author for a pre-trained checkpoint.
- Without model weights the app falls back to a keyword-based heuristic and displays a warning.
- API keys are loaded from `backend/.env` and are never committed to the repository.

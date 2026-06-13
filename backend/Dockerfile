# ── Backend: FastAPI + DistilBERT + EasyOCR ───────────────────
FROM python:3.12-slim

WORKDIR /app

# System libs EasyOCR/OpenCV need at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (layer caching — only re-runs when requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code + the deployed model in backend/model (baked into the image).
# Secrets (.env), tests, and version snapshots are excluded via .dockerignore.
COPY . .

EXPOSE 8000

# host 0.0.0.0 so the port is reachable from outside the container
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

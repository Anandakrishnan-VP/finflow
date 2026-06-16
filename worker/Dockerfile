FROM python:3.12-slim
RUN apt-get update && apt-get install -y \
    tesseract-ocr libgl1 libglib2.0-0 \
    libsm6 libice6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY scripts/ ./scripts/

RUN useradd -m -u 1000 finflow && chown -R finflow:finflow /app
USER finflow
CMD ["celery", "-A", "celery_app", "worker", "--loglevel=info", "--concurrency=2"]

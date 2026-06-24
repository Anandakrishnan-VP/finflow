FROM python:3.12-slim
RUN apt-get update && apt-get install -y \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin \
    libgl1 libglib2.0-0 \
    libsm6 libice6 libxext6 libxrender1 \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY scripts/ ./scripts/

ENV HF_HOME=/data/huggingface

RUN mkdir -p /data/uploads /data/reports /data/huggingface
RUN useradd -m -u 1000 finflow && chown -R finflow:finflow /app /data /data/uploads /data/reports /data/huggingface
USER finflow
CMD ["celery", "-A", "celery_app", "worker", "--loglevel=info", "--concurrency=2"]

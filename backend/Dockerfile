FROM python:3.12-slim

RUN apt-get update && apt-get install -y \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin \
    libgl1 libglib2.0-0 \
    libsm6 libice6 libxext6 libxrender1 \
    clamav clamav-daemon ghostscript \
    redis-tools \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY scripts/ ./scripts/


COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /data/uploads /data/reports
RUN useradd -m -u 1000 finflow && chown -R finflow:finflow /app /data /data/uploads /data/reports
USER finflow

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

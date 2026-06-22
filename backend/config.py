import os
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings

# Resolve .env from project root regardless of working directory
_ENV_FILE = Path(__file__).parent.parent / ".env"

class Settings(BaseSettings):
    database_url: str = ""
    neo4j_url: str = "bolt://neo4j:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""
    redis_url: str = "redis://redis:6379/0"
    secret_key: str = ""
    upload_dir: str = "/data/uploads"
    report_dir: str = "/data/reports"
    model_dir: str = "/app/models"
    llm_provider: str = "template"
    llm_model: str = "llama-3.1-8b-instant"
    groq_api_key: str = ""
    tsa_url: str = "https://freetsa.org/tsr"
    surya_device: str = "auto"

    class Config:
        env_file = str(_ENV_FILE)
        env_file_encoding = "utf-8"
        extra = "ignore"

@lru_cache()
def get_settings() -> Settings:
    return Settings()

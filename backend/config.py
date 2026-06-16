import os
from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = os.getenv("DATABASE_URL", "")
    neo4j_url: str = os.getenv("NEO4J_URL", "bolt://neo4j:7687")
    neo4j_user: str = os.getenv("NEO4J_USER", "neo4j")
    neo4j_password: str = os.getenv("NEO4J_PASSWORD", "")
    redis_url: str = os.getenv("REDIS_URL", "redis://redis:6379/0")
    secret_key: str = os.getenv("SECRET_KEY", "")
    upload_dir: str = os.getenv("UPLOAD_DIR", "/data/uploads")
    report_dir: str = os.getenv("REPORT_DIR", "/data/reports")
    model_dir: str = os.getenv("MODEL_DIR", "/app/models")
    llm_provider: str = os.getenv("LLM_PROVIDER", "groq")
    llm_model: str = os.getenv("LLM_MODEL", "llama-3.1-8b-instant")
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    tsa_url: str = os.getenv("TSA_URL", "https://freetsa.org/tsr")

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()

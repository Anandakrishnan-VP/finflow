from celery import Celery
import os

celery_app = Celery(
    "finflow",
    broker=os.getenv("REDIS_URL", "redis://redis:6379/0"),
    backend=os.getenv("REDIS_URL", "redis://redis:6379/0"),
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,
# Do NOT set result_expires to a short value.
    # Celery result keys have no TTL — volatile-lru in Redis never evicts them.
)

# Import tasks to register them with Celery
import tasks.analysis_task


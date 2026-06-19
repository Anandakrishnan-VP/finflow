from celery import Celery
import os

redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
# Fallback to local SQLite and eager execution if running outside Docker
if not os.path.exists("/.dockerenv") and not os.getenv("KUBERNETES_SERVICE_HOST"):
    broker_url = "sqla+sqlite:///celery_broker.db"
    backend_url = "db+sqlite:///celery_results.db"
    task_always_eager = True
else:
    broker_url = redis_url
    backend_url = redis_url
    task_always_eager = False

celery_app = Celery(
    "finflow",
    broker=broker_url,
    backend=backend_url,
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_always_eager=task_always_eager,
)

# Import tasks to register them with Celery
import tasks.analysis_task


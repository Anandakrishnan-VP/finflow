import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from security.auth import verify_token
from routers import auth, cases, statements, analysis, graph
from routers import entities, reports, watchlist, query, admin, verdicts

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title="FinFlow API",
    description="Forensic Bank Statement Analysis — Karnataka CID EOW",
    version="2.2",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://localhost:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(cases.router)
app.include_router(statements.router)
app.include_router(analysis.router)
app.include_router(graph.router)
app.include_router(entities.router)
app.include_router(reports.router)
app.include_router(watchlist.router)
app.include_router(query.router)
app.include_router(admin.router)
app.include_router(verdicts.router)

@app.websocket("/ws/analysis/{task_id}")
async def analysis_ws(
    websocket: WebSocket,
    task_id: str,
    token: str = Query(..., description="JWT token — browsers cannot send auth headers in WS upgrade"),
):
    """S1 FIX: JWT verified BEFORE websocket.accept(). Close 1008 if invalid."""
    payload = verify_token(token)
    if not payload:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    from celery.result import AsyncResult
    try:
        while True:
            result = AsyncResult(task_id)
            if result.state == "PROGRESS":
                info = result.info or {}
                await websocket.send_json({"progress": info.get("progress", 0),
                                           "stage": info.get("stage", "")})
            elif result.state == "SUCCESS":
                await websocket.send_json({"progress": 100, "stage": "Complete"})
                break
            elif result.state == "FAILURE":
                await websocket.send_json({"progress": -1, "stage": "Failed",
                                           "error": str(result.info)})
                break
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.2"}

@app.get("/health/full")
async def health_full():
    """
    Full dependency health check — use this to diagnose startup issues.
    Returns status of PostgreSQL, Neo4j, Redis, and LLM provider.
    Does NOT require authentication so it can be called during startup.
    """
    import os
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text
    import httpx

    result = {"postgres": "unknown", "neo4j": "unknown",
              "redis": "unknown", "llm": "unknown", "version": "2.2"}

    # PostgreSQL check
    try:
        engine = create_async_engine(os.getenv("DATABASE_URL",""), echo=False)
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        await engine.dispose()
        result["postgres"] = "ok"
    except Exception as e:
        result["postgres"] = f"error: {str(e)[:100]}"

    # Neo4j check
    try:
        from neo4j_client import get_neo4j_driver
        driver = get_neo4j_driver()
        async with driver.session() as session:
            await session.run("RETURN 1")
        result["neo4j"] = "ok"
    except Exception as e:
        result["neo4j"] = f"error: {str(e)[:100]}"

    # Redis check
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))
        await r.ping()
        await r.aclose()
        result["redis"] = "ok"
    except Exception as e:
        result["redis"] = f"error: {str(e)[:100]}"

    # LLM check
    llm_provider = os.getenv("LLM_PROVIDER", "groq")
    if llm_provider == "template":
        result["llm"] = "template_mode (offline)"
    elif llm_provider == "groq":
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get("https://api.groq.com",
                                     headers={"Authorization": f"Bearer {os.getenv('GROQ_API_KEY','')}"})
            result["llm"] = "groq_reachable"
        except Exception:
            result["llm"] = "groq_unreachable — set LLM_PROVIDER=template for offline demo"
    else:
        result["llm"] = f"unknown_provider: {llm_provider}"

    return result

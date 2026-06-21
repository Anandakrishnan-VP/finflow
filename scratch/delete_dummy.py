import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    db_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://finflow:admin123@postgres:5432/finflow")
    engine = create_async_engine(db_url)
    async with engine.begin() as conn:
        print("Cleaning transactions, tasks, review queue, and statements...")
        await conn.execute(text("DELETE FROM analysis_tasks WHERE case_id = 'a0000000-0000-0000-0000-000000000000'"))
        await conn.execute(text("DELETE FROM human_review_queue WHERE case_id = 'a0000000-0000-0000-0000-000000000000'"))
        await conn.execute(text("DELETE FROM transactions WHERE case_id = 'a0000000-0000-0000-0000-000000000000'"))
        await conn.execute(text("DELETE FROM statements WHERE case_id = 'a0000000-0000-0000-0000-000000000000'"))
        print("Deleting dummy case...")
        await conn.execute(text("DELETE FROM cases WHERE id = 'a0000000-0000-0000-0000-000000000000'"))
        print("Done!")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())

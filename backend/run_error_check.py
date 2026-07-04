import asyncio
from sqlalchemy import text
from database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as db:
        print("--- ANALYSIS TASKS ERRORS ---")
        r = await db.execute(text("SELECT case_id, status, error FROM analysis_tasks WHERE error IS NOT NULL"))
        for row in r.fetchall():
            print(f"Case {row.case_id} ({row.status}): {row.error}")
            
        print("\n--- STATEMENTS ERRORS ---")
        r2 = await db.execute(text("SELECT id, original_filename, parse_status, parse_error FROM statements WHERE parse_error IS NOT NULL"))
        for row in r2.fetchall():
            print(f"Statement {row.id} ({row.original_filename}): {row.parse_error}")

if __name__ == "__main__":
    asyncio.run(main())

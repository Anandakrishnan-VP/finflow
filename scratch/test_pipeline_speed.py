import sys
import os
import time
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Ensure /app is in path
sys.path.insert(0, "/app")

from tasks.analysis_task import _run_parse_statement_pipeline_core

class DummyTask:
    def update_state(self, state, meta):
        pass

async def main():
    file_path = "/data/uploads/30c63ce2-c117-4937-906c-57e4b31f561d.csv"
    if not os.path.exists(file_path):
        print(f"Error: file not found at {file_path}")
        return

    db_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://finflow:admin123@postgres:5432/finflow")
    engine = create_async_engine(db_url, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    case_uuid = "a0000000-0000-0000-0000-000000000000"
    statement_uuid = "b0000000-0000-0000-0000-000000000000"

    print("Running _run_parse_statement_pipeline_core...")
    t0 = time.time()
    
    # We need to insert a dummy statement in processing state first to avoid foreign key or query errors
    async with Session() as db:
        from sqlalchemy import text
        # Insert a dummy case
        await db.execute(
            text("INSERT INTO cases (id, case_number, title, status) VALUES (:cid, 'CASE-DUMMY', 'Dummy Case', 'OPEN') ON CONFLICT (id) DO NOTHING"),
            {"cid": case_uuid}
        )
        # Delete existing dummy statement transactions
        await db.execute(
            text("DELETE FROM transactions WHERE statement_id = :sid"),
            {"sid": statement_uuid}
        )
        await db.execute(
            text("DELETE FROM statements WHERE id = :sid"),
            {"sid": statement_uuid}
        )
        # Insert statement
        await db.execute(
            text("""INSERT INTO statements
                 (id, case_id, original_filename, stored_path, file_hash, file_size_bytes,
                  mime_type, parse_status, parse_progress, parse_stage)
                 VALUES (:sid,:cid,'sbi_200k.csv','/data/uploads/30c63ce2-c117-4937-906c-57e4b31f561d.csv',
                         'dummy-hash-200k',13923682,'text/csv','PROCESSING',0,'Queued')"""),
             {"sid": statement_uuid, "cid": case_uuid}
        )
        await db.commit()

    try:
        await _run_parse_statement_pipeline_core(
            task_self=DummyTask(),
            statement_id=statement_uuid,
            file_path=file_path,
            case_id=case_uuid,
            bank_override=None,
            original_filename="sbi_synthetic_statement_200k.csv",
            user_id="dummy-user-id",
            Session=Session
        )
        t1 = time.time()
        print(f"Pipeline completed in {t1 - t0:.4f} seconds!")
    except Exception as e:
        import traceback
        traceback.print_exc()
    finally:
        # Clean up
        async with Session() as db:
            from sqlalchemy import text
            await db.execute(text("DELETE FROM transactions WHERE statement_id = :sid"), {"sid": statement_uuid})
            await db.execute(text("DELETE FROM statements WHERE id = :sid"), {"sid": statement_uuid})
            await db.commit()
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())

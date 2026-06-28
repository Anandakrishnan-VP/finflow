import asyncio, os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

STATEMENT_ID = '01021a32-8293-4453-be1d-06b6468b1466'
CASE_ID = '39cc8b51-c922-4b94-bb9c-a9d0b93fbbf1'

async def main():
    db_url = os.getenv('DATABASE_URL', '')
    engine = create_async_engine(db_url, echo=False)
    async with engine.begin() as conn:
        # Reset the statement to PROCESSING so re-parse is triggered via the UI
        await conn.execute(text("""
            UPDATE statements 
            SET parse_status='PROCESSING', parse_progress=0, 
                parse_stage='Queued for re-parsing', parse_error=NULL, row_count=0
            WHERE id=:sid
        """), {'sid': STATEMENT_ID})
        print(f"Reset statement {STATEMENT_ID} to PROCESSING state.")
        print("Now trigger re-parse via the Celery task...")

    # Trigger re-parse via Celery
    import sys
    sys.path.insert(0, '/app')
    from tasks.analysis_task import parse_statement_task

    # Get statement info
    async with engine.connect() as conn:
        r = await conn.execute(text(
            'SELECT stored_path, original_filename FROM statements WHERE id=:sid'
        ), {'sid': STATEMENT_ID})
        row = r.fetchone()
        print(f'File path: {row.stored_path}')
        print(f'Original filename: {row.original_filename}')
        print(f'File exists: {os.path.exists(row.stored_path)}')

    # Launch the celery task
    print("Enqueueing re-parse task...")
    task = parse_statement_task.delay(
        STATEMENT_ID,
        row.stored_path,
        CASE_ID,
        None,  # bank_override
        row.original_filename,
        'system'  # user_id
    )
    print(f"Re-parse task enqueued: task_id={task.id}")
    await engine.dispose()

asyncio.run(main())

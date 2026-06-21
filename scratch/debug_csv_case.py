import asyncio, os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

CASE_ID = '39cc8b51-c922-4b94-bb9c-a9d0b93fbbf1'

async def main():
    db_url = os.getenv('DATABASE_URL', '')
    engine = create_async_engine(db_url, echo=False)
    async with engine.connect() as conn:
        # 1. Check transaction count for this case
        r = await conn.execute(text('SELECT COUNT(*) FROM transactions WHERE case_id = :c'), {'c': CASE_ID})
        print('Transactions for this case:', r.scalar())

        # 2. Check total transactions in all DB
        r2 = await conn.execute(text('SELECT COUNT(*) FROM transactions'))
        print('Total transactions in DB:', r2.scalar())

        # 3. Check the statement record
        r3 = await conn.execute(text(
            'SELECT id, original_filename, stored_path, file_hash, parse_status, row_count FROM statements WHERE case_id=:c'
        ), {'c': CASE_ID})
        for row in r3.fetchall():
            print('Statement:', dict(row._mapping))
            stored = row.stored_path
            print('Stored path:', stored)
            print('File exists:', os.path.exists(stored))

        # 4. Check if there are any hash collisions (txn_hash conflict with existing DB rows)
        # This would cause ON CONFLICT DO NOTHING to silently skip all inserts
        r4 = await conn.execute(text(
            'SELECT COUNT(*) FROM transactions WHERE statement_id = (SELECT id FROM statements WHERE case_id=:c LIMIT 1)'
        ), {'c': CASE_ID})
        print('Transactions for this statement:', r4.scalar())

        # 5. Check the txn_hash unique constraint
        r5 = await conn.execute(text(
            "SELECT conname, contype FROM pg_constraint WHERE conrelid = 'transactions'::regclass"
        ))
        print('Constraints on transactions table:')
        for row in r5.fetchall():
            print(' ', dict(row._mapping))

    await engine.dispose()

asyncio.run(main())

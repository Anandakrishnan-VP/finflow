import asyncio, os, csv, hashlib
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

CASE_ID = '39cc8b51-c922-4b94-bb9c-a9d0b93fbbf1'
FILE_PATH = '/data/uploads/01021a32-8293-4453-be1d-06b6468b1466.csv'

async def main():
    db_url = os.getenv('DATABASE_URL', '')
    engine = create_async_engine(db_url, echo=False)

    # Read a sample of txn hashes from the file
    print("Reading first 5 rows of the CSV...")
    with open(FILE_PATH, newline='', encoding='utf-8-sig', errors='replace') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        print("Header:", header)
        for i, row in enumerate(reader):
            if i >= 5: break
            print(f"Row {i}:", row)

    # Check how many hashes from this file already exist in the DB
    print("\nChecking for hash collisions with existing DB rows...")
    async with engine.connect() as conn:
        # Get all txn_hashes from transactions for this case's statement (there are none)
        # Instead, check what the txn_hash for row 1 would be by generating it:
        # The parse generates txn_hash from: account_id|date|amount|narration
        # So let's read from the CSV and see what hashes would be generated

        # Count total unique hashes in DB across all cases
        r = await conn.execute(text('SELECT COUNT(*) FROM transactions'))
        total = r.scalar()
        print(f'Total transactions in whole DB: {total}')

        # Check if any old case has transactions from a similar CSV
        r2 = await conn.execute(text(
            'SELECT DISTINCT case_id, COUNT(*) cnt FROM transactions GROUP BY case_id ORDER BY cnt DESC LIMIT 5'
        ))
        print('Top 5 cases by transaction count:')
        for row in r2.fetchall():
            print(f'  case_id={row[0]} cnt={row[1]}')

        # Generate first few hashes manually to test collision
        with open(FILE_PATH, newline='', encoding='utf-8-sig', errors='replace') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            print('\nFirst row headers:', header)
            sample_hashes = []
            for i, row in enumerate(reader):
                if i >= 10: break
                # This is what generic_parser.py does to create txn_hash
                row_str = '|'.join(row)
                h = hashlib.sha256(row_str.encode()).hexdigest()
                sample_hashes.append(h)
                print(f'Row {i} hash: {h[:16]}...')

        # Check if any of these hashes exist in DB
        print('\nChecking if sample hashes exist in DB...')
        for h in sample_hashes:
            r3 = await conn.execute(text(
                'SELECT case_id FROM transactions WHERE txn_hash=:h'
            ), {'h': h})
            existing = r3.fetchone()
            if existing:
                print(f'COLLISION! Hash {h[:16]}... already in case {existing[0]}')
            else:
                print(f'Hash {h[:16]}... NOT in DB (would be new)')

    await engine.dispose()

asyncio.run(main())

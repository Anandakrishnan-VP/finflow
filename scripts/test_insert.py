import asyncio
from database import AsyncSessionLocal
from parsers.router import route_file
from sqlalchemy import text
from decimal import Decimal

async def run():
    db = AsyncSessionLocal()
    case_id = "9ff71513-525b-4d5a-9a30-ac9bdf856e56"
    stmt_id = "9ff71513-525b-4d5a-9a30-ac9bdf856e56"
    
    # Let's route the file
    txns, meta = await route_file(
        '/data/uploads/SBI_Harish_Reddy_2024.csv',
        case_id,
        stmt_id,
        'sbi'
    )
    
    print(f"Parsed {len(txns)} transactions.")
    txn = txns[0]
    
    sql = """INSERT INTO transactions
             (txn_hash, case_id, statement_id, account_id, account_holder, bank_name,
              txn_date, amount, txn_type, balance_after, narration,
              counterparty_account, counterparty_name)
             VALUES (:h,:cid,:sid,:aid,:ah,:bn,:td,:amt,:tt,:bal,:nar,:cp,:cpn)"""
             
    params = {
        "h": txn.txn_hash,
        "cid": case_id,
        "sid": stmt_id,
        "aid": txn.account_id,
        "ah": txn.account_holder,
        "bn": txn.bank_name,
        "td": txn.txn_date,
        "amt": Decimal(str(txn.amount)),
        "tt": txn.txn_type,
        "bal": Decimal(str(txn.balance_after)) if txn.balance_after else None,
        "nar": txn.narration,
        "cp": txn.counterparty_account,
        "cpn": txn.counterparty_name
    }
    
    print("Attempting insert...")
    try:
        await db.execute(text(sql), params)
        await db.commit()
        print("Insert succeeded!")
    except Exception as e:
        print("Insert failed!")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run())

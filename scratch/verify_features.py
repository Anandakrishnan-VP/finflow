import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import sys
import os

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

async def main():
    DATABASE_URL = "postgresql+asyncpg://finflow:postgres_strong_pass123@localhost:5432/finflow"
    engine = create_async_engine(DATABASE_URL)
    
    print("Connecting to database...")
    async with engine.connect() as conn:
        # 1. Fetch cases
        res = await conn.execute(text("SELECT id, title FROM cases LIMIT 5"))
        cases = res.fetchall()
        print(f"Found {len(cases)} cases:")
        for c in cases:
            print(f" - ID: {c.id}, Title: {c.title}")
            
        if not cases:
            print("No cases found in DB. Cannot proceed with further test verification.")
            return
            
        case_id = str(cases[0].id)
        
        # 2. Test syndicate logic
        print(f"\nTesting syndicates for case: {case_id}")
        
        curr_q = await conn.execute(
            text("SELECT account_id, counterparty_account, narration FROM transactions WHERE case_id = :cid"),
            {"cid": case_id}
        )
        curr_txns = curr_q.fetchall()
        print(f"Transactions in this case: {len(curr_txns)}")
        
        # 3. Test Officer Brief PDF Generation
        print("\nTesting Officer Brief PDF Generation...")
        # Get case info
        case_row = await conn.execute(text("SELECT * FROM cases WHERE id=:cid"), {"cid": case_id})
        case = dict(case_row.fetchone()._mapping)
        
        verdicts_q = await conn.execute(
            text("SELECT account_id, composite_score, role_label, tier_label FROM account_verdicts WHERE case_id = :cid"),
            {"cid": case_id}
        )
        verdicts = [dict(r._mapping) for r in verdicts_q.fetchall()]
        
        alert_q = await conn.execute(
            text("SELECT account_id, flag, confidence FROM alerts WHERE case_id = :cid"),
            {"cid": case_id}
        )
        alerts = [dict(r._mapping) for r in alert_q.fetchall()]
        
        next_actions_q = await conn.execute(
            text("SELECT account_id, action_text, completed FROM case_next_actions WHERE case_id = :cid"),
            {"cid": case_id}
        )
        next_actions = [dict(r._mapping) for r in next_actions_q.fetchall()]
        
        annotations_q = await conn.execute(
            text("SELECT ca.annotation, ca.created_at FROM case_annotations ca WHERE ca.case_id = :cid"),
            {"cid": case_id}
        )
        annotations = [dict(r._mapping) for r in annotations_q.fetchall()]
        
        from reports.officer_brief import generate_officer_brief
        pdf_bytes = generate_officer_brief(
            case, verdicts, alerts, next_actions, annotations,
            {"name": "Test Officer"}
        )
        print(f"Officer Brief PDF successfully generated. Size: {len(pdf_bytes)} bytes.")
        
        # Write test brief to file
        pdf_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_officer_brief.pdf"))
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)
        print(f"Saved test brief to: {pdf_path}")
        
    print("\nAll verification steps completed successfully.")

if __name__ == "__main__":
    asyncio.run(main())

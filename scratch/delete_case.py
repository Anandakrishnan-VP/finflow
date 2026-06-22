import asyncio
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

async def delete_case(case_id: str):
    # Retrieve Database URL from environment or fallback
    import os
    db_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://finflow:postgres_strong_pass123@localhost:5432/finflow")
    print(f"Connecting to database: {db_url}")
    engine = create_async_engine(db_url, echo=True)
    
    async with engine.begin() as conn:
        # Check if case exists
        res = await conn.execute(text("SELECT id, case_number, title FROM cases WHERE id = :cid"), {"cid": case_id})
        case = res.fetchone()
        if not case:
            print(f"Case {case_id} not found in database.")
            await engine.dispose()
            return
        
        print(f"Deleting Case: {case.case_number} — {case.title} (ID: {case.id})")
        
        # Cascade deletes
        deletes = [
            ("alerts", "DELETE FROM alerts WHERE case_id = :cid"),
            ("money_trails", "DELETE FROM money_trails WHERE case_id = :cid"),
            ("evidence_packages", "DELETE FROM evidence_packages WHERE case_id = :cid"),
            ("hypothesis_queries", "DELETE FROM hypothesis_queries WHERE case_id = :cid"),
            ("case_next_actions", "DELETE FROM case_next_actions WHERE case_id = :cid"),
            ("case_annotations", "DELETE FROM case_annotations WHERE case_id = :cid"),
            ("case_benford_results", "DELETE FROM case_benford_results WHERE case_id = :cid"),
            ("narration_clusters", "DELETE FROM narration_clusters WHERE case_id = :cid"),
            ("account_verdicts", "DELETE FROM account_verdicts WHERE case_id = :cid"),
            ("human_review_queue", "DELETE FROM human_review_queue WHERE case_id = :cid"),
            ("analysis_tasks", "DELETE FROM analysis_tasks WHERE case_id = :cid"),
            ("watchlist_hits", "DELETE FROM watchlist_hits WHERE case_id = :cid"),
            ("entity_case_appearances", "DELETE FROM entity_case_appearances WHERE case_id = :cid"),
            ("entities (unlink)", "UPDATE entities SET first_seen_case = NULL WHERE first_seen_case = :cid"),
            ("transactions", "DELETE FROM transactions WHERE case_id = :cid"),
            ("statements", "DELETE FROM statements WHERE case_id = :cid"),
            ("cases", "DELETE FROM cases WHERE id = :cid")
        ]
        
        for name, query in deletes:
            print(f"Running delete on {name}...")
            r = await conn.execute(text(query), {"cid": case_id})
            print(f"Affected rows: {r.rowcount}")

    await engine.dispose()
    print("PostgreSQL cleanup completed.")

    # Clean up Neo4j Graph Database
    try:
        sys.path.append("/app")
        from neo4j_client import get_neo4j_driver
        driver = get_neo4j_driver()
        async with driver.session() as session:
            print("Cleaning up Neo4j graph nodes...")
            res = await session.run("MATCH (n {case_id: $case_id}) DETACH DELETE n", {"case_id": case_id})
            print("Neo4j cleanup completed.")
    except Exception as e:
        print(f"Skipping Neo4j cleanup or encountered warning: {e}")

async def list_cases():
    import os
    db_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://finflow:postgres_strong_pass123@localhost:5432/finflow")
    engine = create_async_engine(db_url, echo=False)
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT id, case_number, title, status FROM cases"))
        rows = res.fetchall()
        print("\nExisting Cases in Database:")
        for r in rows:
            print(f"ID: {r.id} | Case Number: {r.case_number} | Title: {r.title} | Status: {r.status}")
    await engine.dispose()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        cid = sys.argv[1]
        asyncio.run(delete_case(cid))
    else:
        # Default target case ID from error screenshot
        default_cid = "8fda3072-f855-4b3d-b6a2-c9adb80af70b"
        asyncio.run(list_cases())
        print(f"\nNo case ID provided. Retrying deletion for default target {default_cid}...")
        asyncio.run(delete_case(default_cid))
        asyncio.run(list_cases())

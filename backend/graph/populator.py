"""Populates Neo4j with account nodes and transaction edges."""
import logging
from decimal import Decimal
from neo4j_client import get_neo4j_driver
from schemas.uts import UniversalTransaction

logger = logging.getLogger(__name__)

async def populate_graph(case_id: str, txns: list[UniversalTransaction]):
    try:
        driver = get_neo4j_driver()
        async with driver.session() as session:
            # Create account nodes
            accounts = {t.account_id for t in txns} | \
                       {t.counterparty_account for t in txns if t.counterparty_account}
            for account_id in accounts:
                if not account_id: continue
                await session.run("""
                    MERGE (a:Account {account_id: $aid, case_id: $cid})
                    SET a.updated_at = timestamp()
                """, aid=account_id, cid=case_id)

            # Create transaction edges
            for txn in txns:
                if not txn.counterparty_account: continue
                src = txn.account_id if txn.txn_type in ("DR", "DEBIT") else txn.counterparty_account
                dst = txn.counterparty_account if txn.txn_type in ("DR", "DEBIT") else txn.account_id
                if not src or not dst: continue
                await session.run("""
                    MATCH (src:Account {account_id: $src, case_id: $cid})
                    MATCH (dst:Account {account_id: $dst, case_id: $cid})
                    MERGE (src)-[r:SENT {case_id: $cid, txn_hash: $hash}]->(dst)
                    SET r.amount_str = $amt,
                        r.txn_date   = $dt,
                        r.narration  = $nar
                """, src=src, dst=dst, cid=case_id,
                     hash=txn.txn_hash, amt=str(txn.amount),
                     dt=txn.txn_date.isoformat(), nar=(txn.narration or "")[:200])
    except Exception as e:
        logger.warning("Failed to populate Neo4j graph: %s. Skipping Neo4j population.", e)

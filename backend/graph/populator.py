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
            # Create indexes for O(1) matching on large datasets
            try:
                await session.run("CREATE INDEX account_id_idx IF NOT EXISTS FOR (n:Account) ON (n.account_id)")
                await session.run("CREATE INDEX case_id_idx IF NOT EXISTS FOR (n:Account) ON (n.case_id)")
            except Exception as idx_err:
                logger.warning("Failed to create Neo4j indexes (ignoring): %s", idx_err)

            # Create account nodes in batch
            accounts = list({t.account_id for t in txns if t.account_id} | \
                            {t.counterparty_account for t in txns if t.counterparty_account})
            if accounts:
                await session.run("""
                    UNWIND $accounts AS account_id
                    MERGE (a:Account {account_id: account_id, case_id: $cid})
                    SET a.updated_at = timestamp()
                """, accounts=accounts, cid=case_id)

            # Create transaction edges in batch
            tx_data = []
            for txn in txns:
                if not txn.counterparty_account: continue
                src = txn.account_id if txn.txn_type in ("DR", "DEBIT") else txn.counterparty_account
                dst = txn.counterparty_account if txn.txn_type in ("DR", "DEBIT") else txn.account_id
                if not src or not dst: continue
                tx_data.append({
                    "src": src,
                    "dst": dst,
                    "hash": txn.txn_hash,
                    "amt": str(txn.amount),
                    "dt": txn.txn_date.isoformat(),
                    "nar": (txn.narration or "")[:200]
                })

            chunk_size = 5000
            for i in range(0, len(tx_data), chunk_size):
                chunk = tx_data[i:i+chunk_size]
                await session.run("""
                    UNWIND $chunk AS item
                    MATCH (src:Account {account_id: item.src, case_id: $cid})
                    MATCH (dst:Account {account_id: item.dst, case_id: $cid})
                    MERGE (src)-[r:SENT {case_id: $cid, txn_hash: item.hash}]->(dst)
                    SET r.amount_str = item.amt,
                        r.txn_date   = item.dt,
                        r.narration  = item.nar
                """, chunk=chunk, cid=case_id)
    except Exception as e:
        logger.warning("Failed to populate Neo4j graph: %s. Skipping Neo4j population.", e)


async def update_graph_metrics(case_id: str, communities: dict, composite_results: dict, txns_by_acc: dict):
    """Batch updates account nodes in Neo4j with analysis metrics (community, risk score, and transaction volume)."""
    try:
        driver = get_neo4j_driver()
        async with driver.session() as session:
            updates = []
            for account_id, res in composite_results.items():
                comm = communities.get(account_id, 0)
                score = float(res["composite_score"]) / 100.0
                volume = len(txns_by_acc.get(account_id, []))
                updates.append({
                    "acc_id": account_id,
                    "comm": comm,
                    "score": score,
                    "vol": volume
                })
            
            if updates:
                await session.run("""
                    UNWIND $updates AS item
                    MATCH (a:Account {account_id: item.acc_id, case_id: $cid})
                    SET a.community_id = item.comm,
                        a.risk_score = item.score,
                        a.total_volume = item.vol
                """, updates=updates, cid=case_id)
    except Exception as e:
        logger.warning("Failed to update Neo4j node metrics: %s", e)

from celery_app import celery_app
from asgiref.sync import async_to_sync
import logging

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, name="analyze_case")
def analyze_case_task(self, case_id: str):
    """[FIX C3]: async_to_sync bridge. [FIX F3]: hash re-verified before pipeline."""
    try:
        task_id = self.request.id
        async_to_sync(_run_analysis_pipeline)(self, case_id, task_id)
        return str(case_id)
    except Exception as e:
        logger.error("Analysis failed for case %s: %s", case_id, e, exc_info=True)
        raise

async def _run_analysis_pipeline(task_self, case_id: str, task_id: str):
    import os
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import text

    def update(pct: int, stage: str):
        task_self.update_state(task_id=task_id, state="PROGRESS", meta={"progress": pct, "stage": stage})

    # [FIX C3]: Create engine INSIDE task — not at module level
    engine = create_async_engine(os.getenv("DATABASE_URL"), echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        # Update case status to ANALYZING
        await db.execute(
            text("UPDATE cases SET status='ANALYZING', updated_at=NOW() WHERE id=:cid"),
            {"cid": case_id}
        )
        await db.commit()

        update(3, "Verifying file integrity")
        mismatches = await _verify_statement_hashes(db, case_id)
        if mismatches:
            raise ValueError(
                f"FORENSIC INTEGRITY VIOLATION: {len(mismatches)} file(s) modified "
                f"since upload: {mismatches}. Analysis halted.")

        update(8, "Loading and deduplicating transactions")
        transactions = await _load_transactions(db, case_id)
        if not transactions:
            raise ValueError("No parsed transactions found for this case.")

        update(15, "Validating balances")
        from engine.balance_validator import validate_balances, detect_failed_transactions
        transactions = validate_balances(transactions)
        transactions = detect_failed_transactions(transactions)

        update(25, "Running enrichment")
        from entity.extractor import enrich_transactions_with_entities
        transactions = enrich_transactions_with_entities(transactions)

        update(30, "Checking watchlist")
        from watchlist.checker import check_against_watchlist
        statement_ids = list({t.statement_id for t in transactions})
        sid = statement_ids[0] if statement_ids else case_id
        transactions = await check_against_watchlist(db, transactions, case_id, sid)

        update(38, "Detecting suspicious patterns")
        from engine.rule_engine import run_all_rules
        transactions = run_all_rules(transactions)

        update(48, "Tracing money flows (FIFO)")
        from engine.fifo import trace_fifo
        money_trail = trace_fifo(transactions)

        update(55, "Populating graph database")
        from graph.populator import populate_graph
        await populate_graph(case_id, transactions)

        update(65, "Running graph algorithms (PageRank + Louvain)")
        from graph.algorithms import run_graph_algorithms, detect_circular_flows
        graph_results = await run_graph_algorithms(case_id)
        circles = await detect_circular_flows(case_id)

        update(75, "Running ML anomaly detection (Isolation Forest)")
        from ml.isolation_forest import run_isolation_forest
        transactions = run_isolation_forest(transactions)

        update(82, "Resolving entities")
        from entity.resolver import resolve_entities
        await resolve_entities(db, case_id, transactions)

        update(87, "Saving analysis results")
        await _save_alerts(db, case_id, transactions, graph_results, circles)
        await _save_money_trail(db, case_id, money_trail, transactions)

        update(91, "Generating LLM narrative and case theory")
        case_data = _build_case_data(case_id, transactions, money_trail, graph_results)
        from llm.narrator import generate_narrative
        from llm.case_theory import generate_case_theory
        narrative    = await generate_narrative(case_data)
        case_theory  = await generate_case_theory(case_data)

        update(96, "Saving narrative and case theory")
        await db.execute(
            text("""UPDATE cases
                    SET status='ANALYZED', updated_at=NOW(),
                        description=description  -- narrative stored separately
                    WHERE id=:cid"""),
            {"cid": case_id}
        )
        # Store narrative in analysis_tasks or a separate table
        await db.execute(
            text("""UPDATE analysis_tasks SET status='COMPLETE', completed_at=NOW()
                    WHERE case_id=:cid"""),
            {"cid": case_id}
        )
        await db.commit()

    await engine.dispose()
    update(100, "Complete")

async def _verify_statement_hashes(db, case_id: str) -> list:
    """[FIX F3]: Re-compute SHA-256 of every uploaded file vs. stored hash."""
    import hashlib, os
    from sqlalchemy import text
    result = await db.execute(
        text("SELECT id, stored_path, file_hash, original_filename FROM statements "
             "WHERE case_id=:cid AND parse_status='PARSED'"),
        {"cid": case_id}
    )
    mismatches = []
    for row in result.fetchall():
        if not os.path.exists(row.stored_path):
            raise RuntimeError(
                f"INTEGRITY ERROR: File missing: {row.stored_path} "
                f"(statement_id={row.id}). Chain of custody broken.")
        actual = hashlib.sha256(open(row.stored_path, "rb").read()).hexdigest()
        if actual != row.file_hash:
            logger.error("HASH MISMATCH: statement %s stored=%s actual=%s",
                         row.id, row.file_hash[:16], actual[:16])
            mismatches.append(str(row.id))
    return mismatches

async def _load_transactions(db, case_id: str) -> list:
    """Load all PARSED transactions for this case from DB as UTS objects."""
    from sqlalchemy import text
    from schemas.uts import UniversalTransaction, TransactionType
    from decimal import Decimal

    result = await db.execute(
        text("""SELECT t.* FROM transactions t
                JOIN statements s ON t.statement_id = s.id
                WHERE t.case_id=:cid
                ORDER BY t.txn_date"""),
        {"cid": case_id}
    )
    rows = result.fetchall()
    txns = []
    for row in rows:
        try:
            txns.append(UniversalTransaction(
                txn_hash=row.txn_hash, case_id=str(row.case_id),
                statement_id=str(row.statement_id),
                source_file_hash=row.txn_hash,
                account_id=row.account_id or "",
                account_holder=row.account_holder or "",
                bank_name=row.bank_name or "",
                txn_date=row.txn_date,
                amount=Decimal(str(row.amount)),
                txn_type=TransactionType(row.txn_type),
                balance_after=Decimal(str(row.balance_after)) if row.balance_after else None,
                narration=row.narration or "",
                counterparty_account=row.counterparty_account,
                counterparty_name=row.counterparty_name,
            ))
        except Exception as e:
            logger.debug("Row load error: %s", e)
    return txns

async def _save_alerts(db, case_id: str, transactions, graph_results: dict, circles: list):
    from sqlalchemy import text
    import json
    for txn in transactions:
        for flag in txn.flags:
            await db.execute(
                text("""INSERT INTO alerts (case_id, account_id, flag, confidence, evidence)
                        VALUES (:cid, :aid, :flag, :conf, CAST(:ev AS jsonb))
                        ON CONFLICT DO NOTHING"""),
                {
                    "cid": case_id,
                    "aid": txn.account_id,
                    "flag": str(flag),
                    "conf": txn.risk_score or 0.5,
                    "ev": json.dumps({"narration": txn.narration,
                                     "amount": str(txn.amount),
                                     "date": txn.txn_date.isoformat()})
                }
            )
    # Add circular flow alerts from Neo4j
    for circle in circles:
        for account_id in circle.get("accounts", []):
            await db.execute(
                text("""INSERT INTO alerts (case_id, account_id, flag, confidence, evidence)
                        VALUES (:cid, :aid, 'CIRCULAR_FLOW', 0.9, CAST(:ev AS jsonb))
                        ON CONFLICT DO NOTHING"""),
                {"cid": case_id, "aid": account_id,
                 "ev": json.dumps({"accounts": circle["accounts"], "hops": circle["hops"]})}
            )
    await db.commit()

async def _save_money_trail(db, case_id: str, trail, transactions):
    from sqlalchemy import text
    txn_id_map = {t.txn_hash: t for t in transactions}
    for entry in trail:
        credit_txn = txn_id_map.get(entry.credit_txn_id)
        debit_txn  = txn_id_map.get(entry.debit_txn_id)
        if not credit_txn or not debit_txn:
            continue
        # Get DB UUIDs by txn_hash
        cr = await db.execute(
            text("SELECT id FROM transactions WHERE txn_hash=:h"), {"h": entry.credit_txn_id})
        dr = await db.execute(
            text("SELECT id FROM transactions WHERE txn_hash=:h"), {"h": entry.debit_txn_id})
        cr_row = cr.fetchone()
        dr_row = dr.fetchone()
        if not cr_row or not dr_row:
            continue
        await db.execute(
            text("""INSERT INTO money_trails (case_id, credit_txn_id, debit_txn_id, amount, days_held)
                    VALUES (:cid, :crid, :drid, :amt, :days)"""),
            {"cid": case_id, "crid": str(cr_row[0]), "drid": str(dr_row[0]),
             "amt": str(entry.amount), "days": entry.days_held}
        )
    await db.commit()

def _build_case_data(case_id: str, transactions, trail, graph_results: dict) -> dict:
    """Build summary dict for LLM prompt (tokenized before API call)."""
    from collections import Counter
    flags = []
    for t in transactions:
        flags.extend([str(f) for f in t.flags])
    flag_counts = Counter(flags)
    return {
        "case_id": case_id,
        "transaction_count": len(transactions),
        "top_flags": dict(flag_counts.most_common(5)),
        "top_suspicious_transactions": [
            {"amount": str(t.amount), "narration": t.narration[:100], "flags": [str(f) for f in t.flags]}
            for t in sorted(transactions, key=lambda x: x.risk_score or 0, reverse=True)[:10]
        ],
        "money_trail_count": len(trail),
        "graph_top_pagerank": list(graph_results.get("pagerank", {}).items())[:5],
        "community_count": len(set(graph_results.get("communities", {}).values())),
    }

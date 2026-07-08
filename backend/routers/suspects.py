import io
import re
import json
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_db
from security.auth import get_current_user
from security.audit_log import log_action
from neo4j_client import get_neo4j_driver
from entity.extractor import extract_entities_from_narration

# ReportLab imports for PDF generation
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

logger = logging.getLogger(__name__)

# Register both prefix variations to prevent router path mismatch
router = APIRouter(tags=["suspects"])

# Helper: name fuzzy matching logic
def is_fuzzy_name_match(name1: str, name2: str) -> bool:
    if not name1 or not name2:
        return False
    n1 = name1.lower().strip()
    n2 = name2.lower().strip()
    if n1 == n2:
        return True
    words1 = [w for w in re.split(r'\s+', n1) if len(w) > 0]
    words2 = [w for w in re.split(r'\s+', n2) if len(w) > 0]
    if not words1 or not words2:
        return False
    for w1 in words1:
        if len(w1) > 3:
            for w2 in words2:
                if w1 == w2:
                    other1 = [w[0] for w in words1 if w != w1]
                    other2 = [w[0] for w in words2 if w != w2]
                    if not other1 or not other2 or any(i1 == i2 for i1 in other1 for i2 in other2):
                        return True
    return False

# Identity Resolution Helper
async def resolve_linked_accounts_internal(db: AsyncSession, case_id: str, account_id: str) -> List[dict]:
    # 1. Load target account info from statements
    stmt_target_q = await db.execute(
        text("SELECT DISTINCT account_id, account_holder, bank_name FROM statements WHERE case_id=:cid AND account_id=:aid"),
        {"cid": case_id, "aid": account_id}
    )
    target_row = stmt_target_q.fetchone()
    
    # Fallback to transactions if not in statements
    if not target_row:
        tx_target_q = await db.execute(
            text("SELECT DISTINCT account_id, account_holder, bank_name FROM transactions WHERE case_id=:cid AND account_id=:aid LIMIT 1"),
            {"cid": case_id, "aid": account_id}
        )
        target_row = tx_target_q.fetchone()

    if not target_row:
        # Return at least itself
        return [{
            "account_id": account_id,
            "bank_name": "Unknown Bank",
            "account_holder": "Unknown Suspect",
            "match_confidence": "Confirmed",
            "match_reason": "Primary Account"
        }]

    target_holder = target_row.account_holder or "Unnamed Suspect"
    target_bank = target_row.bank_name or "Unknown Bank"

    # 2. Extract targets' features from narrations
    target_txns_q = await db.execute(
        text("SELECT narration FROM transactions WHERE case_id=:cid AND account_id=:aid"),
        {"cid": case_id, "aid": account_id}
    )
    target_narrations = [r[0] for r in target_txns_q.fetchall() if r[0]]
    
    target_pans = set()
    target_phones = set()
    target_upis = set()
    for narr in target_narrations:
        ents = extract_entities_from_narration(narr)
        if "pan_numbers" in ents:
            target_pans.update(ents["pan_numbers"])
        if "phone_numbers" in ents:
            target_phones.update(ents["phone_numbers"])
        if "upi_ids" in ents:
            target_upis.update(ents["upi_ids"])

    # 3. Load all candidate statement accounts in the case
    candidates_q = await db.execute(
        text("SELECT DISTINCT account_id, account_holder, bank_name FROM statements WHERE case_id=:cid"),
        {"cid": case_id}
    )
    candidates = [dict(r._mapping) for r in candidates_q.fetchall()]

    linked = []
    # Always include the primary account first
    linked.append({
        "account_id": account_id,
        "bank_name": target_bank,
        "account_holder": target_holder,
        "match_confidence": "Confirmed",
        "match_reason": "Primary Account"
    })

    for cand in candidates:
        cand_id = cand["account_id"]
        if cand_id == account_id:
            continue
        
        cand_holder = cand["account_holder"] or "Unnamed Suspect"
        cand_bank = cand["bank_name"] or "Unknown Bank"

        # Query candidate's transaction narrations for overlap check
        cand_txns_q = await db.execute(
            text("SELECT narration FROM transactions WHERE case_id=:cid AND account_id=:aid"),
            {"cid": case_id, "aid": cand_id}
        )
        cand_narrations = [r[0] for r in cand_txns_q.fetchall() if r[0]]
        
        cand_pans = set()
        cand_phones = set()
        cand_upis = set()
        for narr in cand_narrations:
            ents = extract_entities_from_narration(narr)
            if "pan_numbers" in ents:
                cand_pans.update(ents["pan_numbers"])
            if "phone_numbers" in ents:
                cand_phones.update(ents["phone_numbers"])
            if "upi_ids" in ents:
                cand_upis.update(ents["upi_ids"])

        # Check match criteria
        common_pans = target_pans.intersection(cand_pans)
        common_phones = target_phones.intersection(cand_phones)
        common_upis = target_upis.intersection(cand_upis)

        if common_pans:
            linked.append({
                "account_id": cand_id,
                "bank_name": cand_bank,
                "account_holder": cand_holder,
                "match_confidence": "Confirmed",
                "match_reason": f"PAN (matched on {list(common_pans)[0]})"
            })
        elif common_phones:
            linked.append({
                "account_id": cand_id,
                "bank_name": cand_bank,
                "account_holder": cand_holder,
                "match_confidence": "Confirmed",
                "match_reason": f"Phone (matched on {list(common_phones)[0]})"
            })
        elif common_upis:
            linked.append({
                "account_id": cand_id,
                "bank_name": cand_bank,
                "account_holder": cand_holder,
                "match_confidence": "Confirmed",
                "match_reason": f"UPI (matched on {list(common_upis)[0]})"
            })
        elif cand_holder.lower().strip() == target_holder.lower().strip() and target_holder != "Unnamed Suspect":
            linked.append({
                "account_id": cand_id,
                "bank_name": cand_bank,
                "account_holder": cand_holder,
                "match_confidence": "Unconfirmed",
                "match_reason": "Name only (exact match)"
            })
        elif is_fuzzy_name_match(target_holder, cand_holder) and target_holder != "Unnamed Suspect":
            linked.append({
                "account_id": cand_id,
                "bank_name": cand_bank,
                "account_holder": cand_holder,
                "match_confidence": "Unconfirmed",
                "match_reason": f"Fuzzy Name ({target_holder} vs {cand_holder})"
            })

    return linked


# --- DECORATOR PATH PAIRINGS ---

@router.get("/cases/{case_id}/suspects/{account_id}/overview")
@router.get("/case/{case_id}/suspect/{account_id}/overview")
async def get_suspect_overview(
    case_id: str,
    account_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    linked_accounts = await resolve_linked_accounts_internal(db, case_id, account_id)
    linked_ids = [la["account_id"] for la in linked_accounts]

    # Get composite risk score & details from account_verdicts
    verdict_q = await db.execute(
        text("SELECT composite_score, score_breakdown, algo_verdict, llm_verdict, llm_reasoning, role_label, tier_label FROM account_verdicts WHERE case_id=:cid AND account_id=:aid"),
        {"cid": case_id, "aid": account_id}
    )
    verdict_row = verdict_q.fetchone()
    
    score = 50
    role = "Mule / Layer"
    tier = "MEDIUM"
    breakdown = {}
    verdict_reason = ""
    
    if verdict_row:
        score = verdict_row.composite_score
        role = verdict_row.role_label or role
        tier = verdict_row.tier_label or tier
        breakdown = verdict_row.score_breakdown or {}
        verdict_reason = verdict_row.llm_reasoning or ""

    # Calculate metrics over all linked accounts
    tx_metrics_q = await db.execute(
        text("""
            SELECT 
                COALESCE(SUM(
                    CASE 
                        WHEN account_id = ANY(:aids) AND txn_type='CR' THEN amount
                        WHEN counterparty_account = ANY(:aids) AND txn_type='DR' THEN amount
                        ELSE 0 
                    END
                ), 0) AS total_received,
                COALESCE(SUM(
                    CASE 
                        WHEN account_id = ANY(:aids) AND txn_type='DR' THEN amount
                        WHEN counterparty_account = ANY(:aids) AND txn_type='CR' THEN amount
                        ELSE 0 
                    END
                ), 0) AS total_sent,
                COUNT(DISTINCT 
                    CASE 
                        WHEN account_id = ANY(:aids) THEN COALESCE(counterparty_account, counterparty_name)
                        ELSE account_id
                    END
                ) AS counterparty_count
            FROM transactions 
            WHERE case_id=:cid AND (account_id = ANY(:aids) OR counterparty_account = ANY(:aids))
        """),
        {"cid": case_id, "aids": list(linked_ids) if linked_ids else [account_id]}
    )
    metrics_row = tx_metrics_q.fetchone()
    
    total_received = float(metrics_row.total_received) if metrics_row else 0.0
    total_sent = float(metrics_row.total_sent) if metrics_row else 0.0
    counterparty_count = metrics_row.counterparty_count if metrics_row else 0
    
    net_retained = total_received - total_sent
    net_retained_pct = (net_retained / total_received * 100) if total_received > 0 else 0.0

    # Fetch Alerts/Flags panel
    alerts_q = await db.execute(
        text("SELECT flag, confidence, evidence FROM alerts WHERE case_id=:cid AND account_id = ANY(:aids)"),
        {"cid": case_id, "aids": list(linked_ids) if linked_ids else [account_id]}
    )
    
    flags_map = {}
    for r in alerts_q.fetchall():
        flg = r.flag
        if flg not in flags_map:
            flags_map[flg] = {
                "flag": flg,
                "confidence": float(r.confidence or 0.5),
                "count": 0,
                "evidence_list": []
            }
        flags_map[flg]["count"] += 1
        
        # Load evidence JSON
        ev = r.evidence
        if isinstance(ev, str):
            try:
                ev = json.loads(ev)
            except Exception:
                ev = {}
        flags_map[flg]["evidence_list"].append(ev)

    # Extract identifiers (PAN, Phone, UPI) from narrations of all linked accounts' transactions
    pans_set = set()
    phones_set = set()
    upis_set = set()
    
    narrations_q = await db.execute(
        text("""
            SELECT narration 
            FROM transactions 
            WHERE case_id = :cid 
              AND (account_id = ANY(:aids) OR counterparty_account = ANY(:aids))
              AND narration IS NOT NULL AND narration != ''
        """),
        {"cid": case_id, "aids": list(linked_ids) if linked_ids else [account_id]}
    )
    for row in narrations_q.fetchall():
        narr = row[0]
        ents = extract_entities_from_narration(narr)
        if "pan_numbers" in ents:
            pans_set.update(ents["pan_numbers"])
        if "phone_numbers" in ents:
            phones_set.update(ents["phone_numbers"])
        if "upi_ids" in ents:
            upis_set.update(ents["upi_ids"])

    return {
        "account_id": account_id,
        "account_holder": linked_accounts[0]["account_holder"],
        "bank_name": linked_accounts[0]["bank_name"],
        "composite_score": score,
        "role_label": role,
        "tier_label": tier,
        "score_breakdown": breakdown,
        "reasoning": verdict_reason,
        "metrics": {
            "total_received": total_received,
            "total_sent": total_sent,
            "net_retained": net_retained,
            "net_retained_pct": net_retained_pct,
            "counterparty_count": counterparty_count
        },
        "flags": list(flags_map.values()),
        "linked_accounts_count": len(linked_accounts),
        "extracted_pans": list(pans_set),
        "extracted_phones": list(phones_set),
        "extracted_upis": list(upis_set)
    }



@router.get("/cases/{case_id}/suspects/{account_id}/graph")
@router.get("/case/{case_id}/suspect/{account_id}/graph")
async def get_suspect_graph(
    case_id: str,
    account_id: str,
    hops: int = Query(1, ge=1, le=2),
    round_trip_only: bool = Query(False),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    linked_accounts = await resolve_linked_accounts_internal(db, case_id, account_id)
    linked_ids = [la["account_id"] for la in linked_accounts]

    nodes = []
    edges = []

    # Get Neo4j Driver
    driver = get_neo4j_driver()
    try:
        async with driver.session() as session:
            if round_trip_only:
                # Closed cycles involving any of the suspect's accounts
                cypher = """
                    MATCH (a:Account {case_id: $cid})
                    WHERE a.account_id IN $targets
                    MATCH path = (a)-[:SENT*2..4]->(a)
                    WITH path
                    UNWIND relationships(path) AS r
                    WITH startNode(r) AS src, endNode(r) AS dst, r
                    RETURN DISTINCT src.account_id AS source, dst.account_id AS target,
                                    sum(toFloat(r.amount_str)) AS total_amount,
                                    count(r) AS txn_count
                """
                edge_result = await session.run(cypher, cid=case_id, targets=linked_ids)
            elif hops == 1:
                # 1-hop connections
                cypher = """
                    MATCH (src:Account {case_id: $cid})-[r:SENT]->(dst:Account {case_id: $cid})
                    WHERE src.account_id IN $targets OR dst.account_id IN $targets
                    WITH src, dst, collect(r) AS rels
                    RETURN src.account_id AS source, dst.account_id AS target,
                           reduce(s = 0.0, rel IN rels | s + toFloat(rel.amount_str)) AS total_amount,
                           size(rels) AS txn_count
                """
                edge_result = await session.run(cypher, cid=case_id, targets=linked_ids)
            else:
                # 2-hop induced subgraph
                cypher = """
                    MATCH (a:Account {case_id: $cid})
                    WHERE a.account_id IN $targets
                    MATCH (a)-[:SENT*0..2]-(b:Account {case_id: $cid})
                    WITH DISTINCT b.account_id AS valid_account_ids
                    MATCH (src:Account {case_id: $cid})-[r:SENT]->(dst:Account {case_id: $cid})
                    WHERE src.account_id IN valid_account_ids AND dst.account_id IN valid_account_ids
                    WITH src, dst, collect(r) AS rels
                    RETURN src.account_id AS source, dst.account_id AS target,
                           reduce(s = 0.0, rel IN rels | s + toFloat(rel.amount_str)) AS total_amount,
                           size(rels) AS txn_count
                """
                edge_result = await session.run(cypher, cid=case_id, targets=linked_ids)

            edge_records = []
            valid_node_ids = set()
            async for record in edge_result:
                source = record["source"]
                target = record["target"]
                valid_node_ids.add(source)
                valid_node_ids.add(target)
                edge_records.append({
                    "source": source,
                    "target": target,
                    "total_amount": record["total_amount"],
                    "txn_count": record["txn_count"]
                })

            # Load node metadata
            node_result = await session.run("""
                MATCH (a:Account {case_id: $cid})
                WHERE a.account_id IN $valid_ids
                RETURN a.account_id AS account_id, a.name AS name, a.bank AS bank
            """, cid=case_id, valid_ids=list(valid_node_ids))

            node_metadata = {}
            async for record in node_result:
                node_metadata[record["account_id"]] = {
                    "name": record["name"] or "Unknown Account",
                    "bank": record["bank"] or "Unknown Bank"
                }

    except Exception as e:
        logger.warning("Neo4j queries failed in suspect graph endpoint: %s. Falling back to SQL.", e)
        # Fallback to SQL to construct graph if Neo4j is offline
        valid_node_ids = set(linked_ids)
        
        # Load 1-hop or 2-hop edges from SQL
        if hops == 1:
            sql = """
                SELECT account_id AS source, counterparty_account AS target, 
                       SUM(amount) AS total_amount, COUNT(*) AS txn_count
                FROM transactions
                WHERE case_id=:cid AND (account_id = ANY(:targets) OR counterparty_account = ANY(:targets))
                  AND counterparty_account IS NOT NULL AND counterparty_account != ''
                GROUP BY account_id, counterparty_account
            """
        else:
            sql = """
                WITH target_neighbors AS (
                    SELECT DISTINCT counterparty_account AS acc_id FROM transactions WHERE case_id=:cid AND account_id = ANY(:targets)
                    UNION
                    SELECT DISTINCT account_id AS acc_id FROM transactions WHERE case_id=:cid AND counterparty_account = ANY(:targets)
                    UNION
                    SELECT UNNEST(:targets) AS acc_id
                )
                SELECT account_id AS source, counterparty_account AS target, 
                       SUM(amount) AS total_amount, COUNT(*) AS txn_count
                FROM transactions
                WHERE case_id=:cid 
                  AND account_id IN (SELECT acc_id FROM target_neighbors)
                  AND counterparty_account IN (SELECT acc_id FROM target_neighbors)
                  AND counterparty_account IS NOT NULL AND counterparty_account != ''
                GROUP BY account_id, counterparty_account
            """
        
        edge_q = await db.execute(text(sql), {"cid": case_id, "targets": list(linked_ids)})
        edge_records = []
        for r in edge_q.fetchall():
            source = r.source
            target = r.target
            valid_node_ids.add(source)
            valid_node_ids.add(target)
            edge_records.append({
                "source": source,
                "target": target,
                "total_amount": float(r.total_amount),
                "txn_count": r.txn_count
            })

        # Load metadata from SQL
        meta_q = await db.execute(
            text("SELECT DISTINCT account_id, account_holder AS name, bank_name AS bank FROM transactions WHERE case_id=:cid AND account_id = ANY(:vids)"),
            {"cid": case_id, "vids": list(valid_node_ids) if valid_node_ids else [account_id]}
        )
        node_metadata = {}
        for r in meta_q.fetchall():
            node_metadata[r.account_id] = {
                "name": r.name or "Unknown Counterparty",
                "bank": r.bank or "Unknown Bank"
            }

    # Enrichment of verdicts from Postgres
    verdict_q = await db.execute(
        text("SELECT account_id, composite_score, role_label, tier_label FROM account_verdicts WHERE case_id=:cid AND account_id = ANY(:vids)"),
        {"cid": case_id, "vids": list(valid_node_ids) if valid_node_ids else [account_id]}
    )
    verdict_map = {r.account_id: {"score": r.composite_score, "role": r.role_label, "tier": r.tier_label} for r in verdict_q.fetchall()}

    # Construct Cytoscape elements
    for node_id in valid_node_ids:
        meta = node_metadata.get(node_id, {"name": "Unknown Account", "bank": "Unknown Bank"})
        v = verdict_map.get(node_id, {"score": 40, "role": "Counterparty", "tier": "LOW"})
        nodes.append({
            "data": {
                "id": node_id,
                "account_id": node_id,
                "name": meta["name"],
                "bank": meta["bank"],
                "composite_score": v["score"],
                "role_label": v["role"],
                "tier_label": v["tier"],
                "is_suspect": node_id in linked_ids
            }
        })

    for ed in edge_records:
        edges.append({
            "data": {
                "id": f"{ed['source']}_{ed['target']}",
                "source": ed["source"],
                "target": ed["target"],
                "amount": ed["total_amount"],
                "txn_count": ed["txn_count"],
                "label": f"₹{ed['total_amount']:,.0f} ({ed['txn_count']} txs)"
            }
        })

    return {"nodes": nodes, "edges": edges}


@router.get("/cases/{case_id}/suspects/{account_id}/linked-accounts")
@router.get("/case/{case_id}/suspect/{account_id}/linked-accounts")
async def get_suspect_linked_accounts(
    case_id: str,
    account_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await resolve_linked_accounts_internal(db, case_id, account_id)


@router.get("/cases/{case_id}/suspects/{account_id}/transactions")
@router.get("/case/{case_id}/suspect/{account_id}/transactions")
async def get_suspect_transactions(
    case_id: str,
    account_id: str,
    channel: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    amount_min: Optional[float] = Query(None),
    amount_max: Optional[float] = Query(None),
    direction: Optional[str] = Query(None), # inbound | outbound
    flagged_only: bool = Query(False),
    counterparty: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    linked_accounts = await resolve_linked_accounts_internal(db, case_id, account_id)
    linked_ids = [la["account_id"] for la in linked_accounts]

    sql_parts = [
        """
        SELECT t.txn_hash, t.txn_date, t.amount, t.txn_type, t.narration,
               t.counterparty_account, t.counterparty_name, t.counterparty_bank,
               t.account_id, s.bank_name
        FROM transactions t
        JOIN statements s ON t.statement_id = s.id
        WHERE t.case_id = :cid AND (t.account_id = ANY(:aids) OR t.counterparty_account = ANY(:aids))
        """
    ]
    params = {"cid": case_id, "aids": list(linked_ids)}

    if channel:
        sql_parts.append("AND t.narration ILIKE :channel")
        params["channel"] = f"%{channel}%"
    
    if date_from:
        sql_parts.append("AND t.txn_date >= :date_from")
        params["date_from"] = date_from

    if date_to:
        sql_parts.append("AND t.txn_date <= :date_to")
        params["date_to"] = date_to

    if amount_min is not None:
        sql_parts.append("AND t.amount >= :amount_min")
        params["amount_min"] = amount_min

    if amount_max is not None:
        sql_parts.append("AND t.amount <= :amount_max")
        params["amount_max"] = amount_max

    if direction == "inbound":
        sql_parts.append("AND t.txn_type = 'CR'")
    elif direction == "outbound":
        sql_parts.append("AND t.txn_type = 'DR'")

    if counterparty:
        sql_parts.append("AND (t.counterparty_name ILIKE :cp OR t.counterparty_account ILIKE :cp)")
        params["cp"] = f"%{counterparty}%"

    if flagged_only:
        sql_parts.append("""
            AND EXISTS (
                SELECT 1 FROM alerts al
                WHERE al.case_id = t.case_id AND al.account_id = t.account_id
                AND al.evidence->>'narration' = t.narration
                AND al.evidence->>'amount' = CAST(t.amount AS VARCHAR)
            )
        """)

    sql_parts.append("ORDER BY t.txn_date DESC")

    result = await db.execute(text(" ".join(sql_parts)), params)
    txns = [dict(r._mapping) for r in result.fetchall()]
    return txns


@router.get("/cases/{case_id}/suspects/{account_id}/timeline")
@router.get("/case/{case_id}/suspect/{account_id}/timeline")
async def get_suspect_timeline(
    case_id: str,
    account_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    linked_accounts = await resolve_linked_accounts_internal(db, case_id, account_id)
    linked_ids = [la["account_id"] for la in linked_accounts]

    # Cumulative transaction points sorted chronologically
    txns_q = await db.execute(
        text("""
            SELECT t.txn_date, t.amount, t.txn_type, t.narration, t.account_id, t.balance_after, s.bank_name,
                   t.counterparty_name, t.counterparty_account
            FROM transactions t
            JOIN statements s ON t.statement_id = s.id
            WHERE t.case_id = :cid AND (t.account_id = ANY(:aids) OR t.counterparty_account = ANY(:aids))
            ORDER BY t.txn_date ASC
        """),
        {"cid": case_id, "aids": list(linked_ids)}
    )
    txns = [dict(r._mapping) for r in txns_q.fetchall()]

    # Fetch change points / CUSUM anomalies
    cusum_q = await db.execute(
        text("SELECT flag, confidence, evidence FROM alerts WHERE case_id=:cid AND account_id = ANY(:aids) AND flag = 'CUSUM_BREAK'"),
        {"cid": case_id, "aids": list(linked_ids)}
    )
    cusum_alerts = []
    for r in cusum_q.fetchall():
        ev = r.evidence
        if isinstance(ev, str):
            try:
                ev = json.loads(ev)
            except Exception:
                ev = {}
        cusum_alerts.append({
            "date": ev.get("date"),
            "narration": ev.get("narration"),
            "amount": ev.get("amount")
        })

    return {
        "transactions": txns,
        "significant_changes": cusum_alerts
    }


@router.get("/cases/{case_id}/suspects/{account_id}/dossier.pdf")
@router.get("/case/{case_id}/suspect/{account_id}/dossier.pdf")
async def get_suspect_dossier(
    case_id: str,
    account_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Fetch overview details
    overview = await get_suspect_overview(case_id, account_id, current_user, db)
    linked_accounts = await resolve_linked_accounts_internal(db, case_id, account_id)

    # Fetch largest 10 transactions
    linked_ids = [la["account_id"] for la in linked_accounts]
    tx_q = await db.execute(
        text("""
            SELECT t.txn_date, t.amount, t.txn_type, t.counterparty_name, t.narration, t.account_id
            FROM transactions t
            WHERE t.case_id = :cid AND (t.account_id = ANY(:aids) OR t.counterparty_account = ANY(:aids))
            ORDER BY t.amount DESC LIMIT 10
        """),
        {"cid": case_id, "aids": list(linked_ids)}
    )
    top_txns = [dict(r._mapping) for r in tx_q.fetchall()]

    # Generate PDF in memory
    pdf_buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    
    # Custom colors and styles
    c_primary = colors.HexColor("#1e293b")   # Slate 800
    c_secondary = colors.HexColor("#0f766e") # Teal 700
    c_danger = colors.HexColor("#be123c")    # Rose 700

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        textColor=c_primary,
        fontSize=24,
        leading=28,
        spaceAfter=12
    )
    
    section_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        textColor=c_secondary,
        fontSize=16,
        leading=20,
        spaceBefore=14,
        spaceAfter=8
    )

    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        spaceAfter=6
    )

    bold_body_style = ParagraphStyle(
        'DocBodyBold',
        parent=body_style,
        fontName='Helvetica-Bold'
    )

    story = []

    # 1. Header
    story.append(Paragraph("KARNATAKA STATE POLICE", bold_body_style))
    story.append(Paragraph("ECONOMIC OFFENCES WING (CID)", bold_body_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("SUSPECT FORENSIC DOSSIER", title_style))
    story.append(Paragraph(f"Primary Suspect Account: {account_id}", bold_body_style))
    story.append(Paragraph(f"Name: {overview['account_holder']} | Primary Bank: {overview['bank_name']}", body_style))
    story.append(Paragraph(f"Composite Risk Score: <b>{overview['composite_score']}/100</b> (Classification: {overview['tier_label']})", body_style))
    story.append(Paragraph(f"Syndicate Role: <b>{overview['role_label']}</b>", body_style))
    story.append(Spacer(1, 15))

    # 2. Case Context
    case_res = await db.execute(text("SELECT title, case_number FROM cases WHERE id=:cid"), {"cid": case_id})
    case_row = case_res.fetchone()
    case_title = case_row.title if case_row else "Unknown"
    case_number = case_row.case_number if case_row else "Unknown"
    story.append(Paragraph("<b>Case Reference:</b>", bold_body_style))
    story.append(Paragraph(f"Case Number: {case_number} | Title: {case_title}", body_style))
    story.append(Spacer(1, 10))

    # 3. Flow Metrics Summary
    story.append(Paragraph("Financial Summary (All Linked Accounts)", section_style))
    metrics_data = [
        ["Total Received", f"INR {overview['metrics']['total_received']:,.2f}"],
        ["Total Sent", f"INR {overview['metrics']['total_sent']:,.2f}"],
        ["Net Retained", f"INR {overview['metrics']['net_retained']:,.2f} ({overview['metrics']['net_retained_pct']:.2f}%)"],
        ["Unique Counterparties", str(overview['metrics']['counterparty_count'])]
    ]
    metrics_table = Table(metrics_data, colWidths=[200, 300])
    metrics_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(metrics_table)
    story.append(Spacer(1, 15))

    # 4. Identity Resolution (Linked Accounts)
    story.append(Paragraph("Linked Accounts (Resolved Identity Map)", section_style))
    linked_data = [["Account ID", "Bank Name", "Account Holder", "Confidence", "Reason"]]
    for la in linked_accounts:
        linked_data.append([
            la["account_id"],
            la["bank_name"],
            la["account_holder"],
            la["match_confidence"],
            la["match_reason"]
        ])
    linked_table = Table(linked_data, colWidths=[110, 90, 110, 80, 150])
    linked_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#e2e8f0")),
        ('TEXTCOLOR', (0,0), (-1,0), c_primary),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(linked_table)
    story.append(Spacer(1, 15))

    # 5. Risk Flags Panel
    story.append(Paragraph("Detected Risk Flags & Evidence", section_style))
    if not overview["flags"]:
        story.append(Paragraph("No significant alerts triggered.", body_style))
    else:
        for flg in overview["flags"]:
            story.append(Paragraph(f"• <b>{flg['flag']}</b> (Severity Score: {flg['confidence']:.2f})", bold_body_style))
            story.append(Paragraph(f"Triggered {flg['count']} times in transaction records.", body_style))
            if flg["evidence_list"]:
                # Show sample evidence narration and details
                sample = flg["evidence_list"][0]
                sample_str = ""
                if "amount" in sample:
                    sample_str += f"Amount: ₹{float(sample['amount']):,.2f} | "
                if "date" in sample:
                    sample_str += f"Date: {sample['date']} | "
                if "narration" in sample:
                    sample_str += f"Narration: {sample['narration']}"
                story.append(Paragraph(f"<i>Sample instance: {sample_str}</i>", body_style))
            story.append(Spacer(1, 5))
    story.append(Spacer(1, 10))

    # Page Break for Top Transactions table
    story.append(PageBreak())

    # 6. Top Transactions Table
    story.append(Paragraph("Top 10 Largest Transactions", section_style))
    tx_data = [["Txn Date", "Amount (INR)", "Type", "Counterparty Name", "Narration", "Account ID"]]
    for tx in top_txns:
        tx_data.append([
            tx["txn_date"].strftime("%Y-%m-%d") if tx["txn_date"] else "N/A",
            f"{float(tx['amount']):,.2f}",
            tx["txn_type"],
            tx["counterparty_name"] or "N/A",
            tx["narration"][:25] + "..." if len(tx["narration"] or "") > 25 else (tx["narration"] or "N/A"),
            tx["account_id"]
        ])
    tx_table = Table(tx_data, colWidths=[70, 80, 40, 110, 150, 90])
    tx_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#e2e8f0")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(tx_table)

    doc.build(story)
    pdf_buffer.seek(0)

    # Log action to audit logs
    await log_action(db, current_user["user_id"], "SUSPECT_DOSSIER_DOWNLOADED", "suspect", account_id, {"case_id": case_id})

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=suspect_dossier_{account_id}.pdf"}
    )

import json
import logging
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import get_current_user
from schemas.uts import UniversalTransaction, TransactionType
from llm.second_opinion import get_second_opinion
from engine.verdict_fusion import fuse_verdict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cases", tags=["verdicts"])


@router.get("/{case_id}/verdicts")
async def get_case_verdicts(
    case_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all account verdicts for the case, sorted by review priority and composite score.
    """
    result = await db.execute(
        text("""
            SELECT v.account_id, v.composite_score, v.score_breakdown, v.algo_verdict,
                   v.llm_verdict, v.llm_confidence, v.llm_reasoning, v.agreement_tier,
                   v.tier_label, v.review_priority, v.reviewed_at, v.role_label,
                   s.account_holder, s.bank_name
            FROM account_verdicts v
            LEFT JOIN (
                SELECT DISTINCT ON (account_id) account_id, account_holder, bank_name
                FROM statements
                WHERE case_id = :cid
            ) s ON v.account_id = s.account_id
            WHERE v.case_id = :cid
            ORDER BY v.review_priority ASC, v.composite_score DESC
        """),
        {"cid": case_id},
    )
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]



@router.get("/{case_id}/benford")
async def get_case_benford(
    case_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the case-wide Benford's Law check results.
    """
    result = await db.execute(
        text("""
            SELECT applicable, sample_size, chi_square, p_value,
                   significant_deviation, observed_distribution, expected_distribution, reason
            FROM case_benford_results
            WHERE case_id = :cid
        """),
        {"cid": case_id},
    )
    row = result.fetchone()
    if not row:
        return {"applicable": False, "sample_size": 0, "reason": "No Benford result computed yet. Please analyze the case first."}
    return dict(row._mapping)


@router.post("/{case_id}/accounts/{account_id}/second-opinion")
async def trigger_second_opinion(
    case_id: str,
    account_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    On-demand blind LLM audit for a specific account.
    Fuses the new LLM verdict with the existing algo verdict and updates DB.
    """
    # 1. Fetch existing verdict row to get algo_verdict, composite score, score_breakdown, and role_label
    verdict_q = await db.execute(
        text("""
            SELECT algo_verdict, composite_score, score_breakdown, role_label
            FROM account_verdicts
            WHERE case_id = :cid AND account_id = :aid
        """),
        {"cid": case_id, "aid": account_id},
    )
    verdict_row = verdict_q.fetchone()
    if not verdict_row:
        raise HTTPException(status_code=404, detail="Account verdict record not found. Run analysis first.")

    algo_verdict = verdict_row.algo_verdict
    composite_score = verdict_row.composite_score
    score_breakdown = verdict_row.score_breakdown
    role_label = verdict_row.role_label

    # 2. Fetch transactions for this account/case to build payload
    txns_q = await db.execute(
        text("""
            SELECT id, txn_hash, statement_id, account_id, account_holder,
                   bank_name, txn_date, amount, txn_type, balance_after, narration,
                   counterparty_account, counterparty_name, counterparty_bank
            FROM transactions
            WHERE case_id = :cid AND account_id = :aid
            ORDER BY txn_date ASC
        """),
        {"cid": case_id, "aid": account_id},
    )
    rows = txns_q.fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No transactions found for this account.")

    txns = []
    for r in rows:
        txns.append(UniversalTransaction(
            id=str(r.id),
            txn_hash=r.txn_hash,
            case_id=case_id,
            statement_id=str(r.statement_id),
            source_file_hash=r.txn_hash,
            account_id=r.account_id or "",
            account_holder=r.account_holder or "",
            bank_name=r.bank_name or "",
            txn_date=r.txn_date,
            amount=Decimal(str(r.amount)),
            txn_type=TransactionType(r.txn_type),
            balance_after=Decimal(str(r.balance_after)) if r.balance_after else None,
            narration=r.narration or "",
            counterparty_account=r.counterparty_account,
            counterparty_name=r.counterparty_name,
            counterparty_bank=r.counterparty_bank,
        ))

    # 3. Call LLM for second opinion
    opinion = await get_second_opinion(account_id, txns)
    llm_verdict = opinion["verdict"]
    llm_confidence = opinion["confidence"]
    llm_reasoning = opinion["reasoning"]

    # 4. Fuse verdicts
    fused = fuse_verdict(algo_verdict, llm_verdict)

    new_role_label = role_label
    if role_label == "CLEAR" and llm_verdict == "SUSPICIOUS":
        new_role_label = "SUSPECT"

    # 5. Save back to database
    await db.execute(
        text("""
            UPDATE account_verdicts
            SET llm_verdict = :llm,
                llm_confidence = :llm_conf,
                llm_reasoning = :llm_reason,
                agreement_tier = :tier,
                tier_label = :label,
                review_priority = :prio,
                role_label = :role,
                reviewed_at = NOW()
            WHERE case_id = :cid AND account_id = :aid
        """),
        {
            "cid": case_id,
            "aid": account_id,
            "llm": llm_verdict,
            "llm_conf": llm_confidence,
            "llm_reason": llm_reasoning,
            "tier": fused["agreement_tier"],
            "label": fused["tier_label"],
            "prio": fused["review_priority"],
            "role": new_role_label,
        },
    )
    await db.commit()

    return {
        "account_id": account_id,
        "algo_verdict": algo_verdict,
        "llm_verdict": llm_verdict,
        "llm_confidence": llm_confidence,
        "llm_reasoning": llm_reasoning,
        "agreement_tier": fused["agreement_tier"],
        "tier_label": fused["tier_label"],
        "review_priority": fused["review_priority"],
        "role_label": new_role_label,
    }

import re
from datetime import datetime, timedelta

def parse_date_spec(val):
    if not val:
        return None
    if isinstance(val, (datetime, timedelta)):
        return val
    val_str = str(val).strip().lower()
    
    if val_str == "today":
        return datetime.now().date()
    if val_str == "now":
        return datetime.now()
        
    m = re.match(r"today\s*-\s*(\d+)\s*(days|day|d)?", val_str)
    if m:
        days = int(m.group(1))
        return datetime.now().date() - timedelta(days=days)
        
    m2 = re.match(r"(\d+)\s*(days|day|d)\s*ago", val_str)
    if m2:
        days = int(m2.group(1))
        return datetime.now().date() - timedelta(days=days)
        
    try:
        return datetime.fromisoformat(val_str)
    except ValueError:
        pass
    try:
        return datetime.strptime(val_str, "%Y-%m-%d").date()
    except ValueError:
        pass
    try:
        return datetime.strptime(val_str, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        pass
        
    return None

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import get_current_user
from schemas.report import NLQueryRequest
from llm.nl_query import nl_to_query_spec

router = APIRouter(prefix="/cases", tags=["query"])

@router.post("/{case_id}/query")
async def nl_query(case_id: str, req: NLQueryRequest,
                   current_user=Depends(get_current_user),
                   db: AsyncSession = Depends(get_db)):
    acc_result = await db.execute(
        text("SELECT DISTINCT account_id, account_holder FROM transactions WHERE case_id = :cid"),
        {"cid": case_id}
    )
    accounts = [{"id": r.account_id, "holder": r.account_holder} for r in acc_result.fetchall()]

    spec = await nl_to_query_spec(req.question, accounts)
    # Execute query based on spec
    query_type = spec.get("query_type", "transaction_filter")
    filters    = spec.get("filters", {})
    limit      = min(spec.get("limit", 100), 500)

    where_parts = ["t.case_id=:cid"]
    params = {"cid": case_id, "limit": limit}

    if filters.get("account_ids"):
        where_parts.append(f"t.account_id = ANY(:aids)")
        params["aids"] = filters["account_ids"]
    if filters.get("date_from"):
        parsed_df = parse_date_spec(filters["date_from"])
        if parsed_df:
            where_parts.append("t.txn_date >= :df")
            params["df"] = parsed_df
    if filters.get("date_to"):
        parsed_dt = parse_date_spec(filters["date_to"])
        if parsed_dt:
            where_parts.append("t.txn_date <= :dt")
            params["dt"] = parsed_dt
    if filters.get("amount_min"):
        where_parts.append("t.amount >= :amin")
        params["amin"] = str(filters["amount_min"])
    if filters.get("amount_max"):
        where_parts.append("t.amount <= :amax")
        params["amax"] = str(filters["amount_max"])
    if filters.get("txn_type"):
        where_parts.append("t.txn_type = :tt")
        params["tt"] = filters["txn_type"]

    where_clause = " AND ".join(where_parts)
    result = await db.execute(
        text(f"""SELECT t.txn_hash, t.account_id, t.txn_date, t.amount::text,
                        t.txn_type, t.narration, t.counterparty_account
                 FROM transactions t WHERE {where_clause}
                 ORDER BY t.txn_date LIMIT :limit"""),
        params
    )
    rows = [dict(r._mapping) for r in result.fetchall()]
    return {
        "question": req.question,
        "query_spec": spec,
        "results": rows,
        "count": len(rows),
    }

import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import get_current_user

router = APIRouter(prefix="/cases", tags=["syndicates"])

UPI_RE = re.compile(r'\b[a-zA-Z0-9.\-_]+@[a-zA-Z]{3,}\b')
PHONE_RE = re.compile(r'\b[6-9]\d{9}\b')
PAN_RE = re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b')

@router.get("/{case_id}/syndicates")
async def get_case_syndicates(
    case_id: str,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Finds cross-case syndicate links where identifiers (accounts, UPIs, phones, PANs)
    overlap between the current case and other cases in the database.
    """
    # 1. Fetch current case transactions
    curr_q = await db.execute(
        text("""
            SELECT account_id, counterparty_account, narration 
            FROM transactions 
            WHERE case_id = :cid
        """),
        {"cid": case_id}
    )
    curr_txns = curr_q.fetchall()
    if not curr_txns:
        return []

    # Extract identifiers
    accounts = set()
    upis = set()
    phones = set()
    pans = set()

    for r in curr_txns:
        if r.account_id:
            accounts.add(r.account_id)
        if r.counterparty_account:
            accounts.add(r.counterparty_account)
        
        narr = r.narration or ""
        # UPI ID extraction
        for upi in UPI_RE.findall(narr):
            upis.add(upi)
        # Phone extraction
        for ph in PHONE_RE.findall(narr):
            phones.add(ph)
        # PAN extraction
        for p in PAN_RE.findall(narr):
            pans.add(p)

    # Clean accounts (remove empty/null)
    accounts = {a for a in accounts if a and len(a) > 3}

    # 2. Query other cases' transactions to find matches
    other_q = await db.execute(
        text("""
            SELECT t.case_id, c.title AS case_title, t.account_id, t.counterparty_account, t.narration
            FROM transactions t
            JOIN cases c ON t.case_id = c.id
            WHERE t.case_id != :cid
        """),
        {"cid": case_id}
    )
    other_txns = other_q.fetchall()

    seen_matches = set()
    matches = []

    for r in other_txns:
        other_case_id = str(r.case_id)
        other_title = r.case_title
        
        # Check Account match
        if r.account_id in accounts:
            key = (other_case_id, "ACCOUNT", r.account_id)
            if key not in seen_matches:
                seen_matches.add(key)
                matches.append({
                    "matched_case_id": other_case_id,
                    "matched_case_title": other_title,
                    "match_type": "ACCOUNT",
                    "matched_value": r.account_id,
                    "details": f"Account number {r.account_id} is active in both cases."
                })
        
        if r.counterparty_account in accounts:
            key = (other_case_id, "ACCOUNT", r.counterparty_account)
            if key not in seen_matches:
                seen_matches.add(key)
                matches.append({
                    "matched_case_id": other_case_id,
                    "matched_case_title": other_title,
                    "match_type": "ACCOUNT",
                    "matched_value": r.counterparty_account,
                    "details": f"Counterparty Account {r.counterparty_account} is active in both cases."
                })

        # Check narration extraction matches
        narr = r.narration or ""
        # UPI IDs in other txn narration
        for upi in UPI_RE.findall(narr):
            if upi in upis:
                key = (other_case_id, "UPI", upi)
                if key not in seen_matches:
                    seen_matches.add(key)
                    matches.append({
                        "matched_case_id": other_case_id,
                        "matched_case_title": other_title,
                        "match_type": "UPI",
                        "matched_value": upi,
                        "details": f"UPI ID '{upi}' detected in transaction narrations of both cases."
                    })
        
        # Phone numbers in other txn narration
        for ph in PHONE_RE.findall(narr):
            if ph in phones:
                key = (other_case_id, "PHONE", ph)
                if key not in seen_matches:
                    seen_matches.add(key)
                    matches.append({
                        "matched_case_id": other_case_id,
                        "matched_case_title": other_title,
                        "match_type": "PHONE",
                        "matched_value": ph,
                        "details": f"Mobile number '{ph}' found in transaction narrations of both cases."
                    })

        # PAN numbers in other txn narration
        for p in PAN_RE.findall(narr):
            if p in pans:
                key = (other_case_id, "PAN", p)
                if key not in seen_matches:
                    seen_matches.add(key)
                    matches.append({
                        "matched_case_id": other_case_id,
                        "matched_case_title": other_title,
                        "match_type": "PAN",
                        "matched_value": p,
                        "details": f"PAN number '{p}' found in transaction narrations of both cases."
                    })

    return matches

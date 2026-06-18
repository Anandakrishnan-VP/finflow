"""F6 FIX: Only check ACTIVE watchlist entries (is_active=true)."""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from schemas.uts import UniversalTransaction, TransactionFlag

logger = logging.getLogger(__name__)

async def check_against_watchlist(
    db: AsyncSession,
    transactions: list[UniversalTransaction],
    case_id: str,
    statement_id: str,
) -> list[UniversalTransaction]:
    """F6 FIX: Soft-deleted entries (is_active=false) are excluded."""
    result = await db.execute(
        text("SELECT id, entry_type, value FROM watchlist WHERE is_active=true"))
    entries = result.fetchall()

    for txn in transactions:
        for entry in entries:
            entry_type, value = entry.entry_type, entry.value
            hit = False
            if entry_type == "ACCOUNT" and value in [
                    txn.account_id, txn.counterparty_account]:
                hit = True
            elif entry_type == "KEYWORD" and value.upper() in (txn.narration or "").upper():
                hit = True
            elif entry_type == "UPI" and value in (txn.counterparty_account or ""):
                hit = True

            if hit:
                try:
                    await db.execute(
                        text("""INSERT INTO watchlist_hits
                             (watchlist_id, case_id, statement_id, transaction_id)
                             VALUES (:wid, :cid, :sid, :tid)
                             ON CONFLICT DO NOTHING"""),
                        {"wid": str(entry.id), "cid": case_id,
                         "sid": statement_id, "tid": txn.id}
                    )
                    if TransactionFlag.WATCHLIST_HIT not in txn.flags:
                        txn.flags.append(TransactionFlag.WATCHLIST_HIT)
                except Exception as e:
                    logger.error("Watchlist hit insert failed: %s", e)

    await db.commit()
    return transactions

import hashlib, json, logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal): return str(o)
        return super().default(o)

async def get_last_hash(db: AsyncSession) -> str:
    result = await db.execute(
        text("SELECT row_hash FROM audit_log ORDER BY id DESC LIMIT 1"))
    row = result.fetchone()
    return row[0] if row else "GENESIS"

async def log_action(
    db: AsyncSession,
    user_id: Optional[str],
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    detail: Optional[dict] = None,
    ip_address: Optional[str] = None,
):
    try:
        previous_hash = await get_last_hash(db)
        ts = datetime.now(timezone.utc).isoformat()
        detail_str = json.dumps(detail or {}, cls=DecimalEncoder)
        # Hash the row content for tamper detection
        row_content = f"{ts}|{user_id}|{action}|{resource_type}|{resource_id}|{detail_str}|{previous_hash}"
        row_hash = hashlib.sha256(row_content.encode()).hexdigest()

        # [FIX] CAST(:det AS jsonb) — explicit cast prevents asyncpg type error on JSONB column
        await db.execute(
            text("""INSERT INTO audit_log
                 (user_id, action, resource_type, resource_id, detail, ip_address, previous_hash, row_hash)
                 VALUES (:uid,:act,:rtype,:rid,CAST(:det AS jsonb),:ip,:prev,:rhash)"""),
            {
                "uid": user_id, "act": action, "rtype": resource_type,
                "rid": resource_id, "det": detail_str, "ip": ip_address,
                "prev": previous_hash, "rhash": row_hash
            }
        )
        await db.commit()
    except Exception as e:
        logger.error("Audit log failed: %s", e)

async def verify_chain(db: AsyncSession) -> dict:
    """Verifies the hash chain has not been tampered with. Called by admin endpoint."""
    rows = await db.execute(
        text("SELECT id, user_id, action, resource_type, resource_id, detail::text, "
             "ip_address, previous_hash, row_hash, created_at FROM audit_log ORDER BY id"))
    all_rows = rows.fetchall()
    broken = []
    prev_hash = "GENESIS"
    for row in all_rows:
        content = (f"{row.created_at.isoformat()}|{row.user_id}|{row.action}|"
                   f"{row.resource_type}|{row.resource_id}|{row.detail}|{prev_hash}")
        expected = hashlib.sha256(content.encode()).hexdigest()
        if expected != row.row_hash:
            broken.append({"id": row.id, "action": row.action})
        prev_hash = row.row_hash
    return {"chain_intact": len(broken) == 0, "broken_rows": broken,
            "total_rows": len(all_rows)}

"""Resolve entities across statements — same account, different name spellings."""
import logging, json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

async def resolve_entities(db: AsyncSession, case_id: str, transactions: list) -> dict:
    """
    Build an entity registry: group account IDs that appear to be the same entity
    (same PAN, same phone, same UPI across different narrations).
    Returns: {account_id: entity_id}
    """
    entity_map = {}
    all_accounts = list({t.account_id for t in transactions if t.account_id})
    for account_id in all_accounts:
        # Find the canonical name (account_holder) from transactions
        canonical_name = "Unnamed Entity"
        for t in transactions:
            if t.account_id == account_id and t.account_holder:
                canonical_name = t.account_holder
                break

        # Check if entity already exists for this case
        result = await db.execute(
            text("SELECT id FROM entities WHERE linked_accounts @> CAST(:acc AS jsonb) AND first_seen_case = :cid"),
            {"acc": json.dumps([account_id]), "cid": case_id}
        )
        row = result.fetchone()
        if row:
            entity_id = str(row[0])
            entity_map[account_id] = entity_id
            # Backfill canonical_name if it is currently missing
            await db.execute(
                text("""UPDATE entities 
                        SET canonical_name = :name 
                        WHERE id = :eid AND (canonical_name IS NULL OR canonical_name = 'Unnamed Entity' OR canonical_name = '')"""),
                {"name": canonical_name, "eid": entity_id}
            )
        else:
            insert_result = await db.execute(
                text("""INSERT INTO entities (canonical_name, linked_accounts, first_seen_case)
                        VALUES (:name, CAST(:acc AS jsonb), :cid) RETURNING id"""),
                {"name": canonical_name, "acc": json.dumps([account_id]), "cid": case_id}
            )
            new_id = insert_result.fetchone()[0]
            entity_map[account_id] = str(new_id)
            await db.execute(
                text("""INSERT INTO entity_case_appearances (entity_id, case_id, account_id)
                        VALUES (:eid, :cid, :aid) ON CONFLICT DO NOTHING"""),
                {"eid": str(new_id), "cid": case_id, "aid": account_id}
            )
    return entity_map

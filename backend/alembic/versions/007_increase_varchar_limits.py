"""increase varchar limits

Revision ID: 007_increase_varchar_limits
Revises: 006_reliability_hardening
Create Date: 2026-07-04 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = "007_increase_varchar_limits"
down_revision: Union[str, None] = "006_reliability_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sql = """
    ALTER TABLE transactions ALTER COLUMN counterparty_account TYPE VARCHAR(255);
    ALTER TABLE transactions ALTER COLUMN account_id TYPE VARCHAR(255);
    ALTER TABLE statements ALTER COLUMN account_id TYPE VARCHAR(255);
    ALTER TABLE alerts ALTER COLUMN account_id TYPE VARCHAR(255);
    ALTER TABLE alerts ALTER COLUMN flag TYPE VARCHAR(255);
    ALTER TABLE account_verdicts ALTER COLUMN account_id TYPE VARCHAR(255);
    ALTER TABLE case_next_actions ALTER COLUMN account_id TYPE VARCHAR(255);
    ALTER TABLE case_annotations ALTER COLUMN account_id TYPE VARCHAR(255);
    ALTER TABLE entity_case_appearances ALTER COLUMN account_id TYPE VARCHAR(255);
    ALTER TABLE hypothesis_queries ALTER COLUMN from_account TYPE VARCHAR(255);
    ALTER TABLE hypothesis_queries ALTER COLUMN to_account TYPE VARCHAR(255);
    ALTER TABLE audit_log ALTER COLUMN resource_type TYPE VARCHAR(255);
    ALTER TABLE evidence_packages ALTER COLUMN officer_badge TYPE VARCHAR(255);
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)


def downgrade() -> None:
    sql = """
    ALTER TABLE evidence_packages ALTER COLUMN officer_badge TYPE VARCHAR(50);
    ALTER TABLE audit_log ALTER COLUMN resource_type TYPE VARCHAR(50);
    ALTER TABLE hypothesis_queries ALTER COLUMN to_account TYPE VARCHAR(50);
    ALTER TABLE hypothesis_queries ALTER COLUMN from_account TYPE VARCHAR(50);
    ALTER TABLE entity_case_appearances ALTER COLUMN account_id TYPE VARCHAR(50);
    ALTER TABLE case_annotations ALTER COLUMN account_id TYPE VARCHAR(50);
    ALTER TABLE case_next_actions ALTER COLUMN account_id TYPE VARCHAR(50);
    ALTER TABLE account_verdicts ALTER COLUMN account_id TYPE VARCHAR(50);
    ALTER TABLE alerts ALTER COLUMN flag TYPE VARCHAR(50);
    ALTER TABLE alerts ALTER COLUMN account_id TYPE VARCHAR(50);
    ALTER TABLE statements ALTER COLUMN account_id TYPE VARCHAR(50);
    ALTER TABLE transactions ALTER COLUMN account_id TYPE VARCHAR(50);
    ALTER TABLE transactions ALTER COLUMN counterparty_account TYPE VARCHAR(50);
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)

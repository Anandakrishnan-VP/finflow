"""reliability hardening

Revision ID: 006_reliability_hardening
Revises: 005_chain_of_custody_and_mapping
Create Date: 2026-06-21 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op


revision: str = "006_reliability_hardening"
down_revision: Union[str, None] = "005_chain_of_custody_and_mapping"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sql = """
    ALTER TABLE statements
        ADD COLUMN IF NOT EXISTS parse_method VARCHAR(80),
        ADD COLUMN IF NOT EXISTS parse_quality_score NUMERIC(5,4),
        ADD COLUMN IF NOT EXISTS parse_warnings JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS extracted_row_count INTEGER,
        ADD COLUMN IF NOT EXISTS inserted_row_count INTEGER,
        ADD COLUMN IF NOT EXISTS duplicate_row_count INTEGER,
        ADD COLUMN IF NOT EXISTS rejected_row_count INTEGER,
        ADD COLUMN IF NOT EXISTS needs_review_reason TEXT;

    ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS raw_row_index INTEGER,
        ADD COLUMN IF NOT EXISTS raw_row_json JSONB,
        ADD COLUMN IF NOT EXISTS parse_confidence NUMERIC(5,4),
        ADD COLUMN IF NOT EXISTS parser_name VARCHAR(80),
        ADD COLUMN IF NOT EXISTS identity_confidence NUMERIC(5,4);

    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_txn_hash_key;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_statement_txn_hash
        ON transactions(statement_id, txn_hash);
    CREATE INDEX IF NOT EXISTS idx_txn_statement_hash
        ON transactions(statement_id, txn_hash);

    ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_status_check;
    ALTER TABLE cases ADD CONSTRAINT cases_status_check
        CHECK (status IN ('OPEN','ANALYZING','ANALYZED','ANALYSIS_FAILED','CLOSED','ARCHIVED'));
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)


def downgrade() -> None:
    sql = """
    DROP INDEX IF EXISTS idx_txn_statement_hash;
    DROP INDEX IF EXISTS uq_transactions_statement_txn_hash;
    ALTER TABLE transactions ADD CONSTRAINT transactions_txn_hash_key UNIQUE (txn_hash);

    ALTER TABLE transactions
        DROP COLUMN IF EXISTS identity_confidence,
        DROP COLUMN IF EXISTS parser_name,
        DROP COLUMN IF EXISTS parse_confidence,
        DROP COLUMN IF EXISTS raw_row_json,
        DROP COLUMN IF EXISTS raw_row_index;

    ALTER TABLE statements
        DROP COLUMN IF EXISTS needs_review_reason,
        DROP COLUMN IF EXISTS rejected_row_count,
        DROP COLUMN IF EXISTS duplicate_row_count,
        DROP COLUMN IF EXISTS inserted_row_count,
        DROP COLUMN IF EXISTS extracted_row_count,
        DROP COLUMN IF EXISTS parse_warnings,
        DROP COLUMN IF EXISTS parse_quality_score,
        DROP COLUMN IF EXISTS parse_method;

    ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_status_check;
    ALTER TABLE cases ADD CONSTRAINT cases_status_check
        CHECK (status IN ('OPEN','ANALYZING','ANALYZED','CLOSED','ARCHIVED'));
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)

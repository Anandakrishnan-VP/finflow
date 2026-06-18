"""phase4 verdicts

Revision ID: 002_phase4_verdicts
Revises: 001_initial_schema
Create Date: 2026-06-18 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '002_phase4_verdicts'
down_revision: Union[str, None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sql = """
    CREATE TABLE account_verdicts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id),
        account_id VARCHAR(50) NOT NULL,
        composite_score INTEGER NOT NULL,
        score_breakdown JSONB,
        algo_verdict VARCHAR(20) NOT NULL,              -- FLAGGED | CLEAR
        llm_verdict VARCHAR(20) NOT NULL DEFAULT 'NOT_REVIEWED',  -- SUSPICIOUS | NOT_SUSPICIOUS | NOT_REVIEWED
        llm_confidence VARCHAR(10),                      -- HIGH | MEDIUM | LOW
        llm_reasoning TEXT,
        agreement_tier VARCHAR(40) NOT NULL,
        tier_label VARCHAR(120),
        review_priority INTEGER NOT NULL DEFAULT 4,       -- 0 = look here first, 5 = safe to deprioritize
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(case_id, account_id)
    );

    CREATE INDEX idx_verdicts_case     ON account_verdicts(case_id);
    CREATE INDEX idx_verdicts_priority ON account_verdicts(case_id, review_priority);

    CREATE TABLE case_benford_results (
        case_id UUID PRIMARY KEY REFERENCES cases(id),
        applicable BOOLEAN NOT NULL,
        sample_size INTEGER,
        chi_square NUMERIC(10,4),
        p_value NUMERIC(6,4),
        significant_deviation BOOLEAN,
        observed_distribution JSONB,
        expected_distribution JSONB,
        reason TEXT,
        computed_at TIMESTAMPTZ DEFAULT NOW()
    );
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)


def downgrade() -> None:
    sql = """
    DROP TABLE IF EXISTS case_benford_results CASCADE;
    DROP TABLE IF EXISTS account_verdicts CASCADE;
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)

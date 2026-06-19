"""phase5 accuracy

Revision ID: 004_phase5_accuracy
Revises: 003_workspace_features
Create Date: 2026-06-19 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '004_phase5_accuracy'
down_revision: Union[str, None] = '003_workspace_features'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sql = """
    CREATE TABLE IF NOT EXISTS narration_clusters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        cluster_id INTEGER NOT NULL,
        narration_signature VARCHAR(64) NOT NULL,
        transaction_count INTEGER NOT NULL,
        account_count INTEGER NOT NULL,
        is_coordinated BOOLEAN DEFAULT false,
        representative_narration TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_clusters_case ON narration_clusters(case_id);

    CREATE TABLE IF NOT EXISTS hypothesis_queries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        queried_by UUID REFERENCES users(id) ON DELETE SET NULL,
        from_account VARCHAR(50),
        to_account VARCHAR(50),
        max_hops INTEGER,
        path_found BOOLEAN,
        path_data JSONB,
        queried_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS evidence_packages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        package_path TEXT NOT NULL,
        sha256_manifest JSONB NOT NULL,
        officer_badge VARCHAR(50),
        generated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_case_flag_date
        ON alerts(case_id, flag, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_txn_case_date_amount
        ON transactions(case_id, txn_date, amount);

    ALTER TABLE account_verdicts
        ADD COLUMN IF NOT EXISTS lof_score NUMERIC(5,4),
        ADD COLUMN IF NOT EXISTS lgbm_score NUMERIC(5,4),
        ADD COLUMN IF NOT EXISTS score_confidence VARCHAR(10),
        ADD COLUMN IF NOT EXISTS uncertainty_band JSONB;
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)


def downgrade() -> None:
    sql = """
    ALTER TABLE account_verdicts DROP COLUMN IF EXISTS lof_score;
    ALTER TABLE account_verdicts DROP COLUMN IF EXISTS lgbm_score;
    ALTER TABLE account_verdicts DROP COLUMN IF EXISTS score_confidence;
    ALTER TABLE account_verdicts DROP COLUMN IF EXISTS uncertainty_band;

    DROP TABLE IF EXISTS evidence_packages CASCADE;
    DROP TABLE IF EXISTS hypothesis_queries CASCADE;
    DROP TABLE IF EXISTS narration_clusters CASCADE;
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)

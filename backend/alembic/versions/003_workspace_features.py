"""workspace features

Revision ID: 003_workspace_features
Revises: 002_phase4_verdicts
Create Date: 2026-06-19 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '003_workspace_features'
down_revision: Union[str, None] = '002_phase4_verdicts'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sql = """
    ALTER TABLE account_verdicts ADD COLUMN role_label VARCHAR(50);

    CREATE TABLE case_next_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        account_id VARCHAR(50) NOT NULL,
        action_key VARCHAR(100) NOT NULL,
        action_text TEXT NOT NULL,
        completed BOOLEAN DEFAULT false,
        completed_at TIMESTAMPTZ,
        UNIQUE(case_id, account_id, action_key)
    );

    CREATE TABLE case_annotations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        account_id VARCHAR(50),
        author_id UUID REFERENCES users(id),
        annotation TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_next_actions_case ON case_next_actions(case_id);
    CREATE INDEX idx_annotations_case ON case_annotations(case_id);
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)


def downgrade() -> None:
    sql = """
    DROP TABLE IF EXISTS case_annotations CASCADE;
    DROP TABLE IF EXISTS case_next_actions CASCADE;
    ALTER TABLE account_verdicts DROP COLUMN IF EXISTS role_label;
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)

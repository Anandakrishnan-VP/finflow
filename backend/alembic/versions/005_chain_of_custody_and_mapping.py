"""chain of custody and mapping

Revision ID: 005_chain_of_custody_and_mapping
Revises: 004_phase5_accuracy
Create Date: 2026-06-20 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '005_chain_of_custody_and_mapping'
down_revision: Union[str, None] = '004_phase5_accuracy'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sql = """
    ALTER TABLE statements ADD COLUMN IF NOT EXISTS column_mapping JSONB;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS chain_hash VARCHAR(64);
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)


def downgrade() -> None:
    sql = """
    ALTER TABLE transactions DROP COLUMN IF EXISTS chain_hash;
    ALTER TABLE statements DROP COLUMN IF EXISTS column_mapping;
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)

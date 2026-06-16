"""initial schema

Revision ID: 001_initial_schema
Revises: None
Create Date: 2026-06-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sql = """
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        hashed_password TEXT NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        badge_number VARCHAR(20) UNIQUE NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('IO','SUPERVISOR','ADMIN')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_number VARCHAR(50) UNIQUE NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'OPEN'
            CHECK (status IN ('OPEN','ANALYZING','ANALYZED','CLOSED','ARCHIVED')),
        classification_level INTEGER DEFAULT 1 CHECK (classification_level IN (1,2,3)),
        created_by UUID REFERENCES users(id),
        assigned_io UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE statements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        original_filename VARCHAR(255) NOT NULL,
        stored_path TEXT NOT NULL,
        file_hash VARCHAR(64) NOT NULL,
        file_size_bytes BIGINT NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        bank_name VARCHAR(100),
        account_id VARCHAR(50),
        account_holder VARCHAR(200),
        statement_from DATE,
        statement_to DATE,
        parse_status VARCHAR(20) DEFAULT 'PENDING',
        parse_error TEXT,
        ocr_used BOOLEAN DEFAULT false,
        ocr_confidence_avg NUMERIC(4,2),
        row_count INTEGER,
        uploaded_by UUID REFERENCES users(id),
        uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        txn_hash VARCHAR(64) UNIQUE NOT NULL,
        case_id UUID REFERENCES cases(id),
        statement_id UUID REFERENCES statements(id),
        account_id VARCHAR(50) NOT NULL,
        account_holder VARCHAR(200),
        bank_name VARCHAR(100),
        txn_date TIMESTAMPTZ NOT NULL,
        value_date TIMESTAMPTZ,
        amount NUMERIC(20,4) NOT NULL,
        txn_type CHAR(2) NOT NULL CHECK (txn_type IN ('CR','DR')),
        balance_after NUMERIC(20,4),
        narration TEXT,
        counterparty_account VARCHAR(50),
        counterparty_name VARCHAR(200),
        counterparty_bank VARCHAR(100),
        ocr_confidence NUMERIC(4,2),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_txn_case             ON transactions(case_id);
    CREATE INDEX idx_txn_account          ON transactions(account_id);
    CREATE INDEX idx_txn_date             ON transactions(txn_date);
    CREATE INDEX idx_txn_narration_trgm   ON transactions USING gin(narration gin_trgm_ops);

    CREATE TABLE alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id),
        account_id VARCHAR(50) NOT NULL,
        flag VARCHAR(50) NOT NULL,
        confidence NUMERIC(4,2),
        evidence JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_alerts_case         ON alerts(case_id);
    CREATE INDEX idx_alerts_account_case ON alerts(account_id, case_id);
    CREATE INDEX idx_alerts_flag_case    ON alerts(flag, case_id);
    CREATE INDEX idx_alerts_created      ON alerts(created_at);

    CREATE TABLE money_trails (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id),
        credit_txn_id UUID REFERENCES transactions(id),
        debit_txn_id UUID REFERENCES transactions(id),
        amount NUMERIC(20,4) NOT NULL,
        days_held INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_trails_case   ON money_trails(case_id);
    CREATE INDEX idx_trails_credit ON money_trails(credit_txn_id);
    CREATE INDEX idx_trails_debit  ON money_trails(debit_txn_id);

    CREATE TABLE entities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        canonical_name VARCHAR(200),
        identifiers JSONB,
        linked_accounts JSONB,
        first_seen_case UUID REFERENCES cases(id),
        risk_score NUMERIC(4,2),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE entity_case_appearances (
        entity_id UUID REFERENCES entities(id),
        case_id UUID REFERENCES cases(id),
        account_id VARCHAR(50),
        PRIMARY KEY (entity_id, case_id, account_id)
    );

    CREATE TABLE watchlist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entry_type VARCHAR(20) NOT NULL
            CHECK (entry_type IN ('ACCOUNT','PHONE','PAN','UPI','KEYWORD','ENTITY')),
        value VARCHAR(200) NOT NULL,
        reason TEXT,
        source VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        deactivated_by UUID REFERENCES users(id),
        deactivated_at TIMESTAMPTZ,
        added_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(entry_type, value)
    );

    CREATE TABLE watchlist_hits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        watchlist_id UUID REFERENCES watchlist(id),
        case_id UUID REFERENCES cases(id),
        statement_id UUID REFERENCES statements(id),
        transaction_id UUID REFERENCES transactions(id),
        hit_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE audit_log (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50),
        resource_id UUID,
        detail JSONB,
        ip_address INET,
        previous_hash VARCHAR(64),
        row_hash VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE analysis_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id),
        celery_task_id VARCHAR(100),
        status VARCHAR(20) DEFAULT 'QUEUED',
        progress INTEGER DEFAULT 0,
        current_stage VARCHAR(100),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error TEXT
    );

    CREATE TABLE human_review_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id),
        statement_id UUID REFERENCES statements(id),
        txn_hash VARCHAR(64),
        ocr_confidence NUMERIC(4,2),
        raw_row JSONB,
        reason VARCHAR(100),
        reviewed BOOLEAN DEFAULT false,
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)


def downgrade() -> None:
    sql = """
    DROP TABLE IF EXISTS human_review_queue CASCADE;
    DROP TABLE IF EXISTS analysis_tasks CASCADE;
    DROP TABLE IF EXISTS audit_log CASCADE;
    DROP TABLE IF EXISTS watchlist_hits CASCADE;
    DROP TABLE IF EXISTS watchlist CASCADE;
    DROP TABLE IF EXISTS entity_case_appearances CASCADE;
    DROP TABLE IF EXISTS entities CASCADE;
    DROP TABLE IF EXISTS money_trails CASCADE;
    DROP TABLE IF EXISTS alerts CASCADE;
    DROP TABLE IF EXISTS transactions CASCADE;
    DROP TABLE IF EXISTS statements CASCADE;
    DROP TABLE IF EXISTS cases CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP EXTENSION IF EXISTS pg_trgm;
    DROP EXTENSION IF EXISTS pgcrypto;
    """
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            op.execute(stmt)


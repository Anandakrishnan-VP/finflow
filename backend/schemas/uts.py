from decimal import Decimal
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator
from enum import Enum

class TransactionType(str, Enum):
    CREDIT = "CR"
    DEBIT  = "DR"

class TransactionFlag(str, Enum):
    STRUCTURING          = "STRUCTURING"
    FAN_OUT              = "FAN_OUT_PATTERN"
    FAN_IN               = "FAN_IN_PATTERN"
    PASSTHROUGH          = "PASSTHROUGH_SUSPECTED"
    ROUND_TRIP           = "ROUND_TRIP"
    CIRCULAR_FLOW        = "CIRCULAR_FLOW"
    TIMING_REGULARITY    = "TIMING_REGULARITY"
    DORMANT_ACTIVATION   = "DORMANT_ACTIVATION"
    LAYERING             = "LAYERING"
    CASH_INTENSIVE       = "CASH_INTENSIVE"
    FAILED_TXN           = "FAILED_TXN"
    ML_ANOMALY_IF        = "ML_ANOMALY_ISOLATION_FOREST"
    ML_ANOMALY_LSTM      = "ML_ANOMALY_LSTM"
    LOW_OCR_CONFIDENCE   = "LOW_OCR_CONFIDENCE"
    WATCHLIST_HIT        = "WATCHLIST_HIT"
    BALANCE_MISMATCH     = "BALANCE_MISMATCH"
    HIDDEN_TXN_SUSPECTED = "HIDDEN_TXN_SUSPECTED"

class UniversalTransaction(BaseModel):
    """CRITICAL: Every monetary field is Decimal. Never float."""
    id: Optional[str] = None
    txn_hash: str
    case_id: str
    statement_id: str
    source_file_hash: str
    account_id: str
    account_holder: str
    bank_name: str
    ifsc: Optional[str] = None
    txn_date: datetime
    value_date: Optional[datetime] = None
    amount: Decimal                          # NEVER float
    txn_type: TransactionType
    balance_after: Optional[Decimal] = None  # NEVER float
    counterparty_account: Optional[str] = None
    counterparty_name: Optional[str] = None
    counterparty_bank: Optional[str] = None
    narration: str = ""
    ocr_confidence: Optional[float] = None   # 0.0-1.0 — float OK (not money)
    flags: list[TransactionFlag] = []
    risk_score: Optional[float] = None       # 0.0-1.0 — float OK (not money)

    @field_validator('amount', 'balance_after', mode='before')
    @classmethod
    def coerce_to_decimal(cls, v):
        if v is None: return v
        if isinstance(v, float): return Decimal(str(v))
        return Decimal(v)

    class Config:
        use_enum_values = True

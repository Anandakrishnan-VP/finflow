from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
from uuid import UUID

class AlertResponse(BaseModel):
    id: UUID
    case_id: UUID
    account_id: str
    flag: str
    confidence: Optional[float]
    evidence: Optional[Any]
    created_at: datetime
    class Config:
        from_attributes = True

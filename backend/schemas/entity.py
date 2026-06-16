from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
from uuid import UUID

class EntityResponse(BaseModel):
    id: UUID
    canonical_name: Optional[str]
    identifiers: Optional[Any]
    linked_accounts: Optional[Any]
    risk_score: Optional[float]
    created_at: datetime
    class Config:
        from_attributes = True

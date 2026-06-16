from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID

class CaseCreate(BaseModel):
    case_number: str
    title: str
    description: Optional[str] = None
    classification_level: int = 1

class CaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    classification_level: Optional[int] = None
    assigned_io: Optional[UUID] = None

class CaseResponse(BaseModel):
    id: UUID
    case_number: str
    title: str
    description: Optional[str]
    status: str
    classification_level: int
    created_by: Optional[UUID]
    assigned_io: Optional[UUID]
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

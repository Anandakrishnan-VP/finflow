from pydantic import BaseModel
from typing import Optional

class ReportRequest(BaseModel):
    include_narrative: bool = True
    include_case_theory: bool = True
    include_money_trail: bool = True
    include_graph_summary: bool = True

class NLQueryRequest(BaseModel):
    question: str

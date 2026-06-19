from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from security.auth import get_current_user
from llm.chat_assistant import chat_with_case_assistant

router = APIRouter(prefix="/cases", tags=["chat"])

@router.post("/{case_id}/chat")
async def chat_case_assistant(
    case_id: str,
    message: str = Body(..., embed=True),
    history: list[dict] = Body([], embed=True),
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Sends a query and recent chat history to the Case Assistant LLM.
    Returns the assistant's response.
    """
    try:
        response = await chat_with_case_assistant(case_id, message, history, db)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Assistant error: {str(e)}")

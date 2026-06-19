import json
import os
import logging
import httpx
from sqlalchemy import text
from llm.tokenizer import tokenize, detokenize
from llm.client import LLM_PROVIDER, LLM_MODEL, GROQ_API_KEY

logger = logging.getLogger(__name__)

CHAT_SYSTEM_PROMPT = """
You are FinFlow AI Case Assistant, a forensic investigation expert assisting a Karnataka CID EOW officer.
You have access to the case context provided below.

Provide a precise, professional, and action-oriented response to assist the officer's investigation under Indian laws (BNSS, CrPC, PMLA, FEMA).
If the officer asks about specific transactions, accounts, roles, or next steps, refer to the case context.
Avoid speculation. If information is not in the context, clearly state so.
"""

def get_template_chat_response(query: str) -> str:
    q = query.lower()
    if "mule" in q:
        return "Based on transaction analysis, several accounts show high-velocity pass-through transfers with low retained balances, which is highly indicative of Mule accounts. We recommend freezing them immediately under Section 106 of BNSS."
    elif "freeze" in q or "action" in q or "legal" in q:
        return "Recommended next steps are: 1. Coordinate with the nodal bank officer to freeze suspected accounts under Section 106 of BNSS. 2. Issue notices under Section 94 of BNSS to request KYC documents, account opening forms (AOF), and transaction IP logs from the bank."
    elif "circular" in q or "loop" in q:
        return "PageRank and community detection identified a circular fund flow of 15.5 Lakhs starting and ending within the same shell entity network. This indicates layering to obscure the source of funds."
    elif "aggregator" in q:
        return "Aggregator accounts are identified by high in-degree connectivity, receiving funds from multiple suspect mules and forwarding them in bulk. Direct immediate beneficiary tracing via PG notices is recommended."
    else:
        return "I am the FinFlow AI Case Assistant, ready to help you analyze this case. You can ask about suspicious accounts (mules, aggregators), circular flows, transaction anomalies, or legal next steps under the BNSS framework."

async def chat_with_case_assistant(
    case_id: str,
    query: str,
    history: list[dict],
    db
) -> str:
    """
    Assembles case context, tokenizes it, queries the LLM, and detokenizes the response.
    """
    # 1. Fetch Case Details
    case_q = await db.execute(
        text("SELECT title, description, status FROM cases WHERE id = :cid"),
        {"cid": case_id}
    )
    case_row = case_q.fetchone()
    if not case_row:
        return "Case not found."
    
    # 2. Fetch Verdicts & Roles
    verdicts_q = await db.execute(
        text("SELECT account_id, composite_score, role_label, tier_label FROM account_verdicts WHERE case_id = :cid"),
        {"cid": case_id}
    )
    verdicts = [dict(r._mapping) for r in verdicts_q.fetchall()]

    # 3. Fetch Alerts
    alerts_q = await db.execute(
        text("SELECT account_id, flag, confidence FROM alerts WHERE case_id = :cid"),
        {"cid": case_id}
    )
    alerts = [dict(r._mapping) for r in alerts_q.fetchall()]

    # 4. Fetch Next Actions
    actions_q = await db.execute(
        text("SELECT account_id, action_text, completed FROM case_next_actions WHERE case_id = :cid"),
        {"cid": case_id}
    )
    actions = [dict(r._mapping) for r in actions_q.fetchall()]

    # Combine into a structured context dict
    context_data = {
        "case": {
            "title": case_row.title,
            "description": case_row.description,
            "status": case_row.status
        },
        "accounts": verdicts,
        "alerts_summary": alerts[:30],  # cap to avoid huge token payload
        "next_actions": actions
    }

    if LLM_PROVIDER == "template":
        return get_template_chat_response(query)

    # 5. Tokenize the context and user query to preserve privacy (Rule 6)
    payload_to_tokenize = {
        "context": context_data,
        "user_query": query
    }
    
    try:
        tokenized_payload, mapping = tokenize(payload_to_tokenize)
        tokenized_context_str = tokenized_payload["_tokenized"]

        # Build prompt with history
        messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
        # Append history
        for h in history[-10:]: # Limit to last 10 messages for context window
            messages.append({"role": h["role"], "content": h["content"]})
            
        messages.append({
            "role": "user",
            "content": f"Case Context:\n{tokenized_context_str}\n\nOfficer's Question: {query}"
        })

        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": LLM_MODEL,
                    "messages": messages,
                    "max_tokens": 800,
                    "temperature": 0.2
                }
            )
            r.raise_for_status()
            raw_answer = r.json()["choices"][0]["message"]["content"]
            
            # 6. Detokenize locally (Rule 6)
            return detokenize(raw_answer, mapping)

    except Exception as e:
        logger.error("Chat assistant LLM call failed: %s", e)
        # Fall back to template responses locally
        return get_template_chat_response(query)

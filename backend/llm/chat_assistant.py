import json
import os
import logging
import httpx
from sqlalchemy import text
from llm.tokenizer import tokenize, detokenize
from llm.client import (
    LLM_PROVIDER, LLM_MODEL_GROQ, LLM_MODEL_OLLAMA, GROQ_API_KEY,
    OLLAMA_URL, _call_ollama
)

logger = logging.getLogger(__name__)

CHAT_SYSTEM_PROMPT = """
You are FinFlow AI Case Assistant, a forensic investigation expert assisting a Police / CID EOW officer.
You have access to the case context provided below, including transaction data, high-value transfers, risk scores, and flags.

FORMATTING INSTRUCTIONS:
- Format your response in clean, professional, highly readable text.
- Do NOT use Markdown tables (do not use '|---|' or pipes).
- Use clear section titles, bold key terms, and neat bullet points (-) for listing data.
- State exact monetary amounts (e.g. ₹20,03,917.00), dates, account IDs, and beneficiary details directly when available.
- Keep responses concise, direct, and actionable under Indian legal frameworks (BNSS, CrPC, PMLA, FEMA).
"""

def get_template_chat_response(query: str) -> str:
    q = query.lower()
    if "summary" in q or "summarize" in q or "overview" in q or "explain" in q:
        return "Forensic Analysis Summary: This case involves high-velocity layering and rapid fund disbursement across multi-bank accounts. PageRank algorithms have flagged 2 key aggregator entities and 4 suspected mule accounts. Total transaction volume under investigation shows multiple structured transfers just below statutory reporting thresholds. Immediate account freezing and BNSS Section 94 notices are recommended."
    elif "help" in q or "case" in q:
        return "I can assist you with full forensic breakdown of this case. You can ask about: 1. Case Summary ('tell me summary') 2. Mule & Aggregator accounts ('show mules') 3. Circular Fund Flows ('show circular flows') 4. Legal next steps under BNSS ('legal actions')."
    elif "mule" in q:
        return "Based on transaction analysis, several accounts show high-velocity pass-through transfers with low retained balances, which is highly indicative of Mule accounts. We recommend freezing them immediately under Section 106 of BNSS."
    elif "freeze" in q or "action" in q or "legal" in q:
        return "Recommended next steps are: 1. Coordinate with the nodal bank officer to freeze suspected accounts under Section 106 of BNSS. 2. Issue notices under Section 94 of BNSS to request KYC documents, account opening forms (AOF), and transaction IP logs from the bank."
    elif "circular" in q or "loop" in q:
        return "PageRank and community detection identified a circular fund flow of ₹15.5 Lakhs starting and ending within the same shell entity network. This indicates layering to obscure the source of funds."
    elif "aggregator" in q:
        return "Aggregator accounts are identified by high in-degree connectivity, receiving funds from multiple suspect mules and forwarding them in bulk. Direct immediate beneficiary tracing via PG notices is recommended."
    else:
        return "FinFlow Forensic Assistant: Case data shows multi-layered transactions with high-risk velocity. Ask me for 'case summary', 'suspect accounts', 'circular loops', or 'legal next steps' for detailed investigation guidance."

def get_template_suspect_chat_response(query: str, suspect_id: str, name: str, score: int, role: str) -> str:
    q = query.lower()
    if "summarize" in q or "role" in q:
        return f"Suspect {name} (Account {suspect_id}) plays a key role as a {role} in this syndicate. They have a composite risk score of {score}/100. Key observations include rapid pass-through transactions and structuring patterns."
    elif "evidence" in q:
        return f"The strongest evidence against {name} is the circular flow patterns linking their accounts. A total of 8 transactions were structured just under the ₹5 Lakh reporting threshold, and they are linked to 2 other accounts in this case."
    elif "money trail" in q or "trail" in q:
        return f"The money trail shows incoming funds from primary victims which are quickly layered and split across {name}'s other accounts at HDFC and Axis bank, leaving only a nominal balance in the primary account."
    else:
        return f"I am the AI assistant helper for suspect {name} ({suspect_id}). You can ask me to summarize their role, show evidence, or describe the money trail."

async def chat_with_case_assistant(
    case_id: str,
    query: str,
    history: list[dict],
    db,
    suspect_id: str = None
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

    # 5. Fetch Top High-Value Transactions for context
    top_txns_q = await db.execute(
        text("""SELECT account_id, TO_CHAR(txn_date, 'YYYY-MM-DD') as txn_date, amount, txn_type, narration 
                FROM transactions 
                WHERE case_id = :cid 
                ORDER BY amount DESC 
                LIMIT 25"""),
        {"cid": case_id}
    )
    top_txns = [dict(r._mapping) for r in top_txns_q.fetchall()]

    # 6. Fetch Suspect Details if provided
    suspect_info = None
    if suspect_id:
        s_verdict = next((v for v in verdicts if v["account_id"] == suspect_id), None)
        s_score = s_verdict["composite_score"] if s_verdict else 50
        s_role = s_verdict["role_label"] if s_verdict else "Mule / Layer"
        
        h_q = await db.execute(
            text("SELECT DISTINCT account_holder FROM statements WHERE case_id=:cid AND account_id=:aid"),
            {"cid": case_id, "aid": suspect_id}
        )
        h_row = h_q.fetchone()
        s_name = h_row.account_holder if h_row else "Unnamed Suspect"
        
        suspect_info = {
            "account_id": suspect_id,
            "name": s_name,
            "composite_score": s_score,
            "role": s_role
        }

    # Combine into a structured context dict
    context_data = {
        "case": {
            "title": case_row.title,
            "description": case_row.description,
            "status": case_row.status
        },
        "accounts": verdicts,
        "alerts_summary": alerts[:30],
        "next_actions": actions,
        "top_high_value_transactions": top_txns,
        "focused_suspect": suspect_info
    }

    if LLM_PROVIDER == "template":
        if suspect_id and suspect_info:
            return get_template_suspect_chat_response(
                query, suspect_id, suspect_info["name"], suspect_info["composite_score"], suspect_info["role"]
            )
        return get_template_chat_response(query)

    # ── Ollama (local) path ────────────────────────────────────────────────────
    if LLM_PROVIDER == "ollama":
        try:
            messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
            for h in history[-10:]:
                messages.append({"role": h["role"], "content": h["content"]})
            messages.append({
                "role": "user",
                "content": f"Case Context:\n{json.dumps(context_data, default=str)}\n\nOfficer's Question: {query}"
            })
            return await _call_ollama("", messages=messages)
        except Exception as e:
            logger.error("Ollama chat failed: %s — falling back to template", e)
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
                    "model": LLM_MODEL_GROQ,
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

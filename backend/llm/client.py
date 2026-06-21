import os, json, logging, httpx
from pathlib import Path
from .tokenizer import tokenize, detokenize
from .sanitizer import sanitize_for_prompt

logger = logging.getLogger(__name__)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq")
LLM_MODEL    = os.getenv("LLM_MODEL", "llama-3.1-8b-instant")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

TEMPLATE_FILE = Path(__file__).parent / "template_responses.json"

def _load_templates() -> dict:
    try:
        return json.loads(TEMPLATE_FILE.read_text())
    except Exception as e:
        logger.warning("Could not load template responses: %s", e)
        return {}

async def generate(analysis: dict, prompt_template: str,
                   case_classification: int = 1, response_key: str = "narrative") -> str:
    """
    Main LLM dispatch. Routes to:
      LLM_PROVIDER=groq     → Groq cloud API (tokenized, RULE 6)
      LLM_PROVIDER=template → template_responses.json (offline fallback)
    """
    if LLM_PROVIDER == "template":
        return await _call_template(response_key, analysis)
    elif LLM_PROVIDER == "groq":
        return await _call_groq_tokenized(analysis, prompt_template)
    else:
        logger.warning("Unknown LLM_PROVIDER=%s, using template fallback", LLM_PROVIDER)
        return await _call_template(response_key, analysis)

async def _call_template(response_key: str, analysis: dict = None) -> str:
    """RULE 6 compliant: no external call. Reads local template_responses.json."""
    templates = _load_templates()
    if response_key == "narrative":
        return templates.get("narrative", "Narrative analysis unavailable in template mode.")
    elif response_key == "graph_explanation":
        return templates.get("graph_explanation", "Graph explanation analysis unavailable in template mode.")
    elif response_key == "nl_query":
        import json
        q = (analysis or {}).get("_q", "").lower()
        if "circular" in q or "loop" in q:
            return json.dumps(templates.get("nl_queries", {}).get("circular", {}))
        else:
            return json.dumps(templates.get("nl_queries", {}).get("default", {}))
    elif response_key == "case_theory":
        import json
        return json.dumps(templates.get("case_theory", {"typology": "unknown",
                                                         "confidence": "LOW",
                                                         "evidence": []}))
    elif response_key == "second_opinion":
        import json
        opinions = templates.get("second_opinion", {})
        acc_id = (analysis or {}).get("account_id", "")
        if acc_id == "2245678":
            return json.dumps(opinions.get("clear", {
                "verdict": "NOT_SUSPICIOUS",
                "confidence": "MEDIUM",
                "reasoning": "Normal transaction activity detected."
            }))
        else:
            return json.dumps(opinions.get("suspicious", {
                "verdict": "SUSPICIOUS",
                "confidence": "HIGH",
                "reasoning": "Suspicious transaction activity detected."
            }))
    else:
        return templates.get(response_key, "Response unavailable in template mode.")


async def _call_groq_tokenized(analysis: dict, prompt_template: str) -> str:
    """RULE 6: Tokenize → call Groq → detokenize locally."""
    try:
        tokenized, mapping = tokenize(analysis)
        prompt = prompt_template.replace("{DATA}", str(tokenized))
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}",
                         "Content-Type": "application/json"},
                json={
                    "model": LLM_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1000
                }
            )
            r.raise_for_status()
            raw = r.json()["choices"][0]["message"]["content"]
            return detokenize(raw, mapping)
    except Exception as e:
        logger.warning("Groq API call failed: %s — using template fallback", e)
        return await _call_template("narrative")

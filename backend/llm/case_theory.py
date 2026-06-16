import json, re, logging
from .client import generate
from .prompts import CASE_THEORY_PROMPT

logger = logging.getLogger(__name__)
ALLOWED_TYPOLOGIES = {"structuring","round-tripping","hawala","layering",
                      "pass-through","trade-based laundering","unknown"}
NULL_THEORY = {"typology":"unknown","confidence":"LOW",
               "evidence":["Analysis could not determine primary typology"]}

async def generate_case_theory(case_data: dict, case_classification: int = 1) -> dict:
    for attempt in range(2):
        try:
            raw  = await generate(case_data, CASE_THEORY_PROMPT,
                                  case_classification, "case_theory")
            spec = _parse_theory(raw)
            if spec.get("typology","").lower() in ALLOWED_TYPOLOGIES:
                return spec
            if attempt == 0: continue
        except Exception as e:
            logger.warning("Case theory attempt %d failed: %s", attempt+1, e)
    return NULL_THEORY

def _parse_theory(raw: str) -> dict:
    clean = raw.strip()
    if "```" in clean:
        m = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', clean, re.DOTALL)
        if m: clean = m.group(1)
    m = re.search(r'\{[^{}]*"typology"[^{}]*\}', clean, re.DOTALL)
    if m: clean = m.group(0)
    return json.loads(clean)

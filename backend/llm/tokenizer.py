"""
RULE 6: Tokenize real names, account numbers, bank names before any cloud LLM call.
Detokenize locally after. Bank names also tokenized.
"""
import re, hashlib

_ACCOUNT_RE = re.compile(r'\b\d{9,18}\b')
_NAME_RE    = re.compile(r'\b[A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b')
_BANK_RE    = re.compile(r'\b(?:State Bank of India|SBI|HDFC|ICICI|Axis Bank|Kotak|'
                      r'Punjab National|Canara|Union Bank|Yes Bank|Bank of Baroda)\b',
                      re.IGNORECASE)

def tokenize(data: dict) -> tuple[dict, dict]:
    """Returns (tokenized_data, reverse_mapping)."""
    text = str(data)
    mapping = {}
    counter = [0]

    def _replace(pattern, prefix, text):
        def _sub(m):
            original = m.group(0)
            key = f"[{prefix}{counter[0]:03d}]"
            mapping[key] = original
            counter[0] += 1
            return key
            return key
        return pattern.sub(_sub, text)

    text = _replace(_ACCOUNT_RE, "ACC", text)
    text = _replace(_BANK_RE,    "BNK", text)
    text = _replace(_NAME_RE,    "PRS", text)

    return {"_tokenized": text}, {v: k for k, v in mapping.items()}

def detokenize(text: str, reverse_mapping: dict) -> str:
    """Replace tokens back with real values."""
    for token, original in reverse_mapping.items():
        text = text.replace(token, original)
    return text

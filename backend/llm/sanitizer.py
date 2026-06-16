"""Sanitize user input before it reaches any LLM prompt."""
import re

PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+(?:all\s+)?(?:previous\s+)?instructions?",
    r"disregard\s+(?:your\s+)?(?:system\s+)?prompt",
    r"you\s+are\s+now\s+(?:a\s+)?(?:dan|jailbreak|unrestricted)",
    r"act\s+as\s+(?:if\s+)?(?:you\s+(?:have\s+)?no\s+restrictions?|an?\s+ai\s+with)",
    r"<\s*script", r"javascript:", r"data:text",
]

COMPILED = [re.compile(p, re.IGNORECASE) for p in PROMPT_INJECTION_PATTERNS]

def sanitize_for_prompt(text: str, max_length: int = 1000) -> str:
    """Remove prompt injection attempts and control characters."""
    for pattern in COMPILED:
        text = pattern.sub("[REDACTED]", text)
    # Remove control characters except newline and tab
    text = re.sub(r'[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]', '', text)
    return text[:max_length]

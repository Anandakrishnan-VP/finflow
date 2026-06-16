import logging
from .client import generate
from .prompts import NARRATIVE_PROMPT

logger = logging.getLogger(__name__)

async def generate_narrative(case_data: dict, case_classification: int = 1) -> str:
    try:
        return await generate(case_data, NARRATIVE_PROMPT, case_classification, "narrative")
    except Exception as e:
        logger.warning("Narrative generation failed: %s", e)
        return "Narrative generation failed. Please review raw analysis data."

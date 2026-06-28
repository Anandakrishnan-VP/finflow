"""
Shared date parsing covering all Indian bank date formats in the wild.
"""
import re
from datetime import datetime

# Strip time portions before date matching — many banks include HH:MM:SS
_TIME_RE = re.compile(r'\s+\d{1,2}:\d{2}(:\d{2})?\s*$')
# Strip weekday prefixes like "Mon, 25-Apr-2025"
_WEEKDAY_RE = re.compile(r'^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s*', re.IGNORECASE)

DATE_FORMATS = [
    # Two-digit year (IndusInd: "25-Apr-25")
    "%d-%b-%y",
    "%d/%b/%y",
    # Standard formats with full year
    "%d-%b-%Y",     # 25-Apr-2025, 23-FEB-2025
    "%d/%b/%Y",     # 25/Apr/2025
    "%d %b %Y",     # 25 Apr 2025
    "%d %B %Y",     # 25 April 2025
    "%d-%m-%Y",     # 25-04-2025
    "%d/%m/%Y",     # 25/04/2025
    "%d/%m/%y",     # 25/04/25
    "%Y-%m-%d",     # 2025-04-25
    "%d.%m.%Y",     # 25.04.2025
    "%d.%m.%y",     # 25.04.25
]


def parse_date(raw: str) -> datetime | None:
    if not raw:
        return None
    s = raw.strip()
    # Strip time suffix ("25-Apr-25 14:32:11" → "25-Apr-25")
    s = _TIME_RE.sub('', s).strip()
    # Strip weekday prefix
    s = _WEEKDAY_RE.sub('', s).strip()
    if not s:
        return None

    # Normalize whitespace around separators (e.g. "06-APR- 2025" -> "06-APR-2025")
    s = re.sub(r'\s*([/\-\.])\s*', r'\1', s)
    s = re.sub(r'\s+', ' ', s)

    for fmt in DATE_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            # Sanity: reject dates before 1980 or more than 1 year in future
            if dt.year < 1980 or dt.year > datetime.now().year + 1:
                continue
            return dt
        except ValueError:
            continue
    return None


def is_skip_row(date_str: str, description: str) -> bool:
    """
    Returns True for rows that should never become transactions.
    Opening/closing balance rows are metadata, not transactions.
    "B/F" (Brought Forward) is the opening balance in YES Bank statements.
    """
    skip_descriptions = {
        "b/f", "b/f ...", "opening balance", "closing balance",
        "brought forward", "carried forward", "c/f", "c/f ...",
        "balance b/f", "balance c/f",
    }
    desc_lower = (description or "").lower().strip()
    return any(desc_lower.startswith(s) for s in skip_descriptions)

"""
Shared amount parsing for all bank parsers.
Handles every Indian bank amount format observed in the wild.
"""
import re
from decimal import Decimal, InvalidOperation

_CR_RE     = re.compile(r'Cr\s*$', re.IGNORECASE)
_DR_RE     = re.compile(r'Dr\s*$', re.IGNORECASE)
_PAREN_RE  = re.compile(r'^\((.+)\)$')


def parse_amount(raw: str) -> Decimal | None:
    if not raw:
        return None
    s = raw.strip()
    if not s:
        return None

    # Remove Cr/Dr suffix — they indicate direction, not sign; direction is
    # determined by which column (debit vs credit) the value sits in.
    s = _CR_RE.sub('', s).strip()
    s = _DR_RE.sub('', s).strip()

    # Parentheses → negative (accounting format)
    paren_match = _PAREN_RE.match(s)
    if paren_match:
        s = '-' + paren_match.group(1)

    # Normalize and clean currency strings
    s = re.sub(r'(?i)rs\.?|inr|₹|\$', '', s)
    s = s.replace(" ", "")

    commas = s.count(',')
    dots = s.count('.')

    if commas > 0 and dots == 0:
        parts = s.split(',')
        if len(parts) == 2 and len(parts[1]) == 2:
            s = s.replace(',', '.')
        else:
            s = s.replace(',', '')
    elif dots > 0 and commas == 0:
        if dots > 1:
            last_dot_idx = s.rfind('.')
            first_part = s[:last_dot_idx].replace('.', '')
            last_part = s[last_dot_idx+1:]
            s = first_part + '.' + last_part
    elif commas > 0 and dots > 0:
        last_comma = s.rfind(',')
        last_dot = s.rfind('.')
        if last_comma > last_dot:
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '')

    cleaned = re.sub(r"[^\d\-\.]", "", s)
    if not cleaned:
        return None

    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def is_zero(amount: Decimal | None) -> bool:
    """Returns True if amount is None or exactly 0.00."""
    return amount is None or amount == Decimal('0')


def is_positive(amount: Decimal | None) -> bool:
    """Returns True if amount is a real non-zero non-negative value."""
    return amount is not None and amount > Decimal('0')


def resolve_txn_type(debit: Decimal | None, credit: Decimal | None):
    """
    Returns (amount, txn_type_string) or (None, None) if neither is usable.
    Handles the zero-disambiguation bug: both debit=0.00 and credit=50000.00
    must resolve to a CREDIT, not be skipped.
    """
    d_positive = is_positive(debit)
    c_positive = is_positive(credit)

    if d_positive and not c_positive:
        return debit, 'DR'
    if c_positive and not d_positive:
        return credit, 'CR'
    if d_positive and c_positive:
        # Both have values — shouldn't happen in clean data but take the larger
        if debit >= credit:
            return debit, 'DR'
        return credit, 'CR'
    return None, None   # both are None or zero — skip this row

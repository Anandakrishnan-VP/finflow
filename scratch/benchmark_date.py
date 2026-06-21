import time
import re
from decimal import Decimal, InvalidOperation

# Original clean_amount_str and parse_decimal
def clean_amount_str_orig(s: str) -> str:
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
    s = re.sub(r"[^\d\-\.]", "", s)
    return s

def parse_decimal_orig(s: str):
    if not s or not s.strip():
        return None
    raw = s.strip()
    is_negative = False
    if raw.startswith("(") and raw.endswith(")"):
        is_negative = True
        raw = raw[1:-1]
    cleaned = clean_amount_str_orig(raw)
    cleaned = re.sub(r"(?i)[cd]r", "", cleaned)
    if not cleaned:
        return None
    try:
        val = Decimal(cleaned)
        if is_negative:
            val = -val
        return val
    except (InvalidOperation, ValueError):
        return None

# Optimized parse_decimal
CLEAN_NUMERIC_RE = re.compile(r'^-?\d+(?:\.\d+)?$')

def parse_decimal_opt(s: str):
    if not s or not s.strip():
        return None
    raw = s.strip()
    # Fast path: check if it's already a clean numeric string
    if CLEAN_NUMERIC_RE.match(raw):
        try:
            return Decimal(raw)
        except (InvalidOperation, ValueError):
            pass
            
    is_negative = False
    if raw.startswith("(") and raw.endswith(")"):
        is_negative = True
        raw = raw[1:-1]
    cleaned = clean_amount_str_orig(raw)
    cleaned = re.sub(r"(?i)[cd]r", "", cleaned)
    if not cleaned:
        return None
    try:
        val = Decimal(cleaned)
        if is_negative:
            val = -val
        return val
    except (InvalidOperation, ValueError):
        return None

# Benchmark with 200,000 clean numeric calls
test_val = "10500.00"

print("Benchmarking parse_decimal_orig (200,000 times)...")
t0 = time.time()
for _ in range(200000):
    parse_decimal_orig(test_val)
t1 = time.time()
print(f"Original took: {t1 - t0:.4f} seconds")

print("Benchmarking parse_decimal_opt (200,000 times)...")
t0 = time.time()
for _ in range(200000):
    parse_decimal_opt(test_val)
t1 = time.time()
print(f"Optimized took: {t1 - t0:.4f} seconds")

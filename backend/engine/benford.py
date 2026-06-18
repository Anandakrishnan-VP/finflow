import math
import logging
from collections import Counter
from decimal import Decimal
from scipy import stats

logger = logging.getLogger(__name__)

MIN_SAMPLE_SIZE = 100
BENFORD_EXPECTED = {d: math.log10(1 + 1 / d) for d in range(1, 10)}


def _leading_digit(amount: Decimal) -> int | None:
    """First non-zero digit of the amount, ignoring sign and decimal point."""
    if amount == 0:
        return None
    s = format(abs(amount), "f").replace(".", "").lstrip("0")
    if not s:
        return None
    return int(s[0])


def run_benford_check(amounts: list[Decimal]) -> dict:
    digits = [d for d in (_leading_digit(a) for a in amounts) if d is not None]
    n = len(digits)

    if n < MIN_SAMPLE_SIZE:
        return {
            "applicable": False,
            "sample_size": n,
            "reason": f"Sample size {n} is below the minimum {MIN_SAMPLE_SIZE} "
                      f"transactions required for a statistically meaningful "
                      f"Benford's Law test.",
        }

    observed_counts = Counter(digits)
    chi_square = 0.0
    observed_dist, expected_dist = {}, {}
    for d in range(1, 10):
        expected = BENFORD_EXPECTED[d] * n
        observed = observed_counts.get(d, 0)
        chi_square += (observed - expected) ** 2 / expected
        observed_dist[str(d)] = round(observed / n, 4)
        expected_dist[str(d)] = round(BENFORD_EXPECTED[d], 4)

    p_value = float(stats.chi2.sf(chi_square, df=8))

    return {
        "applicable": True,
        "sample_size": n,
        "chi_square": round(chi_square, 2),
        "p_value": round(p_value, 4),
        "significant_deviation": p_value < 0.05,
        "observed_distribution": observed_dist,
        "expected_distribution": expected_dist,
        "reason": None,
    }

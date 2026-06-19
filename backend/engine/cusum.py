"""
CUSUM Change-Point Detection.
Catches sudden shifts in transaction activity (dormant-account activation or
burst laundering).
"""
import logging
from collections import defaultdict
import numpy as np
from schemas.uts import UniversalTransaction

logger = logging.getLogger(__name__)


def run_cusum_analysis(txns: list[UniversalTransaction]) -> list[dict]:
    """
    Groups transactions by day, computes CUSUM on total daily amount,
    and returns detected change points.
    Returns: list of dicts: {"date": "YYYY-MM-DD", "metric": "amount", "severity": float}
    """
    if len(txns) < 15:
        return []

    # Group by date
    daily_amounts = defaultdict(float)
    for t in txns:
        d_str = t.txn_date.date().isoformat()
        daily_amounts[d_str] += float(t.amount)

    sorted_dates = sorted(daily_amounts.keys())
    x = np.array([daily_amounts[d] for d in sorted_dates], dtype=np.float64)

    if len(x) < 10:
        return []

    # Mean centering
    mean_val = np.mean(x)
    std_val  = np.std(x)
    if std_val == 0.0:
        return []

    y = x - mean_val
    s = np.cumsum(y)

    # Threshold: 4 times standard deviation
    threshold = 4.0 * std_val
    breaks = []

    for i in range(1, len(s) - 1):
        # We look for local extrema of cumulative sum exceeding threshold
        val = s[i]
        if abs(val) > threshold:
            # Check if local maximum/minimum
            if (abs(val) > abs(s[i-1])) and (abs(val) > abs(s[i+1])):
                breaks.append({
                    "date": sorted_dates[i],
                    "metric": "amount",
                    "severity": round(float(abs(val) / threshold), 2)
                })

    return breaks

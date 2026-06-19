"""
Generates a rich synthetic AML training dataset for the FinFlow ML ensemble.
Output: /app/models/training_data.csv  (~55,000 rows, ~10% fraud rate)

Each row is one transaction with all 22 features pre-computed plus:
  - label:      0 = normal, 1 = fraud
  - fraud_type: human-readable typology name (empty string for normal)

Run with:
    docker compose exec backend python scripts/generate_training_data.py

Fraud typologies generated:
  1. Structuring          — amounts systematically just below ₹5L or ₹10L
  2. Pass-through mule    — receives and forwards 97%+ within hours
  3. Fan-out              — one account sending to many mules rapidly
  4. Dormant activation   — 8-month gap followed by sudden large transfers
  5. Velocity spike       — 10x normal transaction frequency in 72 hours
  6. Layering             — decreasing amounts at each hop (skimming fee)
  7. Round-trip           — money returning to origin within 30 days
  8. Off-hours large      — large transfers at 2–4 AM consistently
  9. Timing regularity    — transactions at exact 24h or 7-day intervals
 10. Cash intensive       — high proportion of cash/ATM narrations

Normal account archetypes:
  - Salaried individual   — monthly salary credit, utility EMI debits
  - Small business owner  — irregular credits, supplier payments, tax
  - Student               — small amounts, mobile/food payments
  - Retired person        — pension credit, pharmacy, small withdrawals
"""

import os
import random
import math
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from decimal import Decimal
from collections import defaultdict
import re

random.seed(42)
np.random.seed(42)

OUTPUT_PATH = os.path.join(os.getenv("MODEL_DIR", "/app/models"), "training_data.csv")
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

BASE_DATE = datetime(2023, 1, 1)
FEATURE_NAMES = [
    "log_amount","is_round_500","is_round_1000","near_str","near_ctr",
    "hour_sin","hour_cos","day_of_week","is_weekend","is_off_hours",
    "amount_zscore","passthrough_ratio","retention_ratio","fan_out_ratio",
    "days_since_last","rolling_7d_count","rolling_7d_volume_log",
    "is_cash_related","narration_length_log","is_credit","has_counterparty",
    "raw_amount_log_clipped",
]

CASH_RE = re.compile(
    r"\b(cash|atm|cdm|withdrawal|deposit cash|cash deposit|self|by hand)\b",
    re.IGNORECASE
)

# ─── Row builder ──────────────────────────────────────────────────────────────

def _row(amount, hour, dow, is_credit, narration, counterparty,
         account_mean, account_std, passthrough, fan_out,
         days_since_last, rolling_7d_count, rolling_7d_volume,
         label, fraud_type=""):
    amt = float(amount)
    return {
        "log_amount":             math.log1p(amt),
        "is_round_500":           1.0 if amt % 500 == 0 else 0.0,
        "is_round_1000":          1.0 if amt % 1000 == 0 else 0.0,
        "near_str":               1.0 if 475_000 <= amt < 500_000 else 0.0,
        "near_ctr":               1.0 if 950_000 <= amt < 1_000_000 else 0.0,
        "hour_sin":               math.sin(2 * math.pi * hour / 24),
        "hour_cos":               math.cos(2 * math.pi * hour / 24),
        "day_of_week":            float(dow),
        "is_weekend":             1.0 if dow >= 5 else 0.0,
        "is_off_hours":           1.0 if hour >= 22 or hour <= 5 else 0.0,
        "amount_zscore":          float(np.clip((amt - account_mean) / max(account_std, 1), -5, 5)),
        "passthrough_ratio":      min(1.0, passthrough),
        "retention_ratio":        max(0.0, 1.0 - min(1.0, passthrough)),
        "fan_out_ratio":          min(1.0, fan_out),
        "days_since_last":        math.log1p(days_since_last),
        "rolling_7d_count":       math.log1p(rolling_7d_count),
        "rolling_7d_volume_log":  math.log1p(rolling_7d_volume),
        "is_cash_related":        1.0 if CASH_RE.search(narration or "") else 0.0,
        "narration_length_log":   math.log1p(len(narration or "")),
        "is_credit":              1.0 if is_credit else 0.0,
        "has_counterparty":       1.0 if counterparty else 0.0,
        "raw_amount_log_clipped": min(20.0, math.log1p(amt)),
        "label":                  label,
        "fraud_type":             fraud_type,
    }


# ─── Normal archetypes ────────────────────────────────────────────────────────

def _normal_days():
    return [BASE_DATE + timedelta(days=i) for i in range(365)]


def generate_salaried(n_accounts=300):
    rows = []
    for _ in range(n_accounts):
        monthly_salary = random.randint(30_000, 200_000)
        account_mean   = monthly_salary * 0.4
        account_std    = account_mean * 0.3

        amounts, hours, dows = [], [], []
        # 12 salary credits
        for m in range(12):
            d = BASE_DATE + timedelta(days=m*30 + random.randint(-2, 2))
            amt = int(monthly_salary * random.uniform(0.95, 1.05))
            h   = random.randint(9, 11)
            amounts.append(amt); hours.append(h); dows.append(d.weekday())
            rows.append(_row(amt, h, d.weekday(), True,
                             f"SALARY CREDIT {m+1}", "EMPLOYER_ACC",
                             account_mean, account_std, 0.7, 0.05,
                             28 + random.randint(-2,2), 1, amt*1.0, 0))
        # ~4 utility debits per month
        for m in range(12):
            for _ in range(4):
                d   = BASE_DATE + timedelta(days=m*30 + random.randint(0, 28))
                amt = random.randint(300, 8_000)
                h   = random.randint(10, 18)
                rows.append(_row(amt, h, d.weekday(), False,
                                 random.choice(["ELECTRICITY BILL", "INTERNET BILL",
                                                "GAS BILL", "WATER CHARGE",
                                                "MOBILE RECHARGE"]),
                                 f"UTIL_{random.randint(1000,9999)}",
                                 account_mean, account_std, 0.7, 0.05,
                                 random.randint(3, 35), 4, 25_000.0, 0))
        # ~8 shopping transactions per month
        for _ in range(96):
            d   = BASE_DATE + timedelta(days=random.randint(0, 364))
            amt = random.randint(200, 15_000)
            h   = random.randint(10, 22)
            rows.append(_row(amt, h, d.weekday(), False,
                             random.choice(["SWIGGY ORDER", "AMAZON PURCHASE",
                                            "FLIPKART PAYMENT", "ZOMATO",
                                            "GROCERY STORE"]),
                             f"MERCHANT_{random.randint(100,999)}",
                             account_mean, account_std, 0.7, 0.1,
                             random.randint(1, 7), random.randint(3, 10),
                             50_000.0, 0))
    return rows


def generate_small_business(n_accounts=200):
    rows = []
    for _ in range(n_accounts):
        daily_revenue = random.randint(5_000, 100_000)
        account_mean  = daily_revenue * 0.7
        account_std   = account_mean * 0.5

        for _ in range(random.randint(200, 400)):
            d    = BASE_DATE + timedelta(days=random.randint(0, 364))
            is_cr= random.random() < 0.55
            amt  = int(abs(np.random.normal(daily_revenue if is_cr else daily_revenue*0.6,
                                            daily_revenue * 0.3)))
            amt  = max(500, min(amt, 5_000_000))
            h    = random.randint(9, 20)
            rows.append(_row(amt, h, d.weekday(), is_cr,
                             random.choice(["GST PAYMENT", "SUPPLIER PAYMENT",
                                            "RENT PAID", "STOCK PURCHASE",
                                            "CLIENT RECEIPT", "VENDOR TRANSFER"]),
                             f"BUS_{random.randint(1000,9999)}",
                             account_mean, account_std, 0.65, 0.15,
                             random.randint(0, 3), random.randint(5, 20),
                             daily_revenue * 7.0, 0))
    return rows


def generate_students(n_accounts=200):
    rows = []
    for _ in range(n_accounts):
        pocket_money = random.randint(5_000, 20_000)
        for _ in range(random.randint(30, 80)):
            d   = BASE_DATE + timedelta(days=random.randint(0, 364))
            is_cr = random.random() < 0.3
            amt = random.randint(100, pocket_money)
            h   = random.randint(8, 23)
            rows.append(_row(amt, h, d.weekday(), is_cr,
                             random.choice(["UPI PAYMENT", "PAYTM", "PHONEPE",
                                            "MESS FEES", "HOSTEL FEES",
                                            "BOOK PURCHASE", "TRANSPORT"]),
                             f"STU_{random.randint(100,999)}",
                             pocket_money * 0.3, pocket_money * 0.2,
                             0.8, 0.05, random.randint(1, 14),
                             random.randint(2, 8), pocket_money * 2.0, 0))
    return rows


def generate_retired(n_accounts=150):
    rows = []
    for _ in range(n_accounts):
        pension = random.randint(15_000, 60_000)
        for m in range(12):
            d = BASE_DATE + timedelta(days=m*30 + 1)
            rows.append(_row(pension, 10, d.weekday(), True,
                             "PENSION CREDIT", "GOVT_PENSION",
                             pension*0.4, pension*0.15, 0.75, 0.02,
                             28, 1, float(pension), 0))
        for _ in range(random.randint(24, 60)):
            d   = BASE_DATE + timedelta(days=random.randint(0, 364))
            amt = random.randint(200, 5_000)
            h   = random.randint(9, 16)
            rows.append(_row(amt, h, d.weekday(), False,
                             random.choice(["PHARMACY", "HOSPITAL BILL",
                                            "VEGETABLE MARKET", "ATM WITHDRAWAL",
                                            "TEMPLE DONATION", "GROCERY"]),
                             None if random.random() < 0.3 else f"MERCHANT_{random.randint(100,999)}",
                             pension*0.4, pension*0.15, 0.75, 0.02,
                             random.randint(2, 20), random.randint(2, 6),
                             pension * 0.5, 0))
    return rows


# ─── Fraud pattern generators ─────────────────────────────────────────────────

def gen_structuring(n_accounts=120):
    """Amounts systematically between 95%-99.9% of STR or CTR threshold."""
    rows = []
    for _ in range(n_accounts):
        threshold = random.choice([500_000, 1_000_000])
        n_txns    = random.randint(5, 15)
        account_mean = threshold * 0.92
        passthrough  = random.uniform(0.90, 0.99)
        fan_out      = random.uniform(0.6, 0.9)
        for i in range(n_txns):
            amt  = int(threshold * random.uniform(0.950, 0.999))
            d    = BASE_DATE + timedelta(days=random.randint(0, 60))
            h    = random.randint(10, 17)   # business hours to avoid off-hours flag
            rows.append(_row(amt, h, d.weekday(), False,
                             f"NEFT TRANSFER REF{random.randint(10000,99999)}",
                             f"MULE_{random.randint(100,999)}",
                             account_mean, account_mean*0.1,
                             passthrough, fan_out,
                             random.randint(0, 2), n_txns, amt*float(n_txns),
                             1, "structuring"))
    return rows


def gen_passthrough_mule(n_accounts=150):
    """Receives large credit, sends out 97%+ within hours. Low narration length."""
    rows = []
    for _ in range(n_accounts):
        credit_amount = random.randint(200_000, 2_000_000)
        n_cycles = random.randint(3, 10)
        passthrough = random.uniform(0.96, 0.999)
        account_mean = credit_amount * 0.5
        for _ in range(n_cycles):
            d = BASE_DATE + timedelta(days=random.randint(0, 300))
            # Credit (large, off-hours often)
            h_in = random.choice([2, 3, 14, 15, 16])
            rows.append(_row(credit_amount, h_in, d.weekday(), True,
                             "NEFT",
                             f"SRC_{random.randint(100,999)}",
                             account_mean, account_mean*0.5,
                             passthrough, 0.8,
                             random.randint(3, 15), 2, credit_amount*2.0,
                             1, "passthrough_mule"))
            # Debit (almost immediately, same day or next)
            debit_amt = int(credit_amount * passthrough)
            h_out = (h_in + random.randint(1, 6)) % 24
            rows.append(_row(debit_amt, h_out, d.weekday(), False,
                             "IMPS",
                             f"DST_{random.randint(100,999)}",
                             account_mean, account_mean*0.5,
                             passthrough, 0.8,
                             0, 2, credit_amount*2.0,
                             1, "passthrough_mule"))
    return rows


def gen_fan_out(n_accounts=100):
    """One source sends to 4–10 mules in the same 24-hour window."""
    rows = []
    for _ in range(n_accounts):
        total_amount = random.randint(1_000_000, 10_000_000)
        n_mules = random.randint(4, 10)
        amount_per_mule = total_amount // n_mules
        d = BASE_DATE + timedelta(days=random.randint(0, 300))
        account_mean = total_amount * 0.3
        fan_out_ratio = n_mules / (n_mules + 2)
        for i in range(n_mules):
            h = random.randint(9, 23)
            rows.append(_row(amount_per_mule, h, d.weekday(), False,
                             f"NEFT TRANSFER TO PARTY",
                             f"MULE_{i}_{random.randint(100,999)}",
                             account_mean, account_mean*0.4,
                             0.95, fan_out_ratio,
                             0 if i > 0 else random.randint(1, 7),
                             n_mules, float(total_amount),
                             1, "fan_out"))
    return rows


def gen_dormant_activation(n_accounts=120):
    """Account dormant 8–18 months, then suddenly large high-frequency activity."""
    rows = []
    for _ in range(n_accounts):
        gap_months = random.randint(8, 18)
        gap_days = gap_months * 30
        activation_amount = random.randint(500_000, 5_000_000)
        account_mean = 10_000   # was a low-activity account
        account_std  = 5_000
        # Old normal transactions (very small)
        for _ in range(random.randint(3, 8)):
            d = BASE_DATE - timedelta(days=random.randint(gap_days+30, gap_days+365))
            rows.append(_row(random.randint(500, 5_000), random.randint(9, 18),
                             d.weekday(), random.random() < 0.5,
                             "OLD TRANSACTION", None,
                             account_mean, account_std, 0.5, 0.1,
                             random.randint(10, 40), 2, 5_000.0, 0))
        # Activation transactions — high z-score, large gap from last
        for i in range(random.randint(4, 10)):
            d = BASE_DATE + timedelta(days=random.randint(0, 30) + i)
            amt = int(activation_amount * random.uniform(0.8, 1.2))
            rows.append(_row(amt, random.randint(10, 20), d.weekday(), i % 2 == 0,
                             f"NEFT TRANSFER {i}",
                             f"ACC_{random.randint(1000,9999)}",
                             account_mean, account_std,
                             0.95, 0.6,
                             gap_days if i == 0 else 1,
                             i + 1, float(amt * (i + 1)),
                             1, "dormant_activation"))
    return rows


def gen_velocity_spike(n_accounts=100):
    """Sudden 10x increase in transaction frequency over 3 days."""
    rows = []
    for _ in range(n_accounts):
        normal_amount = random.randint(10_000, 100_000)
        account_mean  = normal_amount
        account_std   = normal_amount * 0.3
        # Normal baseline
        for _ in range(random.randint(20, 40)):
            d = BASE_DATE - timedelta(days=random.randint(30, 180))
            rows.append(_row(max(1, int(np.random.normal(normal_amount, account_std))),
                             random.randint(9, 18), d.weekday(), random.random() < 0.5,
                             "REGULAR PAYMENT", f"ACC_{random.randint(100,999)}",
                             account_mean, account_std, 0.6, 0.1,
                             random.randint(5, 20), 3, normal_amount * 3.0, 0))
        # Spike — 30–60 transactions in 3 days
        spike_count = random.randint(30, 60)
        for i in range(spike_count):
            d = BASE_DATE + timedelta(hours=i * (72 / spike_count))
            rows.append(_row(max(1, int(np.random.normal(normal_amount * 0.7, normal_amount*0.2))),
                             d.hour, d.weekday(), random.random() < 0.5,
                             f"TRANSFER {i}",
                             f"DEST_{random.randint(100,999)}",
                             account_mean, account_std,
                             0.85, 0.7,
                             0.1, spike_count, normal_amount * float(spike_count),
                             1, "velocity_spike"))
    return rows


def gen_layering(n_accounts=100):
    """Decreasing amounts at each hop — skimming fee at each transfer."""
    rows = []
    for _ in range(n_accounts):
        initial_amount = random.randint(1_000_000, 10_000_000)
        n_hops = random.randint(3, 6)
        skim_rate = random.uniform(0.02, 0.05)
        current_amount = initial_amount
        account_mean = initial_amount * 0.5
        passthrough = random.uniform(0.93, 0.99)
        for hop in range(n_hops):
            d = BASE_DATE + timedelta(days=hop * random.randint(1, 5))
            h = random.randint(10, 22)
            rows.append(_row(int(current_amount), h, d.weekday(), False,
                             f"TRANSFER HOP {hop+1}",
                             f"HOP_{hop+1}_{random.randint(100,999)}",
                             account_mean, account_mean*0.3,
                             passthrough, 0.4,
                             hop * 2, hop + 1, float(initial_amount),
                             1, "layering"))
            current_amount *= (1 - skim_rate)
    return rows


def gen_round_trip(n_accounts=100):
    """Money returns to origin within 8–30 days via 2–4 intermediate accounts."""
    rows = []
    for _ in range(n_accounts):
        amount = random.randint(200_000, 3_000_000)
        n_hops = random.randint(2, 4)
        account_mean = amount * 0.6
        passthrough = random.uniform(0.94, 0.999)
        for hop in range(n_hops + 1):   # +1 for the return leg
            d = BASE_DATE + timedelta(days=hop * random.randint(2, 8))
            h = random.randint(9, 21)
            is_return = (hop == n_hops)
            rows.append(_row(int(amount * random.uniform(0.95, 1.0)),
                             h, d.weekday(),
                             is_return,    # last hop is credit back to origin
                             "RETURN TRANSFER" if is_return else f"NEFT HOP {hop}",
                             f"ORIGIN" if is_return else f"INTERMEDIARY_{hop}",
                             account_mean, account_mean*0.3,
                             passthrough, 0.5,
                             hop * 5, hop + 1, float(amount),
                             1, "round_trip"))
    return rows


def gen_off_hours_large(n_accounts=80):
    """Consistently large transactions at 2–4 AM."""
    rows = []
    for _ in range(n_accounts):
        amount = random.randint(500_000, 5_000_000)
        account_mean = amount * 0.4
        n_txns = random.randint(5, 15)
        for i in range(n_txns):
            d = BASE_DATE + timedelta(days=i * random.randint(3, 10))
            h = random.randint(2, 4)
            rows.append(_row(int(amount * random.uniform(0.8, 1.2)),
                             h, d.weekday(), random.random() < 0.5,
                             f"NEFT CR {random.randint(100000,999999)}",
                             f"ACC_{random.randint(1000,9999)}",
                             account_mean, account_mean*0.4,
                             0.85, 0.4,
                             random.randint(3, 10), n_txns,
                             float(amount * n_txns),
                             1, "off_hours_large"))
    return rows


def gen_timing_regularity(n_accounts=80):
    """Transactions at exact 24h or 7-day intervals — automation signature."""
    rows = []
    for _ in range(n_accounts):
        interval_hours = random.choice([24, 48, 168])   # daily, every 2 days, weekly
        amount = random.randint(50_000, 500_000)
        account_mean = amount
        n_txns = random.randint(8, 20)
        for i in range(n_txns):
            d = BASE_DATE + timedelta(hours=i * interval_hours + random.randint(-1, 1))
            rows.append(_row(int(amount * random.uniform(0.99, 1.01)),
                             d.hour, d.weekday(), random.random() < 0.5,
                             f"AUTO TRANSFER {i}",
                             f"FIXED_DEST",
                             account_mean, amount * 0.02,   # very low std
                             0.9, 0.1,
                             interval_hours / 24, i + 1, float(amount * (i+1)),
                             1, "timing_regularity"))
    return rows


def gen_cash_intensive(n_accounts=100):
    """High proportion of ATM/cash transactions — potential cash-out node."""
    rows = []
    for _ in range(n_accounts):
        daily_cash = random.randint(20_000, 200_000)
        account_mean = daily_cash
        n_txns = random.randint(30, 80)
        for i in range(n_txns):
            d = BASE_DATE + timedelta(days=random.randint(0, 300))
            amt = int(daily_cash * random.uniform(0.5, 2.0) / 2000) * 2000  # ATM denominations
            amt = max(2000, min(amt, 200_000))
            h = random.randint(9, 21)
            rows.append(_row(amt, h, d.weekday(), False,
                             random.choice(["ATM WITHDRAWAL", "CASH WITHDRAWAL",
                                            "CDM CASH", "SELF WITHDRAWAL"]),
                             None,
                             account_mean, account_mean * 0.4,
                             0.9, 0.05,
                             random.randint(0, 3), random.randint(3, 15),
                             float(daily_cash * 7),
                             1, "cash_intensive"))
    return rows


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Generating normal transaction profiles...")
    normal_rows = (
        generate_salaried(300) +
        generate_small_business(200) +
        generate_students(200) +
        generate_retired(150)
    )
    print(f"  Normal transactions: {len(normal_rows):,}")

    print("Generating fraud patterns...")
    fraud_rows = (
        gen_structuring(120) +
        gen_passthrough_mule(150) +
        gen_fan_out(100) +
        gen_dormant_activation(120) +
        gen_velocity_spike(100) +
        gen_layering(100) +
        gen_round_trip(100) +
        gen_off_hours_large(80) +
        gen_timing_regularity(80) +
        gen_cash_intensive(100)
    )
    print(f"  Fraud transactions: {len(fraud_rows):,}")

    all_rows = normal_rows + fraud_rows
    random.shuffle(all_rows)

    df = pd.DataFrame(all_rows)
    cols = FEATURE_NAMES + ["label", "fraud_type"]
    df = df[cols]

    fraud_count  = (df["label"] == 1).sum()
    total        = len(df)
    fraud_pct    = 100 * fraud_count / total
    print(f"\nDataset summary:")
    print(f"  Total rows:   {total:,}")
    print(f"  Normal:       {total - fraud_count:,}  ({100 - fraud_pct:.1f}%)")
    print(f"  Fraud:        {fraud_count:,}  ({fraud_pct:.1f}%)")
    print(f"  Typologies:   {df[df['label']==1]['fraud_type'].value_counts().to_dict()}")

    df.to_csv(OUTPUT_PATH, index=False)
    print(f"\nSaved to {OUTPUT_PATH}")
    print("Next: run scripts/train_models.py")


if __name__ == "__main__":
    main()

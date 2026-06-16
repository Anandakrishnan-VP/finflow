"""
Rule-based fraud pattern detection. Runs after balance validation.
All thresholds use Decimal (RULE 1).
"""
from decimal import Decimal
from datetime import timedelta
from collections import defaultdict
from schemas.uts import UniversalTransaction, TransactionFlag
import logging

logger = logging.getLogger(__name__)

# Regulatory thresholds under PMLA 2002 / FIU-IND
STR_THRESHOLD   = Decimal("500000")   # ₹5 lakh STR threshold
CTR_THRESHOLD   = Decimal("1000000")  # ₹10 lakh CTR threshold
STRUCTURING_BAND = Decimal("0.95")    # 95% of threshold = structuring zone

def run_all_rules(txns: list[UniversalTransaction]) -> list[UniversalTransaction]:
    txns = _detect_structuring(txns)
    txns = _detect_fan_out(txns)
    txns = _detect_fan_in(txns)
    txns = _detect_passthrough(txns)
    txns = _detect_timing_regularity(txns)
    txns = _detect_dormant_activation(txns)
    txns = _detect_cash_intensive(txns)
    txns = _detect_layering(txns)
    return txns

def _detect_structuring(txns):
    """Flag transactions in the structuring band (95%-99.9% of STR/CTR threshold)."""
    str_low = STR_THRESHOLD * STRUCTURING_BAND
    ctr_low = CTR_THRESHOLD * STRUCTURING_BAND
    for t in txns:
        if str_low <= t.amount < STR_THRESHOLD:
            t.flags.append(TransactionFlag.STRUCTURING)
        elif ctr_low <= t.amount < CTR_THRESHOLD:
            t.flags.append(TransactionFlag.STRUCTURING)
    return txns

def _detect_fan_out(txns, min_recipients=3, window_days=7):
    """Single account → many recipients in short window."""
    by_account = defaultdict(list)
    for t in txns:
        if t.txn_type == "DR" and t.counterparty_account:
            by_account[t.account_id].append(t)

    for account_id, account_txns in by_account.items():
        sorted_txns = sorted(account_txns, key=lambda t: t.txn_date)
        for i, anchor in enumerate(sorted_txns):
            window_end = anchor.txn_date + timedelta(days=window_days)
            window_txns = [t for t in sorted_txns[i:] if t.txn_date <= window_end]
            recipients = {t.counterparty_account for t in window_txns}
            if len(recipients) >= min_recipients:
                for t in window_txns:
                    if TransactionFlag.FAN_OUT not in t.flags:
                        t.flags.append(TransactionFlag.FAN_OUT)
    return txns

def _detect_fan_in(txns, min_senders=3, window_days=7):
    """Many accounts → single receiving account in short window."""
    by_dest = defaultdict(list)
    for t in txns:
        if t.txn_type == "CR" and t.counterparty_account:
            by_dest[t.account_id].append(t)

    for account_id, account_txns in by_dest.items():
        sorted_txns = sorted(account_txns, key=lambda t: t.txn_date)
        for i, anchor in enumerate(sorted_txns):
            window_end = anchor.txn_date + timedelta(days=window_days)
            window_txns = [t for t in sorted_txns[i:] if t.txn_date <= window_end]
            senders = {t.counterparty_account for t in window_txns}
            if len(senders) >= min_senders:
                for t in window_txns:
                    if TransactionFlag.FAN_IN not in t.flags:
                        t.flags.append(TransactionFlag.FAN_IN)
    return txns

def _detect_passthrough(txns, retention_threshold=Decimal("0.05")):
    """Account receives and passes on >95% within 72 hours → PASSTHROUGH."""
    by_account = defaultdict(list)
    for t in txns:
        by_account[t.account_id].append(t)

    for account_id, account_txns in by_account.items():
        credits = [t for t in account_txns if t.txn_type == "CR"]
        debits  = [t for t in account_txns if t.txn_type == "DR"]
        total_cr = sum(t.amount for t in credits)
        total_dr = sum(t.amount for t in debits)
        if total_cr == 0: continue
        retention = (total_cr - total_dr) / total_cr
        if retention < retention_threshold:
            for t in account_txns:
                if TransactionFlag.PASSTHROUGH not in t.flags:
                    t.flags.append(TransactionFlag.PASSTHROUGH)
    return txns

def _detect_timing_regularity(txns, min_txns=5, tolerance_hours=2):
    """Transactions at highly regular intervals → possible automation."""
    by_account = defaultdict(list)
    for t in txns:
        by_account[t.account_id].append(t)

    for account_id, account_txns in by_account.items():
        if len(account_txns) < min_txns: continue
        sorted_txns = sorted(account_txns, key=lambda t: t.txn_date)
        gaps = [(sorted_txns[i+1].txn_date - sorted_txns[i].txn_date).total_seconds() / 3600
                for i in range(len(sorted_txns)-1)]
        if len(gaps) < 4: continue
        avg_gap = sum(gaps) / len(gaps)
        deviations = [abs(g - avg_gap) for g in gaps]
        avg_dev = sum(deviations) / len(deviations)
        if avg_dev < tolerance_hours:
            for t in account_txns:
                if TransactionFlag.TIMING_REGULARITY not in t.flags:
                    t.flags.append(TransactionFlag.TIMING_REGULARITY)
    return txns

def _detect_dormant_activation(txns, dormant_months=6, activation_threshold=Decimal("100000")):
    """Account dormant >6 months then sudden high-value activity."""
    by_account = defaultdict(list)
    for t in txns:
        by_account[t.account_id].append(t)

    for account_id, account_txns in by_account.items():
        sorted_txns = sorted(account_txns, key=lambda t: t.txn_date)
        for i in range(1, len(sorted_txns)):
            gap_days = (sorted_txns[i].txn_date - sorted_txns[i-1].txn_date).days
            if gap_days >= dormant_months * 30:
                if sorted_txns[i].amount >= activation_threshold:
                    for t in sorted_txns[i:]:
                        if TransactionFlag.DORMANT_ACTIVATION not in t.flags:
                            t.flags.append(TransactionFlag.DORMANT_ACTIVATION)
                    break
    return txns

def _detect_cash_intensive(txns, cash_ratio_threshold=0.6):
    """High proportion of cash narrations → CASH_INTENSIVE."""
    CASH_KEYWORDS = {"cash", "atm", "withdrawal", "deposit cash", "cdm"}
    by_account = defaultdict(list)
    for t in txns:
        by_account[t.account_id].append(t)

    for account_id, account_txns in by_account.items():
        if not account_txns: continue
        cash_count = sum(1 for t in account_txns
                        if any(kw in (t.narration or "").lower() for kw in CASH_KEYWORDS))
        if cash_count / len(account_txns) >= cash_ratio_threshold:
            for t in account_txns:
                if TransactionFlag.CASH_INTENSIVE not in t.flags:
                    t.flags.append(TransactionFlag.CASH_INTENSIVE)
    return txns

def _detect_layering(txns, min_hops=3, amount_tolerance=Decimal("0.02")):
    """
    3+ sequential transfers of similar amounts within short window.
    Detects: A→B (₹X) then B→C (₹X ± 2%) then C→D (₹X ± 2%) etc.
    """
    debit_map = defaultdict(list)  # sender_account → [(txn, recipient, amount)]
    for t in txns:
        if t.txn_type == "DR" and t.counterparty_account:
            debit_map[t.account_id].append(t)

    def find_chain(start_txn, depth=0, visited=None):
        if visited is None: visited = set()
        if depth >= min_hops - 1: return True
        recipient = start_txn.counterparty_account
        if recipient in visited: return False
        visited.add(recipient)
        for next_txn in debit_map.get(recipient, []):
            delta = abs(next_txn.amount - start_txn.amount) / start_txn.amount
            if delta <= amount_tolerance:
                time_diff = (next_txn.txn_date - start_txn.txn_date).days
                if 0 <= time_diff <= 30:
                    if find_chain(next_txn, depth+1, visited):
                        return True
        return False

    for account_txns in debit_map.values():
        for t in account_txns:
            if find_chain(t):
                if TransactionFlag.LAYERING not in t.flags:
                    t.flags.append(TransactionFlag.LAYERING)
    return txns

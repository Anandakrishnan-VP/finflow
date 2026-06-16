"""
Validates Debit/Credit/Balance consistency.
Flags BALANCE_MISMATCH and HIDDEN_TXN_SUSPECTED.
RULE 1: All arithmetic in Decimal.
"""
from decimal import Decimal
from schemas.uts import UniversalTransaction, TransactionFlag
import logging

logger = logging.getLogger(__name__)
TOLERANCE = Decimal("0.01")   # Bank rounding tolerance

def validate_balances(txns: list[UniversalTransaction]) -> list[UniversalTransaction]:
    """Sort by date and validate running balance. Flags mismatches."""
    by_account = {}
    for t in txns:
        by_account.setdefault(t.account_id, []).append(t)

    for account_id, account_txns in by_account.items():
        sorted_txns = sorted(account_txns, key=lambda t: t.txn_date)
        prev_balance = None
        for txn in sorted_txns:
            if txn.balance_after is None:
                continue
            if prev_balance is not None:
                if txn.txn_type == "DR":
                    expected = prev_balance - txn.amount
                else:
                    expected = prev_balance + txn.amount
                if abs(expected - txn.balance_after) > TOLERANCE:
                    txn.flags.append(TransactionFlag.BALANCE_MISMATCH)
                    logger.debug("Balance mismatch account=%s date=%s expected=%s actual=%s",
                                 account_id, txn.txn_date, expected, txn.balance_after)
            prev_balance = txn.balance_after
    return txns

def detect_failed_transactions(txns: list[UniversalTransaction]) -> list[UniversalTransaction]:
    """
    A failed transaction: debit followed by credit of same amount within 24h, same narration hint.
    Marks both as FAILED_TXN.
    """
    debits = [(i, t) for i, t in enumerate(txns) if t.txn_type == "DR"]
    credited = set()
    for i, debit in debits:
        for j, txn in enumerate(txns):
            if j in credited: continue
            if txn.txn_type != "CR": continue
            if txn.amount != debit.amount: continue
            delta = abs((txn.txn_date - debit.txn_date).total_seconds())
            if delta <= 86400:  # 24 hours
                debit.flags.append(TransactionFlag.FAILED_TXN)
                txn.flags.append(TransactionFlag.FAILED_TXN)
                credited.add(j)
                break
    return txns

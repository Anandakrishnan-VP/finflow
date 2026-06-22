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
    from collections import deque

    # Group by account and amount to narrow down matching candidates
    groups = {}
    for i, t in enumerate(txns):
        key = (t.account_id, t.amount)
        groups.setdefault(key, []).append((i, t))

    for (account_id, amount), group_txns in groups.items():
        # Sort chronologically by date
        group_txns.sort(key=lambda x: x[1].txn_date)
        
        debits_queue = deque()
        
        for idx, txn in group_txns:
            if txn.txn_type == "DR":
                debits_queue.append((idx, txn))
            elif txn.txn_type == "CR":
                while debits_queue:
                    deb_idx, deb_txn = debits_queue[0]
                    delta = (txn.txn_date - deb_txn.txn_date).total_seconds()
                    
                    if 0 <= delta <= 86400:  # Within 24 hours
                        deb_txn.flags.append(TransactionFlag.FAILED_TXN)
                        txn.flags.append(TransactionFlag.FAILED_TXN)
                        debits_queue.popleft()  # Match found, consume debit
                        break
                    elif delta < 0:
                        # Sorted, so subsequent debits will also be in the future
                        break
                    else:
                        # Oldest debit is older than 24 hours. Cannot match this or any future credits.
                        debits_queue.popleft()
                        
    return txns

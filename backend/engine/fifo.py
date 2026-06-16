"""
FIFO money trail: when credit received, track how it is spent (debited)
until previous balance is restored. Multi-credit: FIFO order.
RULE 1: All Decimal arithmetic.
"""
from decimal import Decimal
from datetime import datetime
from typing import NamedTuple
from schemas.uts import UniversalTransaction, TransactionType
import logging

logger = logging.getLogger(__name__)

class MoneyTrailEntry(NamedTuple):
    credit_txn_id: str
    debit_txn_id: str
    amount: Decimal          # NEVER float
    days_held: int

def trace_fifo(txns: list[UniversalTransaction]) -> list[MoneyTrailEntry]:
    """
    For each account: sort chronologically.
    Maintain a queue of credit 'buckets'. For each debit, consume from oldest credit first.
    """
    from collections import deque

    by_account = {}
    for t in txns:
        by_account.setdefault(t.account_id, []).append(t)

    trail = []
    for account_id, account_txns in by_account.items():
        sorted_txns = sorted(account_txns, key=lambda t: t.txn_date)
        credit_queue = deque()  # (remaining_amount: Decimal, credit_txn)

        for txn in sorted_txns:
            if txn.txn_type == TransactionType.CREDIT or txn.txn_type == "CR":
                credit_queue.append([txn.amount, txn])  # mutable list for remaining_amount

            elif txn.txn_type == TransactionType.DEBIT or txn.txn_type == "DR":
                remaining_debit = txn.amount
                while remaining_debit > 0 and credit_queue:
                    credit_remaining, credit_txn = credit_queue[0]
                    consumed = min(remaining_debit, credit_remaining)
                    days_held = (txn.txn_date - credit_txn.txn_date).days
                    trail.append(MoneyTrailEntry(
                        credit_txn_id=credit_txn.txn_hash,
                        debit_txn_id=txn.txn_hash,
                        amount=consumed,
                        days_held=max(0, days_held),
                    ))
                    credit_queue[0][0] -= consumed
                    remaining_debit -= consumed
                    if credit_queue[0][0] <= 0:
                        credit_queue.popleft()
    return trail

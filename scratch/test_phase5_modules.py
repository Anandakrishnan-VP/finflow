import sys
import os
import asyncio
import numpy as np
import pandas as pd
from decimal import Decimal
from datetime import datetime, timedelta
from unittest.mock import MagicMock, AsyncMock

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

def test_ml_ensemble():
    print("Testing ML Ensemble (Isolation Forest + LightGBM)...")
    from ml.ensemble import run_ensemble
    from schemas.uts import UniversalTransaction, TransactionType, TransactionFlag
    
    # Let's create a list of mock transactions for a single account
    txns = []
    
    # 1. Standard low-risk transactions
    for i in range(15):
        txns.append(UniversalTransaction(
            txn_hash=f"hash_clear_{i}",
            case_id="case-123",
            statement_id="stmt-1",
            source_file_hash="file-1",
            account_id="ACC_CLEAR",
            account_holder="John Doe",
            bank_name="HDFC",
            txn_date=datetime(2026, 6, 1) + timedelta(hours=i),
            amount=Decimal("100.00"),
            txn_type=TransactionType.DEBIT,
            narration="Grocery payment"
        ))
        
    # 2. Anomalous transactions (large, odd hour, etc.)
    for i in range(5):
        txns.append(UniversalTransaction(
            txn_hash=f"hash_anomaly_{i}",
            case_id="case-123",
            statement_id="stmt-1",
            source_file_hash="file-1",
            account_id="ACC_CLEAR",
            account_holder="John Doe",
            bank_name="HDFC",
            txn_date=datetime(2026, 6, 1, 3, 15),  # 3:15 AM
            amount=Decimal("500000.00"),
            txn_type=TransactionType.DEBIT,
            counterparty_account="ACC_MULE",
            narration="URGENT TRANSFER",
            flags=[TransactionFlag.STRUCTURING]
        ))
        
    # Run ensemble
    scored_txns = run_ensemble(txns, model_dir="models")
    
    # Verify risk scores and uncertainty bands
    for txn in scored_txns:
        assert txn.risk_score is not None
        assert hasattr(txn, "_ensemble_band")
        assert hasattr(txn, "_ensemble_detail")
        
        # Verify anomalies are scored higher than clear ones
        if "anomaly" in txn.txn_hash:
            assert txn.risk_score >= 0.5
        else:
            assert txn.risk_score < 0.5
            
    print("ML Ensemble tests PASSED!")

def test_cusum():
    print("\nTesting CUSUM Change-Point Detection...")
    from engine.cusum import run_cusum_analysis
    from schemas.uts import UniversalTransaction, TransactionType
    
    # Stable transactions
    txns = []
    for i in range(15):
        # 10 days of 100.00, then 5 days of 5000.00
        amt = Decimal("100.00") if i < 10 else Decimal("50000.00")
        txns.append(UniversalTransaction(
            txn_hash=f"hash_{i}",
            case_id="case-123",
            statement_id="stmt-1",
            source_file_hash="file-1",
            account_id="ACC_CLEAR",
            account_holder="John Doe",
            bank_name="HDFC",
            txn_date=datetime(2026, 6, 1) + timedelta(days=i),
            amount=amt,
            txn_type=TransactionType.DEBIT,
            narration="Daily payout"
        ))
    
    points = run_cusum_analysis(txns)
    print(f"Detected Change-Points: {points}")
    assert len(points) > 0, "Should detect a shift in transaction volumes"
    
    print("CUSUM tests PASSED!")

def test_narration_intel():
    print("\nTesting Narration Intelligence...")
    from engine.narration_intel import compute_narration_clusters
    from schemas.uts import UniversalTransaction, TransactionType
    
    narrations = [
        "UPI payment for rent",
        "UPI payment for rent",
        "Cash withdrawal from ATM",
        "Cash withdrawal from ATM",
        "Grocery shopping supermarket",
    ]
    txns = []
    for idx, narr in enumerate(narrations):
        txns.append(UniversalTransaction(
            txn_hash=f"hash_{idx}",
            case_id="case-123",
            statement_id="stmt-1",
            source_file_hash="file-1",
            account_id=f"ACC_{idx % 3}", # 3 distinct accounts
            account_holder="John Doe",
            bank_name="HDFC",
            txn_date=datetime(2026, 6, 1),
            amount=Decimal("100.00"),
            txn_type=TransactionType.DEBIT,
            narration=narr
        ))
    
    clusters = compute_narration_clusters(txns)
    print(f"Extracted Clusters: {clusters}")
    assert len(clusters) > 0
    assert any("rent" in c["representative_narration"].lower() for c in clusters), "Should cluster rent transactions"
    
    print("Narration Intelligence tests PASSED!")

async def test_evidence_package():
    print("\nTesting Evidence Package ZIP Compiler...")
    from reports.evidence_package import create_evidence_package
    
    # Mock result and session
    mock_result_cases = MagicMock()
    mock_result_cases.fetchone.return_value = MagicMock(
        _mapping={"id": "case-abc", "case_number": "CASE-999", "title": "Test Case", "description": "Desc"}
    )
    
    mock_result_txns = MagicMock()
    mock_result_txns.fetchall.return_value = []
    
    mock_result_alerts = MagicMock()
    mock_result_alerts.fetchall.return_value = []
    
    mock_result_trail = MagicMock()
    mock_result_trail.fetchall.return_value = []
    
    mock_db = AsyncMock()
    
    # Setup execution return values based on query content
    async def mock_execute(query, params=None):
        query_str = str(query).lower()
        if "select * from cases" in query_str:
            return mock_result_cases
        elif "select * from transactions" in query_str:
            return mock_result_txns
        elif "select * from alerts" in query_str:
            return mock_result_alerts
        else:
            return mock_result_trail
            
    mock_db.execute = mock_execute
    
    # Run async function
    zip_path, manifest = await create_evidence_package(
        case_id="case-abc",
        officer_name="Test Officer",
        officer_badge="KA-9821",
        db=mock_db
    )
    
    print(f"Evidence Package ZIP created successfully: {zip_path}")
    print(f"Manifest: {manifest}")
    assert os.path.exists(zip_path)
    assert "report.pdf" in manifest
    assert "report.xlsx" in manifest
    assert "metadata.json" in manifest
    assert "audit_log.txt" in manifest
    
    print("Evidence Package tests PASSED!")

if __name__ == "__main__":
    test_ml_ensemble()
    test_cusum()
    test_narration_intel()
    asyncio.run(test_evidence_package())
    print("\nAll Phase 5 modules passed verification successfully!")

import sys
import os

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

class MockTxn:
    def __init__(self, amount, txn_type, flags=None, narration="", counterparty_account=None, txn_date=None):
        self.amount = amount
        self.txn_type = txn_type
        self.flags = flags or []
        self.narration = narration
        self.counterparty_account = counterparty_account
        self.txn_date = txn_date

def test_risk_fusion():
    print("Testing Risk Fusion Engine...")
    from engine.risk_fusion import compute_role_label
    
    # Mule Case: high volume loop, low cash ratio
    txns_mule = [
        MockTxn(100000.0, "CR", ["HIGH_VOLUME_LOOP"]),
        MockTxn(99000.0, "DR", ["HIGH_VOLUME_LOOP"])
    ]
    # Pass 85 as composite score (0-100 scale)
    role_mule = compute_role_label("ACC_MULE", txns_mule, 85, 0.75)
    print(f"Mule Role Label: {role_mule}")
    assert role_mule in ("MULE", "AGGREGATOR", "CASH_OUT", "DORMANT_SUSPECT"), f"Expected suspect label, got {role_mule}"
    
    # Clear Case: low score, no flags
    txns_clear = [
        MockTxn(100.0, "CR")
    ]
    role_clear = compute_role_label("ACC_CLEAR", txns_clear, 10, 0.05)
    print(f"Clear Role Label: {role_clear}")
    assert role_clear == "CLEAR", f"Expected CLEAR, got {role_clear}"

    print("Risk Fusion tests PASSED!")


def test_next_actions():
    print("\nTesting Next Actions Suggestion Engine...")
    from engine.next_actions import get_suggestions_for_account
    
    # Test next actions for MULE
    actions_mule = get_suggestions_for_account("ACC_123", "MULE", {"HIGH_VOLUME_LOOP"}, 85)
    assert len(actions_mule) > 0
    # verify it suggests BNSS/CrPC freezing or Section 91/94 notice
    action_texts = [a["action_text"] for a in actions_mule]
    assert any("freeze" in text.lower() or "section" in text.lower() or "notice" in text.lower() for text in action_texts), "Mule actions should contain legal notices/freezing"
    
    print("Next Actions tests PASSED!")

def test_officer_brief():
    print("\nTesting Officer Brief Exporter...")
    from reports.officer_brief import generate_officer_brief
    
    case = {"id": "1", "case_number": "CASE-123", "title": "Test EOW Case", "description": "Mock Case Description"}
    verdicts = [{"account_id": "ACC_MULE", "composite_score": 0.85, "role_label": "MULE", "tier_label": "T1"}]
    alerts = [{"account_id": "ACC_MULE", "flag": "HIGH_VOLUME_LOOP", "confidence": 0.9}]
    next_actions = [{"account_id": "ACC_MULE", "action_text": "Request Section 91 notice", "completed": False}]
    annotations = [{"annotation": "Mock annotation by officer", "created_at": "2026-06-18 12:00:00", "username": "officer_test"}]
    
    pdf_bytes = generate_officer_brief(case, verdicts, alerts, next_actions, annotations, {"name": "Test Officer"})
    assert len(pdf_bytes) > 0, "Generated PDF bytes should not be empty"
    print(f"Officer Brief generated successfully! Size: {len(pdf_bytes)} bytes")
    
if __name__ == "__main__":
    test_risk_fusion()
    test_next_actions()
    test_officer_brief()
    print("\nAll modular unit tests passed successfully!")

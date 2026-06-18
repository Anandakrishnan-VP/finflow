import httpx
import time
import sys
import os

BASE_URL = "http://backend:8000"  # Inside docker backend/worker containers can talk tobackend:8000 directly

def main():
    client = httpx.Client(timeout=30.0)

    # 1. Login
    print("Logging in...")
    login_resp = client.post(f"{BASE_URL}/auth/login", json={
        "username": "admin",
        "password": "admin_strong_pass123"
    })
    if login_resp.status_code != 200:
        print(f"Login failed: {login_resp.text}")
        sys.exit(1)
    
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.headers.update(headers)
    print("Login successful.")

    # 2. Create case
    case_number = f"CASE-{int(time.time())}"
    print(f"Creating case {case_number}...")
    case_resp = client.post(f"{BASE_URL}/cases", json={
        "case_number": case_number,
        "title": "Synthetic PDF Test Case",
        "description": "Integration test for SBI PDF parsing and analysis",
        "classification_level": 1
    })
    if case_resp.status_code != 200:
        print(f"Failed to create case: {case_resp.text}")
        sys.exit(1)
    
    case_id = case_resp.json()["id"]
    print(f"Created case with ID: {case_id}")

    # 3. Upload statement PDF
    pdf_path = "/data/uploads/1e579ae9-b17a-42b8-adb4-9d7437cd4097.pdf"
    print(f"Uploading statement {pdf_path}...")
    with open(pdf_path, "rb") as f:
        files = {"file": (os.path.basename(pdf_path), f, "application/pdf")}
        upload_resp = client.post(
            f"{BASE_URL}/cases/{case_id}/statements",
            files=files
        )
    
    if upload_resp.status_code != 200:
        print(f"Upload failed: {upload_resp.text}")
        sys.exit(1)
    
    print("Upload response:", upload_resp.json())
    stmt_id = upload_resp.json()["statement_id"]
    rows_parsed = upload_resp.json()["rows_parsed"]
    print(f"Uploaded statement successfully. Stmt ID: {stmt_id}, Rows parsed: {rows_parsed}")

    # 4. Start analysis
    print("Starting analysis...")
    analyze_resp = client.post(f"{BASE_URL}/cases/{case_id}/analyze")
    if analyze_resp.status_code != 200:
        print(f"Start analysis failed: {analyze_resp.text}")
        sys.exit(1)
    
    task_id = analyze_resp.json()["task_id"]
    print(f"Started analysis task. Task ID: {task_id}")

    # 5. Wait for analysis to complete
    print("Waiting for task to complete...")
    for _ in range(30):
        status_resp = client.get(f"{BASE_URL}/cases/{case_id}/status/{task_id}")
        if status_resp.status_code != 200:
            print(f"Check status failed: {status_resp.text}")
            sys.exit(1)
        
        status_data = status_resp.json()
        print("Status:", status_data)
        if status_data["status"] == "complete":
            print("Analysis complete!")
            break
        elif status_data["status"] == "failed":
            print(f"Analysis task failed! Error: {status_data.get('error')}")
            sys.exit(1)
        time.sleep(1)
    else:
        print("Analysis task timed out!")
        sys.exit(1)

    # 6. Verify transactions in case
    print("Checking transactions...")
    txns_resp = client.get(f"{BASE_URL}/cases/{case_id}/transactions")
    if txns_resp.status_code != 200:
        print(f"Failed to fetch transactions: {txns_resp.text}")
        sys.exit(1)
    
    txns = txns_resp.json()
    print(f"Total transactions found in case: {len(txns)}")
    if len(txns) != 19:
        print(f"ERROR: Expected 19 transactions, found {len(txns)}!")
        sys.exit(1)
    
    # Check that they have the correct account ID
    incorrect_accounts = [t for t in txns if t["account_id"] != "123456789012"]
    if incorrect_accounts:
        print("ERROR: Found transactions with incorrect account IDs!")
        for t in incorrect_accounts:
            print(f"  Hash: {t['txn_hash']} -> Account: {t['account_id']}")
        sys.exit(1)
    
    print("SUCCESS: All 19 transactions have the correct account_id '123456789012'!")

    # 7. Check Alerts
    print("Checking alerts...")
    alerts_resp = client.get(f"{BASE_URL}/cases/{case_id}/alerts")
    if alerts_resp.status_code != 200:
        print(f"Failed to fetch alerts: {alerts_resp.text}")
        sys.exit(1)
    
    alerts = alerts_resp.json()
    print(f"Total alerts generated: {len(alerts)}")
    for a in alerts:
        print(f"  Flag: {a['flag']} | Confidence: {a['confidence']}")

    print("ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    main()

import os
import sys
import time
import requests
import asyncio

async def clean_database():
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL env var not found. Skipping cleanup.")
        return
    engine = create_async_engine(db_url, echo=False)
    try:
        async with engine.begin() as conn:
            print("Cleaning up database for a fresh test run...")
            tables = [
                "alerts", "money_trails", "account_verdicts", "narration_clusters",
                "case_benford_results", "case_annotations", "case_next_actions",
                "hypothesis_queries", "evidence_packages", "human_review_queue",
                "watchlist_hits", "entity_case_appearances", "transactions",
                "statements", "analysis_tasks", "entities", "audit_log", "cases"
            ]
            for table in tables:
                await conn.execute(text(f"DELETE FROM {table}"))
            await conn.execute(text("DELETE FROM users"))
            print("Database cleaned successfully!")
    except Exception as e:
        print(f"Database cleanup failed: {e}")
    finally:
        await engine.dispose()

    # Verify/create admin user
    try:
        sys.path.insert(0, '/app')
        from database import AsyncSessionLocal
        from security.auth import create_user
        async with AsyncSessionLocal() as db:
            try:
                await create_user(db, 'admin', 'admin_strong_pass123', 'Administrator', 'ADMIN-001', 'ADMIN')
                print("Admin user verified/created.")
            except Exception as e:
                print(f"Inner create_user failed: {e}")
    except Exception as e:
        print(f"Admin seeding failed: {e}")

def main():
    print("=== Starting FinFlow Backend Pipeline E2E Test ===")
    asyncio.run(clean_database())
    
    # 1. Login
    login_url = "http://localhost:8000/auth/login"
    login_data = {
        "username": "admin",
        "password": "admin_strong_pass123"
    }
    
    print(f"Logging in to {login_url}...")
    try:
        r = requests.post(login_url, json=login_data)
        r.raise_for_status()
        token_info = r.json()
        access_token = token_info["access_token"]
        print("Login successful! Token acquired.")
    except Exception as e:
        print(f"Login failed: {e}")
        if 'r' in locals() and r.text:
            print(f"Response details: {r.text}")
        sys.exit(1)
        
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    
    # 2. Create Case
    create_case_url = "http://localhost:8000/cases"
    case_num = f"CASE-E2E-100-{int(time.time())}"
    case_data = {
        "case_number": case_num,
        "title": "Forensic E2E API Case",
        "description": "Automated E2E pipeline verification check",
        "classification_level": 1
    }
    
    print(f"Creating case at {create_case_url}...")
    try:
        r = requests.post(create_case_url, json=case_data, headers=headers)
        r.raise_for_status()
        case_info = r.json()
        case_id = case_info["id"]
        print(f"Case created successfully! ID: {case_id}, Number: {case_info['case_number']}")
    except Exception as e:
        print(f"Case creation failed: {e}")
        if 'r' in locals() and r.text:
            print(f"Response details: {r.text}")
        sys.exit(1)
        
    # 3. Upload Test Bank Statements
    # The statements are inside /data/uploads/ inside the container:
    uploads_dir = "/data/uploads"
    files_to_upload = [
        ("SBI_Harish_Reddy_2024.csv", "sbi"),
        ("HDFC_Mule1_2024.csv", "hdfc"),
        ("Axis_Mule2_2024.csv", "axis"),
        ("Kotak_Mule3_2024.csv", "kotak")
    ]
    
    for filename, bank in files_to_upload:
        filepath = os.path.join(uploads_dir, filename)
        if not os.path.exists(filepath):
            # Try workspace root as backup
            filepath = os.path.join("/app", filename)
            if not os.path.exists(filepath):
                print(f"Error: Test file {filename} not found at {os.path.join(uploads_dir, filename)} or {filepath}")
                sys.exit(1)
                
        upload_url = f"http://localhost:8000/cases/{case_id}/statements?bank_override={bank}"
        print(f"Uploading {filename} (Bank: {bank}) to {upload_url}...")
        try:
            with open(filepath, "rb") as f:
                files = {"file": (filename, f, "text/csv")}
                r = requests.post(upload_url, files=files, headers=headers)
                r.raise_for_status()
                res = r.json()
                print(f"Uploaded {filename}! Parsed {res.get('rows_parsed')} rows. Status: {res.get('status')}")
        except Exception as e:
            print(f"Upload of {filename} failed: {e}")
            if 'r' in locals() and r.text:
                print(f"Response details: {r.text}")
            sys.exit(1)
            
    # Wait for statements to finish parsing (since analysis API now has a gate blocking pending/processing statements)
    statements_url = f"http://localhost:8000/cases/{case_id}/statements"
    print("Waiting for statements to finish parsing...")
    parse_start_time = time.time()
    parse_timeout = 60
    parsed_complete = False
    while time.time() - parse_start_time < parse_timeout:
        try:
            r = requests.get(statements_url, headers=headers)
            r.raise_for_status()
            stmts = r.json()
            non_parsed = [s for s in stmts if s.get("status") not in ("PARSED", "PARSED_WITH_WARNINGS")]
            failed_stmts = [s for s in stmts if s.get("status") == "FAILED"]
            if failed_stmts:
                print(f"Statement parsing failed for: {failed_stmts}")
                sys.exit(1)
            if not non_parsed:
                print("All statements successfully parsed!")
                parsed_complete = True
                break
            print(f"Still parsing {len(non_parsed)} statement(s)... {[s.get('filename') for s in non_parsed]}")
        except Exception as e:
            print(f"Failed to poll statements status: {e}")
        time.sleep(2)
    if not parsed_complete:
        print("Timeout waiting for statements to parse.")
        sys.exit(1)

    # 4. Trigger Analysis
    analyze_url = f"http://localhost:8000/cases/{case_id}/analyze"
    print(f"Triggering analysis at {analyze_url}...")
    try:
        r = requests.post(analyze_url, headers=headers)
        r.raise_for_status()
        analysis_info = r.json()
        task_id = analysis_info["task_id"]
        print(f"Analysis triggered! Task ID: {task_id}, Status: {analysis_info['status']}")
    except Exception as e:
        print(f"Analysis trigger failed: {e}")
        if 'r' in locals() and r.text:
            print(f"Response details: {r.text}")
        sys.exit(1)
        
    # 5. Poll Status
    status_url = f"http://localhost:8000/cases/{case_id}/status/{task_id}"
    print(f"Polling analysis status from {status_url}...")
    
    start_time = time.time()
    timeout = 90  # 90 seconds timeout
    complete = False
    
    while time.time() - start_time < timeout:
        try:
            r = requests.get(status_url, headers=headers)
            r.raise_for_status()
            status_info = r.json()
            status = status_info.get("status")
            print(f"Current status: {status} (Progress: {status_info.get('progress')}% - Stage: {status_info.get('stage')})")
            if status == "complete":
                complete = True
                break
            elif status == "failed":
                print(f"Analysis failed in worker: {status_info.get('error')}")
                sys.exit(1)
        except Exception as e:
            print(f"Status poll failed: {e}")
        time.sleep(3)
        
    if not complete:
        print("Timeout waiting for analysis to complete.")
        sys.exit(1)
        
    print("Analysis finished successfully!")
    
    # 6. Retrieve Results
    # A. Summary
    try:
        r = requests.get(f"http://localhost:8000/cases/{case_id}/summary", headers=headers)
        r.raise_for_status()
        summary = r.json()
        print("\n--- CASE SUMMARY ---")
        print(f"Transaction Count: {summary.get('transaction_count')}")
        print(f"Total Amount: {summary.get('total_amount')}")
        print(f"Alerts by Flag: {summary.get('alerts_by_flag')}")
    except Exception as e:
        print(f"Failed to fetch summary: {e}")
        
    # B. Alerts
    try:
        r = requests.get(f"http://localhost:8000/cases/{case_id}/alerts", headers=headers)
        r.raise_for_status()
        alerts = r.json()
        print("\n--- GENERATED ALERTS ---")
        print(f"Total alerts fetched: {len(alerts)}")
        for i, alert in enumerate(alerts[:10]):
            print(f"  {i+1}. Account: {alert.get('account_id')}, Flag: {alert.get('flag')}, Confidence: {alert.get('confidence')}")
            print(f"     Evidence: {alert.get('evidence')}")
    except Exception as e:
        print(f"Failed to fetch alerts: {e}")
        
    # C. Graph
    try:
        r = requests.get(f"http://localhost:8000/cases/{case_id}/graph", headers=headers)
        r.raise_for_status()
        graph = r.json()
        elements = graph.get("elements") if graph.get("elements") is not None else graph
        nodes = elements.get("nodes", [])
        edges = elements.get("edges", [])
        print("\n--- NEO4J GRAPH DATA ---")
        print(f"Nodes: {len(nodes)}")
        print(f"Edges: {len(edges)}")
        if nodes:
            print("Sample Node:", nodes[0])
        if edges:
            print("Sample Edge:", edges[0])
    except Exception as e:
        print(f"Failed to fetch graph data: {e}")
        
    print("\n=== E2E Test Completed Successfully! ===")

if __name__ == "__main__":
    main()

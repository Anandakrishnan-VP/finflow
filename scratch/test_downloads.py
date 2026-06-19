import httpx
import os

BASE_URL = "http://localhost:8000"
username = "admin"
password = "admin_strong_pass123"

def main():
    print("Logging in...")
    r = httpx.post(f"{BASE_URL}/auth/login", json={"username": username, "password": password})
    r.raise_for_status()
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    print("Fetching cases...")
    r = httpx.get(f"{BASE_URL}/cases", headers=headers)
    r.raise_for_status()
    cases = r.json()
    case_id = None
    for c in cases:
        if c["case_number"] == "CASE-XYZ":
            case_id = c["id"]
            break
            
    if not case_id:
        print("CASE-XYZ not found.")
        return
        
    print(f"Case ID: {case_id}")
    
    # 1. Download Officer Brief PDF
    pdf_url = f"{BASE_URL}/cases/{case_id}/reports/officer-brief"
    print(f"Downloading Officer Brief PDF from {pdf_url}...")
    r = httpx.post(pdf_url, headers=headers, timeout=30.0)
    print("PDF Response status:", r.status_code)
    if r.status_code == 200:
        pdf_path = os.path.join(os.path.dirname(__file__), "officer_brief.pdf")
        with open(pdf_path, "wb") as f:
            f.write(r.content)
        print(f"PDF saved successfully to: {pdf_path}")
    else:
        print("Failed:", r.text)
        
    # 2. Download Evidence Package ZIP
    zip_url = f"{BASE_URL}/cases/{case_id}/evidence-package?officer_badge=BADGE123"
    print(f"Downloading Evidence Package ZIP from {zip_url}...")
    r = httpx.post(zip_url, headers=headers, timeout=30.0)
    print("ZIP Response status:", r.status_code)
    if r.status_code == 200:
        zip_path = os.path.join(os.path.dirname(__file__), "evidence_package.zip")
        with open(zip_path, "wb") as f:
            f.write(r.content)
        print(f"ZIP saved successfully to: {zip_path}")
    else:
        print("Failed:", r.text)

    # 3. Test AI Chat Assistant
    chat_url = f"{BASE_URL}/cases/{case_id}/chat"
    print(f"Testing AI Case Assistant chat endpoint at {chat_url}...")
    r = httpx.post(chat_url, headers=headers, json={"message": "Identify the suspect mule accounts in this case.", "history": []}, timeout=30.0)
    print("Chat Response status:", r.status_code)
    if r.status_code == 200:
        print("AI Assistant response:", r.json()["response"])
    else:
        print("Failed:", r.text)

if __name__ == "__main__":
    main()

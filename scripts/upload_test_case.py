import httpx
import os
import urllib3

# Suppress insecure request warning for local self-signed cert
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://localhost:3000/api"
username = "admin"
password = "admin_strong_pass123"

def main():
    # 1. Login
    print("Logging in...")
    r = httpx.post(f"{BASE_URL}/auth/login", json={"username": username, "password": password}, verify=False)
    r.raise_for_status()
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("Login successful.")

    # 2. Get or create case
    print("Checking cases...")
    r = httpx.get(f"{BASE_URL}/cases", headers=headers, verify=False)
    r.raise_for_status()
    cases = r.json()
    
    case_id = None
    for c in cases:
        if c["case_number"] == "CASE-XYZ":
            case_id = c["id"]
            print(f"Found existing case CASE-XYZ with ID: {case_id}")
            break
            
    if not case_id:
        print("Creating case CASE-XYZ...")
        r = httpx.post(
            f"{BASE_URL}/cases",
            headers=headers,
            json={
                "case_number": "CASE-XYZ",
                "title": "Forensic Case XYZ",
                "description": "Test Case for Phase 4 verdicts and Benford's Law check",
                "classification_level": "CONFIDENTIAL"
            },
            verify=False
        )
        r.raise_for_status()
        case_id = r.json()["id"]
        print(f"Created case CASE-XYZ with ID: {case_id}")

    # 3. Upload files with correct bank override
    files_to_upload = {
        "SBI_Harish_Reddy_2024.csv": "sbi",
        "HDFC_Mule1_2024.csv": "hdfc",
        "Axis_Mule2_2024.csv": "axis",
        "Kotak_Mule3_2024.csv": "kotak"
    }
    
    for filename, bank in files_to_upload.items():
        filepath = filename
        if not os.path.exists(filepath):
            print(f"ERROR: {filepath} not found locally.")
            continue
            
        print(f"Uploading {filename} with override {bank}...")
        with open(filepath, "rb") as f:
            files = {"file": (filename, f, "text/csv")}
            # Pass bank_override as a query param
            r = httpx.post(
                f"{BASE_URL}/cases/{case_id}/statements?bank_override={bank}",
                headers=headers,
                files=files,
                verify=False
            )
            if r.status_code == 200:
                print(f"Successfully uploaded {filename}: {r.json()}")
            else:
                print(f"Failed to upload {filename}: {r.status_code} - {r.text}")

if __name__ == "__main__":
    main()

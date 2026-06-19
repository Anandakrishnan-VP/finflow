import httpx

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
        
    print(f"Triggering analysis for case: {case_id}...")
    r = httpx.post(f"{BASE_URL}/cases/{case_id}/analyze", headers=headers)
    print("Response status:", r.status_code)
    print("Response JSON:", r.json())

if __name__ == "__main__":
    main()

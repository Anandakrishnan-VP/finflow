import requests
import urllib3
import json

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

url = "http://ingestion-gateway:8080/api/gateway/upload"
print(f"Testing Java 21 Ingestion Gateway endpoint: {url}")

# Test health check / response
try:
    # Send a dummy request to check if gateway responds
    res = requests.post(url, data={"case_id": "test-case-uuid"}, files=[
        ('files', ('test_statement1.csv', b"Date,Amount,Narration\n2026-08-01,100,Test Payment\n", 'text/csv')),
        ('files', ('test_statement2.csv', b"Date,Amount,Narration\n2026-08-02,500,Salary Deposit\n", 'text/csv'))
    ], verify=False, timeout=10)

    print("Response Status Code:", res.status_code)
    print("Response JSON:")
    print(json.dumps(res.json(), indent=2))
except Exception as e:
    print("Error connecting to Java Gateway:", e)

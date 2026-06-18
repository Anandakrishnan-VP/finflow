"""
Generate Kavitha demo case test data files.
Creates 4 bank statement CSVs that produce 7 fraud patterns when analyzed.
"""
import os, csv, random
from decimal import Decimal
from datetime import datetime, timedelta

OUTPUT_DIR = os.getenv("UPLOAD_DIR", "/data/uploads")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def make_date(base_date, offset_days, hour=None):
    d = base_date + timedelta(days=offset_days)
    if hour:
        d = d.replace(hour=hour)
    return d.strftime("%d/%m/%Y")

BASE = datetime(2024, 7, 1)

# Primary account — Harish Reddy (SBI) — receives large credits, fans out immediately
HARISH_SBI = [
    ["Date", "Description", "Debit", "Credit", "Balance"],
    [make_date(BASE, 0),  "Opening Balance",                    "",       "",          "5000.00"],
    [make_date(BASE, 2),  "NEFT CR/Rajan Enterprises/REF001",  "",       "4900000.00","4905000.00"],
    [make_date(BASE, 2),  "NEFT DR/Acc-7734512/Part1",         "490000.00","",         "4415000.00"],
    [make_date(BASE, 3),  "NEFT DR/Acc-9981234/Part2",         "490000.00","",         "3925000.00"],
    [make_date(BASE, 3),  "NEFT DR/Acc-2245678/Part3",         "490000.00","",         "3435000.00"],
    [make_date(BASE, 4),  "NEFT DR/Acc-5567890/Part4",         "490000.00","",         "2945000.00"],
    [make_date(BASE, 15), "NEFT CR/Rajan Enterprises/REF002",  "",       "4750000.00","7695000.00"],
    [make_date(BASE, 15), "NEFT DR/Acc-7734512/Part5",         "480000.00","",         "7215000.00"],
    [make_date(BASE, 16), "NEFT DR/Acc-9981234/Part6",         "480000.00","",         "6735000.00"],
    [make_date(BASE, 28), "NEFT CR/Acc-7734512/Return",        "",       "200000.00", "6935000.00"],
    [make_date(BASE, 45), "NEFT CR/Acc-9981234/Return",        "",       "150000.00", "7085000.00"],
    [make_date(BASE, 60), "NEFT CR/Acc-5567890/Return",        "",       "300000.00", "7385000.00"],
]

# Mule account 1 — HDFC
MULE1_HDFC = [
    ["Date", "Narration", "Value Dt", "Debit Amount", "Credit Amount", "Closing Balance"],
    [make_date(BASE, 2),  "NEFT CR/Harish Reddy/Part1", make_date(BASE,2), "",         "490000.00", "490000.00"],
    [make_date(BASE, 5),  "NEFT DR/Acc-3312345/Onward", make_date(BASE,5), "485000.00","",          "5000.00"],
    [make_date(BASE, 15), "NEFT CR/Harish Reddy/Part5", make_date(BASE,15),"",         "480000.00", "485000.00"],
    [make_date(BASE, 18), "NEFT DR/Acc-3312345/Onward", make_date(BASE,18),"478000.00","",          "7000.00"],
    [make_date(BASE, 28), "NEFT DR/Acc-HR-Origin/Return",make_date(BASE,28),"200000.00","",         "-193000.00"],
]

# Mule account 2 — Axis
MULE2_AXIS = [
    ["Tran Date","Particulars","Chq/Ref No","Value Date","Withdrawal Amt.","Deposit Amt.","Balance"],
    [make_date(BASE,3), "NEFT-CR Harish Reddy Part2","REF001",make_date(BASE,3),"","490000.00","490000.00"],
    [make_date(BASE,6), "NEFT-DR Acc-6689012 Forward","REF002",make_date(BASE,6),"487500.00","","2500.00"],
    [make_date(BASE,16),"NEFT-CR Harish Reddy Part6","REF003",make_date(BASE,16),"","480000.00","482500.00"],
    [make_date(BASE,45),"NEFT-DR HR Origin Return","REF004",make_date(BASE,45),"150000.00","","332500.00"],
]

# Mule account 3 — Kotak (dormant then activated)
MULE3_KOTAK = [
    ["Txn Date","Description","Dr / Cr","Withdrawal Amt","Deposit Amt","Balance"],
    [make_date(BASE,-200),"Old transaction","DR","1000.00","","4000.00"],
    # 6-month gap → DORMANT_ACTIVATION
    [make_date(BASE,3),  "NEFT CR Salary Credit ABC Corp","CR","","490000.00","494000.00"],
    [make_date(BASE,7),  "NEFT DR Rent Payment Landlord","DR","488000.00","","6000.00"],
    [make_date(BASE,60), "NEFT DR Family Support Transfer","DR","300000.00","","-294000.00"],
]


datasets = [
    ("SBI_Harish_Reddy_2024.csv",  HARISH_SBI),
    ("HDFC_Mule1_2024.csv",        MULE1_HDFC),
    ("Axis_Mule2_2024.csv",        MULE2_AXIS),
    ("Kotak_Mule3_2024.csv",       MULE3_KOTAK),
]

for filename, data in datasets:
    path = os.path.join(OUTPUT_DIR, filename)
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(data)
    print(f"Generated: {path}")

print("\nTest data ready. Files saved to:", OUTPUT_DIR)
print("Expected patterns: STRUCTURING, FAN_OUT, FAN_IN, PASSTHROUGH, CIRCULAR_FLOW, DORMANT_ACTIVATION, ROUND_TRIP")

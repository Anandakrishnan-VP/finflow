import csv
import os
import random
from datetime import datetime, timedelta

def generate_sbi(file_path, num_rows):
    headers = ["Txn Date", "Value Date", "Description", "Ref No./Cheque No.", "Debit", "Credit", "Balance"]
    start_date = datetime(2024, 1, 1)
    balance = 500000.00
    
    narrations_dr = [
        "UPI/TR/948274928472/RajESH", "ATM WDL/SBI-ATM-194", "MF TRANSFER/NIPPON-IND",
        "INTERNET BANKING TRSF/IOB", "CREDIT CARD PAYMENT/SBI-CARD", "DEBIT CARD CHARGES"
    ]
    narrations_cr = [
        "UPI/TR/384729384729/MOHIT", "NEFT INFLOW/TATA-SERVICES", "IMPS INFLOW/827492/KUMAR",
        "INTEREST CREDIT", "REFUND/AMAZON", "SALARY CREDIT/FINFLOW-TECH"
    ]
    
    with open(file_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        
        for i in range(num_rows):
            txn_date = start_date + timedelta(seconds=i * random.randint(10, 60))
            txn_date_str = txn_date.strftime("%d-%m-%Y")
            val_date_str = txn_date_str
            
            is_credit = random.random() > 0.6
            amount = round(random.uniform(10.0, 15000.0), 2)
            ref_no = f"SBI{1000000000 + i}"
            
            if is_credit:
                debit = ""
                credit = str(amount)
                balance += amount
                narration = random.choice(narrations_cr)
            else:
                debit = str(amount)
                credit = ""
                balance -= amount
                narration = random.choice(narrations_dr)
                
            writer.writerow([txn_date_str, val_date_str, narration, ref_no, debit, credit, f"{round(balance, 2)}"])
    print(f"Generated SBI dataset at {file_path} with {num_rows} rows.")

def generate_hdfc(file_path, num_rows):
    headers = ["Date", "Narration", "Value Dt", "Debit Amount", "Credit Amount", "Closing Balance"]
    start_date = datetime(2024, 1, 1)
    balance = 750000.00
    
    narrations_dr = [
        "UPI-OUT/48274927492/ANIL/PAYTM", "NWD-ATM/HDFC-ATM-294/CASH", "IMPS-OUT/KUMAR/BARC/827",
        "NETBANK-OUT/RENT/LANDLORD", "DEBIT-CARD-MERCH-WDL/FLIPKART", "LOAN-EMI-OUT/HDFC-FIN"
    ]
    narrations_cr = [
        "UPI-IN/82739284729/KIRAN/GPLAY", "NEFT-IN/SERVICES/WIPRO", "IMPS-IN/928472/TRADING",
        "INT-CREDIT/SAVINGS", "CASH-DEP/BRANCH-3942", "NETBANK-IN/REFUND/MAKEMYTRIP"
    ]
    
    with open(file_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        
        for i in range(num_rows):
            txn_date = start_date + timedelta(seconds=i * random.randint(10, 60))
            txn_date_str = txn_date.strftime("%d/%m/%Y")
            val_date_str = txn_date_str
            
            is_credit = random.random() > 0.65
            amount = round(random.uniform(5.0, 20000.0), 2)
            
            if is_credit:
                debit = ""
                credit = str(amount)
                balance += amount
                narration = random.choice(narrations_cr)
            else:
                debit = str(amount)
                credit = ""
                balance -= amount
                narration = random.choice(narrations_dr)
                
            writer.writerow([txn_date_str, narration, val_date_str, debit, credit, f"{round(balance, 2)}"])
    print(f"Generated HDFC dataset at {file_path} with {num_rows} rows.")

def generate_icici(file_path, num_rows):
    # ICICI expected column names for generic parser
    headers = ["Value Date", "Transaction Date", "Cheque No.", "Transaction Remarks", "Withdrawal (DR)", "Deposit (CR)", "Balance (INR)"]
    start_date = datetime(2024, 1, 1)
    balance = 320000.00
    
    narrations_dr = [
        "UPI/DR/48274928472/MOBI/ZOMATO", "CASH WDL/ICICI-ATM-942", "RTGS DR/948274/SUPPLIER-INC",
        "NEFT DR/38472/RENT-PAYMENT", "IB CARD PMT/CRED", "ANNUAL SERVICE FEES"
    ]
    narrations_cr = [
        "UPI/CR/82749284729/RAMESH/GPLAY", "RTGS CR/928472/CLIENT-PAY", "NEFT CR/38427/SALARY",
        "INT CR/ICICI-BANK", "CASH DEP/ICICI-CDM-48", "REFUND/MERCHANT"
    ]
    
    with open(file_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        
        for i in range(num_rows):
            txn_date = start_date + timedelta(seconds=i * random.randint(10, 60))
            txn_date_str = txn_date.strftime("%Y-%m-%d")
            val_date_str = txn_date_str
            
            is_credit = random.random() > 0.6
            amount = round(random.uniform(50.0, 50000.0), 2)
            cheque_no = f"CHQ{200000 + i}"
            
            if is_credit:
                debit = ""
                credit = str(amount)
                balance += amount
                narration = random.choice(narrations_cr)
            else:
                debit = str(amount)
                credit = ""
                balance -= amount
                narration = random.choice(narrations_dr)
                
            writer.writerow([val_date_str, txn_date_str, cheque_no, narration, debit, credit, f"{round(balance, 2)}"])
    print(f"Generated ICICI dataset at {file_path} with {num_rows} rows.")

if __name__ == "__main__":
    out_dir = "C:\\Users\\ARJUN KRISHNA\\Desktop\datasets"
    os.makedirs(out_dir, exist_ok=True)
    
    # Generate 50,000 rows for each bank (approx 3.5MB each)
    generate_sbi(os.path.join(out_dir, "sbi_synthetic_50k.csv"), 50000)
    generate_hdfc(os.path.join(out_dir, "hdfc_synthetic_50k.csv"), 50000)
    generate_icici(os.path.join(out_dir, "icici_synthetic_50k.csv"), 50000)

import sys
import os
import asyncio

# Add backend directory to path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.append(backend_dir)

from parsers.pdf_scanned import parse_scanned_pdf

async def test_sbi_scanned():
    file_path = "/tmp/sbi_bs.pdf"
    
    if not os.path.exists(file_path):
        print(f"File {file_path} not found.")
        return

    print(f"Running parse_scanned_pdf on: {file_path}")
    try:
        # Now run the actual parser
        txns = await parse_scanned_pdf(file_path, bank_name="SBI")
        print(f"\n--- SUCCESS ---")
        print(f"Extracted {len(txns)} transactions.")
        print("Extracted transactions:")
        for idx, t in enumerate(txns):
            print(f"  [{idx}] Date={t.txn_date} | Desc={t.narration[:40]:<40} | Amt={t.amount} | Type={t.txn_type} | Bal={t.balance_after}")
    except Exception as e:
        import traceback
        print(f"Parsing failed with error: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_sbi_scanned())

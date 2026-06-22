import sys
import os
import time
import asyncio

# Ensure /app is in path
sys.path.insert(0, "/app")

from parsers.router import route_file

async def main():
    file_path = "/data/uploads/30c63ce2-c117-4937-906c-57e4b31f561d.csv"
    if not os.path.exists(file_path):
        print(f"Error: file not found at {file_path}")
        return

    print(f"File exists. Size: {os.path.getsize(file_path)} bytes")
    
    print("Parsing file using route_file...")
    t0 = time.time()
    
    # Run route_file with none mapping to trigger generic delimiter & header detection
    txns, meta = await route_file(
        file_path=file_path,
        case_id="dummy-case-id",
        statement_id="dummy-statement-id",
        bank_override=None,
        original_filename="sbi_synthetic_statement_200k.csv"
    )
    
    t1 = time.time()
    print(f"Completed in {t1 - t0:.4f} seconds!")
    print(f"Parsed {len(txns)} transactions.")
    print("Metadata keys:", list(meta.keys()))

if __name__ == "__main__":
    asyncio.run(main())

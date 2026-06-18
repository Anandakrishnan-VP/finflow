import asyncio
from parsers.banks.sbi import parse_pdf

async def main():
    txns = await parse_pdf("/data/uploads/1e579ae9-b17a-42b8-adb4-9d7437cd4097.pdf")
    print(f"Parsed {len(txns)} transactions.")
    if txns:
        print("First txn:")
        print("account_id:", txns[0].account_id)
        print("account_holder:", txns[0].account_holder)
        print("txn_hash:", txns[0].txn_hash)
        print("amount:", txns[0].amount)

if __name__ == "__main__":
    asyncio.run(main())

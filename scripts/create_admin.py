import asyncio
from database import AsyncSessionLocal
from security.auth import create_user

async def main():
    async with AsyncSessionLocal() as db:
        try:
            await create_user(db, 'admin', 'admin_strong_pass123', 'Administrator', 'ADMIN-001', 'ADMIN')
            print("Admin user created successfully.")
        except Exception as e:
            print("Admin user may already exist:", e)

if __name__ == "__main__":
    asyncio.run(main())

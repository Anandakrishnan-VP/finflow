Actuallyimport asyncio
from database import AsyncSessionLocal
from sqlalchemy import text
from security.auth import hash_password

async def main():
    new_password = "admin123"
    hashed = hash_password(new_password)
    async with AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE users SET hashed_password = :h WHERE username = 'admin'"),
            {"h": hashed}
        )
        await db.commit()
        print("Successfully updated admin user password in database.")

if __name__ == '__main__':
    asyncio.run(main())

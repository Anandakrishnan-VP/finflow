"""Seed watchlist with common fraud-related keywords and sample entries."""
import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

SEED_ENTRIES = [
    ("KEYWORD", "ponzi", "Ponzi scheme indicator"),
    ("KEYWORD", "hawala", "Hawala transfer indicator"),
    ("KEYWORD", "cash courier", "Cash courier indicator"),
    ("KEYWORD", "benami", "Benami transaction indicator"),
    ("KEYWORD", "shell company", "Shell company indicator"),
]

async def seed():
    engine = create_async_engine(os.getenv("DATABASE_URL",""), echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        for entry_type, value, reason in SEED_ENTRIES:
            await db.execute(
                text("""INSERT INTO watchlist (entry_type, value, reason, source)
                        VALUES (:t,:v,:r,'system_seed')
                        ON CONFLICT (entry_type, value) DO NOTHING"""),
                {"t": entry_type, "v": value, "r": reason}
            )
        await db.commit()
        print(f"Seeded {len(SEED_ENTRIES)} watchlist entries.")
    await engine.dispose()

async def main():
    await seed()

if __name__ == "__main__":
    asyncio.run(main())

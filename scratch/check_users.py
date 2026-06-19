import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def f():
    engine = create_async_engine('postgresql+asyncpg://finflow:postgres_strong_pass123@localhost:5432/finflow')
    async with engine.begin() as conn:
        r = await conn.execute(text('SELECT id, username, role FROM users'))
        print('Users:', [dict(row._mapping) for row in r.fetchall()])
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(f())

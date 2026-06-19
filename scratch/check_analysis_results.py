import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def f():
    engine = create_async_engine('postgresql+asyncpg://finflow:postgres_strong_pass123@localhost:5432/finflow')
    async with engine.begin() as conn:
        # Check alerts
        r = await conn.execute(text("SELECT COUNT(*) FROM alerts"))
        alert_count = r.fetchone()[0]
        
        # Check money_trails
        r = await conn.execute(text("SELECT COUNT(*) FROM money_trails"))
        trail_count = r.fetchone()[0]
        
        # Check narration_clusters
        r = await conn.execute(text("SELECT COUNT(*) FROM narration_clusters"))
        cluster_count = r.fetchone()[0]
        
        print(f"Alerts created: {alert_count}")
        print(f"Money trails detected: {trail_count}")
        print(f"Narration clusters created: {cluster_count}")
        
        # Check some details from alerts
        r = await conn.execute(text("SELECT account_id, flag, confidence FROM alerts LIMIT 5"))
        print("Sample Alerts:")
        for row in r.fetchall():
            print(dict(row._mapping))
            
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(f())

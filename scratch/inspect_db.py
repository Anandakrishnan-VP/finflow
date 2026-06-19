import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

async def main():
    # Set autocommit directly on the engine to support role and database creation
    engine = create_async_engine(
        'postgresql+asyncpg://postgres:dataofak@localhost:5432/postgres',
        isolation_level="AUTOCOMMIT"
    )
    
    async with engine.connect() as conn:
        # Check and create role
        res_role = await conn.execute(text("SELECT rolname FROM pg_roles WHERE rolname='finflow'"))
        if not res_role.fetchone():
            print("Creating role 'finflow'...")
            await conn.execute(text("CREATE ROLE finflow WITH LOGIN PASSWORD 'postgres_strong_pass123' SUPERUSER"))
        else:
            print("Role 'finflow' already exists.")
            
        # Check and create database
        res_db = await conn.execute(text("SELECT datname FROM pg_database WHERE datname='finflow'"))
        if not res_db.fetchone():
            print("Creating database 'finflow'...")
            await conn.execute(text("CREATE DATABASE finflow OWNER finflow"))
        else:
            print("Database 'finflow' already exists.")

    print("PostgreSQL setup completed successfully.")

if __name__ == "__main__":
    asyncio.run(main())

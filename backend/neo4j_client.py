import os, asyncio
from neo4j import AsyncGraphDatabase

_driver = None
_driver_loop = None

def get_neo4j_driver():
    global _driver, _driver_loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None
        
    if _driver is None or _driver_loop != current_loop:
        _driver = AsyncGraphDatabase.driver(
            os.getenv("NEO4J_URL", "bolt://neo4j:7687"),
            auth=(os.getenv("NEO4J_USER", "neo4j"),
                  os.getenv("NEO4J_PASSWORD", ""))
        )
        _driver_loop = current_loop
    return _driver

async def close_neo4j_driver():
    global _driver, _driver_loop
    if _driver:
        await _driver.close()
        _driver = None
        _driver_loop = None

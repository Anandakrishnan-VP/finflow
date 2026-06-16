"""
Neo4j GDS algorithms: PageRank, betweenness centrality, Louvain community detection.
RULE 2: Always project → run → drop (in finally block).
RULE 10: Skip betweenness on >500 nodes OR <1GB free RAM.
[FIX]: Use gds.graph.list() not gds.graph.nodeCount() — latter does not exist in GDS 2.6.8.
"""
import logging, psutil
from neo4j_client import get_neo4j_driver

logger = logging.getLogger(__name__)
GRAPH_NAME = "account-graph"
MAX_NODES_FOR_BETWEENNESS = 500
MIN_FREE_RAM_GB = 1.0

async def run_graph_algorithms(case_id: str) -> dict:
    results = {"pagerank": {}, "betweenness": {}, "communities": {}}
    driver = get_neo4j_driver()
    async with driver.session() as session:
        # RULE 2: Always drop existing projection first
        exists_result = await session.run(
            "CALL gds.graph.exists($name) YIELD exists", name=GRAPH_NAME
        )
        rec = await exists_result.single()
        if rec and rec["exists"]:
            await session.run("CALL gds.graph.drop($name) YIELD graphName", name=GRAPH_NAME)

        try:
            # Project the graph
            await session.run("""
                CALL gds.graph.project(
                    $name,
                    {Account: {label: 'Account', properties: {case_id: {defaultValue: ''}}}},
                    {SENT: {type: 'SENT', orientation: 'NATURAL'}}
                )
            """, name=GRAPH_NAME)

            # [FIX] gds.graph.list() — not gds.graph.nodeCount() (doesn't exist in GDS 2.6.8)
            count_result = await session.run(
                "CALL gds.graph.list($name) YIELD nodeCount", name=GRAPH_NAME)
            rec = await count_result.single()
            node_count = rec["nodeCount"] if rec else 0

            # PageRank — always safe to run
            pr_result = await session.run("""
                CALL gds.pageRank.stream($name, {maxIterations: 20, dampingFactor: 0.85})
                YIELD nodeId, score
                RETURN gds.util.asNode(nodeId).account_id AS account_id, score
                ORDER BY score DESC LIMIT 50
            """, name=GRAPH_NAME)
            async for record in pr_result:
                results["pagerank"][record["account_id"]] = round(record["score"], 4)

            # Betweenness — RULE 10: only if ≤500 nodes AND ≥1GB free RAM
            free_ram_gb = psutil.virtual_memory().available / (1024 ** 3)
            if node_count <= MAX_NODES_FOR_BETWEENNESS and free_ram_gb >= MIN_FREE_RAM_GB:
                bt_result = await session.run("""
                    CALL gds.betweenness.stream($name)
                    YIELD nodeId, score
                    RETURN gds.util.asNode(nodeId).account_id AS account_id, score
                    ORDER BY score DESC LIMIT 50
                """, name=GRAPH_NAME)
                async for record in bt_result:
                    results["betweenness"][record["account_id"]] = round(record["score"], 4)
            else:
                logger.warning(
                    "Skipping betweenness: nodes=%d (max=%d), free_ram=%.1fGB (min=%.1fGB)",
                    node_count, MAX_NODES_FOR_BETWEENNESS, free_ram_gb, MIN_FREE_RAM_GB)

            # Louvain community detection
            lv_result = await session.run("""
                CALL gds.louvain.stream($name)
                YIELD nodeId, communityId
                RETURN gds.util.asNode(nodeId).account_id AS account_id, communityId
            """, name=GRAPH_NAME)
            async for record in lv_result:
                results["communities"][record["account_id"]] = record["communityId"]

        except Exception as e:
            logger.error("GDS algorithm error: %s", e)
        finally:
            # RULE 2: Always drop the projection
            try:
                exists_result = await session.run(
                    "CALL gds.graph.exists($name) YIELD exists", name=GRAPH_NAME)
                rec = await exists_result.single()
                if rec and rec["exists"]:
                    await session.run("CALL gds.graph.drop($name) YIELD graphName", name=GRAPH_NAME)
            except Exception as drop_err:
                logger.error("GDS drop failed: %s", drop_err)

    return results

async def detect_circular_flows(case_id: str) -> list[dict]:
    """Detect circular money flows using Neo4j path queries."""
    driver = get_neo4j_driver()
    circles = []
    async with driver.session() as session:
        result = await session.run("""
            MATCH path = (a:Account {case_id: $cid})-[:SENT*2..6]->(a)
            WHERE length(path) >= 2
            WITH path, [n IN nodes(path) | n.account_id] AS accounts
            RETURN accounts, length(path) AS hops
            LIMIT 20
        """, cid=case_id)
        async for record in result:
            circles.append({
                "accounts": record["accounts"],
                "hops": record["hops"]
            })
    return circles

async def get_cytoscape_data(case_id: str) -> dict:
    """Returns nodes and edges formatted for Cytoscape.js."""
    driver = get_neo4j_driver()
    nodes, edges = [], []
    async with driver.session() as session:
        node_result = await session.run(
            "MATCH (a:Account {case_id: $cid}) RETURN a", cid=case_id)
        async for record in node_result:
            a = record["a"]
            nodes.append({"data": {
                "id": a["account_id"],
                "account_id": a["account_id"],
                "risk_score": a.get("risk_score", 0.0),
                "volume": a.get("total_volume", 1),
                "community": a.get("community_id"),
            }})
        edge_result = await session.run("""
            MATCH (src:Account {case_id: $cid})-[r:SENT]->(dst:Account {case_id: $cid})
            RETURN src.account_id AS source, dst.account_id AS target,
                   r.amount_str AS amount, r.txn_date AS date, r.narration AS narration
            LIMIT 500
        """, cid=case_id)
        async for record in edge_result:
            edges.append({"data": {
                "source": record["source"],
                "target": record["target"],
                "amount": record["amount"],
                "date": record["date"],
                "narration": record["narration"],
            }})
    return {"nodes": nodes, "edges": edges}

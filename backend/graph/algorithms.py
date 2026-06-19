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
    results = {"pagerank": {}, "betweenness": {}, "communities": {}, "kcore": {}, "triangles": {}}
    try:
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

                # K-Core Count (Phase 5)
                try:
                    kc_result = await session.run("""
                        CALL gds.kcore.stream($name, {kMin: 2})
                        YIELD nodeId, coreValue
                        RETURN gds.util.asNode(nodeId).account_id AS account_id, coreValue
                    """, name=GRAPH_NAME)
                    async for record in kc_result:
                        results["kcore"][record["account_id"]] = record["coreValue"]
                except Exception as gds_kc_err:
                    logger.warning("GDS Kcore stream failed: %s", gds_kc_err)

                # Triangle Count (Phase 5)
                try:
                    tc_result = await session.run("""
                        CALL gds.triangleCount.stream($name)
                        YIELD nodeId, triangleCount
                        RETURN gds.util.asNode(nodeId).account_id AS account_id, triangleCount
                    """, name=GRAPH_NAME)
                    async for record in tc_result:
                        results["triangles"][record["account_id"]] = record["triangleCount"]
                except Exception as gds_tc_err:
                    logger.warning("GDS TriangleCount stream failed: %s", gds_tc_err)

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
    except Exception as neo_err:
        logger.warning("Failed to run Neo4j algorithms: %s. Using default empty metrics.", neo_err)

    return results

async def detect_circular_flows(case_id: str) -> list[dict]:
    """Detect circular money flows using Neo4j path queries."""
    circles = []
    try:
        driver = get_neo4j_driver()
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
    except Exception as e:
        logger.warning("Circular flow detection skipped because Neo4j is unavailable: %s", e)
    return circles

async def get_cytoscape_data(case_id: str) -> dict:
    """Returns nodes and edges formatted for Cytoscape.js."""
    nodes, edges = [], []
    try:
        driver = get_neo4j_driver()
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
    except Exception as e:
        logger.warning("Cytoscape data loading skipped because Neo4j is unavailable: %s. Using SQL fallback.", e)
        try:
            from database import AsyncSessionLocal
            from sqlalchemy import text
            from entity.extractor import extract_entities_from_narration
            async with AsyncSessionLocal() as db:
                txns_res = await db.execute(
                    text("""
                        SELECT account_id, counterparty_account, amount, txn_date, narration, txn_type 
                        FROM transactions 
                        WHERE case_id = :cid
                        ORDER BY txn_date ASC
                        LIMIT 500
                    """),
                    {"cid": case_id}
                )
                txns_rows = txns_res.fetchall()
                
                verdicts_res = await db.execute(
                    text("SELECT account_id, composite_score FROM account_verdicts WHERE case_id = :cid"),
                    {"cid": case_id}
                )
                verdicts_map = {r[0]: float(r[1]) / 100.0 for r in verdicts_res.fetchall()}
                
                unique_accounts = set()
                parsed_edges = []
                
                for idx, r in enumerate(txns_rows):
                    acc_id = r[0]
                    counterparty = r[1]
                    amount = r[2]
                    txn_date = r[3]
                    narration = r[4] or ""
                    txn_type = r[5] or "DR"
                    
                    if not counterparty:
                        entities = extract_entities_from_narration(narration)
                        if entities.get("upi_ids"):
                            counterparty = entities["upi_ids"][0]
                        elif entities.get("account_numbers"):
                            counterparty = entities["account_numbers"][0]
                    
                    if acc_id:
                        unique_accounts.add(acc_id)
                    if counterparty:
                        unique_accounts.add(counterparty)
                        
                    if acc_id and counterparty:
                        # Determine direction based on DR / CR
                        if txn_type in ("DR", "DEBIT"):
                            src = acc_id
                            dst = counterparty
                        else:
                            src = counterparty
                            dst = acc_id
                            
                        parsed_edges.append({
                            "source": src,
                            "target": dst,
                            "amount": f"₹{float(amount):,.2f}" if amount is not None else "0.00",
                            "date": txn_date.isoformat() if txn_date else None,
                            "narration": narration,
                        })
                        
                # Compute transaction counts (volume) for each account
                volume_map = {}
                for edge in parsed_edges:
                    volume_map[edge["source"]] = volume_map.get(edge["source"], 0) + 1
                    volume_map[edge["target"]] = volume_map.get(edge["target"], 0) + 1
                    
                for acc in unique_accounts:
                    nodes.append({"data": {
                        "id": acc,
                        "account_id": acc,
                        "risk_score": verdicts_map.get(acc, 0.0),
                        "volume": volume_map.get(acc, 1),
                        "community": 0,
                    }})
                    
                for idx, edge in enumerate(parsed_edges):
                    edges.append({"data": {
                        "id": f"sql-edge-{idx}",
                        "source": edge["source"],
                        "target": edge["target"],
                        "amount": edge["amount"],
                        "date": edge["date"],
                        "narration": edge["narration"],
                    }})
        except Exception as sql_err:
            logger.error("SQL graph data fallback failed: %s", sql_err)
    return {"nodes": nodes, "edges": edges}


async def run_taint_propagation(case_id: str, seed_account_ids: list[str]) -> dict:
    """
    Personalized PageRank seeded from known-bad accounts (watchlist hits).
    Returns {account_id: raw_score} — higher score = closer to a tainted seed.
    RULE 2: project, run, drop in finally. Same discipline as run_graph_algorithms.
    If there are no seeds, taint propagation is meaningless — return {} and let
    the caller treat every account's taint contribution as neutral (0).
    """
    if not seed_account_ids:
        logger.info("No watchlist seeds for case %s — skipping taint propagation", case_id)
        return {}

    results = {}
    try:
        driver = get_neo4j_driver()
        async with driver.session() as session:
            exists_result = await session.run("CALL gds.graph.exists($name) YIELD exists", name=GRAPH_NAME)
            rec = await exists_result.single()
            if rec and rec["exists"]:
                await session.run("CALL gds.graph.drop($name) YIELD graphName", name=GRAPH_NAME)

            try:
                await session.run("""
                    CALL gds.graph.project(
                        $name,
                        {Account: {label: 'Account', properties: {case_id: {defaultValue: ''}}}},
                        {SENT: {type: 'SENT', orientation: 'NATURAL'}}
                    )
                """, name=GRAPH_NAME)

                seed_lookup = await session.run("""
                    MATCH (a:Account {case_id: $cid}) WHERE a.account_id IN $seeds
                    RETURN id(a) AS nodeId
                """, cid=case_id, seeds=seed_account_ids)
                seed_node_ids = [r["nodeId"] async for r in seed_lookup]

                if not seed_node_ids:
                    logger.warning("Watchlist seed accounts not present in graph for case %s", case_id)
                    return {}

                # NOTE: parameter name is `sourceNodes` as of GDS 2.x — verify against
                # whichever GDS jar version setup.sh downloaded if this call errors.
                ppr_result = await session.run("""
                    CALL gds.pageRank.stream($name, {
                        sourceNodes: $seeds, dampingFactor: 0.85, maxIterations: 20
                    })
                    YIELD nodeId, score
                    RETURN gds.util.asNode(nodeId).account_id AS account_id, score
                    ORDER BY score DESC
                """, name=GRAPH_NAME, seeds=seed_node_ids)
                async for record in ppr_result:
                    results[record["account_id"]] = record["score"]

            except Exception as e:
                logger.error("Taint propagation failed: %s", e)
            finally:
                try:
                    exists_result = await session.run("CALL gds.graph.exists($name) YIELD exists", name=GRAPH_NAME)
                    rec = await exists_result.single()
                    if rec and rec["exists"]:
                        await session.run("CALL gds.graph.drop($name) YIELD graphName", name=GRAPH_NAME)
                except Exception as drop_err:
                    logger.error("GDS drop failed: %s", drop_err)
    except Exception as neo_err:
        logger.warning("Taint propagation skipped because Neo4j is unavailable: %s", neo_err)

    return results

    return results


def rank_normalize(scores: dict) -> dict:
    """
    Converts raw scores into 0–1 percentiles relative to other accounts in the
    same case. Shared by taint propagation and betweenness in risk_fusion.py —
    defined here since this is the first module that needs it.
    """
    import bisect
    if not scores:
        return {}
    sorted_vals = sorted(scores.values())
    n = len(sorted_vals)
    return {k: bisect.bisect_right(sorted_vals, v) / n for k, v in scores.items()}


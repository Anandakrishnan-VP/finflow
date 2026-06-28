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

async def get_cytoscape_data(
    case_id: str,
    db,                      # AsyncSession — needed to join account_verdicts
    min_amount: float = 0.0,
    node_limit: int = 150,
) -> dict:
    """
    Returns nodes and edges formatted for Cytoscape.js.
    RULE 26: edges aggregated by (source, target) pair — sum, count, date range.
    RULE 30: capped at node_limit by composite_score/volume, with total_node_count
             returned so the frontend can show "showing X of Y" honestly.
    Verdict data (composite_score, role_label, agreement_tier) is fetched from
    Postgres and merged into each node — this is the wiring the old version
    never did, which is why risk tiers never showed up visually.
    """
    from sqlalchemy import text
    driver = get_neo4j_driver()

    # Step 1: aggregated edges from Neo4j (RULE 26)
    raw_edges = []
    async with driver.session() as session:
        edge_result = await session.run("""
            MATCH (src:Account {case_id: $cid})-[r:SENT]->(dst:Account {case_id: $cid})
            WITH src.account_id AS source, dst.account_id AS target,
                 collect(r) AS rels
            RETURN source, target,
                   reduce(s = 0.0, rel IN rels | s + toFloat(rel.amount_str)) AS total_amount,
                   size(rels) AS txn_count,
                   [rel IN rels | rel.txn_date][0..3] AS sample_dates,
                   [rel IN rels | rel.narration][0..3] AS sample_narrations,
                   [rel IN rels | rel.txn_hash] AS txn_hashes
        """, cid=case_id)
        async for record in edge_result:
            if record["total_amount"] < min_amount:
                continue
            raw_edges.append({
                "source": record["source"], "target": record["target"],
                "total_amount": record["total_amount"],
                "txn_count": record["txn_count"],
                "sample_dates": record["sample_dates"],
                "sample_narrations": record["sample_narrations"],
                "txn_hashes": record["txn_hashes"],
            })

        # Step 2: account list + degree, computed from the same projection
        node_result = await session.run("""
            MATCH (a:Account {case_id: $cid})
            OPTIONAL MATCH (a)-[r:SENT]-()
            RETURN a.account_id AS account_id,
                   a.name AS name,
                   a.bank AS bank,
                   a.is_primary AS is_primary,
                   count(r) AS degree
        """, cid=case_id)
        account_meta_map = {}
        async for record in node_result:
            account_meta_map[record["account_id"]] = {
                "name": record["name"] or "Unknown Counterparty",
                "bank": record["bank"] or "Unknown Bank",
                "is_primary": bool(record["is_primary"]) if record["is_primary"] is not None else False,
                "degree": record["degree"]
            }

    # Step 3: verdict enrichment from Postgres — this is the missing wiring
    verdict_result = await db.execute(
        text("""SELECT account_id, composite_score, role_label, agreement_tier,
                       tier_label, score_breakdown
                FROM account_verdicts WHERE case_id = :cid"""),
        {"cid": case_id}
    )
    verdict_map = {}
    for row in verdict_result.fetchall():
        verdict_map[row.account_id] = {
            "composite_score": row.composite_score,
            "role_label": row.role_label,
            "agreement_tier": row.agreement_tier,
            "tier_label": row.tier_label,
        }

    # Step 4: compute total volume per account (for node sizing)
    volume_map = {}
    for e in raw_edges:
        volume_map[e["source"]] = volume_map.get(e["source"], 0) + e["total_amount"]
        volume_map[e["target"]] = volume_map.get(e["target"], 0) + e["total_amount"]

    # Step 5: rank all accounts, cap to node_limit (RULE 30)
    all_account_ids = set(account_meta_map.keys()) | set(volume_map.keys())
    ranked = sorted(
        all_account_ids,
        key=lambda aid: (
            verdict_map.get(aid, {}).get("composite_score", 0),
            volume_map.get(aid, 0),
        ),
        reverse=True,
    )
    total_node_count = len(ranked)
    kept_ids = set(ranked[:node_limit])

    nodes = []
    for aid in kept_ids:
        v = verdict_map.get(aid, {})
        meta = account_meta_map.get(aid, {"name": "Unknown Counterparty", "bank": "Unknown Bank", "is_primary": False, "degree": 0})
        nodes.append({"data": {
            "id": aid,
            "account_id": aid,
            "name": meta["name"],
            "bank": meta["bank"],
            "is_primary": meta["is_primary"],
            "degree": meta.get("degree", 0),
            "volume": volume_map.get(aid, 0),
            "composite_score": v.get("composite_score", 0),
            "role_label": v.get("role_label"),
            "agreement_tier": v.get("agreement_tier"),
            "tier_label": v.get("tier_label"),
        }})

    edges = []
    for e in raw_edges:
        if e["source"] not in kept_ids or e["target"] not in kept_ids:
            continue
        edges.append({"data": {
            "id": f"{e['source']}__{e['target']}",
            "source": e["source"],
            "target": e["target"],
            "total_amount": e["total_amount"],
            "log_amount": __import__("math").log1p(e["total_amount"]),
            "txn_count": e["txn_count"],
            "sample_dates": e["sample_dates"],
            "sample_narrations": e["sample_narrations"],
            "txn_hashes": e["txn_hashes"],
        }})

    # RULE 27 input: degree distribution, computed once here so the frontend
    # doesn't have to recompute it from scratch
    degrees = sorted(degree_map.values())
    median_degree = degrees[len(degrees) // 2] if degrees else 0
    max_degree = max(degrees) if degrees else 0
    is_hub_dominated = max_degree > 3 * max(median_degree, 1)

    return {
        "nodes": nodes,
        "edges": edges,
        "total_node_count": total_node_count,
        "shown_node_count": len(nodes),
        "is_hub_dominated": is_hub_dominated,
        "max_degree": max_degree,
        "median_degree": median_degree,
    }


async def get_flow_data(case_id: str, db, min_amount: float = 0.0) -> dict:
    """
    Returns aggregated source->target->value triples for the Sankey flow view.
    Reuses the same aggregation as get_cytoscape_data (RULE 26) but in the flat
    edge-list shape d3-sankey expects, plus circular-flow edge IDs so the
    frontend can highlight round-trip money separately.
    """
    cyto = await get_cytoscape_data(case_id, db, min_amount=min_amount, node_limit=25)

    circles = await detect_circular_flows(case_id)
    circular_accounts = set()
    for c in circles:
        circular_accounts.update(c.get("accounts", []))

    flows = []
    for e in cyto["edges"]:
        d = e["data"]
        flows.append({
            "source": d["source"],
            "target": d["target"],
            "value": d["total_amount"],
            "txn_count": d["txn_count"],
            "is_circular": d["source"] in circular_accounts and d["target"] in circular_accounts,
        })

    return {
        "flows": flows,
        "node_verdicts": {n["data"]["account_id"]: {
            "composite_score": n["data"]["composite_score"],
            "role_label": n["data"]["role_label"],
        } for n in cyto["nodes"]},
    }



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


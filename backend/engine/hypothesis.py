"""
Hypothesis shortest-path engine between two accounts.
"""
import logging
from neo4j_client import get_neo4j_driver

logger = logging.getLogger(__name__)


async def run_hypothesis_query(
    case_id: str,
    from_account: str,
    to_account: str,
    max_hops: int = 4,
) -> dict:
    """
    Finds all shortest paths between from_account and to_account up to max_hops.
    Returns Cytoscape-formatted nodes and edges representing the paths.
    """
    driver = get_neo4j_driver()
    nodes = {}
    edges = []

    async with driver.session() as session:
        # Use Neo4j allShortestPaths
        query = f"""
            MATCH (src:Account {{account_id: $from_acc, case_id: $cid}}),
                  (dst:Account {{account_id: $to_acc, case_id: $cid}})
            MATCH path = allShortestPaths((src)-[:SENT*..{max_hops}]->(dst))
            RETURN path
        """
        try:
            result = await session.run(
                query,
                from_acc=from_account,
                to_acc=to_account,
                cid=case_id,
            )

            async for record in result:
                path = record["path"]
                # Process nodes
                for node in path.nodes:
                    acc_id = node["account_id"]
                    if acc_id not in nodes:
                        nodes[acc_id] = {
                            "data": {
                                "id": acc_id,
                                "account_id": acc_id,
                                "label": f"Account: {acc_id}",
                                "risk_score": node.get("risk_score", 0.0),
                                "volume": node.get("total_volume", 1),
                                "community": node.get("community_id"),
                            }
                        }

                # Process edges
                for rel in path.relationships:
                    # Retrieve start and end node ids
                    start_node = rel.nodes[0]
                    end_node = rel.nodes[1]
                    start_acc = start_node["account_id"]
                    end_acc = end_node["account_id"]

                    # Unique relationship ID
                    rel_id = f"rel_{start_acc}_{end_acc}_{rel.id}"
                    edges.append({
                        "data": {
                            "id": rel_id,
                            "source": start_acc,
                            "target": end_acc,
                            "amount": rel.get("amount_str", "0"),
                            "date": rel.get("txn_date", ""),
                            "narration": rel.get("narration", ""),
                        }
                    })

        except Exception as e:
            logger.error("Hypothesis path tracing query failed: %s", e)

    return {
        "path_found": len(nodes) > 0,
        "path_data": {
            "nodes": list(nodes.values()),
            "edges": edges,
        }
    }

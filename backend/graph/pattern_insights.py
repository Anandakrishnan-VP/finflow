"""
Derives plain-English investigative pattern summaries from data already
computed by existing detection logic. Read-only. Changes no detection rule,
no alert, no database write. Every function here is additive.

Deliberately structural where possible (computed from graph degree/edges
directly) rather than solely dependent on the rule engine or verdict
pipeline having already run — this keeps the Patterns panel useful even on
a case where Phase 4/5 scoring hasn't executed yet.
"""
import logging
from collections import defaultdict
from sqlalchemy import text
from neo4j_client import get_neo4j_driver
from graph.algorithms import get_cytoscape_data, GRAPH_NAME

logger = logging.getLogger(__name__)

FAN_MIN_DEGREE = 3   # matches the rule engine's own fan-out/fan-in threshold


async def derive_case_patterns(case_id: str, db) -> dict:
    """
    Returns:
    {
      "fan_out": [{"hub": str, "targets": [str], "total_amount": float,
                   "txn_count": int}],
      "fan_in":  [{"hub": str, "sources": [str], "total_amount": float,
                   "txn_count": int}],
      "circular_flows": [{"path": [str,...], "hops": [
                             {"from": str, "to": str, "amount": float,
                              "date": str, "narration": str, "days_elapsed": int}
                          ], "total_amount": float, "duration_days": int}],
      "layering_chains": [{"path": [str,...], "amounts": [float,...],
                            "shrink_pct": float}]
    }
    """
    cyto = await get_cytoscape_data(case_id, db, min_amount=0.0, node_limit=5000)
    fan_out, fan_in = _derive_fan_patterns(cyto["edges"])
    circular_flows = await get_circular_flow_details(case_id)
    layering_chains = await _derive_layering_chains(case_id, db, cyto["edges"])

    return {
        "fan_out": fan_out,
        "fan_in": fan_in,
        "circular_flows": circular_flows,
        "layering_chains": layering_chains,
    }


def _derive_fan_patterns(edges: list[dict]) -> tuple[list, list]:
    """Purely structural — computed straight from aggregated edges (RULE 26
    from the graph overhaul already guarantees these are per-account-pair,
    not per-transaction)."""
    out_edges = defaultdict(list)
    in_edges  = defaultdict(list)
    for e in edges:
        d = e["data"]
        out_edges[d["source"]].append(d)
        in_edges[d["target"]].append(d)

    fan_out = []
    for hub, targets in out_edges.items():
        if len(targets) >= FAN_MIN_DEGREE:
            fan_out.append({
                "hub": hub,
                "targets": [t["target"] for t in targets],
                "total_amount": sum(t["total_amount"] for t in targets),
                "txn_count": sum(t["txn_count"] for t in targets),
            })

    fan_in = []
    for hub, sources in in_edges.items():
        if len(sources) >= FAN_MIN_DEGREE:
            fan_in.append({
                "hub": hub,
                "sources": [s["source"] for s in sources],
                "total_amount": sum(s["total_amount"] for s in sources),
                "txn_count": sum(s["txn_count"] for s in sources),
            })

    fan_out.sort(key=lambda p: -p["total_amount"])
    fan_in.sort(key=lambda p: -p["total_amount"])
    return fan_out[:10], fan_in[:10]


async def get_circular_flow_details(case_id: str) -> list[dict]:
    """
    RULE 38: returns each cycle with per-hop amount, date, narration, and
    days elapsed since the previous hop — everything needed to render a
    numbered, dated story on the graph. This is additive to (does not
    replace) the existing detect_circular_flows(), which stays in place for
    the Sankey view and the Hypothesis Engine.
    """
    driver = get_neo4j_driver()
    circles = []
    seen_cycles = set()
    async with driver.session() as session:
        result = await session.run("""
            MATCH path = (a:Account {case_id: $cid})-[:SENT*2..6]->(a)
            WHERE length(path) >= 2
            WITH path, relationships(path) AS rels, nodes(path) AS ns
            RETURN [n IN ns | n.account_id] AS accounts,
                   [r IN rels | r.amount_str] AS amounts,
                   [r IN rels | r.txn_date] AS dates,
                   [r IN rels | r.narration] AS narrations,
                   length(path) AS hops
            LIMIT 150
        """, cid=case_id)

        async for record in result:
            accounts   = record["accounts"]
            amounts    = record["amounts"]
            dates      = record["dates"]
            narrations = record["narrations"]

            cycle_nodes = accounts[:-1]
            if not cycle_nodes:
                continue

            min_node = min(cycle_nodes)
            min_idx = cycle_nodes.index(min_node)

            canonical_nodes = cycle_nodes[min_idx:] + cycle_nodes[:min_idx]
            canonical_path_str = ",".join(canonical_nodes)

            if canonical_path_str in seen_cycles:
                continue
            seen_cycles.add(canonical_path_str)

            hops = []
            for i in range(len(amounts)):
                hops.append({
                    "from": accounts[i],
                    "to": accounts[i + 1],
                    "amount": float(amounts[i]) if amounts[i] else 0.0,
                    "date": dates[i],
                    "narration": (narrations[i] or "")[:120],
                })

            rotated_hops = hops[min_idx:] + hops[:min_idx]

            refined_hops = []
            prev_date = None
            for h in rotated_hops:
                from datetime import datetime
                try:
                    this_date = datetime.fromisoformat(h["date"]) if h["date"] else None
                except (ValueError, TypeError):
                    this_date = None
                days_elapsed = (this_date - prev_date).days if (this_date and prev_date) else 0

                refined_hops.append({
                    "from": h["from"],
                    "to": h["to"],
                    "amount": h["amount"],
                    "date": h["date"],
                    "narration": h["narration"],
                    "days_elapsed": max(0, days_elapsed),
                })
                if this_date:
                    prev_date = this_date

            canonical_path = canonical_nodes + [min_node]
            total_amount = sum(h["amount"] for h in refined_hops)
            duration_days = sum(h["days_elapsed"] for h in refined_hops)

            circles.append({
                "path": canonical_path,
                "hops": refined_hops,
                "total_amount": total_amount,
                "duration_days": duration_days,
            })

    return circles[:10]


async def _derive_layering_chains(case_id: str, db, edges: list[dict]) -> list[dict]:
    """
    Reconstructs layering chains from accounts already flagged LAYERING by
    the rule engine, restricted to the directed edges between those flagged
    accounts, then walks maximal paths starting from nodes with no incoming
    flagged edge. Amounts are the aggregated edge totals (RULE 26) — an
    approximation when an account pair has more than one hop's worth of
    layering activity, noted here rather than hidden.
    """
    result = await db.execute(
        text("SELECT DISTINCT account_id FROM alerts WHERE case_id=:cid AND flag='LAYERING'"),
        {"cid": case_id}
    )
    flagged_accounts = {r[0] for r in result.fetchall()}
    if not flagged_accounts:
        return []

    sub_edges = defaultdict(list)
    incoming_count = defaultdict(int)
    for e in edges:
        d = e["data"]
        if d["source"] in flagged_accounts and d["target"] in flagged_accounts:
            sub_edges[d["source"]].append(d)
            incoming_count[d["target"]] += 1

    start_nodes = [a for a in flagged_accounts if incoming_count.get(a, 0) == 0 and sub_edges.get(a)]

    chains = []
    for start in start_nodes:
        path, amounts = [start], []
        current = start
        visited = {start}
        while current in sub_edges:
            next_edges = [e for e in sub_edges[current] if e["target"] not in visited]
            if not next_edges:
                break
            next_edge = max(next_edges, key=lambda e: e["total_amount"])
            path.append(next_edge["target"])
            amounts.append(next_edge["total_amount"])
            visited.add(next_edge["target"])
            current = next_edge["target"]

        if len(path) >= 3:
            shrink_pct = 0.0
            if len(amounts) >= 2 and amounts[0] > 0:
                shrink_pct = round((1 - amounts[-1] / amounts[0]) * 100, 1)
            chains.append({"path": path, "amounts": amounts, "shrink_pct": shrink_pct})

    return chains[:10]

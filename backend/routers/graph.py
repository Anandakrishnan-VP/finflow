from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from security.auth import get_current_user
from graph.algorithms import get_cytoscape_data, get_flow_data

router = APIRouter(prefix="/cases", tags=["graph"])

@router.get("/{case_id}/graph")
async def get_graph(
    case_id: str,
    min_amount: float = Query(0.0, ge=0),
    node_limit: int = Query(150, ge=10, le=1000),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_cytoscape_data(case_id, db, min_amount=min_amount, node_limit=node_limit)

@router.get("/{case_id}/graph/flow")
async def get_flow(
    case_id: str,
    min_amount: float = Query(0.0, ge=0),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_flow_data(case_id, db, min_amount=min_amount)

@router.get("/{case_id}/graph/communities")
async def get_communities(case_id: str, current_user=Depends(get_current_user)):
    from graph.algorithms import run_graph_algorithms
    results = await run_graph_algorithms(case_id)
    return {"communities": results.get("communities", {})}

@router.post("/{case_id}/graph/explain")
async def explain_graph(
    case_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from graph.algorithms import get_cytoscape_data, detect_circular_flows
    cyto = await get_cytoscape_data(case_id, db, min_amount=0.0, node_limit=150)
    
    nodes = cyto.get("nodes", [])
    edges = cyto.get("edges", [])
    
    sorted_nodes = sorted(nodes, key=lambda n: n["data"].get("volume", 0), reverse=True)
    top_nodes = []
    for n in sorted_nodes[:10]:
        nd = n["data"]
        top_nodes.append({
            "account_id": nd.get("account_id"),
            "degree": nd.get("degree"),
            "volume": nd.get("volume"),
            "composite_score": nd.get("composite_score"),
            "role_label": nd.get("role_label"),
            "tier_label": nd.get("tier_label"),
        })
        
    high_risk_nodes = []
    for n in nodes:
        nd = n["data"]
        if nd.get("composite_score", 0) >= 65:
            high_risk_nodes.append({
                "account_id": nd.get("account_id"),
                "composite_score": nd.get("composite_score"),
                "role_label": nd.get("role_label"),
            })
            
    sorted_edges = sorted(edges, key=lambda e: e["data"].get("total_amount", 0), reverse=True)
    top_edges = []
    for e in sorted_edges[:10]:
        ed = e["data"]
        top_edges.append({
            "source": ed.get("source"),
            "target": ed.get("target"),
            "total_amount": ed.get("total_amount"),
            "txn_count": ed.get("txn_count"),
        })
        
    circles = await detect_circular_flows(case_id)
    
    analysis_payload = {
        "case_id": case_id,
        "is_hub_dominated": cyto.get("is_hub_dominated", False),
        "total_nodes": len(nodes),
        "total_edges": len(edges),
        "top_volume_accounts": top_nodes,
        "high_risk_accounts": high_risk_nodes[:15],
        "top_transaction_links": top_edges,
        "circular_paths": circles,
    }
    
    from llm.client import generate
    from llm.prompts import GRAPH_EXPLANATION_PROMPT
    
    explanation = await generate(analysis_payload, GRAPH_EXPLANATION_PROMPT, response_key="graph_explanation")
    return {"explanation": explanation}


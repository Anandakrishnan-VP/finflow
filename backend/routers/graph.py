from fastapi import APIRouter, Depends
from security.auth import get_current_user
from graph.algorithms import get_cytoscape_data

router = APIRouter(prefix="/cases", tags=["graph"])

@router.get("/{case_id}/graph")
async def get_graph(case_id: str, current_user=Depends(get_current_user)):
    return await get_cytoscape_data(case_id)

@router.get("/{case_id}/graph/communities")
async def get_communities(case_id: str, current_user=Depends(get_current_user)):
    from graph.algorithms import run_graph_algorithms
    results = await run_graph_algorithms(case_id)
    return {"communities": results.get("communities", {})}

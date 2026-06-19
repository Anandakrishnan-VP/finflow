"""
Intelligence API Router.
Exposes Narration clusters and court-ready Evidence package endpoints.
*As instructed, the cross-case hits endpoint is omitted.*
"""
import os
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import get_current_user
from reports.evidence_package import create_evidence_package

router = APIRouter(prefix="/cases", tags=["intelligence"])


@router.get("/{case_id}/narration-clusters")
async def get_narration_clusters(
    case_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve narration similarity clusters for a case."""
    q = await db.execute(
        text("""
            SELECT id, cluster_id, narration_signature, transaction_count,
                   account_count, is_coordinated, representative_narration, created_at
            FROM narration_clusters
            WHERE case_id = :cid
            ORDER BY is_coordinated DESC, transaction_count DESC
        """),
        {"cid": case_id}
    )
    rows = q.fetchall()
    return [dict(r._mapping) for r in rows]


@router.post("/{case_id}/evidence-package")
async def generate_court_evidence_package(
    case_id: str,
    officer_badge: str = Query(..., min_length=1),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate SHA-256 validated ZIP package containing PDF, Excel, Metadata, and Audit Log."""
    # Verify case exists
    case_row = await db.execute(text("SELECT id, title FROM cases WHERE id=:cid"), {"cid": case_id})
    case = case_row.fetchone()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    officer_name = current_user.get("username", "Unknown Officer")
    user_id = current_user.get("id")

    try:
        # Create ZIP package
        zip_path, manifest = await create_evidence_package(case_id, officer_name, officer_badge, db)

        # Log into DB
        await db.execute(
            text("""
                INSERT INTO evidence_packages
                (case_id, generated_by, package_path, sha256_manifest, officer_badge)
                VALUES (:cid, :uid, :path, :manifest, :badge)
            """),
            {
                "cid": case_id,
                "uid": user_id,
                "path": zip_path,
                "manifest": json.dumps(manifest),
                "badge": officer_badge,
            }
        )
        await db.commit()

        if not os.path.exists(zip_path):
            raise HTTPException(status_code=500, detail="Package file creation failed.")

        return FileResponse(
            zip_path,
            filename=os.path.basename(zip_path),
            media_type="application/zip",
        )

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to generate evidence package: {str(e)}")

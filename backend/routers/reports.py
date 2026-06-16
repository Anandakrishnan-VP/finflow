from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import get_current_user
from schemas.report import ReportRequest

router = APIRouter(prefix="/cases", tags=["reports"])

@router.post("/{case_id}/reports/pdf")
async def generate_pdf(case_id: str, req: ReportRequest = ReportRequest(),
                       current_user=Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    case_row = await db.execute(text("SELECT * FROM cases WHERE id=:cid"), {"cid": case_id})
    case = dict((case_row.fetchone() or {})._mapping)
    if not case:
        raise HTTPException(404, "Case not found")
    txn_r = await db.execute(text("SELECT * FROM transactions WHERE case_id=:cid ORDER BY txn_date"), {"cid": case_id})
    alert_r = await db.execute(text("SELECT * FROM alerts WHERE case_id=:cid ORDER BY confidence DESC"), {"cid": case_id})
    trail_r = await db.execute(text("""
        SELECT mt.amount::text, mt.days_held, cr.txn_date AS credit_date, dr.txn_date AS debit_date
        FROM money_trails mt JOIN transactions cr ON mt.credit_txn_id=cr.id
        JOIN transactions dr ON mt.debit_txn_id=dr.id WHERE mt.case_id=:cid"""), {"cid": case_id})
    from llm.narrator import generate_narrative
    from llm.case_theory import generate_case_theory
    transactions = [dict(r._mapping) for r in txn_r.fetchall()]
    alerts = [dict(r._mapping) for r in alert_r.fetchall()]
    trail  = [dict(r._mapping) for r in trail_r.fetchall()]
    from tasks.analysis_task import _build_case_data
    narrative   = await generate_narrative({"case_id": case_id, "transaction_count": len(transactions)})
    case_theory = await generate_case_theory({"case_id": case_id})
    from reports.pdf_generator import generate_investigation_report
    pdf_bytes = await generate_investigation_report(
        case, transactions, alerts, trail, {},
        narrative, case_theory,
        {"name": current_user.get("username",""), "badge": "", "place": "Bengaluru"}
    )
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="report_{case_id[:8]}.pdf"'})

@router.post("/{case_id}/reports/excel")
async def generate_excel(case_id: str, current_user=Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    case_r = await db.execute(text("SELECT * FROM cases WHERE id=:cid"), {"cid": case_id})
    txn_r  = await db.execute(text("SELECT * FROM transactions WHERE case_id=:cid ORDER BY txn_date"), {"cid": case_id})
    alert_r= await db.execute(text("SELECT * FROM alerts WHERE case_id=:cid"), {"cid": case_id})
    case = dict((case_r.fetchone() or {})._mapping)
    txns = [dict(r._mapping) for r in txn_r.fetchall()]
    alerts = [dict(r._mapping) for r in alert_r.fetchall()]
    from reports.excel_generator import generate_excel_report
    xlsx_bytes = generate_excel_report(case, txns, alerts, [])
    return Response(content=xlsx_bytes,
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="report_{case_id[:8]}.xlsx"'})

@router.post("/{case_id}/reports/str")
async def generate_str(case_id: str, current_user=Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    txn_r = await db.execute(text("SELECT * FROM transactions WHERE case_id=:cid ORDER BY txn_date LIMIT 100"), {"cid": case_id})
    txns  = [dict(r._mapping) for r in txn_r.fetchall()]
    case_r = await db.execute(text("SELECT * FROM cases WHERE id=:cid"), {"cid": case_id})
    case  = dict((case_r.fetchone() or {})._mapping)
    from reports.str_xml import generate_str_xml
    xml_bytes = generate_str_xml(case, txns, {"name": "Karnataka CID EOW"})
    return Response(content=xml_bytes, media_type="application/xml",
                    headers={"Content-Disposition": f'attachment; filename="str_DRAFT_{case_id[:8]}.xml"'})

@router.post("/{case_id}/reports/brief")
async def generate_brief(case_id: str, current_user=Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    case_r = await db.execute(text("SELECT * FROM cases WHERE id=:cid"), {"cid": case_id})
    alert_r= await db.execute(text("SELECT * FROM alerts WHERE case_id=:cid ORDER BY confidence DESC LIMIT 20"), {"cid": case_id})
    case  = dict((case_r.fetchone() or {})._mapping)
    alerts= [dict(r._mapping) for r in alert_r.fetchall()]
    txn_r = await db.execute(text("SELECT COUNT(*), SUM(amount)::text FROM transactions WHERE case_id=:cid"), {"cid": case_id})
    txn_row = txn_r.fetchone()
    summary = {"transaction_count": txn_row[0], "total_amount": txn_row[1],
               "alert_count": len(alerts), "key_accounts": []}
    from reports.magistrate_brief import generate_magistrate_brief
    pdf = generate_magistrate_brief(case, summary, alerts,
                                    {"name": current_user.get("username",""), "badge": ""})
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="brief_{case_id[:8]}.pdf"'})

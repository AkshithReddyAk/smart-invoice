from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Invoice, InvoiceTemplate

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard_stats(db: Session = Depends(get_db)):
    total_invoices = db.query(func.count(Invoice.id)).scalar() or 0
    total_value = db.query(func.coalesce(func.sum(Invoice.grand_total), 0.0)).scalar() or 0.0
    saved_templates = db.query(func.count(InvoiceTemplate.id)).scalar() or 0
    recent = (
        db.query(Invoice)
        .order_by(Invoice.created_at.desc())
        .limit(8)
        .all()
    )

    return {
        "total_invoices": int(total_invoices),
        "total_invoice_value": round(float(total_value), 2),
        "saved_templates": int(saved_templates),
        "recent_invoices": [
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "customer_name": inv.customer_name,
                "invoice_date": inv.invoice_date,
                "grand_total": inv.grand_total,
                "template_name_snapshot": inv.template_name_snapshot,
                "created_at": inv.created_at.isoformat(),
            }
            for inv in recent
        ],
    }

from datetime import date
import json
from pathlib import Path
from urllib.parse import quote
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import INVOICES_DIR
from app.database import get_db
from app.models import CompanySettings, Invoice, InvoiceItem, InvoiceTemplate
from app.schemas import (
    CompanyDetailsPayload,
    InvoiceCalculationRequest,
    InvoiceItemOut,
    InvoiceOut,
    InvoicePayload,
)
from app.services.calculator import calculate_invoice_totals
from app.services.pdf_generator import (
    generate_background_mode_pdf,
    generate_docx_mode_pdf,
    render_populated_docx_structure,
)

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


def _get_company_dict(payload_comp: CompanyDetailsPayload | None, db: Session) -> dict:
    if payload_comp and any(payload_comp.model_dump().values()):
        d = payload_comp.model_dump()
        # Preserve stored logo path if not sent explicitly
        if not d.get("company_logo_path"):
            s = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
            if s and s.company_logo_path:
                d["company_logo_path"] = s.company_logo_path
        return d

    s = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    if not s:
        return CompanyDetailsPayload().model_dump()
    return {
        "company_name": s.company_name,
        "company_logo_path": s.company_logo_path,
        "company_address": s.company_address,
        "gstin": s.gstin,
        "pan_number": s.pan_number,
        "phone": s.phone,
        "email": s.email,
        "website": s.website,
    }


def _generate_fallback_pdf(invoice_dict: dict, out_pdf_path: Path) -> Path:
    """Clean A4 fallback PDF when no template is attached."""
    out_pdf_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(out_pdf_path), pagesize=A4, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    title_style = ParagraphStyle("Title", fontName="Helvetica-Bold", fontSize=16, spaceAfter=6)
    norm = ParagraphStyle("Norm", fontName="Helvetica", fontSize=9.5, leading=13)
    bold = ParagraphStyle("Bold", fontName="Helvetica-Bold", fontSize=9.5, leading=13)

    comp = invoice_dict.get("company_details") or {}
    story = [
        Paragraph(comp.get("company_name") or "TAX INVOICE", title_style),
        Paragraph(f"{comp.get('company_address', '')} | GSTIN: {comp.get('gstin', '-')}", norm),
        Spacer(1, 10),
        Paragraph(f"<b>Invoice No:</b> {invoice_dict['invoice_number']} &nbsp;&nbsp; <b>Date:</b> {invoice_dict['invoice_date']}", norm),
        Paragraph(f"<b>Bill To:</b> {invoice_dict['customer_name']} &nbsp;&nbsp; {invoice_dict.get('billing_address', '')}", norm),
        Spacer(1, 10),
    ]

    rows = [["Sl", "Description", "HSN/SAC", "Qty", "Rate", "GST%", "Total"]]
    for it in invoice_dict["items"]:
        rows.append([
            str(it["sl_no"]),
            Paragraph(it["description"], norm),
            it.get("hsn_sac", ""),
            f"{it['quantity']:g} {it.get('unit', '')}",
            f"{it['rate']:,.2f}",
            f"{it['gst_percent']:g}%",
            f"{it['total_amount']:,.2f}",
        ])

    tbl = Table(rows, colWidths=[28, 195, 62, 55, 65, 45, 73], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"<b>Grand Total:</b> {invoice_dict['grand_total']:,.2f}", bold))
    story.append(Paragraph(f"<b>Amount in Words:</b> {invoice_dict['amount_in_words']}", norm))
    doc.build(story)
    return out_pdf_path


def _render_invoice_artifacts(inv: Invoice, tpl: InvoiceTemplate | None, invoice_dict: dict) -> tuple[str, str]:
    pdf_path = INVOICES_DIR / f"{inv.id}.pdf"
    docx_path = ""
    try:
        if tpl and Path(tpl.file_path).exists():
            if tpl.mode == "docx":
                out_docx = INVOICES_DIR / f"{inv.id}.docx"
                generate_docx_mode_pdf(tpl.file_path, invoice_dict, pdf_path, out_docx)
                docx_path = str(out_docx)
            else:
                mappings = json.loads(tpl.field_mappings_json or "{}")
                generate_background_mode_pdf(tpl.file_path, tpl.file_type, mappings, invoice_dict, pdf_path)
        else:
            _generate_fallback_pdf(invoice_dict, pdf_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {exc}") from exc

    return str(pdf_path), docx_path


def _serialize_invoice(inv: Invoice) -> InvoiceOut:
    return InvoiceOut(
        id=inv.id,
        invoice_number=inv.invoice_number,
        template_id=inv.template_id,
        template_name_snapshot=inv.template_name_snapshot,
        invoice_date=inv.invoice_date,
        due_date=inv.due_date,
        place_of_supply=inv.place_of_supply,
        payment_terms=inv.payment_terms,
        po_number=inv.po_number,
        customer_name=inv.customer_name,
        billing_address=inv.billing_address,
        shipping_address=inv.shipping_address,
        customer_gstin=inv.customer_gstin,
        customer_phone=inv.customer_phone,
        customer_email=inv.customer_email,
        company_details=CompanyDetailsPayload(**json.loads(inv.company_snapshot_json or "{}")),
        tax_mode=inv.tax_mode,
        auto_round_off=inv.auto_round_off,
        invoice_discount=inv.invoice_discount,
        subtotal=inv.subtotal,
        discount_total=inv.discount_total,
        taxable_total=inv.taxable_total,
        cgst_total=inv.cgst_total,
        sgst_total=inv.sgst_total,
        igst_total=inv.igst_total,
        round_off=inv.round_off,
        grand_total=inv.grand_total,
        amount_in_words=inv.amount_in_words,
        payment_instructions=inv.payment_instructions,
        bank_account_details=inv.bank_account_details,
        upi_id=inv.upi_id,
        extra_fields=json.loads(inv.extra_fields_json or "{}"),
        paper_size=inv.paper_size,
        has_pdf=bool(inv.pdf_path and Path(inv.pdf_path).exists()),
        has_docx=bool(inv.docx_path and Path(inv.docx_path).exists()),
        status=inv.status,
        items=[
            InvoiceItemOut(
                sl_no=it.sl_no,
                description=it.description,
                hsn_sac=it.hsn_sac,
                quantity=it.quantity,
                unit=it.unit,
                rate=it.rate,
                discount=it.discount,
                discount_type=it.discount_type,
                gst_percent=it.gst_percent,
                taxable_amount=it.taxable_amount,
                gst_amount=it.gst_amount,
                total_amount=it.total_amount,
            )
            for it in inv.items
        ],
        created_at=inv.created_at,
        updated_at=inv.updated_at,
    )


def _next_unique_invoice_number(db: Session) -> str:
    s = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    prefix = s.invoice_prefix if s else "INV-"
    seq = s.next_invoice_seq if s else 1
    while True:
        candidate = f"{prefix}{seq:04d}"
        exists = db.query(Invoice.id).filter(Invoice.invoice_number == candidate).first()
        if not exists:
            return candidate
        seq += 1


@router.get("/next-number")
def get_next_invoice_number(db: Session = Depends(get_db)):
    return {"invoice_number": _next_unique_invoice_number(db)}


@router.post("/calculate")
def calculate_totals_endpoint(payload: InvoiceCalculationRequest):
    return calculate_invoice_totals(
        items=payload.items,
        tax_mode=payload.tax_mode,
        auto_round_off=payload.auto_round_off,
        invoice_discount=payload.invoice_discount,
    )


@router.post("/preview-docx")
def preview_docx_live(payload: InvoicePayload, db: Session = Depends(get_db)):
    if not payload.template_id:
        raise HTTPException(status_code=400, detail="template_id is required")
    tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == payload.template_id).first()
    if not tpl or tpl.mode != "docx":
        raise HTTPException(status_code=404, detail="DOCX template not found")

    calc = calculate_invoice_totals(
        items=payload.items,
        tax_mode=payload.tax_mode,
        auto_round_off=payload.auto_round_off,
        invoice_discount=payload.invoice_discount,
    )
    comp = _get_company_dict(payload.company_details, db)
    invoice_dict = {
        **payload.model_dump(),
        **calc,
        "company_details": comp,
        "amount_in_words": (payload.amount_in_words or "").strip() or calc["amount_in_words"],
    }
    return render_populated_docx_structure(tpl.file_path, invoice_dict)


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    q: str = Query("", description="Search invoice number or customer name"),
    customer: str = Query(""),
    date_from: str = Query(""),
    date_to: str = Query(""),
    template_id: str = Query(""),
    db: Session = Depends(get_db),
):
    query = db.query(Invoice)
    if q.strip():
        pat = f"%{q.strip()}%"
        query = query.filter(or_(Invoice.invoice_number.ilike(pat), Invoice.customer_name.ilike(pat)))
    if customer.strip():
        query = query.filter(Invoice.customer_name.ilike(f"%{customer.strip()}%"))
    if date_from.strip():
        query = query.filter(Invoice.invoice_date >= date_from.strip())
    if date_to.strip():
        query = query.filter(Invoice.invoice_date <= date_to.strip())
    if template_id.strip():
        query = query.filter(Invoice.template_id == template_id.strip())

    rows = query.order_by(Invoice.created_at.desc()).all()
    return [_serialize_invoice(r) for r in rows]


@router.post("", response_model=InvoiceOut)
def create_invoice(payload: InvoicePayload, db: Session = Depends(get_db)):
    existing = db.query(Invoice).filter(Invoice.invoice_number == payload.invoice_number).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Invoice number '{payload.invoice_number}' already exists. Please use a unique invoice number.",
        )

    tpl = None
    if payload.template_id:
        tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == payload.template_id).first()
        if not tpl:
            raise HTTPException(status_code=404, detail="Selected template not found")
    else:
        tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.is_default.is_(True)).first()

    calc = calculate_invoice_totals(
        items=payload.items,
        tax_mode=payload.tax_mode,
        auto_round_off=payload.auto_round_off,
        invoice_discount=payload.invoice_discount,
    )
    comp = _get_company_dict(payload.company_details, db)
    words = (payload.amount_in_words or "").strip() or calc["amount_in_words"]

    inv_id = f"inv_{uuid.uuid4().hex[:12]}"
    inv = Invoice(
        id=inv_id,
        invoice_number=payload.invoice_number,
        template_id=tpl.id if tpl else None,
        template_name_snapshot=tpl.name if tpl else "Standard A4",
        invoice_date=payload.invoice_date,
        due_date=payload.due_date,
        place_of_supply=payload.place_of_supply,
        payment_terms=payload.payment_terms,
        po_number=payload.po_number,
        customer_name=payload.customer_name,
        billing_address=payload.billing_address,
        shipping_address=payload.shipping_address,
        customer_gstin=payload.customer_gstin,
        customer_phone=payload.customer_phone,
        customer_email=payload.customer_email,
        company_snapshot_json=json.dumps(comp),
        tax_mode=payload.tax_mode,
        auto_round_off=payload.auto_round_off,
        invoice_discount=payload.invoice_discount,
        subtotal=calc["subtotal"],
        discount_total=calc["discount_total"],
        taxable_total=calc["taxable_total"],
        cgst_total=calc["cgst_total"],
        sgst_total=calc["sgst_total"],
        igst_total=calc["igst_total"],
        round_off=calc["round_off"],
        grand_total=calc["grand_total"],
        amount_in_words=words,
        payment_instructions=payload.payment_instructions,
        bank_account_details=payload.bank_account_details,
        upi_id=payload.upi_id,
        extra_fields_json=json.dumps(payload.extra_fields),
        paper_size=payload.paper_size,
        status="generated",
    )

    for idx, ci in enumerate(calc["items"], start=1):
        inv.items.append(
            InvoiceItem(
                sl_no=idx,
                description=ci["description"],
                hsn_sac=ci["hsn_sac"],
                quantity=ci["quantity"],
                unit=ci["unit"],
                rate=ci["rate"],
                discount=ci["discount"],
                discount_type=ci["discount_type"],
                gst_percent=ci["gst_percent"],
                taxable_amount=ci["taxable_amount"],
                gst_amount=ci["gst_amount"],
                total_amount=ci["total_amount"],
            )
        )

    invoice_dict = {
        **payload.model_dump(),
        **calc,
        "company_details": comp,
        "amount_in_words": words,
    }
    pdf_path, docx_path = _render_invoice_artifacts(inv, tpl, invoice_dict)
    inv.pdf_path = pdf_path
    inv.docx_path = docx_path

    # Increment invoice sequence counter if settings uses matching prefix
    settings = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    if settings and payload.invoice_number.startswith(settings.invoice_prefix):
        settings.next_invoice_seq += 1

    db.add(inv)
    db.commit()
    db.refresh(inv)
    return _serialize_invoice(inv)


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _serialize_invoice(inv)


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(invoice_id: str, payload: InvoicePayload, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if payload.invoice_number != inv.invoice_number:
        conflict = (
            db.query(Invoice)
            .filter(Invoice.invoice_number == payload.invoice_number, Invoice.id != invoice_id)
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=409,
                detail=f"Invoice number '{payload.invoice_number}' already exists.",
            )

    # Guard against accidental PDF overwrite unless explicitly confirmed
    if inv.pdf_path and Path(inv.pdf_path).exists() and not payload.confirm_overwrite:
        raise HTTPException(
            status_code=409,
            detail="An existing PDF exists for this invoice. Confirm overwrite to regenerate and replace it.",
        )

    tpl = None
    if payload.template_id:
        tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == payload.template_id).first()
        if not tpl:
            raise HTTPException(status_code=404, detail="Selected template not found")

    calc = calculate_invoice_totals(
        items=payload.items,
        tax_mode=payload.tax_mode,
        auto_round_off=payload.auto_round_off,
        invoice_discount=payload.invoice_discount,
    )
    comp = _get_company_dict(payload.company_details, db)
    words = (payload.amount_in_words or "").strip() or calc["amount_in_words"]

    inv.invoice_number = payload.invoice_number
    inv.template_id = tpl.id if tpl else None
    inv.template_name_snapshot = tpl.name if tpl else "Standard A4"
    inv.invoice_date = payload.invoice_date
    inv.due_date = payload.due_date
    inv.place_of_supply = payload.place_of_supply
    inv.payment_terms = payload.payment_terms
    inv.po_number = payload.po_number
    inv.customer_name = payload.customer_name
    inv.billing_address = payload.billing_address
    inv.shipping_address = payload.shipping_address
    inv.customer_gstin = payload.customer_gstin
    inv.customer_phone = payload.customer_phone
    inv.customer_email = payload.customer_email
    inv.company_snapshot_json = json.dumps(comp)
    inv.tax_mode = payload.tax_mode
    inv.auto_round_off = payload.auto_round_off
    inv.invoice_discount = payload.invoice_discount
    inv.subtotal = calc["subtotal"]
    inv.discount_total = calc["discount_total"]
    inv.taxable_total = calc["taxable_total"]
    inv.cgst_total = calc["cgst_total"]
    inv.sgst_total = calc["sgst_total"]
    inv.igst_total = calc["igst_total"]
    inv.round_off = calc["round_off"]
    inv.grand_total = calc["grand_total"]
    inv.amount_in_words = words
    inv.payment_instructions = payload.payment_instructions
    inv.bank_account_details = payload.bank_account_details
    inv.upi_id = payload.upi_id
    inv.extra_fields_json = json.dumps(payload.extra_fields)
    inv.paper_size = payload.paper_size
    inv.status = "generated"

    inv.items.clear()
    db.flush()
    for idx, ci in enumerate(calc["items"], start=1):
        inv.items.append(
            InvoiceItem(
                sl_no=idx,
                description=ci["description"],
                hsn_sac=ci["hsn_sac"],
                quantity=ci["quantity"],
                unit=ci["unit"],
                rate=ci["rate"],
                discount=ci["discount"],
                discount_type=ci["discount_type"],
                gst_percent=ci["gst_percent"],
                taxable_amount=ci["taxable_amount"],
                gst_amount=ci["gst_amount"],
                total_amount=ci["total_amount"],
            )
        )

    invoice_dict = {
        **payload.model_dump(),
        **calc,
        "company_details": comp,
        "amount_in_words": words,
    }
    pdf_path, docx_path = _render_invoice_artifacts(inv, tpl, invoice_dict)
    inv.pdf_path = pdf_path
    inv.docx_path = docx_path

    db.commit()
    db.refresh(inv)
    return _serialize_invoice(inv)


@router.post("/{invoice_id}/regenerate", response_model=InvoiceOut)
def regenerate_invoice_pdf(
    invoice_id: str,
    confirm_overwrite: bool = Query(False),
    db: Session = Depends(get_db),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.pdf_path and Path(inv.pdf_path).exists() and not confirm_overwrite:
        raise HTTPException(
            status_code=409,
            detail="Confirm overwrite to regenerate this invoice PDF.",
        )

    tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == inv.template_id).first() if inv.template_id else None
    serialized = _serialize_invoice(inv)
    invoice_dict = serialized.model_dump()
    invoice_dict["company_details"] = serialized.company_details.model_dump()
    pdf_path, docx_path = _render_invoice_artifacts(inv, tpl, invoice_dict)
    inv.pdf_path = pdf_path
    inv.docx_path = docx_path
    inv.status = "generated"
    db.commit()
    db.refresh(inv)
    return _serialize_invoice(inv)


@router.post("/{invoice_id}/duplicate", response_model=InvoiceOut)
def duplicate_invoice(invoice_id: str, db: Session = Depends(get_db)):
    src = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Source invoice not found")

    new_num = _next_unique_invoice_number(db)
    new_inv = Invoice(
        id=f"inv_{uuid.uuid4().hex[:12]}",
        invoice_number=new_num,
        template_id=src.template_id,
        template_name_snapshot=src.template_name_snapshot,
        invoice_date=date.today().isoformat(),
        due_date="",
        place_of_supply=src.place_of_supply,
        payment_terms=src.payment_terms,
        po_number="",
        customer_name=src.customer_name,
        billing_address=src.billing_address,
        shipping_address=src.shipping_address,
        customer_gstin=src.customer_gstin,
        customer_phone=src.customer_phone,
        customer_email=src.customer_email,
        company_snapshot_json=src.company_snapshot_json,
        tax_mode=src.tax_mode,
        auto_round_off=src.auto_round_off,
        invoice_discount=src.invoice_discount,
        subtotal=src.subtotal,
        discount_total=src.discount_total,
        taxable_total=src.taxable_total,
        cgst_total=src.cgst_total,
        sgst_total=src.sgst_total,
        igst_total=src.igst_total,
        round_off=src.round_off,
        grand_total=src.grand_total,
        amount_in_words=src.amount_in_words,
        payment_instructions=src.payment_instructions,
        bank_account_details=src.bank_account_details,
        upi_id=src.upi_id,
        extra_fields_json=src.extra_fields_json,
        paper_size=src.paper_size,
        pdf_path="",
        docx_path="",
        status="draft",
    )
    for it in src.items:
        new_inv.items.append(
            InvoiceItem(
                sl_no=it.sl_no,
                description=it.description,
                hsn_sac=it.hsn_sac,
                quantity=it.quantity,
                unit=it.unit,
                rate=it.rate,
                discount=it.discount,
                discount_type=it.discount_type,
                gst_percent=it.gst_percent,
                taxable_amount=it.taxable_amount,
                gst_amount=it.gst_amount,
                total_amount=it.total_amount,
            )
        )

    db.add(new_inv)
    db.commit()
    db.refresh(new_inv)
    return _serialize_invoice(new_inv)


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(invoice_id: str, inline: bool = Query(False), db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if not inv.pdf_path or not Path(inv.pdf_path).exists():
        tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == inv.template_id).first() if inv.template_id else None
        serialized = _serialize_invoice(inv)
        invoice_dict = serialized.model_dump()
        invoice_dict["company_details"] = serialized.company_details.model_dump()
        pdf_path, docx_path = _render_invoice_artifacts(inv, tpl, invoice_dict)
        inv.pdf_path = pdf_path
        inv.docx_path = docx_path
        inv.status = "generated"
        db.commit()

    p = Path(inv.pdf_path).resolve()
    if not p.exists() or not str(p).startswith(str(INVOICES_DIR.resolve())):
        raise HTTPException(status_code=404, detail="Invoice PDF missing on disk")

    safe_num = inv.invoice_number.replace("/", "-").replace("\\", "-")
    disp = "inline" if inline else "attachment"
    return FileResponse(
        p,
        media_type="application/pdf",
        headers={"Content-Disposition": f"{disp}; filename*=UTF-8''{quote(f'Invoice_{safe_num}.pdf')}"},
    )


@router.get("/{invoice_id}/docx")
def download_invoice_docx(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv or not inv.docx_path:
        raise HTTPException(status_code=404, detail="DOCX output not available for this invoice")
    p = Path(inv.docx_path).resolve()
    if not p.exists() or not str(p).startswith(str(INVOICES_DIR.resolve())):
        raise HTTPException(status_code=404, detail="Invoice DOCX missing on disk")
    safe_num = inv.invoice_number.replace("/", "-").replace("\\", "-")
    return FileResponse(
        p,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(f'Invoice_{safe_num}.docx')}"},
    )


@router.delete("/{invoice_id}")
def delete_invoice(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    for p_str in (inv.pdf_path, inv.docx_path):
        if p_str:
            Path(p_str).unlink(missing_ok=True)
    db.delete(inv)
    db.commit()
    return {"status": "deleted", "id": invoice_id}

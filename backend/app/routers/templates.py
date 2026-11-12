import json
from pathlib import Path
import uuid

import fitz
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import PREVIEWS_DIR
from app.database import get_db
from app.models import InvoiceTemplate
from app.schemas import TemplateMappings, TemplateOut, TemplateUpdate
from app.services.label_locator import detect_style_near_box, locate_field_on_template
from app.services.template_processor import (
    TemplateValidationError,
    extract_docx_structure,
    process_template_file,
)

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _serialize_template(t: InvoiceTemplate) -> TemplateOut:
    return TemplateOut(
        id=t.id,
        name=t.name,
        file_type=t.file_type,
        mode=t.mode,
        original_filename=t.original_filename,
        preview_images=json.loads(t.preview_images_json or "[]"),
        page_width_pt=t.page_width_pt,
        page_height_pt=t.page_height_pt,
        page_count=t.page_count,
        field_mappings=TemplateMappings(**json.loads(t.field_mappings_json or "{}")),
        docx_placeholders=json.loads(t.docx_placeholders_json or "[]"),
        is_default=t.is_default,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


@router.get("", response_model=list[TemplateOut])
def list_templates(db: Session = Depends(get_db)):
    rows = db.query(InvoiceTemplate).order_by(InvoiceTemplate.is_default.desc(), InvoiceTemplate.created_at.desc()).all()
    return [_serialize_template(r) for r in rows]


@router.post("/upload", response_model=TemplateOut)
async def upload_template(
    file: UploadFile = File(...),
    name: str = Form(""),
    set_as_default: bool = Form(False),
    db: Session = Depends(get_db),
):
    data = await file.read()
    tpl_id = f"tpl_{uuid.uuid4().hex[:12]}"
    try:
        meta = process_template_file(tpl_id, file.filename or "template", data)
    except TemplateValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    clean_name = name.strip() or Path(meta["original_filename"]).stem
    existing_count = db.query(InvoiceTemplate).count()
    should_default = bool(set_as_default) or (existing_count == 0)

    if should_default:
        db.query(InvoiceTemplate).update({InvoiceTemplate.is_default: False})

    tpl = InvoiceTemplate(
        id=tpl_id,
        name=clean_name,
        is_default=should_default,
        **meta,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return _serialize_template(tpl)


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: str, db: Session = Depends(get_db)):
    tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return _serialize_template(tpl)


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(template_id: str, payload: TemplateUpdate, db: Session = Depends(get_db)):
    tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    if payload.name is not None:
        tpl.name = payload.name
    if payload.field_mappings is not None:
        tpl.field_mappings_json = payload.field_mappings.model_dump_json()
    if payload.is_default is True:
        db.query(InvoiceTemplate).update({InvoiceTemplate.is_default: False})
        tpl.is_default = True
    elif payload.is_default is False:
        tpl.is_default = False

    db.commit()
    db.refresh(tpl)
    return _serialize_template(tpl)


@router.post("/{template_id}/set-default", response_model=TemplateOut)
def set_default_template(template_id: str, db: Session = Depends(get_db)):
    tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    db.query(InvoiceTemplate).update({InvoiceTemplate.is_default: False})
    tpl.is_default = True
    db.commit()
    db.refresh(tpl)
    return _serialize_template(tpl)


@router.post("/{template_id}/replace", response_model=TemplateOut)
async def replace_template_file(
    template_id: str,
    file: UploadFile = File(...),
    preserve_mappings: bool = Form(True),
    db: Session = Depends(get_db),
):
    tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    data = await file.read()
    old_file = Path(tpl.file_path)
    old_previews = json.loads(tpl.preview_images_json or "[]")
    existing_map = json.loads(tpl.field_mappings_json or "{}") if preserve_mappings else None

    try:
        meta = process_template_file(
            template_id,
            file.filename or "template",
            data,
            preserve_mappings=existing_map,
        )
    except TemplateValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    for key, val in meta.items():
        setattr(tpl, key, val)
    db.commit()
    db.refresh(tpl)

    # Clean up old files safely
    if old_file.exists() and str(old_file) != tpl.file_path:
        old_file.unlink(missing_ok=True)
    for pv in old_previews:
        pf = PREVIEWS_DIR / pv.get("filename", "")
        pf.unlink(missing_ok=True)

    return _serialize_template(tpl)


@router.delete("/{template_id}")
def delete_template(template_id: str, db: Session = Depends(get_db)):
    tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    was_default = tpl.is_default
    file_path = Path(tpl.file_path)
    previews = json.loads(tpl.preview_images_json or "[]")

    db.delete(tpl)
    db.commit()

    file_path.unlink(missing_ok=True)
    for pv in previews:
        (PREVIEWS_DIR / pv.get("filename", "")).unlink(missing_ok=True)

    if was_default:
        next_tpl = db.query(InvoiceTemplate).order_by(InvoiceTemplate.created_at.desc()).first()
        if next_tpl:
            next_tpl.is_default = True
            db.commit()

    return {"status": "deleted", "id": template_id}


@router.get("/{template_id}/pages/{page_num}")
def get_template_page_image(template_id: str, page_num: int, db: Session = Depends(get_db)):
    tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    previews = json.loads(tpl.preview_images_json or "[]")
    match = next((p for p in previews if int(p.get("page", 0)) == page_num), None)
    if not match:
        raise HTTPException(status_code=404, detail="Template page preview not found")
    img_path = (PREVIEWS_DIR / match["filename"]).resolve()
    if not img_path.exists() or not str(img_path).startswith(str(PREVIEWS_DIR.resolve())):
        raise HTTPException(status_code=404, detail="Preview image missing on disk")
    return FileResponse(img_path, media_type="image/png")


@router.get("/{template_id}/docx-structure")
def get_docx_template_structure(template_id: str, db: Session = Depends(get_db)):
    tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    if tpl.mode != "docx":
        raise HTTPException(status_code=400, detail="Template is not a DOCX template")
    return extract_docx_structure(tpl.file_path)


@router.get("/{template_id}/pdf-widgets")
def get_pdf_embedded_widgets(template_id: str, db: Session = Depends(get_db)):
    """Extract embedded AcroForm text fields from a PDF template if any exist."""
    tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    if tpl.file_type != "pdf":
        return {"widgets": []}

    doc = fitz.open(str(tpl.file_path))
    extracted = []
    try:
        for p_idx, page in enumerate(doc, start=1):
            pw, ph = page.rect.width, page.rect.height
            if pw <= 0 or ph <= 0:
                continue
            for w_idx, w in enumerate(page.widgets() or []):
                name = (w.field_name or f"field_{p_idx}_{w_idx + 1}").strip()
                r = w.rect
                x_pct = round(max(0.0, (r.x0 / pw) * 100.0), 2)
                y_pct = round(max(0.0, (r.y0 / ph) * 100.0), 2)
                w_pct = round(min(100.0 - x_pct, max(2.0, (r.width / pw) * 100.0)), 2)
                h_pct = round(min(100.0 - y_pct, max(1.2, (r.height / ph) * 100.0)), 2)
                label = name.replace("_", " ").title()
                align = "center" if w.text_format == 1 else ("right" if w.text_format == 2 else "left")
                extracted.append({
                    "id": f"pdfw_{p_idx}_{w_idx}_{uuid.uuid4().hex[:4]}",
                    "field_key": name,
                    "label": label,
                    "kind": "text",
                    "page": p_idx,
                    "x_pct": x_pct,
                    "y_pct": y_pct,
                    "w_pct": w_pct,
                    "h_pct": h_pct,
                    "font_size": round(float(w.text_fontsize or 9.0), 1),
                    "font_weight": "bold" if "bold" in (w.text_font or "").lower() or "helvb" in (w.text_font or "").lower() else "normal",
                    "color": "#111827",
                    "align": align,
                    "multiline": bool(w.field_flags & 4096) or h_pct >= 4.0,
                    "bg_color": "",
                })
    finally:
        doc.close()
    return {"widgets": extracted}


@router.post("/{template_id}/locate-label")
def locate_label_position(
    template_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    """Find a matching text label on the template page and return the blank box beside/below it."""
    tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    if tpl.mode != "background":
        return {"found": False}

    page_num = int(payload.get("page", 1))
    field_key = str(payload.get("field_key", ""))
    label = str(payload.get("label", ""))
    existing_fields = payload.get("existing_fields") or []

    previews = json.loads(tpl.preview_images_json or "[]")
    match = next((p for p in previews if int(p.get("page", 0)) == page_num), None)
    if not match:
        return {"found": False}

    prev_path = (PREVIEWS_DIR / match["filename"]).resolve()
    return locate_field_on_template(
        tpl.file_path,
        tpl.file_type,
        prev_path,
        field_key=field_key,
        label=label,
        page_num=page_num,
        existing_fields=existing_fields,
        page_height_pt=float(match.get("height_pt", tpl.page_height_pt)),
    )


@router.post("/{template_id}/detect-style")
def detect_box_style(
    template_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    """Detect matching font size, weight, color, and alignment for a manually drawn box."""
    tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    if tpl.mode != "background":
        return {"font_size": 9.0, "font_weight": "normal", "color": "#111827", "align": "left"}

    page_num = int(payload.get("page", 1))
    previews = json.loads(tpl.preview_images_json or "[]")
    match = next((p for p in previews if int(p.get("page", 0)) == page_num), None)
    if not match:
        return {"font_size": 9.0, "font_weight": "normal", "color": "#111827", "align": "left"}

    prev_path = (PREVIEWS_DIR / match["filename"]).resolve()
    return detect_style_near_box(
        tpl.file_path,
        tpl.file_type,
        prev_path,
        x_pct=float(payload.get("x_pct", 0)),
        y_pct=float(payload.get("y_pct", 0)),
        w_pct=float(payload.get("w_pct", 10)),
        h_pct=float(payload.get("h_pct", 3)),
        field_key=str(payload.get("field_key", "")),
        page_num=page_num,
        page_height_pt=float(match.get("height_pt", tpl.page_height_pt)),
    )


@router.post("/{template_id}/match-styles")
def match_all_field_styles(
    template_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    """Update font_size, font_weight, and color for a list of mapped fields to match nearby template text."""
    tpl = db.query(InvoiceTemplate).filter(InvoiceTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    fields = payload.get("fields") or []
    if tpl.mode != "background":
        return {"fields": fields}

    previews = json.loads(tpl.preview_images_json or "[]")
    updated_fields = []
    for fld in fields:
        p_num = int(fld.get("page", 1))
        match = next((p for p in previews if int(p.get("page", 0)) == p_num), None)
        if not match:
            updated_fields.append(fld)
            continue
        prev_path = (PREVIEWS_DIR / match["filename"]).resolve()
        st = detect_style_near_box(
            tpl.file_path,
            tpl.file_type,
            prev_path,
            x_pct=float(fld.get("x_pct", 0)),
            y_pct=float(fld.get("y_pct", 0)),
            w_pct=float(fld.get("w_pct", 10)),
            h_pct=float(fld.get("h_pct", 3)),
            field_key=str(fld.get("field_key", "")),
            page_num=p_num,
            page_height_pt=float(match.get("height_pt", tpl.page_height_pt)),
        )
        updated_fields.append({
            **fld,
            "font_size": st["font_size"],
            "font_weight": st["font_weight"],
            "color": st["color"],
        })
    return {"fields": updated_fields}

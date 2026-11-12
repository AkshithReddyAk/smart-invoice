import base64
import io
import json
import re
import uuid
import zipfile
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
from docx import Document
from docx.oxml.ns import qn
from PIL import Image, ImageOps

from app.config import (
    ALLOWED_TEMPLATE_EXTENSIONS,
    MAX_UPLOAD_SIZE_BYTES,
    PREVIEWS_DIR,
    TEMPLATES_DIR,
)

PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.\-]+)\s*\}\}")

ITEM_ROW_KEYS = {
    "sl_no",
    "description",
    "item_description",
    "hsn_sac",
    "hsn",
    "quantity",
    "qty",
    "unit",
    "rate",
    "discount",
    "gst_percent",
    "gst_pct",
    "taxable_amount",
    "gst_amount",
    "total_amount",
    "total",
}


class TemplateValidationError(ValueError):
    pass


def sanitize_filename(name: str) -> str:
    base = Path(name or "template").name
    cleaned = re.sub(r"[^A-Za-z0-9._\- ]+", "_", base).strip()
    return cleaned or "template"


def validate_template_bytes(filename: str, data: bytes) -> str:
    if not data:
        raise TemplateValidationError("Uploaded file is empty")
    if len(data) > MAX_UPLOAD_SIZE_BYTES:
        raise TemplateValidationError(
            f"File exceeds maximum allowed size of {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB"
        )

    ext = Path(filename).suffix.lower().lstrip(".")
    if ext not in ALLOWED_TEMPLATE_EXTENSIONS:
        raise TemplateValidationError(
            f"Unsupported file type '.{ext}'. Allowed: PDF, DOCX, PNG, JPG"
        )

    if ext == "pdf":
        if not data.lstrip()[:5].startswith(b"%PDF-"):
            raise TemplateValidationError("Invalid PDF file header")
        try:
            doc = fitz.open(stream=data, filetype="pdf")
            if doc.page_count < 1:
                raise TemplateValidationError("PDF has no pages")
            doc.close()
        except TemplateValidationError:
            raise
        except Exception as exc:
            raise TemplateValidationError(f"Corrupted or unreadable PDF: {exc}") from exc
    elif ext == "png":
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise TemplateValidationError("Invalid PNG file signature")
        try:
            with Image.open(io.BytesIO(data)) as im:
                im.verify()
        except Exception as exc:
            raise TemplateValidationError(f"Corrupted PNG image: {exc}") from exc
    elif ext in ("jpg", "jpeg"):
        if not data.startswith(b"\xff\xd8\xff"):
            raise TemplateValidationError("Invalid JPEG file signature")
        try:
            with Image.open(io.BytesIO(data)) as im:
                im.verify()
        except Exception as exc:
            raise TemplateValidationError(f"Corrupted JPEG image: {exc}") from exc
    elif ext == "docx":
        if not data.startswith(b"PK"):
            raise TemplateValidationError("Invalid DOCX archive signature")
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                if "word/document.xml" not in zf.namelist():
                    raise TemplateValidationError("Invalid DOCX: missing word/document.xml")
            Document(io.BytesIO(data))
        except TemplateValidationError:
            raise
        except Exception as exc:
            raise TemplateValidationError(f"Corrupted DOCX file: {exc}") from exc

    return "jpg" if ext == "jpeg" else ext


def _auto_detect_pdf_fields(doc: fitz.Document) -> dict[str, Any]:
    """Best-effort detection of common invoice label positions on text-based PDFs."""
    label_patterns = [
        (r"invoice\s*no", "invoice_number", "Invoice Number", 18.0, 2.6),
        (r"invoice\s*date|\bdate\s*:", "invoice_date", "Invoice Date", 14.0, 2.6),
        (r"due\s*date", "due_date", "Due Date", 14.0, 2.6),
        (r"customer\s*name|bill\s*to", "customer_name", "Customer Name", 24.0, 2.8),
        (r"billing\s*address|address\s*:", "billing_address", "Billing Address", 26.0, 6.0),
        (r"gstin|gst\s*no", "customer_gstin", "Customer GSTIN", 18.0, 2.6),
        (r"grand\s*total|total\s*invoice\s*value", "grand_total", "Grand Total", 15.0, 2.8),
        (r"amount\s*in\s*words", "amount_in_words", "Amount in Words", 38.0, 4.0),
    ]
    detected = []
    seen_keys = set()
    page = doc[0]
    pw, ph = page.rect.width, page.rect.height
    if pw <= 0 or ph <= 0:
        return {"fields": [], "masks": [], "items_table": {"enabled": False, "columns": []}}

    blocks = page.get_text("blocks")
    for b in blocks:
        x0, y0, x1, y1, text = b[0], b[1], b[2], b[3], (b[4] or "").strip()
        if not text:
            continue
        low = text.lower()
        for pat, key, label, w_pct, h_pct in label_patterns:
            if key in seen_keys:
                continue
            if re.search(pat, low):
                seen_keys.add(key)
                # Place suggested field immediately to the right of the label
                fx = min(90.0, ((x1 + 6) / pw) * 100.0)
                fy = max(0.5, (y0 / ph) * 100.0)
                detected.append({
                    "id": f"auto_{key}",
                    "field_key": key,
                    "label": label,
                    "kind": "text",
                    "page": 1,
                    "x_pct": round(fx, 2),
                    "y_pct": round(fy, 2),
                    "w_pct": min(w_pct, round(98.0 - fx, 2)),
                    "h_pct": h_pct,
                    "font_size": 9.5,
                    "font_weight": "normal",
                    "color": "#111827",
                    "align": "left",
                    "multiline": h_pct > 3.5,
                    "bg_color": "",
                })
                break

    return {
        "fields": detected,
        "masks": [],
        "items_table": {"enabled": False, "page": 1, "y_start_pct": 48.0, "y_end_pct": 72.0, "row_height_pct": 3.2, "font_size": 9.0, "font_weight": "normal", "color": "#111827", "bg_color": "", "show_grid_lines": False, "columns": []},
    }


def _extract_docx_placeholders(doc: Document) -> list[str]:
    found: list[str] = []
    seen = set()

    def scan_text(text: str):
        for m in PLACEHOLDER_RE.finditer(text or ""):
            key = m.group(1).strip()
            if key and key not in seen:
                seen.add(key)
                found.append(key)

    for p in doc.paragraphs:
        scan_text(p.text)
    for tbl in doc.tables:
        for row in tbl.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    scan_text(p.text)
    for section in doc.sections:
        for hdr_ftr in (section.header, section.footer):
            for p in hdr_ftr.paragraphs:
                scan_text(p.text)
            for tbl in hdr_ftr.tables:
                for row in tbl.rows:
                    for cell in row.cells:
                        for p in cell.paragraphs:
                            scan_text(p.text)
    return found


def _emu_to_pt(val) -> float:
    if val is None:
        return 0.0
    return round(float(val) / 12700.0, 2)


def _extract_run_style(run, part) -> dict[str, Any]:
    font = run.font
    color_hex = "#111827"
    if font.color and font.color.rgb:
        color_hex = f"#{font.color.rgb}"
    size_pt = _emu_to_pt(font.size) if font.size else 10.0
    if size_pt <= 0:
        size_pt = 10.0

    # Check inline drawings (images/logos) inside this run
    images = []
    for blip in run._r.xpath(".//*[local-name()='blip']"):
        r_id = blip.get(qn("r:embed"))
        if r_id and part and r_id in part.related_parts:
            img_part = part.related_parts[r_id]
            ctype = getattr(img_part, "content_type", "image/png")
            b64 = base64.b64encode(img_part.blob).decode("ascii")
            # Try getting extent width/height
            ext_els = run._r.xpath(".//*[local-name()='extent']")
            w_pt, h_pt = 90.0, 45.0
            if ext_els:
                cx = ext_els[0].get("cx")
                cy = ext_els[0].get("cy")
                if cx and cy:
                    w_pt = round(int(cx) / 12700.0, 2)
                    h_pt = round(int(cy) / 12700.0, 2)
            images.append({
                "data_uri": f"data:{ctype};base64,{b64}",
                "content_type": ctype,
                "width_pt": w_pt,
                "height_pt": h_pt,
            })

    return {
        "text": run.text or "",
        "bold": bool(run.bold),
        "italic": bool(run.italic),
        "underline": bool(run.underline),
        "font_size_pt": size_pt,
        "font_name": font.name or "Helvetica",
        "color": color_hex,
        "images": images,
    }


def _extract_paragraph_dict(p, part) -> dict[str, Any]:
    align_map = {0: "left", 1: "center", 2: "right", 3: "justify"}
    align = align_map.get(p.alignment, "left") if p.alignment is not None else "left"
    pf = p.paragraph_format
    space_before = _emu_to_pt(pf.space_before) if pf.space_before else 0.0
    space_after = _emu_to_pt(pf.space_after) if pf.space_after else 3.0
    return {
        "type": "paragraph",
        "align": align,
        "space_before_pt": space_before,
        "space_after_pt": space_after,
        "runs": [_extract_run_style(r, part) for r in p.runs],
        "raw_text": p.text or "",
    }


def _get_cell_shading(cell) -> str:
    shd = cell._tc.xpath("./*[local-name()='tcPr']/*[local-name()='shd']")
    if shd:
        fill = shd[0].get(qn("w:fill"))
        if fill and fill.lower() not in ("auto", "ffffff", "none"):
            return f"#{fill}"
    return ""


def _has_table_borders(table) -> bool:
    tbl_pr = table._tbl.xpath("./*[local-name()='tblPr']/*[local-name()='tblBorders']")
    if not tbl_pr:
        return True
    for child in tbl_pr[0]:
        val = child.get(qn("w:val"))
        if val and val != "none" and val != "nil":
            return True
    return False


def extract_docx_structure(file_path: str | Path) -> dict[str, Any]:
    """Extract ordered paragraphs, tables, styles, margins, and embedded images from a DOCX file."""
    doc = Document(str(file_path))
    section = doc.sections[0]
    page_w = _emu_to_pt(section.page_width) or 595.28
    page_h = _emu_to_pt(section.page_height) or 841.89
    margin_top = _emu_to_pt(section.top_margin) or 36.0
    margin_bottom = _emu_to_pt(section.bottom_margin) or 36.0
    margin_left = _emu_to_pt(section.left_margin) or 36.0
    margin_right = _emu_to_pt(section.right_margin) or 36.0

    # Walk body children in exact document order
    body_blocks = []
    para_map = {p._p: p for p in doc.paragraphs}
    table_map = {t._tbl: t for t in doc.tables}

    for child in doc.element.body:
        if child in para_map:
            body_blocks.append(_extract_paragraph_dict(para_map[child], doc.part))
        elif child in table_map:
            tbl = table_map[child]
            rows_data = []
            col_widths = []
            if tbl.columns:
                col_widths = [_emu_to_pt(col.width) for col in tbl.columns]

            for r_idx, row in enumerate(tbl.rows):
                cells_data = []
                row_text_combined = " ".join(c.text for c in row.cells)
                tokens = {m.group(1).strip().lower() for m in PLACEHOLDER_RE.finditer(row_text_combined)}
                is_item_row = bool(tokens & ITEM_ROW_KEYS)
                for c_idx, cell in enumerate(row.cells):
                    w_pt = _emu_to_pt(cell.width) if cell.width else (
                        col_widths[c_idx] if c_idx < len(col_widths) else 0.0
                    )
                    cells_data.append({
                        "width_pt": w_pt,
                        "bg_color": _get_cell_shading(cell),
                        "paragraphs": [_extract_paragraph_dict(p, doc.part) for p in cell.paragraphs],
                    })
                rows_data.append({
                    "row_index": r_idx,
                    "is_item_row": is_item_row,
                    "cells": cells_data,
                })

            body_blocks.append({
                "type": "table",
                "has_borders": _has_table_borders(tbl),
                "col_widths_pt": col_widths,
                "rows": rows_data,
            })

    header_blocks = [
        _extract_paragraph_dict(p, section.header.part)
        for p in section.header.paragraphs
        if p.text.strip() or p._p.xpath(".//*[local-name()='blip']")
    ]
    footer_blocks = [
        _extract_paragraph_dict(p, section.footer.part)
        for p in section.footer.paragraphs
        if p.text.strip() or p._p.xpath(".//*[local-name()='blip']")
    ]

    return {
        "page_width_pt": page_w,
        "page_height_pt": page_h,
        "margin_top_pt": margin_top,
        "margin_bottom_pt": margin_bottom,
        "margin_left_pt": margin_left,
        "margin_right_pt": margin_right,
        "header_blocks": header_blocks,
        "footer_blocks": footer_blocks,
        "blocks": body_blocks,
    }


def process_template_file(
    template_id: str,
    original_filename: str,
    data: bytes,
    preserve_mappings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Validate, persist, and generate previews/metadata for an uploaded template."""
    ext = validate_template_bytes(original_filename, data)
    safe_name = sanitize_filename(original_filename)
    stored_filename = f"{template_id}_{uuid.uuid4().hex[:8]}.{ext}"
    stored_path = TEMPLATES_DIR / stored_filename
    stored_path.write_bytes(data)

    preview_images: list[dict[str, Any]] = []
    docx_placeholders: list[str] = []
    page_width_pt = 595.28
    page_height_pt = 841.89
    page_count = 1
    mode = "docx" if ext == "docx" else "background"
    field_mappings: dict[str, Any] = preserve_mappings or {
        "fields": [],
        "masks": [],
        "items_table": {
            "enabled": False,
            "page": 1,
            "y_start_pct": 48.0,
            "y_end_pct": 72.0,
            "row_height_pct": 3.2,
            "font_size": 9.0,
            "font_weight": "normal",
            "color": "#111827",
            "bg_color": "",
            "show_grid_lines": False,
            "columns": [],
        },
    }

    if ext == "pdf":
        doc = fitz.open(str(stored_path))
        page_count = doc.page_count
        page_width_pt = float(doc[0].rect.width)
        page_height_pt = float(doc[0].rect.height)
        for idx, page in enumerate(doc, start=1):
            pix = page.get_pixmap(dpi=180, alpha=False)
            prev_name = f"{template_id}_p{idx}_{uuid.uuid4().hex[:6]}.png"
            prev_path = PREVIEWS_DIR / prev_name
            pix.save(str(prev_path))
            preview_images.append({
                "page": idx,
                "filename": prev_name,
                "width_pt": float(page.rect.width),
                "height_pt": float(page.rect.height),
                "width_px": pix.width,
                "height_px": pix.height,
            })
        doc.close()

    elif ext in ("png", "jpg"):
        with Image.open(stored_path) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            w_px, h_px = im.size
            prev_name = f"{template_id}_p1_{uuid.uuid4().hex[:6]}.png"
            prev_path = PREVIEWS_DIR / prev_name
            im.save(prev_path, format="PNG")
            page_width_pt = 595.28
            page_height_pt = round(595.28 * (h_px / max(1, w_px)), 2)
            preview_images.append({
                "page": 1,
                "filename": prev_name,
                "width_pt": page_width_pt,
                "height_pt": page_height_pt,
                "width_px": w_px,
                "height_px": h_px,
            })

    elif ext == "docx":
        doc = Document(str(stored_path))
        docx_placeholders = _extract_docx_placeholders(doc)
        struct = extract_docx_structure(stored_path)
        page_width_pt = struct["page_width_pt"]
        page_height_pt = struct["page_height_pt"]

    return {
        "file_type": ext,
        "mode": mode,
        "original_filename": safe_name,
        "file_path": str(stored_path),
        "preview_images_json": json.dumps(preview_images),
        "page_width_pt": page_width_pt,
        "page_height_pt": page_height_pt,
        "page_count": page_count,
        "field_mappings_json": json.dumps(field_mappings),
        "docx_placeholders_json": json.dumps(docx_placeholders),
    }

import base64
import copy
import html
import io
import json
import re
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
from docx import Document
from docx.shared import Inches, Pt
from docx.table import _Row
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    Image as RLImage,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.config import INVOICES_DIR
from app.services.template_processor import (
    ITEM_ROW_KEYS,
    PLACEHOLDER_RE,
    extract_docx_structure,
)

A4_WIDTH_PT, A4_HEIGHT_PT = 595.28, 841.89


def _hex_to_rgb01(hex_color: str) -> tuple[float, float, float]:
    c = (hex_color or "#111827").strip().lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    if len(c) != 6:
        return (0.07, 0.09, 0.15)
    try:
        return (
            int(c[0:2], 16) / 255.0,
            int(c[2:4], 16) / 255.0,
            int(c[4:6], 16) / 255.0,
        )
    except ValueError:
        return (0.07, 0.09, 0.15)


def _fmt_num(val: float) -> str:
    return f"{float(val):,.2f}"


def _fmt_qty(val: float) -> str:
    f = float(val)
    return str(int(f)) if f.is_integer() else f"{f:g}"


def build_field_value_map(invoice_dict: dict[str, Any]) -> dict[str, str]:
    comp = invoice_dict.get("company_details") or {}
    extra = invoice_dict.get("extra_fields") or {}

    inv_date_str = str(invoice_dict.get("invoice_date", ""))
    display_date = inv_date_str
    if len(inv_date_str) == 10 and inv_date_str[4] == "-" and inv_date_str[7] == "-":
        y, m, d = inv_date_str.split("-")
        display_date = f"{d}/{m}/{y}"

    mapping = {
        # Company
        "company_name": str(comp.get("company_name", "")),
        "company_address": str(comp.get("company_address", "")),
        "company_gstin": str(comp.get("gstin", "")),
        "gstin": str(comp.get("gstin", "")),
        "company_pan": str(comp.get("pan_number", "")),
        "pan_number": str(comp.get("pan_number", "")),
        "company_phone": str(comp.get("phone", "")),
        "company_email": str(comp.get("email", "")),
        "company_website": str(comp.get("website", "")),
        # Invoice
        "invoice_number": str(invoice_dict.get("invoice_number", "")),
        "invoice_no": str(invoice_dict.get("invoice_number", "")),
        "invoice_date": display_date or inv_date_str,
        "display_date": display_date or inv_date_str,
        "date": display_date or inv_date_str,
        "due_date": str(invoice_dict.get("due_date", "")),
        "place_of_supply": str(invoice_dict.get("place_of_supply", "")),
        "payment_terms": str(invoice_dict.get("payment_terms", "")),
        "po_number": str(invoice_dict.get("po_number", "")),
        # Customer
        "customer_name": str(invoice_dict.get("customer_name", "")),
        "bill_to": str(invoice_dict.get("customer_name", "")),
        "ship_to": str(invoice_dict.get("customer_name", "")),
        "billing_address": str(invoice_dict.get("billing_address", "")),
        "shipping_address": str(invoice_dict.get("shipping_address", "") or invoice_dict.get("billing_address", "")),
        "customer_gstin": str(invoice_dict.get("customer_gstin", "")),
        "customer_phone": str(invoice_dict.get("customer_phone", "")),
        "customer_email": str(invoice_dict.get("customer_email", "")),
    }
    # Totals — avoid injecting "0.00" when user is filling custom fields without item pricing
    has_priced_items = any(float(it.get("rate", 0)) > 0 for it in (invoice_dict.get("items") or []))
    summary_map = {
        "subtotal": _fmt_num(invoice_dict.get("subtotal", 0.0)) if has_priced_items else "",
        "discount_total": _fmt_num(invoice_dict.get("discount_total", 0.0)) if has_priced_items else "",
        "discount": _fmt_num(invoice_dict.get("discount_total", 0.0)) if has_priced_items else "",
        "taxable_total": _fmt_num(invoice_dict.get("taxable_total", 0.0)) if has_priced_items else "",
        "taxable": _fmt_num(invoice_dict.get("taxable_total", 0.0)) if has_priced_items else "",
        "cgst_total": _fmt_num(invoice_dict.get("cgst_total", 0.0)) if has_priced_items else "",
        "cgst": _fmt_num(invoice_dict.get("cgst_total", 0.0)) if has_priced_items else "",
        "sgst_total": _fmt_num(invoice_dict.get("sgst_total", 0.0)) if has_priced_items else "",
        "sgst": _fmt_num(invoice_dict.get("sgst_total", 0.0)) if has_priced_items else "",
        "igst_total": _fmt_num(invoice_dict.get("igst_total", 0.0)) if has_priced_items else "",
        "igst": _fmt_num(invoice_dict.get("igst_total", 0.0)) if has_priced_items else "",
        "round_off": _fmt_num(invoice_dict.get("round_off", 0.0)) if has_priced_items else "",
        "grand_total": _fmt_num(invoice_dict.get("grand_total", 0.0)) if has_priced_items else "",
        "total": _fmt_num(invoice_dict.get("grand_total", 0.0)) if has_priced_items else "",
        "amount_in_words": str(invoice_dict.get("amount_in_words", "")) if (has_priced_items or str(invoice_dict.get("amount_in_words", "")).strip() not in ("", "ZERO RUPEES ONLY")) else "",
        "payment_instructions": str(invoice_dict.get("payment_instructions", "")),
        "bank_account_details": str(invoice_dict.get("bank_account_details", "")),
        "upi_id": str(invoice_dict.get("upi_id", "")),
    }
    mapping.update(summary_map)

    for k, v in extra.items():
        sval = str(v)
        if k in mapping and sval == "":
            continue
        mapping[str(k)] = sval
    return mapping


def _item_value_map(item: dict[str, Any]) -> dict[str, str]:
    disc_str = (
        f"{_fmt_qty(item.get('discount', 0))}%"
        if item.get("discount_type") == "percent" and float(item.get("discount", 0)) > 0
        else _fmt_num(item.get("discount", 0))
    )
    return {
        "sl_no": str(item.get("sl_no", "")),
        "description": str(item.get("description", "")),
        "item_description": str(item.get("description", "")),
        "hsn_sac": str(item.get("hsn_sac", "")),
        "hsn": str(item.get("hsn_sac", "")),
        "quantity": _fmt_qty(item.get("quantity", 1)),
        "qty": _fmt_qty(item.get("quantity", 1)),
        "unit": str(item.get("unit", "Nos")),
        "rate": _fmt_num(item.get("rate", 0)),
        "discount": disc_str,
        "gst_percent": f"{_fmt_qty(item.get('gst_percent', 0))}%",
        "gst_pct": f"{_fmt_qty(item.get('gst_percent', 0))}%",
        "taxable_amount": _fmt_num(item.get("taxable_amount", 0)),
        "gst_amount": _fmt_num(item.get("gst_amount", 0)),
        "total_amount": _fmt_num(item.get("total_amount", 0)),
        "total": _fmt_num(item.get("total_amount", 0)),
    }


def _compute_target_rect(src_w: float, src_h: float, paper_size: str) -> tuple[float, float, fitz.Rect]:
    if paper_size == "TEMPLATE":
        return src_w, src_h, fitz.Rect(0, 0, src_w, src_h)
    # Default A4 preserving aspect ratio with neat centering
    margin = 12.0
    avail_w = A4_WIDTH_PT - 2 * margin
    avail_h = A4_HEIGHT_PT - 2 * margin
    scale = min(avail_w / max(1.0, src_w), avail_h / max(1.0, src_h))
    draw_w = src_w * scale
    draw_h = src_h * scale
    x0 = (A4_WIDTH_PT - draw_w) / 2.0
    y0 = (A4_HEIGHT_PT - draw_h) / 2.0
    return A4_WIDTH_PT, A4_HEIGHT_PT, fitz.Rect(x0, y0, x0 + draw_w, y0 + draw_h)


def _draw_wrapped_text(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    fontname: str,
    fontsize: float,
    color: tuple[float, float, float],
    align_code: int,
    multiline: bool,
) -> None:
    if not text:
        return
    # Fit inside rect; if single-line overflows, gently step down font size
    size = fontsize
    if not multiline:
        while size > 5.5:
            tw = fitz.get_text_length(text, fontname=fontname, fontsize=size)
            if tw <= rect.width - 4:
                break
            size -= 0.5
        tw = fitz.get_text_length(text, fontname=fontname, fontsize=size)
        if align_code == 1:
            px = rect.x0 + max(1.0, (rect.width - tw) / 2.0)
        elif align_code == 2:
            px = max(rect.x0 + 1.0, rect.x1 - tw - 3.0)
        else:
            px = rect.x0 + 2.0
        # Vertically center baseline cleanly inside rect
        baseline_y = rect.y0 + (rect.height + size * 0.7) / 2.0
        page.insert_text(
            fitz.Point(px, baseline_y),
            text,
            fontname=fontname,
            fontsize=size,
            color=color,
        )
    else:
        while size > 5.5:
            rc = page.insert_textbox(
                fitz.Rect(rect.x0 + 1, rect.y0 + 1, rect.x1 - 1, rect.y1 - 1),
                text,
                fontname=fontname,
                fontsize=size,
                color=color,
                align=align_code,
            )
            if rc >= 0:
                break
            size -= 0.5


def generate_background_mode_pdf(
    template_path: str | Path,
    template_file_type: str,
    mappings: dict[str, Any],
    invoice_dict: dict[str, Any],
    out_pdf_path: str | Path,
) -> Path:
    """Render Mode A (PDF/PNG/JPG background + mapped overlays + dynamic multi-page item rows) to PDF."""
    paper_size = invoice_dict.get("paper_size", "A4")
    field_values = build_field_value_map(invoice_dict)
    company_logo_path = (invoice_dict.get("company_details") or {}).get("company_logo_path", "")

    # Load source template into a temporary PyMuPDF document
    if template_file_type == "pdf":
        src_doc = fitz.open(str(template_path))
    else:
        src_doc = fitz.open()
        with fitz.open(str(template_path)) as img_doc:
            rect = img_doc[0].rect
            p = src_doc.new_page(width=595.28, height=595.28 * rect.height / max(1.0, rect.width))
            p.insert_image(p.rect, filename=str(template_path))

    out_doc = fitz.open()
    src_p0 = src_doc[0]
    out_w, out_h, draw_rect = _compute_target_rect(src_p0.rect.width, src_p0.rect.height, paper_size)
    scale_factor = draw_rect.width / max(1.0, src_p0.rect.width)

    def create_template_page(src_page_idx: int) -> tuple[int, fitz.Rect]:
        idx = min(src_page_idx, src_doc.page_count - 1)
        sp = src_doc[idx]
        pw, ph, drect = _compute_target_rect(sp.rect.width, sp.rect.height, paper_size)
        op = out_doc.new_page(width=pw, height=ph)
        op.show_pdf_page(drect, src_doc, idx)
        return out_doc.page_count - 1, drect

    # Render base template pages (store page indices, never stale fitz.Page refs)
    rendered_pages: list[tuple[int, fitz.Rect]] = []
    for i in range(src_doc.page_count):
        rendered_pages.append(create_template_page(i))

    def pct_rect(drect: fitz.Rect, x_pct: float, y_pct: float, w_pct: float, h_pct: float) -> fitz.Rect:
        x0 = drect.x0 + (x_pct / 100.0) * drect.width
        y0 = drect.y0 + (y_pct / 100.0) * drect.height
        x1 = x0 + (w_pct / 100.0) * drect.width
        y1 = y0 + (h_pct / 100.0) * drect.height
        return fitz.Rect(x0, y0, x1, y1)

    align_map = {"left": 0, "center": 1, "right": 2}

    # 1. Apply Erase Masks
    for mask in mappings.get("masks", []):
        p_idx = max(0, int(mask.get("page", 1)) - 1)
        if p_idx < len(rendered_pages):
            op_idx, drect = rendered_pages[p_idx]
            op = out_doc[op_idx]
            r = pct_rect(drect, mask["x_pct"], mask["y_pct"], mask["w_pct"], mask["h_pct"])
            rgb = _hex_to_rgb01(mask.get("color", "#FFFFFF"))
            op.draw_rect(r, color=rgb, fill=rgb, width=0)

    # 2. Render Dynamic Items Table (with automatic row wrapping & multi-page overflow!)
    items_cfg = mappings.get("items_table") or {}
    items = invoice_dict.get("items") or []
    if items_cfg.get("enabled") and items_cfg.get("columns") and items:
        tbl_page_idx = max(0, int(items_cfg.get("page", 1)) - 1)
        if tbl_page_idx >= len(rendered_pages):
            tbl_page_idx = 0
        op_idx, drect = rendered_pages[tbl_page_idx]
        op = out_doc[op_idx]

        y_start_pct = float(items_cfg.get("y_start_pct", 48.0))
        y_end_pct = float(items_cfg.get("y_end_pct", 72.0))
        row_h_pct = float(items_cfg.get("row_height_pct", 3.2))
        base_row_h = (row_h_pct / 100.0) * drect.height
        y_cursor = drect.y0 + (y_start_pct / 100.0) * drect.height
        y_limit = drect.y0 + (y_end_pct / 100.0) * drect.height
        font_name = "hebo" if items_cfg.get("font_weight") == "bold" else "helv"
        font_size = float(items_cfg.get("font_size", 9.0)) * scale_factor
        font_size = max(6.0, min(18.0, font_size))
        color = _hex_to_rgb01(items_cfg.get("color", "#111827"))
        bg_hex = items_cfg.get("bg_color", "")
        show_grid = bool(items_cfg.get("show_grid_lines", False))
        columns = items_cfg.get("columns", [])

        # Clear initial table data region if background mask color is set
        if bg_hex and columns:
            min_x = min(c["x_pct"] for c in columns)
            max_x = max(c["x_pct"] + c["w_pct"] for c in columns)
            tbl_bg = pct_rect(drect, min_x, y_start_pct, max_x - min_x, max(0.5, y_end_pct - y_start_pct))
            bg_rgb = _hex_to_rgb01(bg_hex)
            op.draw_rect(tbl_bg, color=bg_rgb, fill=bg_rgb, width=0)

        for item in items:
            iv = _item_value_map(item)
            # Calculate dynamic height needed for wrapped description
            needed_h = base_row_h
            for col in columns:
                val = iv.get(col["key"], "")
                col_w = (col["w_pct"] / 100.0) * drect.width - 4
                if val and col_w > 10:
                    words = val.split()
                    lines = 1
                    cur_w = 0.0
                    space_w = fitz.get_text_length(" ", fontname=font_name, fontsize=font_size)
                    for w in words:
                        ww = fitz.get_text_length(w, fontname=font_name, fontsize=font_size)
                        if cur_w + ww > col_w and cur_w > 0:
                            lines += 1
                            cur_w = ww + space_w
                        else:
                            cur_w += ww + space_w
                    est_h = lines * (font_size * 1.3) + 6
                    if est_h > needed_h:
                        needed_h = est_h

            # Page break if row won't fit
            if y_cursor + needed_h > y_limit and y_cursor > drect.y0 + (y_start_pct / 100.0) * drect.height + 1:
                cont_page = out_doc.new_page(width=op.rect.width, height=op.rect.height)
                rendered_pages.append((out_doc.page_count - 1, fitz.Rect(36, 48, cont_page.rect.width - 36, cont_page.rect.height - 48)))
                op = cont_page
                op.insert_text(
                    fitz.Point(drect.x0 + 12, 36),
                    f"Invoice {invoice_dict.get('invoice_number', '')} — Continued Items",
                    fontname="hebo",
                    fontsize=10,
                    color=(0.15, 0.2, 0.3),
                )
                y_cursor = 58.0
                y_limit = op.rect.height - 48.0
                hdr_h = 20.0
                for col in columns:
                    cx0 = drect.x0 + (col["x_pct"] / 100.0) * drect.width
                    cw = (col["w_pct"] / 100.0) * drect.width
                    hrect = fitz.Rect(cx0, y_cursor, cx0 + cw, y_cursor + hdr_h)
                    op.draw_rect(hrect, color=(0.75, 0.78, 0.82), fill=(0.95, 0.96, 0.98), width=0.5)
                    _draw_wrapped_text(
                        op,
                        hrect,
                        col.get("label") or col["key"].replace("_", " ").title(),
                        "hebo",
                        font_size,
                        (0.1, 0.14, 0.2),
                        align_map.get(col.get("align", "left"), 0),
                        False,
                    )
                y_cursor += hdr_h

            for col in columns:
                cx0 = drect.x0 + (col["x_pct"] / 100.0) * drect.width
                cw = (col["w_pct"] / 100.0) * drect.width
                crect = fitz.Rect(cx0, y_cursor, cx0 + cw, y_cursor + needed_h)
                if show_grid:
                    op.draw_rect(crect, color=(0.78, 0.8, 0.84), width=0.5)
                val = iv.get(col["key"], "")
                _draw_wrapped_text(
                    op,
                    crect,
                    val,
                    font_name,
                    font_size,
                    color,
                    align_map.get(col.get("align", "left"), 0),
                    multiline=True,
                )
            y_cursor += needed_h

    # 3. Render Mapped Field Overlays
    for fld in mappings.get("fields", []):
        p_idx = max(0, int(fld.get("page", 1)) - 1)
        if p_idx >= len(rendered_pages):
            continue
        op_idx, drect = rendered_pages[p_idx]
        op = out_doc[op_idx]
        fld_w_pct = fld["w_pct"]
        if str(fld.get("field_key", "")).lower() in ("date", "invoice_date", "display_date") and fld_w_pct < 13.0:
            fld_w_pct = 13.2
        frect = pct_rect(drect, fld["x_pct"], fld["y_pct"], fld_w_pct, fld["h_pct"])

        bg = fld.get("bg_color", "")
        if bg:
            bg_rgb = _hex_to_rgb01(bg)
            op.draw_rect(frect, color=bg_rgb, fill=bg_rgb, width=0)

        if fld.get("kind") == "image" or fld.get("field_key") == "company_logo":
            if company_logo_path and Path(company_logo_path).exists():
                op.insert_image(frect, filename=str(company_logo_path), keep_proportion=True)
            continue

        val = field_values.get(fld.get("field_key", ""), "")
        if not val:
            continue
        fontname = "hebo" if fld.get("font_weight") == "bold" else "helv"
        fontsize = max(5.5, float(fld.get("font_size", 10.0)) * scale_factor)
        color = _hex_to_rgb01(fld.get("color", "#111827"))
        align_code = align_map.get(fld.get("align", "left"), 0)
        _draw_wrapped_text(
            op,
            frect,
            val,
            fontname,
            fontsize,
            color,
            align_code,
            bool(fld.get("multiline", False)),
        )

    # 4. Page numbering on multi-page documents
    total_pages = out_doc.page_count
    if total_pages > 1:
        for pno, page in enumerate(out_doc, start=1):
            txt = f"Page {pno} of {total_pages}"
            page.insert_text(
                fitz.Point(page.rect.width - 78, page.rect.height - 14),
                txt,
                fontname="helv",
                fontsize=8,
                color=(0.4, 0.45, 0.52),
            )

    out_path = Path(out_pdf_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_doc.save(str(out_path), deflate=True, garbage=3)
    out_doc.close()
    src_doc.close()
    return out_path


# ---------------------------------------------------------------------------
# Mode B: DOCX Template Engine (Preserves formatting + dynamic item rows + A4 PDF)
# ---------------------------------------------------------------------------

def _replace_placeholders_in_paragraph(paragraph, values: dict[str, str], logo_path: str = "") -> None:
    full_text = "".join(r.text for r in paragraph.runs)
    if "{{" not in full_text:
        return

    # Handle logo placeholder
    if "{{company_logo}}" in full_text and logo_path and Path(logo_path).exists():
        for r in paragraph.runs:
            r.text = ""
        run = paragraph.runs[0] if paragraph.runs else paragraph.add_run()
        run.add_picture(str(logo_path), width=Inches(1.3))
        return

    def repl(match):
        key = match.group(1).strip()
        return values.get(key, values.get(key.lower(), ""))

    # Try run-level replacement first to preserve per-run formatting
    replaced_any = False
    for run in paragraph.runs:
        if PLACEHOLDER_RE.search(run.text or ""):
            run.text = PLACEHOLDER_RE.sub(repl, run.text)
            replaced_any = True

    # If a placeholder was split across multiple XML runs, replace across merged text on first run
    remaining = "".join(r.text for r in paragraph.runs)
    if PLACEHOLDER_RE.search(remaining):
        new_text = PLACEHOLDER_RE.sub(repl, remaining)
        if paragraph.runs:
            paragraph.runs[0].text = new_text
            for r in paragraph.runs[1:]:
                r.text = ""
        elif not replaced_any:
            paragraph.text = new_text


def populate_docx_template(
    template_path: str | Path,
    invoice_dict: dict[str, Any],
    out_docx_path: str | Path,
) -> Path:
    doc = Document(str(template_path))
    values = build_field_value_map(invoice_dict)
    items = invoice_dict.get("items") or []
    logo_path = (invoice_dict.get("company_details") or {}).get("company_logo_path", "")

    # 1. Replace body paragraphs
    for p in doc.paragraphs:
        _replace_placeholders_in_paragraph(p, values, logo_path)

    # 2. Replace headers/footers
    for section in doc.sections:
        for hf in (section.header, section.footer):
            for p in hf.paragraphs:
                _replace_placeholders_in_paragraph(p, values, logo_path)
            for tbl in hf.tables:
                for row in tbl.rows:
                    for cell in row.cells:
                        for p in cell.paragraphs:
                            _replace_placeholders_in_paragraph(p, values, logo_path)

    # 3. Replace tables + clone item rows dynamically
    for tbl in doc.tables:
        template_item_rows = []
        for row in tbl.rows:
            row_text = " ".join(c.text for c in row.cells)
            tokens = {m.group(1).strip().lower() for m in PLACEHOLDER_RE.finditer(row_text)}
            if tokens & ITEM_ROW_KEYS:
                template_item_rows.append(row)

        if template_item_rows:
            tpl_row = template_item_rows[0]
            tbl_xml = tbl._tbl
            insert_idx = list(tbl_xml).index(tpl_row._tr)

            for idx, item in enumerate(items):
                new_tr = copy.deepcopy(tpl_row._tr)
                tbl_xml.insert(insert_idx + idx, new_tr)
                row_obj = _Row(new_tr, tbl)
                iv = {**values, **_item_value_map(item)}
                for cell in row_obj.cells:
                    for p in cell.paragraphs:
                        _replace_placeholders_in_paragraph(p, iv, logo_path)

            # Remove the original template placeholder row(s)
            for tr in template_item_rows:
                tbl_xml.remove(tr._tr)

        # Replace non-item rows
        for row in tbl.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    _replace_placeholders_in_paragraph(p, values, logo_path)

    out_path = Path(out_docx_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out_path))
    return out_path


def _runs_to_rl_paragraph(para_dict: dict[str, Any], default_font_size: float = 10.0) -> list[Any]:
    flowables: list[Any] = []
    align_map = {"left": TA_LEFT, "center": TA_CENTER, "right": TA_RIGHT, "justify": TA_JUSTIFY}
    align = align_map.get(para_dict.get("align", "left"), TA_LEFT)

    # Extract images first if present
    for run in para_dict.get("runs", []):
        for img in run.get("images", []):
            uri = img.get("data_uri", "")
            if "," in uri:
                b64 = uri.split(",", 1)[1]
                img_bytes = base64.b64decode(b64)
                w_pt = min(220.0, float(img.get("width_pt", 80.0)))
                h_pt = min(140.0, float(img.get("height_pt", 40.0)))
                rl_img = RLImage(io.BytesIO(img_bytes), width=w_pt, height=h_pt)
                rl_img.hAlign = para_dict.get("align", "LEFT").upper()
                flowables.append(rl_img)

    html_parts: list[str] = []
    max_font_size = default_font_size
    for run in para_dict.get("runs", []):
        txt = run.get("text", "")
        if not txt:
            continue
        fs = float(run.get("font_size_pt", default_font_size))
        max_font_size = max(max_font_size, fs)
        escaped = html.escape(txt).replace("\n", "<br/>")
        color = run.get("color", "#111827")
        styled = f'<font size="{fs:.1f}" color="{color}">{escaped}</font>'
        if run.get("bold"):
            styled = f"<b>{styled}</b>"
        if run.get("italic"):
            styled = f"<i>{styled}</i>"
        if run.get("underline"):
            styled = f"<u>{styled}</u>"
        html_parts.append(styled)

    if html_parts:
        style = ParagraphStyle(
            name="DocxPara",
            fontName="Helvetica",
            fontSize=max_font_size,
            leading=max_font_size * 1.32,
            alignment=align,
            spaceBefore=float(para_dict.get("space_before_pt", 0.0)),
            spaceAfter=float(para_dict.get("space_after_pt", 3.0)),
        )
        flowables.append(Paragraph("".join(html_parts), style))

    return flowables


def generate_docx_mode_pdf(
    template_path: str | Path,
    invoice_dict: dict[str, Any],
    out_pdf_path: str | Path,
    out_docx_path: str | Path,
) -> tuple[Path, Path]:
    """Populate DOCX preserving styles/tables and render to a high-res A4 PDF with page numbers."""
    populated_docx = populate_docx_template(template_path, invoice_dict, out_docx_path)
    struct = extract_docx_structure(populated_docx)

    left_m = max(24.0, min(72.0, float(struct.get("margin_left_pt", 36.0))))
    right_m = max(24.0, min(72.0, float(struct.get("margin_right_pt", 36.0))))
    top_m = max(24.0, min(72.0, float(struct.get("margin_top_pt", 36.0))))
    bottom_m = max(28.0, min(72.0, float(struct.get("margin_bottom_pt", 36.0))))

    out_pdf = Path(out_pdf_path)
    out_pdf.parent.mkdir(parents=True, exist_ok=True)

    avail_w = A4_WIDTH_PT - left_m - right_m
    story: list[Any] = []

    for hb in struct.get("header_blocks", []):
        story.extend(_runs_to_rl_paragraph(hb, 9.5))

    for blk in struct.get("blocks", []):
        if blk["type"] == "paragraph":
            flows = _runs_to_rl_paragraph(blk, 10.0)
            if flows:
                story.extend(flows)
            else:
                story.append(Spacer(1, 6))
        elif blk["type"] == "table":
            rows = blk.get("rows", [])
            if not rows:
                continue
            raw_widths = blk.get("col_widths_pt") or []
            num_cols = max(len(r["cells"]) for r in rows)
            if len(raw_widths) != num_cols or sum(raw_widths) <= 0:
                col_widths = [avail_w / max(1, num_cols)] * num_cols
            else:
                total_rw = sum(raw_widths)
                col_widths = [avail_w * (w / total_rw) for w in raw_widths]

            table_data = []
            style_cmds = [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
            if blk.get("has_borders", True):
                style_cmds.append(("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#334155")))

            for r_idx, row in enumerate(rows):
                row_cells = []
                for c_idx, cell in enumerate(row["cells"]):
                    cell_flows: list[Any] = []
                    for cp in cell.get("paragraphs", []):
                        cell_flows.extend(_runs_to_rl_paragraph(cp, 9.5))
                    row_cells.append(cell_flows if cell_flows else "")
                    if cell.get("bg_color"):
                        try:
                            style_cmds.append(
                                ("BACKGROUND", (c_idx, r_idx), (c_idx, r_idx), colors.HexColor(cell["bg_color"]))
                            )
                        except Exception:
                            pass
                table_data.append(row_cells)

            repeat_rows = 1 if len(rows) > 2 else 0
            rl_table = Table(table_data, colWidths=col_widths, repeatRows=repeat_rows)
            rl_table.setStyle(TableStyle(style_cmds))
            story.append(rl_table)
            story.append(Spacer(1, 6))

    for fb in struct.get("footer_blocks", []):
        story.extend(_runs_to_rl_paragraph(fb, 9.0))

    if not story:
        story.append(Paragraph(f"Invoice {invoice_dict.get('invoice_number', '')}", ParagraphStyle("Empty", fontSize=11)))

    def _draw_page_num(canvas_obj, doc_obj):
        canvas_obj.saveState()
        canvas_obj.setFont("Helvetica", 8)
        canvas_obj.setFillColor(colors.HexColor("#64748B"))
        canvas_obj.drawRightString(A4_WIDTH_PT - right_m, 16, f"Page {doc_obj.page}")
        canvas_obj.restoreState()

    doc_tpl = SimpleDocTemplate(
        str(out_pdf),
        pagesize=A4,
        leftMargin=left_m,
        rightMargin=right_m,
        topMargin=top_m,
        bottomMargin=bottom_m,
        title=f"Invoice {invoice_dict.get('invoice_number', '')}",
    )
    doc_tpl.build(story, onFirstPage=_draw_page_num, onLaterPages=_draw_page_num)
    return out_pdf, populated_docx


def render_populated_docx_structure(template_path: str | Path, invoice_dict: dict[str, Any]) -> dict[str, Any]:
    """Produce live DOCX structure with current form values substituted (for instant Split-Screen Live Preview)."""
    struct = extract_docx_structure(template_path)
    values = build_field_value_map(invoice_dict)
    items = invoice_dict.get("items") or []

    def sub_text(txt: str, row_vals: dict[str, str]) -> str:
        return PLACEHOLDER_RE.sub(lambda m: row_vals.get(m.group(1).strip(), row_vals.get(m.group(1).strip().lower(), "")), txt or "")

    def sub_para(p: dict[str, Any], row_vals: dict[str, str]) -> dict[str, Any]:
        new_runs = []
        full = "".join(r["text"] for r in p.get("runs", []))
        if PLACEHOLDER_RE.search(full):
            # Substitute smoothly while keeping first run's style if split across runs
            any_single = any(PLACEHOLDER_RE.search(r["text"]) for r in p["runs"])
            if any_single:
                for r in p["runs"]:
                    nr = dict(r)
                    nr["text"] = sub_text(r["text"], row_vals)
                    new_runs.append(nr)
            else:
                for idx, r in enumerate(p["runs"]):
                    nr = dict(r)
                    nr["text"] = sub_text(full, row_vals) if idx == 0 else ""
                    new_runs.append(nr)
        else:
            new_runs = p.get("runs", [])
        return {**p, "runs": new_runs, "raw_text": sub_text(p.get("raw_text", ""), row_vals)}

    new_blocks = []
    for blk in struct.get("blocks", []):
        if blk["type"] == "paragraph":
            new_blocks.append(sub_para(blk, values))
        elif blk["type"] == "table":
            new_rows = []
            for row in blk.get("rows", []):
                if row.get("is_item_row"):
                    for item in items:
                        iv = {**values, **_item_value_map(item)}
                        new_cells = [
                            {**cell, "paragraphs": [sub_para(cp, iv) for cp in cell.get("paragraphs", [])]}
                            for cell in row["cells"]
                        ]
                        new_rows.append({**row, "cells": new_cells})
                else:
                    new_cells = [
                        {**cell, "paragraphs": [sub_para(cp, values) for cp in cell.get("paragraphs", [])]}
                        for cell in row["cells"]
                    ]
                    new_rows.append({**row, "cells": new_cells})
            new_blocks.append({**blk, "rows": new_rows})

    struct["header_blocks"] = [sub_para(hb, values) for hb in struct.get("header_blocks", [])]
    struct["footer_blocks"] = [sub_para(fb, values) for fb in struct.get("footer_blocks", [])]
    struct["blocks"] = new_blocks
    return struct

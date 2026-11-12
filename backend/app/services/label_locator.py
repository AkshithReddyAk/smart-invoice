import re
from pathlib import Path
from typing import Any

import fitz
import numpy as np
from PIL import Image

_OCR_INSTANCE = None
_PAGE_OCR_CACHE: dict[str, list[dict[str, Any]]] = {}

LABEL_ALIASES: dict[str, list[str]] = {
    "invoice_number": ["invoice no", "invoice number", "inv no", "bill no"],
    "invoice_no": ["invoice no", "invoice number", "inv no"],
    "invoice_date": ["invoice date", "date"],
    "date": ["date", "invoice date"],
    "due_date": ["due date"],
    "place_of_supply": ["place of supply"],
    "payment_terms": ["payment terms", "terms"],
    "po_number": ["order id no", "purchase order", "po no", "po number"],
    "customer_name": ["bill to", "customer name", "party name", "name"],
    "billing_address": ["address", "billing address"],
    "shipping_address": ["shipping address", "address"],
    "customer_gstin": ["gst no", "gstin"],
    "customer_phone": ["contact no", "phone", "mobile"],
    "customer_email": ["mail id", "email", "e-mail"],
    "subtotal": ["subtotal", "sub total"],
    "discount_total": ["discount", "offer/discount"],
    "taxable_total": ["taxable", "taxable value", "taxable amount"],
    "cgst_total": ["cgst"],
    "sgst_total": ["sgst"],
    "igst_total": ["igst"],
    "round_off": ["round off"],
    "grand_total": ["total value", "grand total", "total invoice value", "net total"],
    "amount_in_words": ["amount in words", "in words"],
    "payment_instructions": ["payment instructions"],
    "bank_account_details": ["bank", "account"],
    "upi_id": ["upi"],
}


def _get_ocr():
    global _OCR_INSTANCE
    if _OCR_INSTANCE is None:
        from rapidocr_onnxruntime import RapidOCR
        _OCR_INSTANCE = RapidOCR()
    return _OCR_INSTANCE


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def extract_page_labels(
    template_file_path: str | Path,
    template_file_type: str,
    preview_image_path: str | Path,
    page_num: int = 1,
) -> list[dict[str, Any]]:
    cache_key = f"{preview_image_path}:{page_num}"
    if cache_key in _PAGE_OCR_CACHE:
        return _PAGE_OCR_CACHE[cache_key]

    labels: list[dict[str, Any]] = []

    # 1. Try native vector PDF text first (instant & exact if PDF is text-based, including font metadata!)
    if template_file_type == "pdf":
        try:
            doc = fitz.open(str(template_file_path))
            if 1 <= page_num <= doc.page_count:
                page = doc[page_num - 1]
                pw, ph = page.rect.width, page.rect.height
                if pw > 0 and ph > 0:
                    tdict = page.get_text("dict")
                    for blk in tdict.get("blocks", []):
                        if blk.get("type") != 0:
                            continue
                        for line in blk.get("lines", []):
                            spans = [s for s in line.get("spans", []) if (s.get("text") or "").strip()]
                            if not spans:
                                continue
                            txt = " ".join(s["text"].strip() for s in spans).strip()
                            bbox = line.get("bbox", blk.get("bbox"))
                            # Take dominant span's font size, bold flag, color
                            dom = max(spans, key=lambda s: len(s.get("text", "")))
                            c_int = int(dom.get("color", 0))
                            r = (c_int >> 16) & 0xFF
                            g = (c_int >> 8) & 0xFF
                            b_col = c_int & 0xFF
                            hex_col = f"#{r:02x}{g:02x}{b_col:02x}"
                            if max(r, g, b_col) < 55 and max(r, g, b_col) - min(r, g, b_col) < 20:
                                hex_col = "#111827"
                            is_bold = bool(int(dom.get("flags", 0)) & 16) or (
                                "bold" in str(dom.get("font", "")).lower()
                            )
                            labels.append({
                                "text": txt,
                                "norm": _norm(txt),
                                "x0": (bbox[0] / pw) * 100.0,
                                "y0": (bbox[1] / ph) * 100.0,
                                "x1": (bbox[2] / pw) * 100.0,
                                "y1": (bbox[3] / ph) * 100.0,
                                "font_size": round(max(6.0, min(36.0, float(dom.get("size", 9.5)))), 1),
                                "font_weight": "bold" if is_bold else "normal",
                                "color": hex_col,
                            })
            doc.close()
        except Exception:
            pass

    # 2. Fall back to RapidOCR on the rendered preview PNG for scanned PDFs & images
    if not labels and Path(preview_image_path).exists():
        ocr = _get_ocr()
        with Image.open(preview_image_path) as im:
            w_px, h_px = im.size
        res, _ = ocr(str(preview_image_path))
        for box, txt, _conf in (res or []):
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            labels.append({
                "text": txt,
                "norm": _norm(txt),
                "x0": (min(xs) / max(1, w_px)) * 100.0,
                "y0": (min(ys) / max(1, h_px)) * 100.0,
                "x1": (max(xs) / max(1, w_px)) * 100.0,
                "y1": (max(ys) / max(1, h_px)) * 100.0,
            })

    _PAGE_OCR_CACHE[cache_key] = labels
    return labels


def _infer_style_from_image(
    preview_image_path: str | Path,
    page_height_pt: float,
    lbl: dict[str, Any],
) -> dict[str, Any]:
    """Measure font size (pt), bold vs normal weight, and ink color directly from template label pixels."""
    if "font_size" in lbl and "font_weight" in lbl and "color" in lbl:
        return {
            "font_size": lbl["font_size"],
            "font_weight": lbl["font_weight"],
            "color": lbl["color"],
        }

    default_style = {"font_size": 8.5, "font_weight": "normal", "color": "#111827"}
    if not Path(preview_image_path).exists():
        return default_style

    with Image.open(preview_image_path) as im:
        rgb = np.array(im.convert("RGB"))
    h_px, w_px, _ = rgb.shape
    gray = rgb.mean(axis=2)

    x0 = max(0, int(lbl["x0"] / 100.0 * w_px))
    x1 = min(w_px, int(lbl["x1"] / 100.0 * w_px))
    y0 = max(0, int(lbl["y0"] / 100.0 * h_px))
    y1 = min(h_px, int(lbl["y1"] / 100.0 * h_px))
    if x1 <= x0 + 2 or y1 <= y0 + 2:
        return default_style

    crop_g = gray[y0:y1, x0:x1]
    crop_rgb = rgb[y0:y1, x0:x1]
    # Estimate local background brightness (e.g. white or peach header)
    bg_lum = float(np.percentile(crop_g, 90))
    ink_thresh = min(195.0, bg_lum - 30.0)
    ink_mask = crop_g < ink_thresh
    if not ink_mask.any():
        return default_style

    # Exclude table border lines (>= 85% full-width horizontal dark lines)
    non_border_rows = np.where(ink_mask.any(axis=1) & (ink_mask.mean(axis=1) < 0.85))[0]
    rows_with_ink = non_border_rows if len(non_border_rows) else np.where(ink_mask.any(axis=1))[0]
    ink_span_px = float(rows_with_ink[-1] - rows_with_ink[0] + 1) if len(rows_with_ink) else float(y1 - y0)
    pt_per_px = (page_height_pt or 841.89) / max(1.0, float(h_px))
    ink_pt = ink_span_px * pt_per_px

    txt = lbl.get("text", "")
    has_descenders = any(ch in txt for ch in "gjpqy,;")
    divisor = 0.84 if has_descenders else 0.65
    est_pt = round(max(7.5, min(28.0, (ink_pt / divisor) * 2.0) / 2.0), 1)
    # Clamp to sensible label height if OCR box included extra padding
    box_pt = (y1 - y0) * pt_per_px
    if est_pt > box_pt * 1.25:
        est_pt = round(max(7.5, box_pt * 0.95), 1)

    # Stroke width vs ink height to classify bold vs normal
    runs: list[int] = []
    for r in rows_with_ink:
        c = 0
        for v in ink_mask[r]:
            if v:
                c += 1
            elif c:
                runs.append(c)
                c = 0
        if c:
            runs.append(c)
    med_stroke = float(np.median(runs)) if runs else 1.5
    stroke_ratio = med_stroke / max(1.0, ink_span_px)
    font_weight = "bold" if stroke_ratio >= 0.16 else "normal"

    # Sample core (darkest 35%) ink pixels so anti-aliased edge gray doesn't wash out color
    ink_vals = crop_g[ink_mask]
    cutoff = float(np.percentile(ink_vals, 35))
    core_mask = ink_mask & (crop_g <= cutoff)
    med_rgb = np.median(crop_rgb[core_mask], axis=0).astype(int)
    r_c, g_c, b_c = int(med_rgb[0]), int(med_rgb[1]), int(med_rgb[2])
    # Snap near-black scanned ink cleanly to crisp #111827
    if max(r_c, g_c, b_c) < 75 and (max(r_c, g_c, b_c) - min(r_c, g_c, b_c)) < 25:
        hex_col = "#111827"
    else:
        hex_col = f"#{r_c:02x}{g_c:02x}{b_c:02x}"

    return {
        "font_size": est_pt,
        "font_weight": font_weight,
        "color": hex_col,
    }


def _infer_alignment(field_key: str, placement: str, w_pct: float) -> str:
    kl = (field_key or "").lower()
    if any(tok in kl for tok in ("taxable", "cgst", "sgst", "igst", "discount", "subtotal", "round_off", "subsidy", "total_value")):
        return "right"
    if placement == "below":
        return "center"
    if placement == "beside_cell" and w_pct <= 18.0:
        return "center"
    return "left"


def _find_best_box_near_label(
    preview_image_path: str | Path,
    lbl: dict[str, Any],
    all_labels: list[dict[str, Any]],
) -> tuple[float, float, float, float, str, bool]:
    """Given a matched label's % box, detect whether its blank target cell is beside (right) or below.
    Returns (x_pct, y_pct, w_pct, h_pct, placement, is_clean_empty).
    """
    lx0, ly0, lx1, ly1 = lbl["x0"], lbl["y0"], lbl["x1"], lbl["y1"]
    lh = max(1.2, ly1 - ly0)

    right_neighbors = [
        other for other in all_labels
        if other is not lbl
        and abs(((other["y0"] + other["y1"]) / 2.0) - ((ly0 + ly1) / 2.0)) < 1.8
        and other["x0"] > lx1
    ]
    right_neighbors.sort(key=lambda o: o["x0"])
    nearest_right = right_neighbors[0] if right_neighbors else None

    same_row_siblings = [
        other for other in all_labels
        if other is not lbl
        and abs(other["y0"] - ly0) < 1.6
    ]
    if Path(preview_image_path).exists():
        with Image.open(preview_image_path) as im:
            gray = np.array(im.convert("L"))
        h_px, w_px = gray.shape
        dark = gray < 130

        cy_px = int(((ly0 + ly1) / 2.0) / 100.0 * h_px)
        cx_px = int(((lx0 + lx1) / 2.0) / 100.0 * w_px)
        rx_start = int((lx1 / 100.0) * w_px) + 4

        v_borders = []
        scan_y0 = max(0, cy_px - int(0.015 * h_px))
        scan_y1 = min(h_px, cy_px + int(0.015 * h_px))
        if scan_y1 > scan_y0:
            col_density = dark[scan_y0:scan_y1, :].mean(axis=0)
            x = rx_start
            while x < w_px - 4:
                if col_density[x] > 0.7:
                    x_end = x
                    while x_end + 1 < w_px and col_density[x_end + 1] > 0.7:
                        x_end += 1
                    v_borders.append((x, x_end))
                    x = x_end + 1
                else:
                    x += 1

        top_y = max(0, cy_px - int(0.05 * h_px))
        for y in range(cy_px - 2, max(0, cy_px - int(0.12 * h_px)), -1):
            if dark[y, max(0, cx_px - 20):min(w_px, cx_px + 20)].mean() > 0.7:
                top_y = y + 2
                break

        bot_y = min(h_px, cy_px + int(0.05 * h_px))
        for y in range(cy_px + 2, min(h_px, cy_px + int(0.12 * h_px))):
            if dark[y, max(0, cx_px - 20):min(w_px, cx_px + 20)].mean() > 0.7:
                bot_y = y - 2
                break

        if v_borders:
            first_vx0, first_vx1 = v_borders[0]
            first_vx_pct = (first_vx0 / w_px) * 100.0
            gap_same_cell_pct = first_vx_pct - lx1
            has_label_before_first_v = any(
                o["x0"] < first_vx_pct - 0.5 for o in right_neighbors
            )

            if gap_same_cell_pct >= 6.0 and not has_label_before_first_v:
                rx0 = lx1 + 0.6
                rx1 = first_vx_pct - 0.4
                ry0 = max(0.0, ly0 - 0.4)
                ry1 = min(100.0, ly1 + 0.5)
                return (
                    round(rx0, 2),
                    round(ry0, 2),
                    round(max(4.0, rx1 - rx0), 2),
                    round(max(2.0, ry1 - ry0), 2),
                    "beside",
                    True,
                )

            if len(v_borders) >= 2:
                next_cx0 = (first_vx1 / w_px) * 100.0 + 0.4
                next_cx1 = (v_borders[1][0] / w_px) * 100.0 - 0.4
                next_cell_occupied = any(
                    o["x0"] >= next_cx0 - 1.5 and o["x0"] <= next_cx1 - 0.5
                    for o in right_neighbors
                )
                if (next_cx1 - next_cx0) >= 4.0 and not next_cell_occupied:
                    ry0 = max(0.0, (top_y / h_px) * 100.0 + 0.3)
                    ry1 = min(100.0, (bot_y / h_px) * 100.0 - 0.3)
                    return (
                        round(next_cx0, 2),
                        round(ry0, 2),
                        round(next_cx1 - next_cx0, 2),
                        round(max(2.0, ry1 - ry0), 2),
                        "beside_cell",
                        True,
                    )

        if len(same_row_siblings) >= 3:
            by0 = min(96.0, (bot_y / h_px) * 100.0 + 0.5)
            # Check if below cell is occupied by another label
            below_occupied = any(
                o["y0"] > ly1 and o["y0"] < by0 + 3.0 and abs(o["x0"] - lx0) < 6.0
                for o in all_labels
            )
            return (
                round(max(0.5, lx0 - 1.0), 2),
                round(by0, 2),
                round(max(6.0, (lx1 - lx0) + 2.0), 2),
                2.8,
                "below",
                not below_occupied,
            )

    rx0 = min(85.0, lx1 + 0.8)
    max_w = (nearest_right["x0"] - rx0 - 0.8) if nearest_right else (92.0 - rx0)
    rw = max(6.0, min(22.0, max_w))
    return (
        round(rx0, 2),
        round(max(0.5, ly0 - 0.3), 2),
        round(rw, 2),
        round(max(2.2, lh + 0.6), 2),
        "beside",
        True,
    )


def locate_field_on_template(
    template_file_path: str | Path,
    template_file_type: str,
    preview_image_path: str | Path,
    field_key: str,
    label: str = "",
    page_num: int = 1,
    existing_fields: list[dict[str, Any]] | None = None,
    page_height_pt: float = 841.89,
) -> dict[str, Any]:
    all_labels = extract_page_labels(
        template_file_path, template_file_type, preview_image_path, page_num
    )
    if not all_labels:
        return {"found": False}

    candidates = []
    if label.strip():
        candidates.append(_norm(label))
    key_norm = _norm(field_key)
    if key_norm and key_norm not in candidates:
        candidates.append(key_norm)
    for alias in LABEL_ALIASES.get(field_key.lower(), []):
        an = _norm(alias)
        if an not in candidates:
            candidates.append(an)

    # Score every OCR label against candidate phrases
    scored: list[tuple[int, dict[str, Any]]] = []
    for lbl in all_labels:
        ln = lbl["norm"]
        if not ln:
            continue
        best_score = 0
        for idx, cand in enumerate(candidates):
            if not cand:
                continue
            priority_bonus = max(0, 20 - idx * 3)
            if ln == cand:
                best_score = max(best_score, 100 + priority_bonus)
            elif cand in ln.split() or ln.startswith(cand + " ") or ln.endswith(" " + cand):
                best_score = max(best_score, 85 + priority_bonus)
            elif cand in ln:
                best_score = max(best_score, 70 + priority_bonus)
            elif len(ln) >= 3 and ln in cand:
                best_score = max(best_score, 55 + priority_bonus)
        if best_score > 0:
            scored.append((best_score, lbl))

    if not scored:
        return {"found": False}

    existing = existing_fields or []
    # Score candidates together with whether the target cell is clean/unoccupied
    evaluated: list[tuple[int, int, float, float, dict[str, Any], tuple[float, float, float, float, str, bool]]] = []
    for base_score, lbl in scored:
        box = _find_best_box_near_label(preview_image_path, lbl, all_labels)
        bx, by, bw, bh, _place, is_clean = box
        overlaps = any(
            int(ef.get("page", 1)) == page_num
            and abs(float(ef.get("x_pct", 0)) - bx) < 3.0
            and abs(float(ef.get("y_pct", 0)) - by) < 2.0
            for ef in existing
        )
        evaluated.append((
            1 if not overlaps else 0,
            1 if is_clean else 0,
            base_score,
            -lbl["y0"],
            lbl,
            box,
        ))

    evaluated.sort(key=lambda t: (t[0], t[1], t[2], -t[4]["y0"], -t[4]["x0"]), reverse=True)
    chosen = evaluated[0][4]
    x_pct, y_pct, w_pct, h_pct, placement, _ = evaluated[0][5]
    style = _infer_style_from_image(preview_image_path, page_height_pt, chosen)
    align = _infer_alignment(field_key, placement, w_pct)
    return {
        "found": True,
        "matched_label": chosen["text"],
        "placement": placement,
        "x_pct": x_pct,
        "y_pct": y_pct,
        "w_pct": w_pct,
        "h_pct": h_pct,
        "font_size": style["font_size"],
        "font_weight": style["font_weight"],
        "color": style["color"],
        "align": align,
    }


def detect_style_near_box(
    template_file_path: str | Path,
    template_file_type: str,
    preview_image_path: str | Path,
    x_pct: float,
    y_pct: float,
    w_pct: float,
    h_pct: float,
    field_key: str = "",
    page_num: int = 1,
    page_height_pt: float = 841.89,
) -> dict[str, Any]:
    """Find the closest label to a manually drawn box and inherit its font size, weight, and color."""
    all_labels = extract_page_labels(
        template_file_path, template_file_type, preview_image_path, page_num
    )
    if not all_labels:
        return {"font_size": 9.0, "font_weight": "normal", "color": "#111827", "align": "left"}

    cy = y_pct + h_pct / 2.0
    # Prefer labels on the same horizontal row to the left of the box, or directly above
    best_lbl = None
    best_dist = 1e9
    placement = "beside"
    for lbl in all_labels:
        lcy = (lbl["y0"] + lbl["y1"]) / 2.0
        lcx = (lbl["x0"] + lbl["x1"]) / 2.0
        if abs(lcy - cy) < 3.0 and lbl["x1"] <= x_pct + 2.0:
            dist = abs(lcy - cy) * 5.0 + max(0.0, x_pct - lbl["x1"])
            if dist < best_dist:
                best_dist = dist
                best_lbl = lbl
                placement = "beside"
        elif lbl["y1"] <= y_pct + 1.5 and abs(lcx - (x_pct + w_pct / 2.0)) < 12.0:
            dist = max(0.0, y_pct - lbl["y1"]) * 2.0 + abs(lcx - (x_pct + w_pct / 2.0))
            if dist < best_dist:
                best_dist = dist
                best_lbl = lbl
                placement = "below"

    if not best_lbl:
        # Nearest label anywhere on the page as baseline font reference
        best_lbl = min(
            all_labels,
            key=lambda l: abs(((l["y0"] + l["y1"]) / 2.0) - cy) + abs(l["x0"] - x_pct) * 0.3,
        )

    style = _infer_style_from_image(preview_image_path, page_height_pt, best_lbl)
    align = _infer_alignment(field_key, placement, w_pct)
    return {**style, "align": align}

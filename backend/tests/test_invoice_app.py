import io
import os
import sys
from pathlib import Path

import fitz
import pytest
from docx import Document
from docx.shared import Pt, RGBColor
from fastapi.testclient import TestClient
from PIL import Image

# Isolate test DB and storage before importing app
TEST_ROOT = Path(__file__).resolve().parent / "_tmp_test_env"
TEST_ROOT.mkdir(parents=True, exist_ok=True)
os.environ["SMART_INVOICE_STORAGE"] = str(TEST_ROOT / "storage")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_ROOT / 'test.db'}"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402
from app.migrations import run_migrations  # noqa: E402
from app.services.calculator import amount_to_indian_words  # noqa: E402


@pytest.fixture(scope="module")
def client():
    if (TEST_ROOT / "test.db").exists():
        (TEST_ROOT / "test.db").unlink()
    run_migrations()
    with TestClient(app) as c:
        yield c


def _make_sample_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text(fitz.Point(40, 50), "TAX INVOICE", fontsize=18)
    page.insert_text(fitz.Point(40, 100), "Invoice No:", fontsize=10)
    page.insert_text(fitz.Point(40, 130), "Customer Name:", fontsize=10)
    page.draw_rect(fitz.Rect(36, 300, 559, 600), color=(0, 0, 0), width=1)
    data = doc.tobytes()
    doc.close()
    return data


def _make_sample_png_bytes() -> bytes:
    buf = io.BytesIO()
    im = Image.new("RGB", (600, 850), color=(255, 255, 255))
    im.save(buf, format="PNG")
    return buf.getvalue()


def _make_sample_docx_bytes() -> bytes:
    doc = Document()
    p = doc.add_paragraph()
    r = p.add_run("TAX INVOICE - {{company_name}}")
    r.bold = True
    r.font.size = Pt(16)
    r.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    doc.add_paragraph("Invoice No: {{invoice_number}} | Date: {{invoice_date}}")
    doc.add_paragraph("Customer: {{customer_name}} | Address: {{billing_address}}")

    tbl = doc.add_table(rows=2, cols=5)
    headers = ["Sl", "Description", "Qty", "Rate", "Total"]
    for idx, h in enumerate(headers):
        tbl.rows[0].cells[idx].text = h
    row_tokens = ["{{sl_no}}", "{{description}}", "{{quantity}}", "{{rate}}", "{{total_amount}}"]
    for idx, tok in enumerate(row_tokens):
        tbl.rows[1].cells[idx].text = tok

    doc.add_paragraph("Grand Total: {{grand_total}}")
    doc.add_paragraph("Amount in Words: {{amount_in_words}}")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_health_and_indian_words(client: TestClient):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert amount_to_indian_words(106000) == "ONE LAKH SIX THOUSAND RUPEES ONLY"
    assert "ONE CRORE" in amount_to_indian_words(12545678.50)


def test_file_upload_validation(client: TestClient):
    # Invalid extension
    r1 = client.post(
        "/api/templates/upload",
        files={"file": ("bad.txt", b"hello", "text/plain")},
    )
    assert r1.status_code == 400

    # Fake PDF magic bytes
    r2 = client.post(
        "/api/templates/upload",
        files={"file": ("fake.pdf", b"NOTAPDF", "application/pdf")},
    )
    assert r2.status_code == 400

    # Empty file
    r3 = client.post(
        "/api/templates/upload",
        files={"file": ("empty.png", b"", "image/png")},
    )
    assert r3.status_code == 400


def test_template_lifecycle_pdf_and_png(client: TestClient):
    pdf_bytes = _make_sample_pdf_bytes()
    r = client.post(
        "/api/templates/upload",
        data={"name": "Sample PDF Template", "set_as_default": "true"},
        files={"file": ("sample.pdf", pdf_bytes, "application/pdf")},
    )
    assert r.status_code == 200
    tpl = r.json()
    assert tpl["mode"] == "background"
    assert tpl["is_default"] is True
    assert tpl["page_count"] == 1

    # Preview image fetch
    prev = client.get(f"/api/templates/{tpl['id']}/pages/1")
    assert prev.status_code == 200
    assert prev.headers["content-type"] == "image/png"

    # Update mappings (fields + erase mask + items table)
    mappings = {
        "fields": [
            {
                "id": "f1",
                "field_key": "invoice_number",
                "label": "Invoice No",
                "kind": "text",
                "page": 1,
                "x_pct": 25.0,
                "y_pct": 10.5,
                "w_pct": 30.0,
                "h_pct": 3.0,
                "font_size": 10.0,
                "font_weight": "bold",
                "color": "#111827",
                "align": "left",
                "multiline": False,
                "bg_color": "",
            },
            {
                "id": "f2",
                "field_key": "customer_name",
                "label": "Customer Name",
                "kind": "text",
                "page": 1,
                "x_pct": 25.0,
                "y_pct": 14.0,
                "w_pct": 40.0,
                "h_pct": 3.0,
                "font_size": 10.0,
                "font_weight": "bold",
                "color": "#111827",
                "align": "left",
                "multiline": False,
                "bg_color": "",
            },
        ],
        "masks": [
            {"id": "m1", "page": 1, "x_pct": 60.0, "y_pct": 5.0, "w_pct": 20.0, "h_pct": 3.0, "color": "#FFFFFF"}
        ],
        "items_table": {
            "enabled": True,
            "page": 1,
            "y_start_pct": 36.0,
            "y_end_pct": 68.0,
            "row_height_pct": 4.0,
            "font_size": 9.0,
            "font_weight": "normal",
            "color": "#111827",
            "bg_color": "",
            "show_grid_lines": True,
            "columns": [
                {"id": "c1", "key": "sl_no", "label": "Sl", "x_pct": 7.0, "w_pct": 6.0, "align": "center"},
                {"id": "c2", "key": "description", "label": "Description", "x_pct": 13.0, "w_pct": 45.0, "align": "left"},
                {"id": "c3", "key": "quantity", "label": "Qty", "x_pct": 58.0, "w_pct": 10.0, "align": "center"},
                {"id": "c4", "key": "rate", "label": "Rate", "x_pct": 68.0, "w_pct": 12.0, "align": "right"},
                {"id": "c5", "key": "total_amount", "label": "Total", "x_pct": 80.0, "w_pct": 13.0, "align": "right"},
            ],
        },
    }
    upd = client.put(
        f"/api/templates/{tpl['id']}",
        json={"name": "Renamed PDF Template", "field_mappings": mappings},
    )
    assert upd.status_code == 200
    assert upd.json()["name"] == "Renamed PDF Template"

    # Upload PNG template and replace it
    png_res = client.post(
        "/api/templates/upload",
        data={"name": "PNG Template", "set_as_default": "false"},
        files={"file": ("scan.png", _make_sample_png_bytes(), "image/png")},
    )
    assert png_res.status_code == 200
    png_id = png_res.json()["id"]
    rep = client.post(
        f"/api/templates/{png_id}/replace",
        data={"preserve_mappings": "true"},
        files={"file": ("scan2.png", _make_sample_png_bytes(), "image/png")},
    )
    assert rep.status_code == 200
    del_res = client.delete(f"/api/templates/{png_id}")
    assert del_res.status_code == 200


def test_gst_calculations_and_validation(client: TestClient):
    # Exempt & non-taxable must force 0 GST
    calc_exempt = client.post(
        "/api/invoices/calculate",
        json={
            "tax_mode": "exempt",
            "auto_round_off": True,
            "invoice_discount": 0,
            "items": [
                {"description": "E-Bike", "quantity": 2, "rate": 50000, "discount": 10, "discount_type": "percent", "gst_percent": 18}
            ],
        },
    )
    assert calc_exempt.status_code == 200
    d = calc_exempt.json()
    assert d["subtotal"] == 100000.0
    assert d["discount_total"] == 10000.0
    assert d["taxable_total"] == 90000.0
    assert d["cgst_total"] == 0.0
    assert d["sgst_total"] == 0.0
    assert d["igst_total"] == 0.0
    assert d["grand_total"] == 90000.0

    # Intra-state CGST + SGST
    calc_cgst = client.post(
        "/api/invoices/calculate",
        json={
            "tax_mode": "cgst_sgst",
            "auto_round_off": False,
            "items": [{"description": "Charger", "quantity": 1, "rate": 1000, "discount": 0, "discount_type": "amount", "gst_percent": 18}],
        },
    ).json()
    assert calc_cgst["cgst_total"] == 90.0
    assert calc_cgst["sgst_total"] == 90.0
    assert calc_cgst["grand_total"] == 1180.0

    # Validation errors: empty description & due_date < invoice_date
    bad = client.post(
        "/api/invoices",
        json={
            "invoice_number": "ERR-01",
            "invoice_date": "2026-11-12",
            "due_date": "2026-11-01",
            "customer_name": "Test Customer",
            "items": [{"description": "   ", "quantity": 1, "rate": 100}],
        },
    )
    assert bad.status_code == 422


def test_multipage_pdf_generation_and_overwrite_guard(client: TestClient):
    templates = client.get("/api/templates").json()
    tpl_id = templates[0]["id"]

    # 20 items with long descriptions should spill onto multiple pages
    items = [
        {
            "description": f"Electric Scooter Model X-{i} with extended battery pack and fast charger bundle",
            "hsn_sac": "871190",
            "quantity": 1,
            "unit": "Nos",
            "rate": 50000,
            "discount": 0,
            "discount_type": "amount",
            "gst_percent": 5,
        }
        for i in range(1, 21)
    ]

    create_res = client.post(
        "/api/invoices",
        json={
            "template_id": tpl_id,
            "invoice_number": "INV-MULTI-001",
            "invoice_date": "2026-11-12",
            "customer_name": "Ramesh Kumar",
            "billing_address": "123 Main Road, Hyderabad",
            "tax_mode": "cgst_sgst",
            "items": items,
        },
    )
    assert create_res.status_code == 200
    inv = create_res.json()
    assert inv["has_pdf"] is True
    assert inv["grand_total"] == 1050000.0

    # Unique invoice number enforcement
    dup_num = client.post(
        "/api/invoices",
        json={
            "template_id": tpl_id,
            "invoice_number": "INV-MULTI-001",
            "invoice_date": "2026-11-12",
            "customer_name": "Another Person",
            "items": [items[0]],
        },
    )
    assert dup_num.status_code == 409

    # Download PDF & inspect with PyMuPDF
    pdf_dl = client.get(f"/api/invoices/{inv['id']}/pdf")
    assert pdf_dl.status_code == 200
    assert pdf_dl.headers["content-type"] == "application/pdf"
    doc = fitz.open(stream=pdf_dl.content, filetype="pdf")
    assert doc.page_count >= 2
    full_text = "\n".join(p.get_text() for p in doc)
    assert "INV-MULTI-001" in full_text
    assert "Ramesh Kumar" in full_text
    assert "Model X-20" in full_text
    doc.close()

    # Overwrite protection when editing saved invoice without confirm_overwrite
    upd_no_confirm = client.put(
        f"/api/invoices/{inv['id']}",
        json={
            "template_id": tpl_id,
            "invoice_number": "INV-MULTI-001",
            "invoice_date": "2026-11-12",
            "customer_name": "Ramesh Kumar Updated",
            "items": [items[0]],
            "confirm_overwrite": False,
        },
    )
    assert upd_no_confirm.status_code == 409

    # With confirm_overwrite=True it succeeds
    upd_confirm = client.put(
        f"/api/invoices/{inv['id']}",
        json={
            "template_id": tpl_id,
            "invoice_number": "INV-MULTI-001",
            "invoice_date": "2026-11-12",
            "customer_name": "Ramesh Kumar Updated",
            "items": [items[0]],
            "confirm_overwrite": True,
        },
    )
    assert upd_confirm.status_code == 200
    assert upd_confirm.json()["customer_name"] == "Ramesh Kumar Updated"

    # Duplicate invoice
    dup_inv = client.post(f"/api/invoices/{inv['id']}/duplicate")
    assert dup_inv.status_code == 200
    assert dup_inv.json()["invoice_number"] != "INV-MULTI-001"
    assert dup_inv.json()["status"] == "draft"


def test_docx_template_mode_and_pdf_generation(client: TestClient):
    docx_bytes = _make_sample_docx_bytes()
    up = client.post(
        "/api/templates/upload",
        data={"name": "Word Invoice Template", "set_as_default": "false"},
        files={"file": ("invoice.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert up.status_code == 200
    tpl = up.json()
    assert tpl["mode"] == "docx"
    assert "customer_name" in tpl["docx_placeholders"]
    assert "invoice_number" in tpl["docx_placeholders"]

    res = client.post(
        "/api/invoices",
        json={
            "template_id": tpl["id"],
            "invoice_number": "DOCX-101",
            "invoice_date": "2026-11-12",
            "customer_name": "Sita Enterprises",
            "billing_address": "Plot 42, Madhapur",
            "tax_mode": "igst",
            "items": [
                {"description": "Consulting Service", "quantity": 2, "rate": 15000, "gst_percent": 18},
                {"description": "Annual Support", "quantity": 1, "rate": 10000, "gst_percent": 18},
            ],
        },
    )
    assert res.status_code == 200
    inv = res.json()
    assert inv["has_pdf"] is True
    assert inv["has_docx"] is True
    assert inv["igst_total"] == 7200.0
    assert inv["grand_total"] == 47200.0

    pdf_res = client.get(f"/api/invoices/{inv['id']}/pdf")
    assert pdf_res.status_code == 200
    doc = fitz.open(stream=pdf_res.content, filetype="pdf")
    text = " ".join(" ".join(p.get_text().split()) for p in doc)
    assert "DOCX-101" in text
    assert "Sita Enterprises" in text
    assert "Consulting Service" in text
    assert "Annual Support" in text
    doc.close()

    docx_dl = client.get(f"/api/invoices/{inv['id']}/docx")
    assert docx_dl.status_code == 200


def test_history_search_dashboard_and_backup(client: TestClient):
    hist = client.get("/api/invoices?q=DOCX-101").json()
    assert len(hist) == 1
    assert hist[0]["customer_name"] == "Sita Enterprises"

    dash = client.get("/api/dashboard").json()
    assert dash["total_invoices"] >= 2
    assert dash["saved_templates"] >= 2

    bkp = client.get("/api/settings/backup/export")
    assert bkp.status_code == 200
    assert bkp.headers["content-type"] == "application/zip"

# SmartInvoice Studio — Template-Exact Invoice Editor & PDF Generator

A full-stack invoice template editor and PDF generator built with **React + TypeScript + Tailwind CSS** and **Python FastAPI + SQLAlchemy + PyMuPDF + ReportLab + python-docx**.

Upload your existing invoice template (**PDF, DOCX, PNG, or JPG**) once, map editable fields visually or via `{{placeholder}}` tags, save it as your default template, and generate exact-layout A4 PDFs with live split-screen preview.

---

## Features

- **Dashboard**: Total invoices generated, total invoice value, saved templates count, and recent invoices.
- **Template Management**:
  - Upload **PDF, DOCX, PNG, JPG** templates (validated by extension, magic bytes, and 25 MB limit).
  - **Mode A (Background Template Mode — PDF / PNG / JPG)**: Visual drag-and-resize field mapper, optional erase masks to cover old text on scanned/filled invoices, and dynamic multi-page product table columns.
  - **Mode B (Editable Document Mode — DOCX)**: Preserves original Word fonts, colors, tables, borders, and logos; supports `{{placeholder}}` replacement and dynamic repeating item table rows.
  - Set default template, rename, replace file (preserving mappings), and delete.
- **Split-Screen Invoice Editor & Live Preview**:
  - Left side: Company details, Invoice details, Customer details, Dynamic Product/Service table, GST mode (`CGST + SGST`, `IGST`, `GST Exempt`, `Non-Taxable`), Discount, Round-off, Indian numbering **Amount in Words**, Bank/UPI details, and Custom template fields.
  - Right side: Instant live preview matching the selected template with multi-page overflow preview.
- **PDF Generation & History**:
  - High-resolution A4 (or original template size) PDF download, print, and DOCX export.
  - Search & filter by invoice number, customer name, date range, and template.
  - Duplicate existing invoices, edit & regenerate with explicit PDF overwrite confirmation.
  - Database backup & restore (`.zip`).

---

## Project Structure

```text
smart-invoice/
├── backend/
│   ├── app/
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── migrations.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── routers/
│   │   │   ├── dashboard.py
│   │   │   ├── invoices.py
│   │   │   ├── settings.py
│   │   │   └── templates.py
│   │   └── services/
│   │       ├── calculator.py
│   │       ├── pdf_generator.py
│   │       └── template_processor.py
│   ├── tests/
│   │   └── test_invoice_app.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── DashboardView.tsx
│   │   │   ├── InvoiceEditor.tsx
│   │   │   ├── InvoicesListView.tsx
│   │   │   ├── LivePreview.tsx
│   │   │   ├── SettingsView.tsx
│   │   │   ├── TemplateEditorModal.tsx
│   │   │   └── TemplatesView.tsx
│   │   ├── utils/calculator.ts
│   │   ├── api.ts
│   │   ├── App.tsx
│   │   └── types.ts
│   └── package.json
└── start.sh
```

---

## Installation & Running

### 1. Backend Setup

```bash
cd smart-invoice/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

> **PostgreSQL support**: By default, SQLite is used (`smart_invoice.db`). To use PostgreSQL, set `DATABASE_URL=postgresql+psycopg://user:password@host:5432/dbname` before starting the backend.

### 2. Frontend Setup

```bash
cd smart-invoice/frontend
npm install
npm run dev
```

Open **http://localhost:5175** in your browser.

### 3. Quick Start (Both Servers)

```bash
cd smart-invoice
./start.sh
```

---

## Running Automated Tests

```bash
cd smart-invoice/backend
.venv/bin/pytest -v tests/test_invoice_app.py
```

Frontend build & TypeScript check:

```bash
cd smart-invoice/frontend
npm run build
```

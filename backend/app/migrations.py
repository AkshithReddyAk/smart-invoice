from sqlalchemy import inspect, text
from app.database import Base, SessionLocal, engine
from app.models import CompanySettings, SchemaMigration, UserCredential

DEFAULT_USERS = {
    "9553057496": ("Authorized Admin (9553057496)", "Ak@2004"),
    "9908599043": ("Authorized Billing (9908599043)", "Ak@2004"),
    "9951404366": ("Authorized Operations (9951404366)", "Ak@2004"),
}


MIGRATIONS = [
    ("001_initial_schema", "Create core tables for settings, templates, invoices, and invoice_items"),
    ("002_user_credentials", "Create user credentials table with per-user passwords"),
    ("003_update_login_passwords", "Set default login password for the 3 authorized numbers to Ak@2004"),
]


def run_migrations() -> None:
    """Create tables if needed and ensure default settings and credentials exist."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for version, _desc in MIGRATIONS:
            existing = db.query(SchemaMigration).filter(SchemaMigration.version == version).first()
            if not existing:
                db.add(SchemaMigration(version=version))

        # Ensure singleton settings row (id=1) exists
        settings = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
        if not settings:
            db.add(CompanySettings(id=1, company_name="My Company"))

        # Ensure default authorized users exist if not already present
        for phone, (role, default_pass) in DEFAULT_USERS.items():
            user = db.query(UserCredential).filter(UserCredential.phone == phone).first()
            if not user:
                db.add(UserCredential(phone=phone, password=default_pass, role=role))

        db.commit()

        # Future-safe column check example
        inspector = inspect(engine)
        cols = {c["name"] for c in inspector.get_columns("invoices")}
        if "paper_size" not in cols:
            db.execute(text("ALTER TABLE invoices ADD COLUMN paper_size VARCHAR(32) DEFAULT 'A4' NOT NULL"))
            db.commit()

        # Heal template file paths if pointing to another host / environment
        from pathlib import Path
        from app.config import TEMPLATES_DIR
        from app.models import InvoiceTemplate
        templates = db.query(InvoiceTemplate).all()
        for t in templates:
            p = Path(t.file_path) if t.file_path else None
            if not p or not p.exists():
                cand = TEMPLATES_DIR / p.name if p else None
                if cand and cand.exists():
                    t.file_path = str(cand)
                else:
                    matched = list(TEMPLATES_DIR.glob(f"{t.id}*"))
                    if matched and matched[0].is_file():
                        t.file_path = str(matched[0])
                    else:
                        default_asset = Path(__file__).resolve().parent / "assets" / "adms_invoice_template.pdf"
                        if default_asset.exists():
                            t.file_path = str(default_asset)

        # Heal invoices where customer_name was accidentally set to a date
        import re, json
        from app.models import Invoice
        date_pattern = re.compile(r"^(\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2})$")
        invoices = db.query(Invoice).all()
        for inv in invoices:
            cname = (inv.customer_name or "").strip()
            if not cname or date_pattern.match(cname):
                extra = json.loads(inv.extra_fields_json or "{}")
                resolved = ""
                for k in ("Name", "name", "Bill_to", "bill_to", "bill_name", "customer_name"):
                    cand = str(extra.get(k, "")).strip()
                    if cand and not date_pattern.match(cand):
                        resolved = cand
                        break
                if not resolved:
                    for k, v in extra.items():
                        lk = str(k).lower()
                        cand = str(v).strip()
                        if not any(d in lk for d in ("date", "time", "gst", "tax", "total", "amount", "no", "id", "price")) and cand and not date_pattern.match(cand):
                            resolved = cand
                            break
                if resolved:
                    inv.customer_name = resolved

        db.commit()
    finally:
        db.close()

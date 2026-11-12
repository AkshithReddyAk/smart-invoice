from sqlalchemy import inspect, text
from app.database import Base, SessionLocal, engine
from app.models import CompanySettings, SchemaMigration, UserCredential

DEFAULT_USERS = {
    "9553057496": ("Authorized Admin (9553057496)", "Ak@200419"),
    "9908599043": ("Authorized Billing (9908599043)", "Ak@200419"),
    "9951404366": ("Authorized Operations (9951404366)", "Ak@200419"),
}


MIGRATIONS = [
    ("001_initial_schema", "Create core tables for settings, templates, invoices, and invoice_items"),
    ("002_user_credentials", "Create user credentials table with per-user passwords"),
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

        # Ensure default authorized users exist
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
    finally:
        db.close()

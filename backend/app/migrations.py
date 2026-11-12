from sqlalchemy import inspect, text
from app.database import Base, SessionLocal, engine
from app.models import CompanySettings, SchemaMigration


MIGRATIONS = [
    ("001_initial_schema", "Create core tables for settings, templates, invoices, and invoice_items"),
]


def run_migrations() -> None:
    """Create tables if needed and ensure default settings row exists."""
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
        db.commit()

        # Future-safe column check example
        inspector = inspect(engine)
        cols = {c["name"] for c in inspector.get_columns("invoices")}
        if "paper_size" not in cols:
            db.execute(text("ALTER TABLE invoices ADD COLUMN paper_size VARCHAR(32) DEFAULT 'A4' NOT NULL"))
            db.commit()
    finally:
        db.close()

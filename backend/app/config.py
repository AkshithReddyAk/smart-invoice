from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = Path(os.getenv("SMART_INVOICE_STORAGE", BASE_DIR / "storage"))
TEMPLATES_DIR = STORAGE_DIR / "templates"
PREVIEWS_DIR = STORAGE_DIR / "previews"
INVOICES_DIR = STORAGE_DIR / "invoices"
LOGOS_DIR = STORAGE_DIR / "logos"
BACKUPS_DIR = STORAGE_DIR / "backups"

for _d in (STORAGE_DIR, TEMPLATES_DIR, PREVIEWS_DIR, INVOICES_DIR, LOGOS_DIR, BACKUPS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

DEFAULT_DB_PATH = BASE_DIR / "smart_invoice.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")

ALLOWED_TEMPLATE_EXTENSIONS = {"pdf", "docx", "png", "jpg", "jpeg"}
ALLOWED_LOGO_EXTENSIONS = {"png", "jpg", "jpeg"}
MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB

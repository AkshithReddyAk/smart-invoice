import io
import shutil
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image
from sqlalchemy.orm import Session

from app.config import (
    ALLOWED_LOGO_EXTENSIONS,
    BACKUPS_DIR,
    DATABASE_URL,
    DEFAULT_DB_PATH,
    LOGOS_DIR,
    MAX_UPLOAD_SIZE_BYTES,
    STORAGE_DIR,
)
from app.database import engine, get_db
from app.models import CompanySettings
from app.schemas import SettingsOut, SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    if not settings:
        settings = CompanySettings(id=1, company_name="My Company")
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.put("", response_model=SettingsOut)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    settings = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    if not settings:
        settings = CompanySettings(id=1)
        db.add(settings)

    for key, val in payload.model_dump().items():
        setattr(settings, key, val)

    db.commit()
    db.refresh(settings)
    return settings


@router.post("/logo", response_model=SettingsOut)
async def upload_company_logo(file: UploadFile = File(...), db: Session = Depends(get_db)):
    ext = Path(file.filename or "").suffix.lower().lstrip(".")
    if ext not in ALLOWED_LOGO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Logo must be PNG or JPG")

    data = await file.read()
    if not data or len(data) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Invalid logo file size")

    try:
        with Image.open(io.BytesIO(data)) as im:
            im.verify()
    except Exception:
        raise HTTPException(status_code=400, detail="Corrupted logo image")

    logo_name = f"company_logo_{uuid.uuid4().hex[:8]}.{ext}"
    logo_path = LOGOS_DIR / logo_name
    logo_path.write_bytes(data)

    settings = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    if not settings:
        settings = CompanySettings(id=1)
        db.add(settings)
    settings.company_logo_path = str(logo_path)
    db.commit()
    db.refresh(settings)
    return settings


@router.get("/logo/image")
def get_company_logo(db: Session = Depends(get_db)):
    settings = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    if not settings or not settings.company_logo_path:
        raise HTTPException(status_code=404, detail="No company logo uploaded")
    p = Path(settings.company_logo_path).resolve()
    if not p.exists() or not str(p).startswith(str(LOGOS_DIR.resolve())):
        raise HTTPException(status_code=404, detail="Logo file not found")
    return FileResponse(p)


@router.get("/backup/export")
def export_backup():
    """Export SQLite database + storage templates/invoices/logos as a ZIP archive."""
    if not DATABASE_URL.startswith("sqlite"):
        raise HTTPException(status_code=400, detail="ZIP backup export is only enabled for SQLite deployments")

    buf = io.BytesIO()
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    tmp_db = BACKUPS_DIR / f"snapshot_{ts}.db"

    # Safe online SQLite backup
    src_conn = sqlite3.connect(str(DEFAULT_DB_PATH))
    dst_conn = sqlite3.connect(str(tmp_db))
    with dst_conn:
        src_conn.backup(dst_conn)
    dst_conn.close()
    src_conn.close()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(tmp_db, arcname="smart_invoice.db")
        for sub in ("templates", "previews", "invoices", "logos"):
            folder = STORAGE_DIR / sub
            if folder.exists():
                for file_p in folder.rglob("*"):
                    if file_p.is_file():
                        zf.write(file_p, arcname=f"storage/{sub}/{file_p.relative_to(folder)}")

    tmp_db.unlink(missing_ok=True)
    buf.seek(0)
    filename = f"smart_invoice_backup_{ts}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.post("/backup/restore")
async def restore_backup(file: UploadFile = File(...)):
    """Restore SQLite database and storage files from a previously exported ZIP backup."""
    if not DATABASE_URL.startswith("sqlite"):
        raise HTTPException(status_code=400, detail="ZIP restore is only enabled for SQLite deployments")

    data = await file.read()
    if not data or len(data) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Invalid backup archive size")

    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP backup file")

    names = zf.namelist()
    if "smart_invoice.db" not in names:
        raise HTTPException(status_code=400, detail="Backup archive missing smart_invoice.db")

    # Prevent zip-slip
    for name in names:
        if ".." in Path(name).parts or Path(name).is_absolute():
            raise HTTPException(status_code=400, detail="Unsafe path inside backup archive")

    engine.dispose()
    db_bytes = zf.read("smart_invoice.db")
    DEFAULT_DB_PATH.write_bytes(db_bytes)

    for name in names:
        if name.startswith("storage/") and not name.endswith("/"):
            rel = Path(name).relative_to("storage")
            target = (STORAGE_DIR / rel).resolve()
            if not str(target).startswith(str(STORAGE_DIR.resolve())):
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(name))

    return {"status": "restored", "message": "Database and template files restored successfully"}

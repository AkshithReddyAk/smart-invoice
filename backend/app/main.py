import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.migrations import run_migrations
from app.routers import auth, dashboard, invoices, settings, templates
from app.seed_adms import ensure_adms_default_template
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


@asynccontextmanager
async def lifespan(_app: FastAPI):
    run_migrations()
    if not os.getenv("PYTEST_CURRENT_TEST"):
        ensure_adms_default_template()
    yield


app = FastAPI(
    title="SmartInvoice Studio API",
    version="1.0.0",
    description="Template-exact invoice generator supporting PDF, DOCX, PNG, and JPG templates.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(settings.router)
app.include_router(templates.router)
app.include_router(invoices.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


frontend_dist = os.path.abspath(
    os.getenv(
        "FRONTEND_DIST_DIR",
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"),
    )
)
if os.path.exists(frontend_dist) and not os.getenv("PYTEST_CURRENT_TEST"):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_spa_frontend(full_path: str):
        if full_path.startswith("api/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not Found")
        target_file = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(target_file):
            return FileResponse(target_file)
        return FileResponse(os.path.join(frontend_dist, "index.html"))


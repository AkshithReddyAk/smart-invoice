import pytest
from pathlib import Path
import os
import sys

TEST_ROOT = Path(__file__).resolve().parent / "_tmp_test_env"
TEST_ROOT.mkdir(parents=True, exist_ok=True)
os.environ["SMART_INVOICE_STORAGE"] = str(TEST_ROOT / "storage")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_ROOT / 'test_auth.db'}"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.main import app
from app.migrations import run_migrations


@pytest.fixture(scope="module")
def client():
    if (TEST_ROOT / "test_auth.db").exists():
        (TEST_ROOT / "test_auth.db").unlink()
    run_migrations()
    with TestClient(app) as c:
        yield c


def test_default_login_and_unauthorized_access(client: TestClient):
    # Authorized user 1 with default password Ak@2004
    r1 = client.post("/api/auth/login", json={"phone": "9553057496", "password": "Ak@2004"})
    assert r1.status_code == 200
    assert r1.json()["status"] == "ok"
    assert "token" in r1.json()

    # Wrong password
    r2 = client.post("/api/auth/login", json={"phone": "9553057496", "password": "WrongPassword"})
    assert r2.status_code == 401

    # Unauthorized phone number
    r3 = client.post("/api/auth/login", json={"phone": "9876543210", "password": "Ak@2004"})
    assert r3.status_code == 403


def test_template_unlock_password(client: TestClient):
    # Template password must be strictly Ak@200419
    r1 = client.post("/api/auth/verify-password", json={"phone": "9553057496", "password": "Ak@200419"})
    assert r1.status_code == 200
    assert r1.json()["valid"] is True

    # Ak@2004 should not unlock templates
    r2 = client.post("/api/auth/verify-password", json={"phone": "9553057496", "password": "Ak@2004"})
    assert r2.status_code == 400


def test_password_reset_and_old_password_invalidation(client: TestClient):
    user_phone = "9553057496"
    new_password = "SecurePassword@2026"

    # 1. Reset password accepting Ak@200419 as old password
    r_reset = client.post(
        "/api/auth/change-password",
        json={
            "phone": user_phone,
            "old_password": "Ak@200419",
            "new_password": new_password,
            "confirm_password": new_password,
        },
    )
    assert r_reset.status_code == 200
    assert r_reset.json()["status"] == "ok"
    assert "token" in r_reset.json()

    # 2. Old password Ak@2004 MUST NOT be allowed to login
    r_old1 = client.post("/api/auth/login", json={"phone": user_phone, "password": "Ak@2004"})
    assert r_old1.status_code == 401
    assert "Incorrect password" in r_old1.json()["detail"]

    # 3. Old password Ak@200419 MUST NOT be allowed to login
    r_old2 = client.post("/api/auth/login", json={"phone": user_phone, "password": "Ak@200419"})
    assert r_old2.status_code == 401
    assert "Incorrect password" in r_old2.json()["detail"]

    # 4. New password MUST be allowed to login
    r_new = client.post("/api/auth/login", json={"phone": user_phone, "password": new_password})
    assert r_new.status_code == 200
    assert r_new.json()["status"] == "ok"

    # 5. Subsequent migrations/server boot MUST NOT overwrite new password back to Ak@2004
    run_migrations()

    r_after_boot_old = client.post("/api/auth/login", json={"phone": user_phone, "password": "Ak@2004"})
    assert r_after_boot_old.status_code == 401

    r_after_boot_new = client.post("/api/auth/login", json={"phone": user_phone, "password": new_password})
    assert r_after_boot_new.status_code == 200

    # 6. Other users' passwords should remain unaffected (Ak@2004)
    r_other = client.post("/api/auth/login", json={"phone": "9908599043", "password": "Ak@2004"})
    assert r_other.status_code == 200

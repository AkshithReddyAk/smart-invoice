import re
import secrets
import time
from typing import Dict, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserCredential

router = APIRouter(prefix="/api/auth", tags=["auth"])

AUTHORIZED_NUMBERS: Dict[str, str] = {
    "9553057496": "Authorized Admin (9553057496)",
    "9908599043": "Authorized Billing (9908599043)",
    "9951404366": "Authorized Operations (9951404366)",
}

DEFAULT_LOGIN_PASSWORD = "Ak@2004"
TEMPLATE_UNLOCK_PASSWORD = "Ak@200419"

OTP_STORE: Dict[str, dict] = {}
ACTIVE_SESSIONS: Dict[str, dict] = {}


def normalize_phone(raw: str) -> str:
    """Normalize phone number to 10 digits."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits


class LoginRequest(BaseModel):
    phone: str
    password: str


class ChangePasswordRequest(BaseModel):
    phone: str
    old_password: str
    new_password: str
    confirm_password: str


class VerifyPasswordRequest(BaseModel):
    phone: str
    password: str


class SendOtpRequest(BaseModel):
    phone: str


class VerifyOtpRequest(BaseModel):
    phone: str
    otp: str


def get_or_create_user(phone: str, db: Session) -> UserCredential:
    user = db.query(UserCredential).filter(UserCredential.phone == phone).first()
    if not user:
        role = AUTHORIZED_NUMBERS.get(phone, "Authorized Staff")
        user = UserCredential(phone=phone, password=DEFAULT_LOGIN_PASSWORD, role=role)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    phone = normalize_phone(payload.phone)

    if not phone or len(phone) != 10:
        raise HTTPException(
            status_code=400,
            detail="Please enter a valid 10-digit mobile number.",
        )

    if phone not in AUTHORIZED_NUMBERS:
        raise HTTPException(
            status_code=403,
            detail=f"Access Denied: Mobile number +91 {phone} is not authorized to access this website.",
        )

    user = get_or_create_user(phone, db)
    entered_password = (payload.password or "").strip()

    if user.password != entered_password:
        raise HTTPException(
            status_code=401,
            detail="Incorrect password. Please enter the correct password.",
        )

    token = secrets.token_hex(24)
    ACTIVE_SESSIONS[token] = {
        "phone": phone,
        "role": user.role,
        "created_at": time.time(),
    }

    return {
        "status": "ok",
        "token": token,
        "phone": phone,
        "role": user.role,
    }


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, db: Session = Depends(get_db)):
    phone = normalize_phone(payload.phone)

    if not phone or phone not in AUTHORIZED_NUMBERS:
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Unauthorized account.",
        )

    user = get_or_create_user(phone, db)

    # 1. Verify old password
    old_pw = (payload.old_password or "").strip()
    # Accept current stored password, or initial Ak@200419 / Ak@2004 if default
    is_valid_old = (
        old_pw == user.password
        or (user.password in ("Ak@2004", "Ak@200419") and old_pw in ("Ak@2004", "Ak@200419"))
    )
    if not is_valid_old:
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect.",
        )

    # 2. Verify new password matches confirmation
    new_pw = (payload.new_password or "").strip()
    confirm_pw = (payload.confirm_password or "").strip()

    if not new_pw:
        raise HTTPException(
            status_code=400,
            detail="Please enter a new password.",
        )

    if new_pw != confirm_pw:
        raise HTTPException(
            status_code=400,
            detail="New password and confirmation do not match.",
        )

    if len(new_pw) < 6:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 6 characters long.",
        )

    # 3. Update password strictly for this user
    user.password = new_pw
    db.commit()

    # 4. Invalidate all previous active sessions for this phone number
    tokens_to_remove = [t for t, sess in ACTIVE_SESSIONS.items() if sess.get("phone") == phone]
    for t in tokens_to_remove:
        ACTIVE_SESSIONS.pop(t, None)

    # 5. Issue a new active session token so the current user stays authenticated
    new_token = secrets.token_hex(24)
    ACTIVE_SESSIONS[new_token] = {
        "phone": phone,
        "role": user.role,
        "created_at": time.time(),
    }

    return {
        "status": "ok",
        "token": new_token,
        "phone": phone,
        "message": f"Password successfully updated for user +91 {phone}! The old password has been invalidated and cannot be used to log in.",
    }


@router.post("/verify-password")
def verify_password(payload: VerifyPasswordRequest):
    """Verify password for unlocking invoice templates and field editors."""
    entered = (payload.password or "").strip()
    if entered != TEMPLATE_UNLOCK_PASSWORD:
        raise HTTPException(
            status_code=400,
            detail="Incorrect invoice template password. Please try again.",
        )

    return {"status": "ok", "valid": True}


@router.post("/send-otp")
def send_otp(payload: SendOtpRequest):
    phone = normalize_phone(payload.phone)

    if not phone or len(phone) != 10:
        raise HTTPException(
            status_code=400,
            detail="Please enter a valid 10-digit mobile number.",
        )

    if phone not in AUTHORIZED_NUMBERS:
        raise HTTPException(
            status_code=403,
            detail=f"Access Denied: Mobile number +91 {phone} is not authorized to access this website.",
        )

    otp = str(secrets.randbelow(900000) + 100000)
    expires_at = time.time() + 300

    OTP_STORE[phone] = {
        "otp": otp,
        "expires_at": expires_at,
        "attempts": 0,
    }

    return {
        "status": "ok",
        "phone": phone,
        "message": f"OTP successfully generated for +91 {phone}.",
        "expires_in": 300,
    }


@router.post("/verify-otp")
def verify_otp(payload: VerifyOtpRequest):
    phone = normalize_phone(payload.phone)
    entered_otp = (payload.otp or "").strip()

    if phone not in AUTHORIZED_NUMBERS:
        raise HTTPException(
            status_code=403,
            detail="Access Denied: This mobile number is not authorized.",
        )

    if phone not in OTP_STORE:
        raise HTTPException(
            status_code=400,
            detail="No active OTP found. Please request a new OTP.",
        )

    record = OTP_STORE[phone]
    if time.time() > record["expires_at"]:
        del OTP_STORE[phone]
        raise HTTPException(
            status_code=400,
            detail="OTP has expired. Please request a new OTP.",
        )

    if record["otp"] != entered_otp:
        record["attempts"] += 1
        raise HTTPException(
            status_code=400,
            detail="Incorrect OTP. Please check and try again.",
        )

    del OTP_STORE[phone]
    token = secrets.token_hex(24)
    ACTIVE_SESSIONS[token] = {
        "phone": phone,
        "role": AUTHORIZED_NUMBERS[phone],
        "created_at": time.time(),
    }

    return {
        "status": "ok",
        "token": token,
        "phone": phone,
        "role": AUTHORIZED_NUMBERS[phone],
    }


@router.get("/me")
def get_current_user(token: Optional[str] = None):
    if not token or token not in ACTIVE_SESSIONS:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")
    return {
        "authenticated": True,
        **ACTIVE_SESSIONS[token],
    }

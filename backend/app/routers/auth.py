import re
import secrets
import time
from typing import Dict, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Exactly the 3 authorized mobile numbers specified by user
AUTHORIZED_NUMBERS: Dict[str, str] = {
    "9553057496": "Authorized Admin (9553057496)",
    "9908599043": "Authorized Billing (9908599043)",
    "9951404366": "Authorized Operations (9951404366)",
}

# Temporary in-memory OTP cache: phone -> {otp, expires_at, attempts}
OTP_STORE: Dict[str, dict] = {}

# Active tokens: token -> {phone, role, created_at}
ACTIVE_SESSIONS: Dict[str, dict] = {}


def normalize_phone(raw: str) -> str:
    """Normalize phone number to 10 digits."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits


class SendOtpRequest(BaseModel):
    phone: str


class VerifyOtpRequest(BaseModel):
    phone: str
    otp: str


@router.get("/authorized-numbers")
def get_authorized_numbers():
    """Return masked or public authorized numbers for reference."""
    return {
        "authorized_count": len(AUTHORIZED_NUMBERS),
        "numbers": [f"+91 {n[:2]}******{n[-2:]}" for n in AUTHORIZED_NUMBERS.keys()],
    }


@router.post("/send-otp")
def send_otp(payload: SendOtpRequest):
    phone = normalize_phone(payload.phone)

    if not phone or len(phone) != 10:
        raise HTTPException(
            status_code=400,
            detail="Please enter a valid 10-digit mobile number.",
        )

    # STRICT ACCESS CHECK: Only the 3 numbers allowed
    if phone not in AUTHORIZED_NUMBERS:
        raise HTTPException(
            status_code=403,
            detail=f"Access Denied: Mobile number +91 {phone} is not authorized to access this website. Only approved numbers have access.",
        )

    # Generate secure 6-digit OTP
    otp = str(secrets.randbelow(900000) + 100000)
    expires_at = time.time() + 300  # 5 minutes validity

    OTP_STORE[phone] = {
        "otp": otp,
        "expires_at": expires_at,
        "attempts": 0,
    }

    print(f"\n[AUTH SMS SERVICE] OTP for +91 {phone}: {otp} (expires in 5 mins)\n")

    return {
        "status": "ok",
        "phone": phone,
        "message": f"OTP successfully generated for +91 {phone}.",
        "otp": otp,  # Provided for real-time notification / instant copy
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
            detail="No active OTP found for this number. Please request a new OTP.",
        )

    record = OTP_STORE[phone]
    if time.time() > record["expires_at"]:
        del OTP_STORE[phone]
        raise HTTPException(
            status_code=400,
            detail="OTP has expired. Please request a new OTP.",
        )

    if record["attempts"] >= 5:
        del OTP_STORE[phone]
        raise HTTPException(
            status_code=400,
            detail="Too many incorrect attempts. Please request a fresh OTP.",
        )

    if record["otp"] != entered_otp:
        record["attempts"] += 1
        remaining = 5 - record["attempts"]
        raise HTTPException(
            status_code=400,
            detail=f"Incorrect OTP. Please check and try again ({remaining} attempts remaining).",
        )

    # Verification successful!
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

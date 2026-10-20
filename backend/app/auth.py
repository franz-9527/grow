from __future__ import annotations

import hashlib
import hmac
import os
import re
import time
from datetime import datetime

from fastapi import HTTPException, Request, Response

from .database import SHANGHAI


ADMIN_SESSION_COOKIE = "grow_admin_session"
ADMIN_SESSION_MAX_AGE = 30 * 24 * 60 * 60


def configured_pin() -> str:
    pin = os.getenv("GROW_ADMIN_PIN", "").strip()
    if not re.fullmatch(r"\d{4}", pin):
        raise HTTPException(
            status_code=503,
            detail="管理密码尚未配置，请设置 GROW_ADMIN_PIN（4位数字）",
        )
    return pin


def _session_secret(pin: str) -> bytes:
    configured = os.getenv("GROW_ADMIN_SESSION_SECRET", "").strip()
    value = configured or f"grow-admin-session:{pin}"
    return hashlib.sha256(value.encode("utf-8")).digest()


def _signature(expires_at: int, pin: str) -> str:
    payload = str(expires_at).encode("ascii")
    return hmac.new(_session_secret(pin), payload, hashlib.sha256).hexdigest()


def _create_token(pin: str) -> tuple[str, int]:
    expires_at = int(time.time()) + ADMIN_SESSION_MAX_AGE
    return f"{expires_at}.{_signature(expires_at, pin)}", expires_at


def _valid_expiry(request: Request) -> int | None:
    value = request.cookies.get(ADMIN_SESSION_COOKIE, "")
    try:
        expires_text, signature = value.split(".", 1)
        expires_at = int(expires_text)
    except (TypeError, ValueError):
        return None
    if expires_at <= int(time.time()):
        return None
    try:
        pin = configured_pin()
    except HTTPException:
        return None
    expected = _signature(expires_at, pin)
    return expires_at if hmac.compare_digest(signature, expected) else None


def require_admin(request: Request) -> None:
    if _valid_expiry(request) is None:
        raise HTTPException(status_code=401, detail="请先输入4位管理密码")


def login(response: Response, request: Request, pin: str) -> dict[str, object]:
    expected = configured_pin()
    if not hmac.compare_digest(pin, expected):
        raise HTTPException(status_code=401, detail="管理密码不正确")
    token, expires_at = _create_token(expected)
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip()
    secure = request.url.scheme == "https" or forwarded_proto == "https"
    response.set_cookie(
        key=ADMIN_SESSION_COOKIE,
        value=token,
        max_age=ADMIN_SESSION_MAX_AGE,
        expires=ADMIN_SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )
    return {
        "authenticated": True,
        "expiresAt": datetime.fromtimestamp(expires_at, SHANGHAI).isoformat(),
        "maxAgeDays": ADMIN_SESSION_MAX_AGE // (24 * 60 * 60),
    }


def session_status(request: Request) -> dict[str, object]:
    expires_at = _valid_expiry(request)
    return {
        "authenticated": expires_at is not None,
        "expiresAt":
            datetime.fromtimestamp(expires_at, SHANGHAI).isoformat()
            if expires_at is not None
            else None,
        "maxAgeDays": ADMIN_SESSION_MAX_AGE // (24 * 60 * 60),
    }


def logout(response: Response) -> None:
    response.delete_cookie(
        key=ADMIN_SESSION_COOKIE,
        httponly=True,
        samesite="lax",
        path="/",
    )

"""PIN authentication and HS256 JWT tokens for the Telemetry Dashboard."""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any, Dict

from fastapi import Header, HTTPException, status

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "homelab-telemetry-jwt-secret-2026")
ADMIN_PIN_DEFAULT = "3272"


def _b64url_encode(data: bytes) -> str:
    """Encode bytes using URL-safe Base64 without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(segment: str) -> bytes:
    """Decode a URL-safe Base64 string restoring padding."""
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode((segment + padding).encode("ascii"))


def verify_admin_pin(pin: str) -> bool:
    """Verify the 4-digit PIN against ADMIN_PIN environment variable."""
    expected = os.getenv("ADMIN_PIN", ADMIN_PIN_DEFAULT).strip()
    if not expected:
        return False
    return secrets.compare_digest(pin.strip(), expected)


def create_admin_token(ttl_seconds: int = 7 * 24 * 3600) -> str:
    """Create a signed HS256 JWT token with admin role."""
    header_b64 = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
    now = int(time.time())
    payload = {
        "sub": "admin",
        "role": "admin",
        "iat": now,
        "exp": now + ttl_seconds,
    }
    payload_b64 = _b64url_encode(json.dumps(payload).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    sig = hmac.new(JWT_SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(sig)}"


def decode_token(token: str) -> Dict[str, Any]:
    """Verify signature and expiration of an HS256 JWT token."""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid token format")
    header_b64, payload_b64, sig_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected_sig = hmac.new(JWT_SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
    if not secrets.compare_digest(_b64url_encode(expected_sig), sig_b64):
        raise ValueError("Invalid token signature")
    payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("Token expired")
    return payload


def require_admin(authorization: str | None = Header(default=None)) -> Dict[str, Any]:
    """FastAPI dependency requiring a valid Bearer admin token."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere autorización de administrador.",
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida o expirada.",
        ) from exc
    if payload.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permisos insuficientes.",
        )
    return payload

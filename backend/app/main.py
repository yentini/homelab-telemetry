"""FastAPI application for Homelab Telemetry & Operations Control Panel."""

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import json
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import create_admin_token, require_admin, verify_admin_pin
from app.database import get_db, init_db
from app.dokploy_client import fetch_dokploy_snapshot
from app.models import RffmUserModel, TelemetryEventModel
from app.system_metrics import fetch_raspberry_metrics


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialize database tables on startup."""
    init_db()
    yield


app = FastAPI(
    title="Homelab Pulse Telemetry API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TelemetryEventPayload(BaseModel):
    """Incoming telemetry event from any homelab application."""

    app_id: str = Field(..., min_length=2, max_length=32)
    event_type: str = Field(..., min_length=2, max_length=64)
    visitor_id: str = Field(..., min_length=4, max_length=128)
    user_email: Optional[str] = Field(default=None, max_length=255)
    path: Optional[str] = Field(default=None, max_length=255)
    metadata: Optional[Dict[str, Any]] = Field(default=None)


class PinRequest(BaseModel):
    """PIN verification request payload."""

    pin: str = Field(..., min_length=4, max_length=16)


@app.get("/health")
@app.get("/api/health")
def health_check() -> Dict[str, str]:
    """Liveness check endpoint."""
    return {"status": "ok"}


@app.post("/api/auth/verify-pin")
def verify_pin_endpoint(payload: PinRequest) -> Dict[str, str]:
    """Verify the 4-digit admin PIN and return a signed JWT."""
    if not verify_admin_pin(payload.pin):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="PIN de administrador incorrecto.",
        )
    return {"access_token": create_admin_token(), "token_type": "bearer"}


@app.post("/api/events", status_code=status.HTTP_201_CREATED)
def ingest_event(
    payload: TelemetryEventPayload,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Store an incoming telemetry event."""
    meta_str = json.dumps(payload.metadata, ensure_ascii=False) if payload.metadata else None
    ev = TelemetryEventModel(
        app_id=payload.app_id.strip().lower(),
        event_type=payload.event_type.strip().lower(),
        visitor_id=payload.visitor_id.strip(),
        user_email=payload.user_email.strip().lower() if payload.user_email else None,
        path=payload.path.strip()[:255] if payload.path else None,
        metadata_json=meta_str,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return {"ok": True, "id": ev.id}


def _safe_parse_meta(raw: Optional[str]) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _serialize_event(ev: TelemetryEventModel) -> Dict[str, Any]:
    return {
        "id": ev.id,
        "app_id": ev.app_id,
        "event_type": ev.event_type,
        "visitor_id": ev.visitor_id,
        "user_email": ev.user_email,
        "path": ev.path,
        "metadata": _safe_parse_meta(ev.metadata_json),
        "created_at": ev.created_at.isoformat(),
    }


def _count_optional_table(db: Session, table_name: str) -> int:
    try:
        res = db.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()
        return int(res or 0)
    except Exception:
        db.rollback()
        return 0


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@app.get("/api/dashboard/overview")
def get_dashboard_overview(
    _admin: Dict[str, Any] = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return full operational and product analytics for Dokploy, FutMad, and GeoRisk."""
    now = datetime.now(timezone.utc)
    cutoff_24h = now - timedelta(hours=24)

    # 1. FutMad registered users from shared rffm_db
    users_raw: List[RffmUserModel] = []
    try:
        users_raw = db.query(RffmUserModel).all()
    except Exception:
        db.rollback()

    users_raw.sort(
        key=lambda u: _ensure_utc(u.last_login_at) or _ensure_utc(u.created_at) or now,
        reverse=True,
    )
    active_users_24h = sum(
        1
        for u in users_raw
        if (_ensure_utc(u.last_login_at) or _ensure_utc(u.created_at))
        and (_ensure_utc(u.last_login_at) or _ensure_utc(u.created_at)) >= cutoff_24h
    )
    users_list = [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "auth_provider": u.auth_provider,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
        }
        for u in users_raw
    ]
    fav_teams_count = _count_optional_table(db, "favorite_teams")
    fav_campos_count = _count_optional_table(db, "favorite_campos")

    # 2. Telemetry events for FutMad & GeoRisk
    all_events = (
        db.query(TelemetryEventModel)
        .order_by(TelemetryEventModel.created_at.desc())
        .limit(1500)
        .all()
    )

    futmad_events = [e for e in all_events if e.app_id == "futmad"]
    georisk_events = [e for e in all_events if e.app_id == "georisk"]

    futmad_visitors_all = {e.visitor_id for e in futmad_events}
    futmad_visitors_24h = {
        e.visitor_id
        for e in futmad_events
        if _ensure_utc(e.created_at) and _ensure_utc(e.created_at) >= cutoff_24h
    }
    futmad_by_type: Dict[str, int] = {}
    for e in futmad_events:
        futmad_by_type[e.event_type] = futmad_by_type.get(e.event_type, 0) + 1

    user_name_by_email: Dict[str, str] = {}
    for u in users_raw:
        email_clean = u.email.strip().lower()
        if u.name and u.name.strip():
            user_name_by_email[email_clean] = u.name.strip()

    # Daily accesses & registrations breakdown (last 14 days) for FutMad
    def _new_day_bucket(day_str: str) -> Dict[str, Any]:
        return {
            "date": day_str,
            "anonymous_accesses": 0,
            "registered_accesses": 0,
            "new_registrations": 0,
            "anonymous_visitors": set(),
            "registered_users": set(),
            "registered_users_counts": {},
        }

    daily_map: Dict[str, Dict[str, Any]] = {}
    for days_ago in range(13, -1, -1):
        day_str = (now - timedelta(days=days_ago)).strftime("%Y-%m-%d")
        daily_map[day_str] = _new_day_bucket(day_str)

    for e in futmad_events:
        dt = _ensure_utc(e.created_at)
        if not dt:
            continue
        day_str = dt.strftime("%Y-%m-%d")
        if day_str not in daily_map:
            daily_map[day_str] = _new_day_bucket(day_str)
        bucket = daily_map[day_str]
        is_registered = bool(e.user_email and e.user_email.strip())
        if is_registered:
            email_clean = e.user_email.strip().lower()
            bucket["registered_users"].add(email_clean)
            if e.event_type in ("session_start", "auth_login", "auth_register"):
                bucket["registered_accesses"] += 1
                counts_map = bucket["registered_users_counts"]
                counts_map[email_clean] = counts_map.get(email_clean, 0) + 1
        else:
            bucket["anonymous_visitors"].add(e.visitor_id)
            if e.event_type == "session_start":
                bucket["anonymous_accesses"] += 1

    # Also reflect registered users' created_at (registrations per day) and last_login_at
    for u in users_raw:
        email_clean = u.email.strip().lower()
        created_ts = _ensure_utc(u.created_at)
        if created_ts:
            c_day = created_ts.strftime("%Y-%m-%d")
            if c_day not in daily_map:
                daily_map[c_day] = _new_day_bucket(c_day)
            daily_map[c_day]["new_registrations"] += 1

        for ts in (created_ts, _ensure_utc(u.last_login_at)):
            if not ts:
                continue
            day_str = ts.strftime("%Y-%m-%d")
            if day_str not in daily_map:
                daily_map[day_str] = _new_day_bucket(day_str)
            bucket = daily_map[day_str]
            if email_clean not in bucket["registered_users"]:
                bucket["registered_users"].add(email_clean)
                bucket["registered_accesses"] += 1
                counts_map = bucket["registered_users_counts"]
                counts_map[email_clean] = counts_map.get(email_clean, 0) + 1

    daily_accesses: List[Dict[str, Any]] = []
    for day_str in sorted(daily_map.keys()):
        b = daily_map[day_str]
        anon_acc = max(b["anonymous_accesses"], len(b["anonymous_visitors"]))
        reg_acc = max(b["registered_accesses"], len(b["registered_users"]))
        counts_map = b["registered_users_counts"]
        reg_users_detail = sorted(
            [
                {
                    "email": email,
                    "name": user_name_by_email.get(email),
                    "count": counts_map.get(email, 1),
                }
                for email in b["registered_users"]
            ],
            key=lambda item: (-item["count"], item["email"]),
        )
        daily_accesses.append({
            "date": day_str,
            "anonymous_accesses": anon_acc,
            "registered_accesses": reg_acc,
            "new_registrations": b["new_registrations"],
            "anonymous_unique": len(b["anonymous_visitors"]),
            "registered_unique": len(b["registered_users"]),
            "registered_users_detail": reg_users_detail,
            "total_accesses": anon_acc + reg_acc,
        })

    # Per-user total registered accesses across the last 14 days
    recent_14d = daily_accesses[-14:]
    user_access_totals: Dict[str, int] = {}
    for day_item in recent_14d:
        for detail in day_item["registered_users_detail"]:
            em = detail["email"]
            user_access_totals[em] = user_access_totals.get(em, 0) + detail["count"]

    for u_item in users_list:
        u_item["access_count_14d"] = user_access_totals.get(u_item["email"].strip().lower(), 0)

    registered_user_accesses = sorted(
        [
            {
                "email": em,
                "name": user_name_by_email.get(em),
                "access_count": cnt,
            }
            for em, cnt in user_access_totals.items()
        ],
        key=lambda item: (-item["access_count"], item["email"]),
    )

    georisk_visitors_all = {e.visitor_id for e in georisk_events}
    georisk_visitors_24h = {
        e.visitor_id
        for e in georisk_events
        if _ensure_utc(e.created_at) and _ensure_utc(e.created_at) >= cutoff_24h
    }
    georisk_by_type: Dict[str, int] = {}
    unlock_by_plan: Dict[str, int] = {"SINGLE_REPORT_699": 0, "PACK_3_1490": 0}
    georisk_errors: List[Dict[str, Any]] = []

    for e in georisk_events:
        georisk_by_type[e.event_type] = georisk_by_type.get(e.event_type, 0) + 1
        meta = _safe_parse_meta(e.metadata_json)
        if e.event_type == "unlock_click":
            plan = str(meta.get("plan_type") or "SINGLE_REPORT_699")
            unlock_by_plan[plan] = unlock_by_plan.get(plan, 0) + 1
        if "error" in e.event_type:
            georisk_errors.append(_serialize_event(e))

    total_errors_24h = sum(
        1
        for e in all_events
        if "error" in e.event_type
        and _ensure_utc(e.created_at)
        and _ensure_utc(e.created_at) >= cutoff_24h
    )

    return {
        "generated_at": now.isoformat(),
        "global_kpis": {
            "total_registered_users": len(users_list),
            "active_users_24h": active_users_24h,
            "unique_visitors_24h": len(futmad_visitors_24h | georisk_visitors_24h),
            "total_events_logged": len(all_events),
            "errors_24h": total_errors_24h,
        },
        "dokploy": fetch_dokploy_snapshot(),
        "raspberry": fetch_raspberry_metrics(),
        "futmad": {
            "registered_users_total": len(users_list),
            "active_users_24h": active_users_24h,
            "favorite_teams_total": fav_teams_count,
            "favorite_campos_total": fav_campos_count,
            "unique_visitors_total": len(futmad_visitors_all),
            "unique_visitors_24h": len(futmad_visitors_24h),
            "sessions_total": futmad_by_type.get("session_start", 0),
            "events_by_type": futmad_by_type,
            "daily_accesses": recent_14d,
            "registered_user_accesses": registered_user_accesses,
            "users": users_list,
            "recent_events": [_serialize_event(e) for e in futmad_events[:25]],
        },
        "georisk": {
            "unique_visitors_total": len(georisk_visitors_all),
            "unique_visitors_24h": len(georisk_visitors_24h),
            "page_views_total": georisk_by_type.get("page_view", 0),
            "property_searches_total": georisk_by_type.get("search_property", 0),
            "unlock_clicks_total": georisk_by_type.get("unlock_click", 0),
            "unlock_by_plan": unlock_by_plan,
            "errors_total": len(georisk_errors),
            "events_by_type": georisk_by_type,
            "recent_errors": georisk_errors[:25],
            "recent_events": [_serialize_event(e) for e in georisk_events[:25]],
        },
    }

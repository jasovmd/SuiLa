from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import notify
import store
import webhook

router = APIRouter()


class BindIn(BaseModel):
    device_id: str = Field(min_length=1, max_length=64)
    role: str = Field(pattern="^(self|family)$")
    consent: bool = False


class DeviceIn(BaseModel):
    device_id: str = Field(min_length=1, max_length=64)


class PrefsIn(BaseModel):
    device_id: str = Field(min_length=1, max_length=64)
    enabled: bool = True
    interval_min: int = Field(ge=30, le=720)
    quiet_start: str = "22:00"
    quiet_end: str = "07:00"
    meds: list[str] = Field(default_factory=list)
    confirm: bool = False


class ShareIn(BaseModel):
    device_id: str = Field(min_length=1, max_length=64)
    confirm: bool = False


def _hhmm(value: str) -> str:
    hour, _, minute = value.partition(":")
    if not (hour.isdigit() and minute.isdigit() and len(hour) <= 2 and len(minute) == 2):
        raise HTTPException(status_code=400, detail="時間格式需為 HH:MM")
    hh, mm = int(hour), int(minute)
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        raise HTTPException(status_code=400, detail="時間不正確")
    return f"{hh:02d}:{mm:02d}"


@router.post("/line/webhook")
async def line_webhook(request: Request):
    raw = await request.body()
    secret = os.getenv("LINE_CHANNEL_SECRET", "")
    signature = request.headers.get("x-line-signature", "")
    if not webhook.verify_signature(raw, signature, secret):
        raise HTTPException(status_code=400, detail="signature")
    try:
        webhook.handle_body(raw)
    except Exception:
        return {"ok": True}
    return {"ok": True}


@router.post("/api/line/bind-code")
def bind_code(body: BindIn):
    try:
        return store.create_code(body.device_id, body.role, body.consent)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/line/unbind")
def unbind(body: DeviceIn):
    return {"removed": store.unbind_device(body.device_id)}


@router.get("/api/line/status")
def line_status(device_id: str = "suila-esp32c3-01"):
    return store.status(device_id)


@router.get("/api/line/settings")
def line_settings(device_id: str = "suila-esp32c3-01"):
    return store.get_prefs(device_id)


@router.put("/api/line/settings")
def put_line_settings(body: PrefsIn):
    if not body.confirm:
        raise HTTPException(status_code=400, detail="需要確認後才會修改通知設定")
    meds = [_hhmm(item) for item in body.meds]
    return store.save_prefs(
        body.device_id,
        body.enabled,
        body.interval_min,
        _hhmm(body.quiet_start),
        _hhmm(body.quiet_end),
        meds,
    )


@router.post("/api/line/share-analysis")
def share_analysis(body: ShareIn):
    if not body.confirm:
        raise HTTPException(status_code=400, detail="需要同意後才通知家人")
    from app.analysis import analyze

    report = analyze(body.device_id)
    if report.get("status") != "ok":
        raise HTTPException(status_code=400, detail="資料累積中")
    sent = notify.share_analysis(body.device_id, report.get("summary") or report.get("message") or "")
    return {"ok": True, "sent": sent}


def register(app) -> None:
    store.init_tables()
    if not getattr(app.state, "line_registered", False):
        app.include_router(router)
        app.state.line_registered = True

"""SuiLa77 phone app routes — thin adapters over existing SQLite / LINE store.

ESP keeps /api/intake and /api/heartbeat. The Capacitor app uses these paths
from BACKEND.md. One default device; no login cookies required.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import timedelta
from urllib.parse import quote

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .analysis import analyze
from .db import connect
from .reminders import get_times, set_times
from .timeutil import now_utc, to_iso

VOICE_DIR = Path(__file__).resolve().parent.parent / "data" / "voice"

DEVICE_ID = os.getenv("SUILA_DEVICE_ID", "suila-esp32c3-01")
ONLINE_SECONDS = 45
COLORS = ("coral", "blue", "green")

router = APIRouter(tags=["phone"])


def _get(conn, key: str, default: str = "") -> str:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def _put(conn, key: str, value: str) -> None:
    conn.execute(
        """
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (key, value),
    )


def _json_get(conn, key: str, default):
    raw = _get(conn, key, "")
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default


def _json_put(conn, key: str, value) -> None:
    _put(conn, key, json.dumps(value, ensure_ascii=False))


def _heartbeat_row(conn):
    return conn.execute(
        "SELECT last_seen_at FROM heartbeats WHERE device_id = ?",
        (DEVICE_ID,),
    ).fetchone()


def _row_online(row) -> bool:
    if not row:
        return False
    try:
        from .timeutil import parse_iso

        age = (now_utc() - parse_iso(row["last_seen_at"])).total_seconds()
    except ValueError:
        return False
    # A future timestamp is a bad clock, not a live base.
    return 0 <= age <= ONLINE_SECONDS


def _online(conn) -> bool:
    return _row_online(_heartbeat_row(conn))


def _device_status(conn) -> dict:
    row = _heartbeat_row(conn)
    online = _row_online(row)
    name = _get(conn, f"name:{DEVICE_ID}", "").strip() or "水啦底座"
    return {
        "paired": _get(conn, f"paired:{DEVICE_ID}", "0") == "1" or online,
        "connected": online,
        "batteryPercent": int(_get(conn, f"battery:{DEVICE_ID}", "100") or "100"),
        "pendingSyncCount": 0,
        "name": name,
        "deviceId": DEVICE_ID,
    }


def _record_row(row) -> dict:
    return {
        "id": row["event_id"],
        "time": row["measured_at"],
        "amountMl": int(row["estimated_intake_ml"]),
    }


# --- records -----------------------------------------------------------------


@router.get("/records")
def list_records():
    since = to_iso(now_utc() - timedelta(days=40))
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT event_id, measured_at, estimated_intake_ml
            FROM intake_events
            WHERE device_id = ? AND measured_at >= ?
            ORDER BY measured_at DESC
            """,
            (DEVICE_ID, since),
        ).fetchall()
    return [_record_row(row) for row in rows]


class RecordIn(BaseModel):
    amountMl: int = Field(ge=1, le=5000)


@router.post("/records")
def add_record(body: RecordIn):
    event_id = f"manual-{uuid.uuid4().hex[:16]}"
    stamped = to_iso(now_utc())
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO intake_events (
                event_id, device_id, measured_at, received_at,
                estimated_intake_ml, measurement_mode, time_verified
            ) VALUES (?, ?, ?, ?, ?, 'manual', 1)
            """,
            (event_id, DEVICE_ID, stamped, stamped, body.amountMl),
        )
    return {"id": event_id, "time": stamped, "amountMl": body.amountMl}


@router.patch("/records/{record_id}")
def patch_record(record_id: str, body: RecordIn):
    with connect() as conn:
        row = conn.execute(
            "SELECT event_id, measured_at FROM intake_events WHERE event_id = ? AND device_id = ?",
            (record_id, DEVICE_ID),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="not found")
        conn.execute(
            "UPDATE intake_events SET estimated_intake_ml = ? WHERE event_id = ?",
            (body.amountMl, record_id),
        )
    return {"id": record_id, "time": row["measured_at"], "amountMl": body.amountMl}


@router.delete("/records/{record_id}")
def delete_record(record_id: str):
    with connect() as conn:
        cur = conn.execute(
            "DELETE FROM intake_events WHERE event_id = ? AND device_id = ?",
            (record_id, DEVICE_ID),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="not found")
    return Response(status_code=204)


# --- device ------------------------------------------------------------------


@router.get("/device")
def get_device():
    with connect() as conn:
        return _device_status(conn)


@router.post("/device/pair")
def pair_device():
    with connect() as conn:
        _put(conn, f"paired:{DEVICE_ID}", "1")
        return _device_status(conn)


# --- settings / profile ------------------------------------------------------


class ReminderIn(BaseModel):
    dailyGoalMl: int = Field(ge=500, le=4000)
    times: list[str]
    brightness: str = Field(pattern="^(low|medium|high)$")


@router.get("/settings/reminders")
def get_reminders():
    with connect() as conn:
        goal = int(_get(conn, "daily_goal_ml", "2000") or "2000")
        brightness = _get(conn, "brightness", "medium") or "medium"
        if brightness not in {"low", "medium", "high"}:
            brightness = "medium"
        return {
            "dailyGoalMl": goal,
            "times": get_times(conn),
            "brightness": brightness,
        }


@router.put("/settings/reminders")
def put_reminders(body: ReminderIn):
    cleaned = []
    for item in body.times:
        hour, _, minute = item.partition(":")
        if not (hour.isdigit() and minute.isdigit()):
            raise HTTPException(status_code=400, detail="time")
        hh, mm = int(hour), int(minute)
        if not (0 <= hh <= 23 and 0 <= mm <= 59):
            raise HTTPException(status_code=400, detail="time")
        cleaned.append(f"{hh:02d}:{mm:02d}")
    cleaned = sorted(set(cleaned))
    with connect() as conn:
        _put(conn, "daily_goal_ml", str(body.dailyGoalMl))
        saved = set_times(conn, cleaned)
        _put(conn, "brightness", body.brightness)
    return {
        "dailyGoalMl": body.dailyGoalMl,
        "times": saved,
        "brightness": body.brightness,
    }


class NightMuteIn(BaseModel):
    enabled: bool
    start: str
    end: str


def _hhmm(value: str) -> str:
    hour, _, minute = value.partition(":")
    if not (hour.isdigit() and minute.isdigit()):
        raise HTTPException(status_code=400, detail="time")
    hh, mm = int(hour), int(minute)
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        raise HTTPException(status_code=400, detail="time")
    return f"{hh:02d}:{mm:02d}"


@router.get("/settings/night-mute")
def get_night_mute():
    with connect() as conn:
        data = _json_get(
            conn,
            "night_mute",
            {"enabled": True, "start": "22:00", "end": "07:00"},
        )
    return data


@router.put("/settings/night-mute")
def put_night_mute(body: NightMuteIn):
    data = {
        "enabled": body.enabled,
        "start": _hhmm(body.start),
        "end": _hhmm(body.end),
    }
    with connect() as conn:
        _json_put(conn, "night_mute", data)
        # Keep LINE quiet hours in sync when that table exists.
        try:
            import store

            prefs = store.get_prefs(DEVICE_ID)
            store.save_prefs(
                DEVICE_ID,
                prefs["enabled"],
                prefs["interval_min"],
                data["start"],
                data["end"],
                prefs["meds"],
            )
        except Exception:
            pass
    return data


class ProfileIn(BaseModel):
    name: str = ""
    heightCm: str = ""
    weightKg: str = ""
    conditions: list[str] = Field(default_factory=list)


class AuthSessionIn(BaseModel):
    uid: str = Field(min_length=1, max_length=128)
    provider: str = Field(min_length=1, max_length=32)
    phone: str | None = None
    name: str = ""


def _caller_uid(request: Request) -> str:
    return (request.headers.get("x-suila-uid") or "").strip()[:128]


@router.post("/auth/session")
def post_auth_session(body: AuthSessionIn):
    """Remember this phone as someone a LINE voice can be sent to."""
    with connect() as conn:
        _put(conn, "auth_uid", body.uid)
        _put(conn, "auth_provider", body.provider)
        if body.phone:
            _put(conn, "auth_phone", body.phone)
    try:
        import store

        store.init_tables()
        store.upsert_elder(body.uid, body.name)
    except Exception:
        pass
    return {"ok": True, "uid": body.uid}


@router.delete("/auth/account")
def delete_account():
    """Remove the signed-in owner. Drink logs and the paired base stay on the device."""
    with connect() as conn:
        conn.execute(
            """
            DELETE FROM settings
            WHERE key IN (
                'auth_uid', 'auth_provider', 'auth_phone', 'profile',
                'family_members', 'voice_messages', 'is_pro', 'pro_plan'
            )
            OR key = ?
            """,
            (f"name:{DEVICE_ID}",),
        )
    return Response(status_code=204)


@router.get("/profile")
def get_profile():
    with connect() as conn:
        return _json_get(
            conn,
            "profile",
            {"name": "", "heightCm": "", "weightKg": "", "conditions": ["none"]},
        )


@router.put("/profile")
def put_profile(body: ProfileIn, request: Request):
    data = body.model_dump()
    with connect() as conn:
        _json_put(conn, "profile", data)
        if data.get("name"):
            _put(conn, f"name:{DEVICE_ID}", str(data["name"])[:32])
    uid = _caller_uid(request)
    if uid and data.get("name"):
        try:
            import store

            store.upsert_elder(uid, str(data["name"]))
        except Exception:
            pass
    return data


# --- family / LINE / messages / pro -----------------------------------------


def _line_display_name(user_id: str) -> str:
    try:
        from line_push import fetch_profile

        return fetch_profile(user_id)
    except Exception:
        return ""


@router.get("/family")
def get_family():
    members = []
    line_connected = False
    owner_name = ""
    with connect() as conn:
        profile = _json_get(conn, "profile", {})
        if isinstance(profile, dict):
            owner_name = str(profile.get("name") or "").strip()
    try:
        import store

        store.init_tables()
        people = store.bindings(DEVICE_ID)
        line_connected = any(p["role"] == "self" for p in people)
        ordered = sorted(people, key=lambda person: 0 if person["role"] == "self" else 1)
        family_index = 0
        for person in ordered:
            uid = person["line_user_id"]
            name = str(person.get("display_name") or "").strip()
            if not name:
                name = _line_display_name(uid)
                if name:
                    store.set_display_name(uid, name)
            if person["role"] == "self":
                relation = "本人"
                if not name:
                    name = owner_name or "我的 LINE"
            else:
                family_index += 1
                relation = "家人"
                if not name:
                    name = f"家人{family_index}"
            members.append(
                {
                    "id": uid,
                    "name": name,
                    "relation": relation,
                    "color": COLORS[len(members) % len(COLORS)],
                }
            )
    except Exception:
        pass
    with connect() as conn:
        extra = _json_get(conn, "family_members", [])
        if isinstance(extra, list):
            known = {m["id"] for m in members}
            for item in extra:
                if isinstance(item, dict) and item.get("id") and item["id"] not in known:
                    members.append(item)
    return {"lineConnected": line_connected, "members": members}


class LineRestoreIn(BaseModel):
    lineUserId: str = Field(min_length=1, max_length=64)
    displayName: str = ""


@router.post("/family/line-restore")
def line_restore(body: LineRestoreIn):
    """The phone remembers who was linked, so a restarted server can put them back."""
    try:
        import store

        store.init_tables()
        store.ensure_self(DEVICE_ID, body.lineUserId, body.displayName)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return get_family()


@router.post("/family/line-link")
def line_link():
    try:
        import store

        store.init_tables()
        status = store.status(DEVICE_ID)
        if status.get("self", 0) > 0:
            return {"url": None, "connected": True, "code": None}
        code = store.create_code(DEVICE_ID, "self", True)
        return {
            "url": None,
            "connected": False,
            "code": code["code"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/family/invite")
def family_invite():
    with connect() as conn:
        is_pro = _get(conn, "is_pro", "0") == "1"
        extras = _json_get(conn, "family_members", [])
        local_count = len(extras) if isinstance(extras, list) else 0
    try:
        import store

        family_count = store.status(DEVICE_ID).get("family", 0) + local_count
    except Exception:
        family_count = local_count
    if not is_pro and family_count >= 2:
        raise HTTPException(status_code=400, detail="free limit")
    try:
        import store

        code = store.issue_family_code(DEVICE_ID)
        text = quote(f"邀請你加入水啦家人，綁定碼：{code['code']}")
        return {
            "code": code["code"],
            "expiresAt": code["expires_at"],
            "url": f"https://line.me/R/share?text={text}",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


class MemberIn(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    relation: str = Field(min_length=1, max_length=16)


@router.post("/family/members")
def add_family_member(body: MemberIn):
    with connect() as conn:
        is_pro = _get(conn, "is_pro", "0") == "1"
        extras = _json_get(conn, "family_members", [])
        if not isinstance(extras, list):
            extras = []
        if not is_pro and len(extras) >= 2:
            raise HTTPException(status_code=400, detail="free limit")
        member = {
            "id": f"m-{uuid.uuid4().hex[:10]}",
            "name": body.name.strip()[:32],
            "relation": body.relation.strip()[:16],
            "color": COLORS[len(extras) % len(COLORS)],
        }
        extras.append(member)
        _json_put(conn, "family_members", extras)
    return member


@router.delete("/family/members/{member_id}")
def delete_family_member(member_id: str):
    removed_local = False
    with connect() as conn:
        extras = _json_get(conn, "family_members", [])
        if not isinstance(extras, list):
            extras = []
        next_list = [item for item in extras if isinstance(item, dict) and item.get("id") != member_id]
        removed_local = len(next_list) != len(extras)
        if removed_local:
            _json_put(conn, "family_members", next_list)
    removed_line = False
    try:
        import store

        removed_line = store.unbind_user(member_id)
    except Exception:
        removed_line = False
    if not removed_local and not removed_line:
        raise HTTPException(status_code=404, detail="not found")
    return Response(status_code=204)


@router.get("/messages")
def get_messages(request: Request):
    uid = _caller_uid(request)
    with connect() as conn:
        messages = _json_get(conn, "voice_messages", [])
    if not isinstance(messages, list):
        return []
    out = []
    for item in messages:
        if not isinstance(item, dict):
            continue
        target = str(item.get("toUid") or "")
        if uid and target and target != uid:
            continue
        mid = str(item.get("id") or "")
        cleaned = {
            "id": mid,
            "from": str(item.get("from") or ""),
            "time": str(item.get("time") or ""),
            "durationSec": int(item.get("durationSec") or 1),
            "played": bool(item.get("played")),
            "audioUrl": f"/messages/{mid}/audio" if mid else None,
        }
        out.append(cleaned)
    return out


@router.get("/messages/{message_id}/audio")
def get_message_audio(message_id: str):
    safe = "".join(ch for ch in message_id if ch.isalnum() or ch in "-_")
    if not safe or safe != message_id:
        raise HTTPException(status_code=404, detail="not found")
    with connect() as conn:
        messages = _json_get(conn, "voice_messages", [])
    path_name = ""
    if isinstance(messages, list):
        for item in messages:
            if isinstance(item, dict) and item.get("id") == message_id:
                path_name = str(item.get("audioPath") or "")
                break
    if not path_name:
        # Fallback: any extension saved for this id.
        matches = list(VOICE_DIR.glob(f"{safe}.*")) if VOICE_DIR.exists() else []
        if not matches:
            raise HTTPException(status_code=404, detail="not found")
        file_path = matches[0]
    else:
        file_path = VOICE_DIR / Path(path_name).name
        if not file_path.is_file():
            raise HTTPException(status_code=404, detail="not found")
    media = "audio/mp4"
    suffix = file_path.suffix.lower()
    if suffix == ".mp3":
        media = "audio/mpeg"
    elif suffix == ".wav":
        media = "audio/wav"
    elif suffix == ".ogg":
        media = "audio/ogg"
    elif suffix in {".m4a", ".mp4"}:
        media = "audio/mp4"
    return FileResponse(file_path, media_type=media)


@router.post("/messages/{message_id}/played")
def mark_played(message_id: str):
    with connect() as conn:
        messages = _json_get(conn, "voice_messages", [])
        if isinstance(messages, list):
            for item in messages:
                if isinstance(item, dict) and item.get("id") == message_id:
                    item["played"] = True
            _json_put(conn, "voice_messages", messages)
    return Response(status_code=204)


@router.get("/subscription")
def get_subscription():
    with connect() as conn:
        return {"isPro": _get(conn, "is_pro", "0") == "1"}


class SubIn(BaseModel):
    plan: str = Field(pattern="^(monthly|yearly)$")


@router.post("/subscription")
def post_subscription(body: SubIn):
    # No payment yet — flipping the flag is enough for UI unlock.
    with connect() as conn:
        _put(conn, "is_pro", "1")
        _put(conn, "pro_plan", body.plan)
    return {"isPro": True}


@router.get("/analysis")
def get_analysis():
    report = analyze(DEVICE_ID)
    advice = report.get("summary") or report.get("message") or None
    if report.get("status") == "accumulating":
        advice = None
    return {"advice": advice}

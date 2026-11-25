from __future__ import annotations

from datetime import date
from pathlib import Path
import sys

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .analysis import analyze
from .db import connect, init_db
from .phone_api import router as phone_router
from .reminders import add_time, get_times, start_background
from .timeutil import day_bounds_utc, day_in_taipei, now_utc, parse_iso, to_iso

def _line_root() -> Path:
    here = Path(__file__).resolve()
    for candidate in (here.parents[2] / "LINE", here.parents[1] / "LINE"):
        if candidate.is_dir():
            return candidate
    return here.parents[2] / "LINE"


_LINE_ROOT = _line_root()
if str(_LINE_ROOT) not in sys.path:
    sys.path.insert(0, str(_LINE_ROOT))
from envfile import load_env
from routes import register

app = FastAPI(title="水啦 SuiLa")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(phone_router)


class IntakeIn(BaseModel):
    event_id: str = Field(min_length=1, max_length=64)
    device_id: str = Field(min_length=1, max_length=64)
    measured_at: str
    estimated_intake_ml: int = Field(ge=0, le=5000)
    measurement_mode: str = Field(pattern="^(sim|real)$")
    time_verified: bool


class HeartbeatIn(BaseModel):
    device_id: str = Field(min_length=1, max_length=64)
    measurement_mode: str = Field(pattern="^(sim|real)$")
    sensor_ok: bool
    baseline_ready: bool
    message: str = ""


class GoalIn(BaseModel):
    daily_goal_ml: int = Field(ge=100, le=10000)


@app.on_event("startup")
def startup() -> None:
    init_db()
    load_env(_LINE_ROOT / ".env")
    try:
        import store

        store.init_tables()
    except Exception:
        pass
    register(app)
    start_background()


@app.get("/api/health")
def health():
    return {"ok": True, "service": "suila"}


@app.post("/api/intake")
def add_intake(body: IntakeIn):
    try:
        measured = parse_iso(body.measured_at)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="measured_at 格式錯誤") from exc

    received = now_utc()
    with connect() as conn:
        existing = conn.execute(
            "SELECT event_id FROM intake_events WHERE event_id = ?",
            (body.event_id,),
        ).fetchone()
        if existing:
            return {"ok": True, "duplicated": True, "event_id": body.event_id}

        conn.execute(
            """
            INSERT INTO intake_events (
                event_id, device_id, measured_at, received_at,
                estimated_intake_ml, measurement_mode, time_verified
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                body.event_id,
                body.device_id,
                to_iso(measured),
                to_iso(received),
                body.estimated_intake_ml,
                body.measurement_mode,
                1 if body.time_verified else 0,
            ),
        )
    return {"ok": True, "duplicated": False, "event_id": body.event_id}


@app.get("/api/intake/daily")
def daily_intake(
    day: date | None = Query(default=None, description="Asia/Taipei 日期 YYYY-MM-DD"),
    device_id: str | None = None,
):
    target = day or day_in_taipei(now_utc())
    start, end = day_bounds_utc(target)
    params: list = [to_iso(start), to_iso(end)]
    where = "measured_at >= ? AND measured_at <= ?"
    if device_id:
        where += " AND device_id = ?"
        params.append(device_id)

    where += " AND measurement_mode = 'real'"
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT event_id, device_id, measured_at, received_at,
                   estimated_intake_ml, measurement_mode, time_verified
            FROM intake_events
            WHERE {where}
            ORDER BY measured_at ASC
            """,
            params,
        ).fetchall()

    events = []
    total = 0
    last_time = None
    for row in rows:
        item = {
            "event_id": row["event_id"],
            "device_id": row["device_id"],
            "measured_at": row["measured_at"],
            "received_at": row["received_at"],
            "estimated_intake_ml": row["estimated_intake_ml"],
            "measurement_mode": row["measurement_mode"],
            "time_verified": bool(row["time_verified"]),
        }
        events.append(item)
        if item["time_verified"]:
            total += item["estimated_intake_ml"]
            last_time = item["measured_at"]

    return {
        "date": target.isoformat(),
        "total_ml": total,
        "last_intake_at": last_time,
        "events": events,
    }


@app.post("/api/intake/today/clear")
def clear_today(device_id: str = Query(default="suila-esp32c3-01")):
    target = day_in_taipei(now_utc())
    start, end = day_bounds_utc(target)
    with connect() as conn:
        conn.execute(
            "DELETE FROM intake_events WHERE device_id = ? AND measured_at >= ? AND measured_at <= ?",
            (device_id, to_iso(start), to_iso(end)),
        )
        goal = conn.execute(
            "SELECT value FROM settings WHERE key = 'daily_goal_ml'"
        ).fetchone()
        grams = goal["value"] if goal else "2000"
        key = _setting_key(device_id, "last_grams")
        _put_setting(conn, key, grams)
        _put_setting(conn, _setting_key(device_id, "sim_grams"), grams)
    return {"ok": True, "date": target.isoformat(), "cup_grams": float(grams)}


@app.post("/api/heartbeat")
def heartbeat(body: HeartbeatIn):
    seen = to_iso(now_utc())
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO heartbeats (device_id, last_seen_at, measurement_mode, sensor_ok, baseline_ready, message)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
                last_seen_at = excluded.last_seen_at,
                measurement_mode = excluded.measurement_mode,
                sensor_ok = excluded.sensor_ok,
                baseline_ready = excluded.baseline_ready,
                message = excluded.message
            """,
            (
                body.device_id,
                seen,
                body.measurement_mode,
                1 if body.sensor_ok else 0,
                1 if body.baseline_ready else 0,
                body.message[:200],
            ),
        )
    return {"ok": True, "last_seen_at": seen}


def _setting_key(device_id: str, kind: str) -> str:
    return f"{kind}:{device_id}"


def _get_setting(conn, key: str, default: str = "") -> str:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def _put_setting(conn, key: str, value: str) -> None:
    conn.execute(
        """
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (key, value),
    )


@app.get("/api/devices/{device_id}/status")
def device_status(device_id: str):
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM heartbeats WHERE device_id = ?",
            (device_id,),
        ).fetchone()
        name = _get_setting(conn, _setting_key(device_id, "name"), "")
    if row is None:
        return {
            "device_id": device_id,
            "name": name,
            "online": False,
            "last_seen_at": None,
            "measurement_mode": None,
            "sensor_ok": None,
            "baseline_ready": None,
            "message": "",
        }
    last = parse_iso(row["last_seen_at"])
    # ESP 心跳約 15 秒；允許偶發漏打，約 3 次才判離線。未來的時間不算在線。
    age = (now_utc() - last).total_seconds()
    online = 0 <= age <= 45
    return {
        "device_id": device_id,
        "name": name,
        "online": online,
        "last_seen_at": row["last_seen_at"],
        "measurement_mode": row["measurement_mode"],
        "sensor_ok": bool(row["sensor_ok"]),
        "baseline_ready": bool(row["baseline_ready"]),
        "message": row["message"],
    }


class DeviceNameIn(BaseModel):
    name: str = Field(min_length=1, max_length=32)


@app.put("/api/devices/{device_id}/name")
def put_device_name(device_id: str, body: DeviceNameIn):
    with connect() as conn:
        _put_setting(conn, _setting_key(device_id, "name"), body.name.strip())
    return {"device_id": device_id, "name": body.name.strip()}


class SimIn(BaseModel):
    """grams=設定杯重；drink_ml=本次喝掉的克數（記入飲水，杯重自動扣除）。"""

    grams: float | None = Field(default=None, ge=0, le=10000)
    drink_ml: int | None = Field(default=None, ge=1, le=5000)


@app.post("/api/devices/{device_id}/sim")
def post_sim(device_id: str, body: SimIn):
    """
    - 只帶 grams：設定杯中重量（滿杯／空杯），不計飲水
    - 帶 drink_ml：今日 +drink_ml，杯中剩餘 = 上次重量 - drink_ml
      例：滿杯 2000 → 喝一口 300 → 剩餘 1700、今日 +300
    """
    if body.grams is None and body.drink_ml is None:
        raise HTTPException(status_code=400, detail="需要 grams 或 drink_ml")

    received = now_utc()
    last_key = _setting_key(device_id, "last_grams")
    with connect() as conn:
        raw_last = _get_setting(conn, last_key, "")
        try:
            prev = float(raw_last) if raw_last != "" else 2000.0
        except ValueError:
            prev = 2000.0

        intake: int | None = None
        if body.drink_ml is not None:
            intake = body.drink_ml
            new_grams = max(0.0, prev - float(intake))
        else:
            new_grams = float(body.grams)  # type: ignore[arg-type]

        _put_setting(conn, _setting_key(device_id, "sim_grams"), str(new_grams))
        _put_setting(conn, last_key, str(new_grams))

        if intake is not None:
            event_id = f"sim-{device_id}-{int(received.timestamp() * 1000)}"
            conn.execute(
                """
                INSERT INTO intake_events (
                    event_id, device_id, measured_at, received_at,
                    estimated_intake_ml, measurement_mode, time_verified
                ) VALUES (?, ?, ?, ?, ?, 'sim', 1)
                """,
                (
                    event_id,
                    device_id,
                    to_iso(received),
                    to_iso(received),
                    intake,
                ),
            )
    return {"ok": True, "grams": new_grams, "intake_ml": intake, "cup_grams": new_grams}


@app.get("/api/home")
def home_summary(device_id: str = Query(default="suila-esp32c3-01")):
    """今日頁單次彙總，減少 APP 連線次數。"""
    daily = daily_intake(day=None, device_id=device_id)
    goal = get_goal()
    status = device_status(device_id)
    with connect() as conn:
        raw = _get_setting(conn, _setting_key(device_id, "last_grams"), "2000")
    try:
        cup_grams = float(raw)
    except ValueError:
        cup_grams = 2000.0
    return {
        "total_ml": daily["total_ml"],
        "last_intake_at": daily["last_intake_at"],
        "date": daily["date"],
        "daily_goal_ml": goal["daily_goal_ml"],
        "online": status["online"],
        "measurement_mode": status["measurement_mode"],
        "name": status["name"],
        "message": status["message"],
        "cup_grams": cup_grams,
    }


@app.get("/api/devices/{device_id}/command")
def get_device_command(device_id: str):
    with connect() as conn:
        key = _setting_key(device_id, "sim_grams")
        raw = _get_setting(conn, key, "")
        if raw == "":
            return {"sim_grams": None}
        conn.execute("DELETE FROM settings WHERE key = ?", (key,))
    try:
        return {"sim_grams": float(raw)}
    except ValueError:
        return {"sim_grams": None}


@app.get("/api/analysis")
def get_analysis(device_id: str = Query(default="suila-esp32c3-01")):
    return analyze(device_id)


@app.get("/api/reminders")
def get_reminders():
    with connect() as conn:
        times = get_times(conn)
    return {"times": times}


class ReminderConfirmIn(BaseModel):
    time: str = Field(min_length=5, max_length=5)
    confirm: bool = False


@app.post("/api/reminders/confirm")
def confirm_reminder(body: ReminderConfirmIn):
    if not body.confirm:
        raise HTTPException(status_code=400, detail="需要確認後才會修改提醒")
    hour, _, minute = body.time.partition(":")
    if not (hour.isdigit() and minute.isdigit()):
        raise HTTPException(status_code=400, detail="時間格式需為 HH:MM")
    hh, mm = int(hour), int(minute)
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        raise HTTPException(status_code=400, detail="時間不正確")
    hhmm = f"{hh:02d}:{mm:02d}"
    with connect() as conn:
        times = add_time(conn, hhmm)
    return {"times": times}


@app.get("/api/goal")
def get_goal():
    with connect() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = 'daily_goal_ml'"
        ).fetchone()
    return {"daily_goal_ml": int(row["value"]) if row else 2000}


@app.put("/api/goal")
def put_goal(body: GoalIn):
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO settings (key, value) VALUES ('daily_goal_ml', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (str(body.daily_goal_ml),),
        )
    return {"daily_goal_ml": body.daily_goal_ml}

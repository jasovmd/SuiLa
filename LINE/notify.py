from __future__ import annotations

import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

import store
from app.db import connect
from app.timeutil import TAIPEI, day_bounds_utc, day_in_taipei, now_utc, parse_iso, to_iso
from line_push import push_text

ONLINE_SECONDS = 45


def in_quiet(hhmm: str, start: str, end: str) -> bool:
    if not start or not end or start == end:
        return False
    if start < end:
        return start <= hhmm < end
    return hhmm >= start or hhmm < end


def _online(device_id: str) -> bool:
    with connect() as conn:
        row = conn.execute(
            "SELECT last_seen_at FROM heartbeats WHERE device_id = ?",
            (device_id,),
        ).fetchone()
    if row is None:
        return False
    try:
        return (now_utc() - parse_iso(row["last_seen_at"])).total_seconds() <= ONLINE_SECONDS
    except ValueError:
        return False


def _goal(conn) -> int:
    row = conn.execute("SELECT value FROM settings WHERE key = 'daily_goal_ml'").fetchone()
    return int(row["value"]) if row else 2000


def _today_verified(conn, device_id: str) -> int:
    start, end = day_bounds_utc(day_in_taipei(now_utc()))
    rows = conn.execute(
        """
        SELECT estimated_intake_ml FROM intake_events
        WHERE device_id = ? AND measured_at >= ? AND measured_at <= ? AND time_verified = 1
        """,
        (device_id, to_iso(start), to_iso(end)),
    ).fetchall()
    return sum(int(row["estimated_intake_ml"]) for row in rows)


def _last_valid(conn, device_id: str):
    row = conn.execute(
        """
        SELECT measured_at FROM intake_events
        WHERE device_id = ? AND measurement_mode = 'real' AND time_verified = 1
          AND estimated_intake_ml BETWEEN 5 AND 800
        ORDER BY measured_at DESC LIMIT 1
        """,
        (device_id,),
    ).fetchone()
    if row is None:
        return None
    try:
        return parse_iso(row["measured_at"])
    except ValueError:
        return None


def deliver(device_id: str, kind: str, text: str, within_min: int, family_only: bool = False) -> None:
    try:
        people = store.bindings(device_id, family_only=family_only)
    except Exception:
        return
    for person in people:
        user_id = person["line_user_id"]
        try:
            if store.recently_sent(user_id, kind, within_min):
                continue
            ok = push_text(user_id, text)
            store.log_send(user_id, device_id, kind, ok, 1 if ok else 3)
        except Exception:
            try:
                store.log_send(user_id, device_id, kind, False, 3)
            except Exception:
                pass


def copy_fixed(total: int, goal: int) -> str:
    return f"該喝水了。今天已喝 {total}/{goal} ml。"


def copy_progress(total: int, goal: int) -> str:
    return f"下午偏少，記得多喝。目前 {total}/{goal} ml。"


def copy_gap() -> str:
    return "有一陣子沒看到喝水紀錄，方便時喝一口。"


def copy_med(hhmm: str) -> str:
    return f"用藥時間到了（{hhmm}）。"


def copy_analysis(summary: str) -> str:
    return f"飲水習慣整理：{summary}（僅供參考）。"


def run_reminders(device_id: str = "suila-esp32c3-01") -> None:
    """固定門檻提醒。離線時不把缺少紀錄說成沒喝水。這不是 AI。"""
    prefs = store.get_prefs(device_id)
    if not prefs["enabled"]:
        return
    local = now_utc().astimezone(TAIPEI)
    hhmm = local.strftime("%H:%M")
    day = local.date().isoformat()
    if in_quiet(hhmm, prefs["quiet_start"], prefs["quiet_end"]):
        return
    for med in prefs["meds"]:
        if med == hhmm:
            deliver(
                device_id,
                f"med:{day}:{hhmm}",
                copy_med(hhmm),
                within_min=20 * 60,
            )
    if not _online(device_id):
        return
    from app.reminders import get_times

    with connect() as conn:
        if hhmm in get_times(conn):
            total = _today_verified(conn, device_id)
            goal = _goal(conn)
            deliver(
                device_id,
                f"fixed:{day}:{hhmm}",
                copy_fixed(total, goal),
                within_min=20 * 60,
            )
        elapsed = min(14, max(0, local.hour - 8))
        goal = _goal(conn)
        total = _today_verified(conn, device_id)
        expected = goal * (elapsed / 14) if goal else 0
        if local.hour >= 12 and total + 1 < expected * 0.8:
            deliver(
                device_id,
                "progress",
                copy_progress(total, goal),
                within_min=int(prefs["interval_min"]),
            )
        last = _last_valid(conn, device_id)
        if last is not None:
            gap = (now_utc() - last).total_seconds() / 60
            if gap >= int(prefs["interval_min"]):
                deliver(
                    device_id,
                    "no_intake",
                    copy_gap(),
                    within_min=int(prefs["interval_min"]),
                )


def share_analysis(device_id: str, summary: str) -> int:
    text = copy_analysis(summary)
    before = _sent_count(device_id, "analysis")
    deliver(device_id, "analysis", text, within_min=60, family_only=True)
    return _sent_count(device_id, "analysis") - before


def _sent_count(device_id: str, kind: str) -> int:
    with connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM line_sent WHERE device_id = ? AND kind = ? AND ok = 1",
            (device_id, kind),
        ).fetchone()
    return int(row["n"]) if row else 0

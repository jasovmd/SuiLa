from __future__ import annotations

import os
import sys
import threading
import time
from pathlib import Path

from .db import connect

DEFAULT_TIMES = ["10:00", "15:00", "21:00"]
_thread_started = False


def _split_times(raw: str) -> list[str]:
    items = []
    for part in raw.split(","):
        text = part.strip()
        if len(text) == 5 and text[2] == ":" and text[:2].isdigit() and text[3:].isdigit():
            hour, minute = int(text[:2]), int(text[3:])
            if 0 <= hour <= 23 and 0 <= minute <= 59:
                items.append(f"{hour:02d}:{minute:02d}")
    return items


def get_times(conn) -> list[str]:
    row = conn.execute(
        "SELECT value FROM settings WHERE key = 'reminder_times'"
    ).fetchone()
    times = _split_times(row["value"]) if row else []
    return times or list(DEFAULT_TIMES)


def set_times(conn, times: list[str]) -> list[str]:
    cleaned = sorted({item for item in times if item})
    conn.execute(
        """
        INSERT INTO settings (key, value) VALUES ('reminder_times', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (",".join(cleaned),),
    )
    return cleaned or list(DEFAULT_TIMES)


def add_time(conn, hhmm: str) -> list[str]:
    times = get_times(conn)
    if hhmm not in times:
        times.append(hhmm)
        times.sort()
    return set_times(conn, times)


def tick(device_id: str = "suila-esp32c3-01") -> None:
    """交給 LINE/notify 的固定提醒。"""
    here = Path(__file__).resolve()
    line_root = next(
        (
            candidate
            for candidate in (here.parents[1] / "LINE", here.parents[2] / "LINE")
            if candidate.is_dir()
        ),
        here.parents[1] / "LINE",
    )
    if str(line_root) not in sys.path:
        sys.path.insert(0, str(line_root))
    from notify import run_reminders

    run_reminders(device_id)


def start_background(device_id: str = "suila-esp32c3-01") -> None:
    global _thread_started
    if _thread_started or os.getenv("SUILA_TEST") == "1":
        return
    _thread_started = True

    def loop() -> None:
        while True:
            try:
                tick(device_id)
            except Exception:
                pass
            time.sleep(30)

    threading.Thread(target=loop, daemon=True).start()

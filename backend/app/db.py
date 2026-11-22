from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "suila.db"


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS intake_events (
                event_id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                measured_at TEXT NOT NULL,
                received_at TEXT NOT NULL,
                estimated_intake_ml INTEGER NOT NULL,
                measurement_mode TEXT NOT NULL,
                time_verified INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_intake_device_measured
            ON intake_events (device_id, measured_at);

            CREATE TABLE IF NOT EXISTS heartbeats (
                device_id TEXT PRIMARY KEY,
                last_seen_at TEXT NOT NULL,
                measurement_mode TEXT NOT NULL,
                sensor_ok INTEGER NOT NULL,
                baseline_ready INTEGER NOT NULL,
                message TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            INSERT OR IGNORE INTO settings (key, value)
            VALUES ('daily_goal_ml', '2000');
            """
        )

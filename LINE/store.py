from __future__ import annotations

import secrets
import sqlite3
import sys
from datetime import timedelta
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.db import connect  # noqa: E402
from app.timeutil import now_utc, parse_iso, to_iso  # noqa: E402


def init_tables() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS line_bindings (
                line_user_id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                role TEXT NOT NULL,
                consented INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS line_codes (
                code TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                role TEXT NOT NULL,
                consented INTEGER NOT NULL,
                expires_at TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS line_events (
                event_id TEXT PRIMARY KEY,
                received_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS line_sent (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                line_user_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                sent_at TEXT NOT NULL,
                ok INTEGER NOT NULL,
                attempts INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS line_prefs (
                device_id TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL DEFAULT 1,
                interval_min INTEGER NOT NULL DEFAULT 120,
                quiet_start TEXT NOT NULL DEFAULT '22:00',
                quiet_end TEXT NOT NULL DEFAULT '07:00',
                meds TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS line_last_user (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                line_user_id TEXT NOT NULL,
                seen_at TEXT NOT NULL
            );
            """
        )
        cols = {row[1] for row in conn.execute("PRAGMA table_info(line_bindings)")}
        if "display_name" not in cols:
            conn.execute(
                "ALTER TABLE line_bindings ADD COLUMN display_name TEXT NOT NULL DEFAULT ''"
            )


def _prefs_row(conn: sqlite3.Connection, device_id: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM line_prefs WHERE device_id = ?",
        (device_id,),
    ).fetchone()
    if row:
        return row
    conn.execute(
        "INSERT INTO line_prefs (device_id, enabled, interval_min, quiet_start, quiet_end, meds) VALUES (?, 1, 120, '22:00', '07:00', '')",
        (device_id,),
    )
    return conn.execute(
        "SELECT * FROM line_prefs WHERE device_id = ?",
        (device_id,),
    ).fetchone()


def get_prefs(device_id: str) -> dict:
    with connect() as conn:
        row = _prefs_row(conn, device_id)
    meds = [part for part in (row["meds"] or "").split(",") if part]
    return {
        "device_id": device_id,
        "enabled": bool(row["enabled"]),
        "interval_min": int(row["interval_min"]),
        "quiet_start": row["quiet_start"],
        "quiet_end": row["quiet_end"],
        "meds": meds,
    }


def save_prefs(device_id: str, enabled: bool, interval_min: int, quiet_start: str, quiet_end: str, meds: list[str]) -> dict:
    text = ",".join(meds)
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO line_prefs (device_id, enabled, interval_min, quiet_start, quiet_end, meds)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
                enabled = excluded.enabled,
                interval_min = excluded.interval_min,
                quiet_start = excluded.quiet_start,
                quiet_end = excluded.quiet_end,
                meds = excluded.meds
            """,
            (device_id, 1 if enabled else 0, interval_min, quiet_start, quiet_end, text),
        )
    return get_prefs(device_id)


def create_code(device_id: str, role: str, consented: bool, ttl: timedelta | None = None) -> dict:
    if role not in {"self", "family"}:
        raise ValueError("role")
    if role == "family" and not consented:
        raise ValueError("家人接收需要長者同意")
    expires = now_utc() + (ttl or timedelta(minutes=10))
    with connect() as conn:
        for _ in range(8):
            code = f"{secrets.randbelow(1000000):06d}"
            exists = conn.execute("SELECT 1 FROM line_codes WHERE code = ?", (code,)).fetchone()
            if exists:
                continue
            conn.execute(
                """
                INSERT INTO line_codes (code, device_id, role, consented, expires_at, used)
                VALUES (?, ?, ?, ?, ?, 0)
                """,
                (code, device_id, role, 1 if consented or role == "self" else 0, to_iso(expires)),
            )
            return {"code": code, "expires_at": to_iso(expires), "role": role}
    raise RuntimeError("綁定碼建立失敗")


def current_code(device_id: str, role: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT code, expires_at, role FROM line_codes
            WHERE device_id = ? AND role = ? AND used = 0 AND expires_at > ?
            ORDER BY expires_at DESC
            LIMIT 1
            """,
            (device_id, role, to_iso(now_utc())),
        ).fetchone()
    if row is None:
        return None
    return {"code": row["code"], "expires_at": row["expires_at"], "role": row["role"]}


def issue_family_code(device_id: str) -> dict:
    existing = current_code(device_id, "family")
    if existing:
        return existing
    return create_code(device_id, "family", True, timedelta(hours=24))


def claim_code(code: str, line_user_id: str) -> str | None:
    now = now_utc()
    with connect() as conn:
        row = conn.execute("SELECT * FROM line_codes WHERE code = ?", (code,)).fetchone()
        if row is None or row["used"]:
            return None
        try:
            if parse_iso(row["expires_at"]) < now:
                return None
        except ValueError:
            return None
        if row["role"] != "family":
            conn.execute("UPDATE line_codes SET used = 1 WHERE code = ?", (code,))
        conn.execute("DELETE FROM settings WHERE key = ?", (f"line_unbound:{line_user_id}",))
        conn.execute(
            """
            INSERT INTO line_bindings (line_user_id, device_id, role, consented, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(line_user_id) DO UPDATE SET
                device_id = excluded.device_id,
                role = excluded.role,
                consented = excluded.consented,
                created_at = excluded.created_at
            """,
            (line_user_id, row["device_id"], row["role"], row["consented"], to_iso(now)),
        )
    if row["role"] == "family":
        return "已綁定為家人。你的 LINE 已加入水啦，直接傳語音就會出現在 APP。"
    return "已綁定。你的 LINE 已加入水啦，直接傳語音就會出現在 APP。"


def remember_user(line_user_id: str) -> None:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO line_last_user (id, line_user_id, seen_at) VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET line_user_id = excluded.line_user_id, seen_at = excluded.seen_at
            """,
            (line_user_id, to_iso(now_utc())),
        )


def last_user() -> str:
    with connect() as conn:
        row = conn.execute("SELECT line_user_id FROM line_last_user WHERE id = 1").fetchone()
    return row["line_user_id"] if row else ""


def unbind_user(line_user_id: str) -> bool:
    with connect() as conn:
        cur = conn.execute("DELETE FROM line_bindings WHERE line_user_id = ?", (line_user_id,))
        removed = cur.rowcount > 0
        if removed:
            conn.execute(
                """
                INSERT INTO settings (key, value) VALUES (?, '1')
                ON CONFLICT(key) DO UPDATE SET value = '1'
                """,
                (f"line_unbound:{line_user_id}",),
            )
        return removed


def is_unbound(line_user_id: str) -> bool:
    with connect() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = ?",
            (f"line_unbound:{line_user_id}",),
        ).fetchone()
    return bool(row and row["value"] == "1")


def ensure_self(device_id: str, line_user_id: str, display_name: str = "") -> bool:
    user = (line_user_id or "").strip()
    if not user or len(user) > 64 or is_unbound(user):
        return False
    name = (display_name or "").strip()[:32]
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO line_bindings
                (line_user_id, device_id, role, consented, created_at, display_name)
            VALUES (?, ?, 'self', 1, ?, ?)
            ON CONFLICT(line_user_id) DO UPDATE SET
                device_id = excluded.device_id,
                role = 'self',
                consented = 1
            """,
            (user, device_id, to_iso(now_utc()), name),
        )
        if name:
            conn.execute(
                """
                UPDATE line_bindings SET display_name = ?
                WHERE line_user_id = ? AND display_name = ''
                """,
                (name, user),
            )
    return True


def unbind_device(device_id: str) -> int:
    with connect() as conn:
        cur = conn.execute("DELETE FROM line_bindings WHERE device_id = ?", (device_id,))
        return cur.rowcount


def set_display_name(line_user_id: str, display_name: str) -> None:
    name = (display_name or "").strip()[:32]
    if not line_user_id or not name:
        return
    with connect() as conn:
        conn.execute(
            "UPDATE line_bindings SET display_name = ? WHERE line_user_id = ?",
            (name, line_user_id),
        )


def bindings(device_id: str, family_only: bool = False) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT line_user_id, role, consented, display_name
            FROM line_bindings WHERE device_id = ?
            """,
            (device_id,),
        ).fetchall()
    out = []
    for row in rows:
        if family_only and not (row["role"] == "family" and row["consented"]):
            continue
        if row["role"] == "family" and not row["consented"]:
            continue
        out.append(
            {
                "line_user_id": row["line_user_id"],
                "role": row["role"],
                "display_name": row["display_name"] or "",
            }
        )
    return out


def binding_of(line_user_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT line_user_id, device_id, role, consented FROM line_bindings WHERE line_user_id = ?",
            (line_user_id,),
        ).fetchone()
    if row is None:
        return None
    if row["role"] == "family" and not row["consented"]:
        return None
    return {
        "line_user_id": row["line_user_id"],
        "device_id": row["device_id"],
        "role": row["role"],
    }


def status(device_id: str) -> dict:
    people = bindings(device_id)
    return {
        "self": sum(1 for item in people if item["role"] == "self"),
        "family": sum(1 for item in people if item["role"] == "family"),
    }


def mark_event(event_id: str) -> bool:
    if not event_id:
        return True
    with connect() as conn:
        try:
            conn.execute(
                "INSERT INTO line_events (event_id, received_at) VALUES (?, ?)",
                (event_id, to_iso(now_utc())),
            )
            return True
        except sqlite3.IntegrityError:
            return False


def recently_sent(line_user_id: str, kind: str, within_min: int) -> bool:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT sent_at FROM line_sent
            WHERE line_user_id = ? AND kind = ? AND ok = 1
            ORDER BY id DESC LIMIT 1
            """,
            (line_user_id, kind),
        ).fetchone()
    if row is None:
        return False
    try:
        age = (now_utc() - parse_iso(row["sent_at"])).total_seconds() / 60
    except ValueError:
        return False
    return age < within_min


def log_send(line_user_id: str, device_id: str, kind: str, ok: bool, attempts: int) -> None:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO line_sent (line_user_id, device_id, kind, sent_at, ok, attempts)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (line_user_id, device_id, kind, to_iso(now_utc()), 1 if ok else 0, attempts),
        )


def voice_dir() -> Path:
    root = Path(__file__).resolve().parents[1] / "backend" / "data" / "voice"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _settings_json(conn, key: str, default):
    import json

    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    if not row or not row["value"]:
        return default
    try:
        return json.loads(row["value"])
    except Exception:
        return default


def _put_settings_json(conn, key: str, value) -> None:
    import json

    conn.execute(
        """
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (key, json.dumps(value, ensure_ascii=False)),
    )


def list_elders() -> list[dict]:
    with connect() as conn:
        raw = _settings_json(conn, "elders", [])
    if not isinstance(raw, list):
        return []
    elders = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        uid = str(item.get("uid") or "").strip()
        if not uid:
            continue
        elders.append({"uid": uid, "name": str(item.get("name") or "").strip()[:32]})
    elders.sort(key=lambda item: item["uid"])
    return elders


def upsert_elder(uid: str, name: str = "") -> None:
    user = (uid or "").strip()[:128]
    if not user:
        return
    label = (name or "").strip()[:32]
    with connect() as conn:
        elders = _settings_json(conn, "elders", [])
        if not isinstance(elders, list):
            elders = []
        found = False
        for item in elders:
            if isinstance(item, dict) and item.get("uid") == user:
                if label:
                    item["name"] = label
                found = True
                break
        if not found:
            elders.append({"uid": user, "name": label})
        _put_settings_json(conn, "elders", elders[-8:])


def hold_voice(
    *,
    line_user_id: str,
    message_id: str,
    duration_sec: int,
    audio_bytes: bytes,
    content_type: str,
) -> bool:
    if not line_user_id or not message_id or not audio_bytes:
        return False
    path = _write_audio(message_id, audio_bytes, content_type)
    item = {
        "id": message_id,
        "from": line_user_id,
        "time": to_iso(now_utc()),
        "durationSec": max(1, int(duration_sec)),
        "played": False,
        "audioPath": path.name,
    }
    with connect() as conn:
        _put_settings_json(conn, f"voice_hold:{line_user_id}", item)
    return True


def has_hold(line_user_id: str) -> bool:
    with connect() as conn:
        item = _settings_json(conn, f"voice_hold:{line_user_id}", None)
    return isinstance(item, dict) and bool(item.get("id"))


def deliver_held(line_user_id: str, to_uid: str) -> dict | None:
    key = f"voice_hold:{line_user_id}"
    with connect() as conn:
        item = _settings_json(conn, key, None)
        if not isinstance(item, dict) or not item.get("id"):
            return None
        item["toUid"] = to_uid
        item["played"] = False
        messages = _settings_json(conn, "voice_messages", [])
        if not isinstance(messages, list):
            messages = []
        messages = [m for m in messages if not (isinstance(m, dict) and m.get("id") == item["id"])]
        messages.insert(0, item)
        _put_settings_json(conn, "voice_messages", messages[:40])
        conn.execute("DELETE FROM settings WHERE key = ?", (key,))
    return item


def _write_audio(message_id: str, audio_bytes: bytes, content_type: str):
    ext = ".m4a"
    lower = (content_type or "").lower()
    if "mpeg" in lower or "mp3" in lower:
        ext = ".mp3"
    elif "wav" in lower:
        ext = ".wav"
    elif "ogg" in lower:
        ext = ".ogg"
    path = voice_dir() / f"{message_id}{ext}"
    path.write_bytes(audio_bytes)
    return path


def append_voice_message(
    *,
    message_id: str,
    from_user: str,
    duration_sec: int,
    audio_bytes: bytes,
    content_type: str,
    to_uid: str = "",
) -> dict | None:
    import base64
    import json

    if not message_id or not audio_bytes:
        return None
    path = _write_audio(message_id, audio_bytes, content_type)
    item = {
        "id": message_id,
        "from": from_user,
        "time": to_iso(now_utc()),
        "durationSec": max(1, int(duration_sec)),
        "played": False,
        "audioUrl": f"/messages/{message_id}/audio",
        "audioPath": str(path.name),
        "toUid": to_uid,
    }
    if len(audio_bytes) <= 400_000:
        item["audioBase64"] = base64.b64encode(audio_bytes).decode("ascii")
        item["audioExt"] = path.suffix.lower() or ".m4a"
    with connect() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = ?",
            ("voice_messages",),
        ).fetchone()
        messages = []
        if row and row["value"]:
            try:
                parsed = json.loads(row["value"])
                if isinstance(parsed, list):
                    messages = parsed
            except Exception:
                messages = []
        messages = [m for m in messages if not (isinstance(m, dict) and m.get("id") == message_id)]
        messages.insert(0, item)
        messages = messages[:40]
        conn.execute(
            """
            INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            ("voice_messages", json.dumps(messages, ensure_ascii=False)),
        )
    return item

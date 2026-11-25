from __future__ import annotations

import os
import threading
import time
from pathlib import Path

from .db import DB_PATH

_BUCKET = (os.getenv("SUILA_GCS_BUCKET") or "").strip()
_OBJECT = (os.getenv("SUILA_GCS_DB_OBJECT") or "suila.db").strip() or "suila.db"
_dirty = False
_lock = threading.Lock()
_started = False


def _client():
    from google.cloud import storage  # type: ignore

    return storage.Client()


def restore_on_startup() -> None:
    if not _BUCKET:
        return
    try:
        client = _client()
        blob = client.bucket(_BUCKET).blob(_OBJECT)
        if not blob.exists():
            return
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = DB_PATH.with_suffix(".db.download")
        blob.download_to_filename(str(tmp))
        tmp.replace(DB_PATH)
    except Exception:
        pass


def mark_dirty() -> None:
    global _dirty
    if not _BUCKET:
        return
    with _lock:
        _dirty = True


def _upload_if_dirty() -> None:
    global _dirty
    if not _BUCKET:
        return
    with _lock:
        if not _dirty:
            return
        _dirty = False
        path = Path(DB_PATH)
        if not path.is_file():
            return
        try:
            client = _client()
            blob = client.bucket(_BUCKET).blob(_OBJECT)
            blob.upload_from_filename(str(path))
        except Exception:
            with _lock:
                _dirty = True


def start_background() -> None:
    global _started
    if _started or not _BUCKET or os.getenv("SUILA_TEST") == "1":
        return
    _started = True

    def loop() -> None:
        while True:
            try:
                _upload_if_dirty()
            except Exception:
                pass
            time.sleep(8)

    threading.Thread(target=loop, daemon=True).start()

from __future__ import annotations

import os
import time

import httpx

MAX_ATTEMPTS = 3


def _token() -> str:
    return os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "").strip()


def _post(url: str, payload: dict) -> bool:
    token = _token()
    if not token:
        return False
    for attempt in range(MAX_ATTEMPTS):
        try:
            res = httpx.post(
                url,
                headers={"Authorization": f"Bearer {token}"},
                json=payload,
                timeout=5,
            )
            if res.status_code < 300:
                return True
        except Exception:
            pass
        if attempt + 1 < MAX_ATTEMPTS:
            time.sleep(1)
    return False


def push_text(to: str, text: str) -> bool:
    target = (to or "").strip()
    if not target:
        return False
    return _post(
        "https://api.line.me/v2/bot/message/push",
        {"to": target, "messages": [{"type": "text", "text": text}]},
    )


def reply_text(reply_token: str, text: str) -> bool:
    token = (reply_token or "").strip()
    if not token:
        return False
    return _post(
        "https://api.line.me/v2/bot/message/reply",
        {"replyToken": token, "messages": [{"type": "text", "text": text}]},
    )


def push_line(text: str, to: str | None = None) -> bool:
    target = (to or os.getenv("LINE_TEST_USER_ID") or "").strip()
    return push_text(target, text)


def fetch_profile(user_id: str) -> str:
    """LINE display name for a user who has talked to the official account."""
    token = _token()
    uid = (user_id or "").strip()
    if not token or not uid:
        return ""
    try:
        res = httpx.get(
            f"https://api.line.me/v2/bot/profile/{uid}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
        if res.status_code >= 300:
            return ""
        return str((res.json() or {}).get("displayName") or "").strip()[:32]
    except Exception:
        return ""


def fetch_message_content(message_id: str) -> tuple[bytes, str] | None:
    """Download binary content for a LINE message (audio / image / file)."""
    token = _token()
    mid = (message_id or "").strip()
    if not token or not mid:
        return None
    try:
        res = httpx.get(
            f"https://api-data.line.me/v2/bot/message/{mid}/content",
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
        if res.status_code >= 300:
            return None
        content_type = res.headers.get("content-type", "application/octet-stream")
        return res.content, content_type
    except Exception:
        return None

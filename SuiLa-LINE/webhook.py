from __future__ import annotations

import base64
import hashlib
import hmac
import json

import store
from line_push import fetch_message_content, fetch_profile, reply_text


def verify_signature(body: bytes, signature: str, secret: str) -> bool:
    if not secret or not signature:
        return False
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(expected, signature.strip())


def _remember_name(user_id: str) -> None:
    if not user_id:
        return
    name = fetch_profile(user_id)
    if name:
        store.set_display_name(user_id, name)


def _elder_menu(elders: list[dict]) -> str:
    lines = []
    for index, elder in enumerate(elders, start=1):
        name = elder["name"] or f"家人{index}"
        lines.append(f"{index} {name}")
    return "要傳給誰？\n" + "\n".join(lines) + "\n回覆數字"


def _audio_bytes(message: dict) -> tuple[str, int, bytes, str] | None:
    message_id = str(message.get("id") or "")
    duration_ms = int(message.get("duration") or 0)
    duration_sec = max(1, round(duration_ms / 1000)) if duration_ms else 5
    content = fetch_message_content(message_id)
    if not content or not message_id:
        return None
    raw, content_type = content
    return message_id, duration_sec, raw, content_type


def _handle_pick(user_id: str, choice: int, reply_token: str) -> None:
    elders = store.list_elders()
    if choice < 1 or choice > len(elders):
        if reply_token:
            reply_text(reply_token, _elder_menu(elders) if elders else "還沒有人開啟水啦")
        return
    elder = elders[choice - 1]
    saved = store.deliver_held(user_id, elder["uid"])
    name = elder["name"] or f"家人{choice}"
    if reply_token:
        reply_text(
            reply_token,
            f"語音已傳給{name}" if saved else "這則語音已經不在了，請再傳一次",
        )


def _handle_audio(user_id: str, message: dict, reply_token: str) -> None:
    binding = store.binding_of(user_id) if user_id else None
    if not binding:
        if reply_token:
            reply_text(reply_token, "請先把 App 上的 6 碼傳過來，完成綁定後才能傳語音")
        return
    _remember_name(user_id)
    loaded = _audio_bytes(message)
    if not loaded:
        if reply_token:
            reply_text(reply_token, "語音收不到，請再試一次")
        return
    message_id, duration_sec, raw, content_type = loaded
    elders = store.list_elders()
    if len(elders) >= 2:
        held = store.hold_voice(
            line_user_id=user_id,
            message_id=message_id,
            duration_sec=duration_sec,
            audio_bytes=raw,
            content_type=content_type,
        )
        if reply_token:
            reply_text(reply_token, _elder_menu(elders) if held else "語音儲存失敗，請再試一次")
        return
    to_uid = elders[0]["uid"] if elders else ""
    saved = store.append_voice_message(
        message_id=message_id,
        from_user=user_id,
        duration_sec=duration_sec,
        audio_bytes=raw,
        content_type=content_type,
        to_uid=to_uid,
    )
    if reply_token:
        reply_text(
            reply_token,
            "語音留言已送到水啦 APP" if saved else "語音儲存失敗，請再試一次",
        )


def handle_payload(payload: dict) -> None:
    events = payload.get("events") or []
    for event in events:
        if not isinstance(event, dict):
            continue
        event_id = str(event.get("webhookEventId") or "")
        if not store.mark_event(event_id):
            continue
        source = event.get("source") or {}
        user_id = str(source.get("userId") or "")
        if user_id:
            store.remember_user(user_id)
        if event.get("type") != "message":
            continue
        message = event.get("message") or {}
        msg_type = str(message.get("type") or "")
        reply_token = str(event.get("replyToken") or "")
        if msg_type == "audio":
            _handle_audio(user_id, message, reply_token)
            continue
        if msg_type != "text":
            continue
        text = str(message.get("text") or "").strip()
        if user_id and text.isdigit() and len(text) <= 2 and store.has_hold(user_id):
            _handle_pick(user_id, int(text), reply_token)
            continue
        reply = "SuiLa 已連線"
        if text == "解除綁定" and user_id:
            reply = "已解除綁定" if store.unbind_user(user_id) else "尚未綁定"
        elif text.isdigit() and len(text) == 6 and user_id:
            bound = store.claim_code(text, user_id)
            if bound:
                _remember_name(user_id)
                reply = bound
        if reply_token:
            reply_text(reply_token, reply)


def handle_body(raw: bytes) -> None:
    if not raw:
        return
    payload = json.loads(raw.decode("utf-8"))
    if not isinstance(payload, dict):
        return
    handle_payload(payload)

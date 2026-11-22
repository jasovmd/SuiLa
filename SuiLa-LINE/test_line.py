from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent / "backend"))

os.environ.setdefault("SUILA_TEST", "1")
os.environ["LINE_CHANNEL_SECRET"] = "test-secret"

from fastapi.testclient import TestClient

import notify
import store
import webhook
from app.db import init_db
from app.main import app
import app.db as db


def _sign(body: bytes, secret: str = "test-secret") -> str:
    digest = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def _client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "suila.db")
    init_db()
    return TestClient(app)


def test_signature_and_empty_events(tmp_path, monkeypatch):
    body = b'{"events":[]}'
    with _client(tmp_path, monkeypatch) as client:
        bad = client.post("/line/webhook", content=body, headers={"X-Line-Signature": "nope"})
        assert bad.status_code == 400
        ok = client.post("/line/webhook", content=body, headers={"X-Line-Signature": _sign(body)})
        assert ok.status_code == 200


def test_text_reply_once(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(webhook, "reply_text", lambda token, text: calls.append(text) or True)
    payload = {
        "events": [
            {
                "webhookEventId": "evt-1",
                "type": "message",
                "replyToken": "r1",
                "source": {"userId": "U1"},
                "message": {"type": "text", "text": "hi"},
            }
        ]
    }
    raw = json.dumps(payload).encode()
    with _client(tmp_path, monkeypatch) as client:
        headers = {"X-Line-Signature": _sign(raw)}
        assert client.post("/line/webhook", content=raw, headers=headers).status_code == 200
        assert client.post("/line/webhook", content=raw, headers=headers).status_code == 200
    assert calls == ["SuiLa 已連線"]


def test_bind_uses_webhook_user_not_client(tmp_path, monkeypatch):
    monkeypatch.setattr(webhook, "reply_text", lambda token, text: True)
    with _client(tmp_path, monkeypatch) as client:
        denied = client.post(
            "/api/line/bind-code",
            json={"device_id": "esp32-1", "role": "family", "consent": False},
        )
        assert denied.status_code == 400
        created = client.post(
            "/api/line/bind-code",
            json={"device_id": "esp32-1", "role": "self", "consent": True},
        )
        code = created.json()["code"]
        payload = {
            "events": [
                {
                    "webhookEventId": "evt-bind",
                    "type": "message",
                    "replyToken": "r2",
                    "source": {"userId": "U-owner"},
                    "message": {"type": "text", "text": code},
                }
            ]
        }
        raw = json.dumps(payload).encode()
        assert (
            client.post(
                "/line/webhook",
                content=raw,
                headers={"X-Line-Signature": _sign(raw)},
            ).status_code
            == 200
        )
        status = client.get("/api/line/status", params={"device_id": "esp32-1"}).json()
        assert status["self"] == 1
        assert (
            client.put(
                "/api/line/settings",
                json={
                    "device_id": "esp32-1",
                    "enabled": True,
                    "interval_min": 120,
                    "quiet_start": "22:00",
                    "quiet_end": "07:00",
                    "meds": ["08:00"],
                    "confirm": False,
                },
            ).status_code
            == 400
        )
        assert (
            client.post(
                "/api/line/share-analysis",
                json={"device_id": "esp32-1", "confirm": True},
            ).status_code
            == 400
        )


def test_self_bind_joins_app_and_voice_is_saved(tmp_path, monkeypatch):
    replies = []
    monkeypatch.setattr(webhook, "reply_text", lambda token, text: replies.append(text) or True)
    monkeypatch.setattr(webhook, "fetch_profile", lambda user_id: "阿明")
    monkeypatch.setattr(
        webhook,
        "fetch_message_content",
        lambda message_id: (b"fake-audio", "audio/mp4"),
    )
    monkeypatch.setattr(store, "voice_dir", lambda: tmp_path)

    def post_event(client, event_id, message):
        payload = {
            "events": [
                {
                    "webhookEventId": event_id,
                    "type": "message",
                    "replyToken": "r-voice",
                    "source": {"userId": "U-owner"},
                    "message": message,
                }
            ]
        }
        raw = json.dumps(payload).encode()
        response = client.post(
            "/line/webhook",
            content=raw,
            headers={"X-Line-Signature": _sign(raw)},
        )
        assert response.status_code == 200

    with _client(tmp_path, monkeypatch) as client:
        created = client.post("/family/line-link")
        assert created.status_code == 200
        code = created.json()["code"]
        post_event(client, "evt-self", {"type": "text", "text": code})
        family = client.get("/family").json()
        assert family["lineConnected"] is True
        assert family["members"][0]["id"] == "U-owner"
        assert family["members"][0]["name"] == "阿明"
        assert family["members"][0]["relation"] == "本人"
        post_event(
            client,
            "evt-audio",
            {"type": "audio", "id": "aud-1", "duration": 3200},
        )
        messages = client.get("/messages").json()
        assert len(messages) == 1
        assert messages[0]["from"] == "U-owner"
        assert messages[0]["durationSec"] == 3
        assert messages[0]["audioUrl"] == "/messages/aud-1/audio"
    assert any("已加入水啦" in text for text in replies)
    assert "語音留言已送到水啦 APP" in replies


def test_quiet_hours():
    assert notify.in_quiet("23:00", "22:00", "07:00")
    assert not notify.in_quiet("12:00", "22:00", "07:00")

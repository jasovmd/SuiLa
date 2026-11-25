"""Translate a saved family voice note with OpenAI (Whisper + chat + TTS)."""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx

from .db import connect

VOICE_DIR = Path(__file__).resolve().parent.parent / "data" / "voice"

LANG_NAME = {
    "zh-TW": "Traditional Chinese",
    "nan-TW": "Taiwanese Hokkien (written in Chinese characters)",
    "en": "English",
}

TTS_VOICE = {
    "zh-TW": "nova",
    "nan-TW": "nova",
    "en": "alloy",
}


def _openai_key() -> str:
    return (os.getenv("OPENAI_API_KEY") or "").strip()


def _find_message(message_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = ?",
            ("voice_messages",),
        ).fetchone()
    if not row or not row["value"]:
        return None
    try:
        messages = json.loads(row["value"])
    except Exception:
        return None
    if not isinstance(messages, list):
        return None
    for item in messages:
        if isinstance(item, dict) and str(item.get("id") or "") == message_id:
            return item
    return None


def _source_path(item: dict) -> Path | None:
    name = str(item.get("audioPath") or "").strip()
    if not name:
        return None
    path = VOICE_DIR / name
    return path if path.is_file() else None


def translated_path(message_id: str, lang: str) -> Path:
    safe = lang.replace("/", "-")
    return VOICE_DIR / f"{message_id}.{safe}.mp3"


def ensure_translation(message_id: str, lang: str) -> dict:
    """Return { audioUrl, text }. Creates the mp3 once and reuses it."""
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY missing")
    if lang not in LANG_NAME:
        raise ValueError("unsupported lang")

    out = translated_path(message_id, lang)
    meta_path = VOICE_DIR / f"{message_id}.{lang}.json"
    if out.is_file() and meta_path.is_file():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        return {
            "audioUrl": f"/messages/{message_id}/audio?lang={lang}",
            "text": str(meta.get("text") or ""),
        }

    item = _find_message(message_id)
    if not item:
        raise FileNotFoundError("message missing")
    source = _source_path(item)
    if not source:
        raise FileNotFoundError("audio missing")

    headers = {"Authorization": f"Bearer {key}"}
    with httpx.Client(timeout=90.0) as client:
        with source.open("rb") as handle:
            transcript = client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers=headers,
                files={"file": (source.name, handle, "application/octet-stream")},
                data={"model": "whisper-1"},
            )
        transcript.raise_for_status()
        source_text = str(transcript.json().get("text") or "").strip()
        if not source_text:
            raise RuntimeError("empty transcript")

        chat = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Translate the user's message into "
                            f"{LANG_NAME[lang]}. Reply with only the translation."
                        ),
                    },
                    {"role": "user", "content": source_text},
                ],
            },
        )
        chat.raise_for_status()
        translated = str(
            chat.json()["choices"][0]["message"]["content"] or ""
        ).strip()
        if not translated:
            raise RuntimeError("empty translation")

        speech = client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini-tts",
                "voice": TTS_VOICE.get(lang, "alloy"),
                "input": translated,
                "format": "mp3",
            },
        )
        # Fall back to tts-1 if the mini TTS model is unavailable.
        if speech.status_code >= 400:
            speech = client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={**headers, "Content-Type": "application/json"},
                json={
                    "model": "tts-1",
                    "voice": TTS_VOICE.get(lang, "alloy"),
                    "input": translated,
                },
            )
        speech.raise_for_status()
        VOICE_DIR.mkdir(parents=True, exist_ok=True)
        out.write_bytes(speech.content)
        meta_path.write_text(
            json.dumps({"text": translated, "source": source_text}, ensure_ascii=False),
            encoding="utf-8",
        )

    return {
        "audioUrl": f"/messages/{message_id}/audio?lang={lang}",
        "text": translated,
    }

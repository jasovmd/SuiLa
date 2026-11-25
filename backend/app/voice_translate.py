from __future__ import annotations

import base64
import io
import json
import os
import re
import time
import wave
from pathlib import Path

import httpx

from .db import connect

VOICE_DIR = Path(__file__).resolve().parent.parent / "data" / "voice"

LANG_NAME = {
    "zh-TW": "Traditional Chinese",
    "nan-TW": "Taiwanese Hokkien (written in Chinese characters)",
    "en": "English",
}

GEMINI_TTS_VOICE = {
    "zh-TW": "Kore",
    "nan-TW": "Kore",
    "en": "Zephyr",
}

MIME_BY_EXT = {
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
}

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
TEXT_MODEL = "gemini-3.5-flash"
TTS_MODEL = "gemini-3.8-flash-lite-tts"


def _gemini_key() -> str:
    return (os.getenv("GEMINI_API_KEY") or "").strip()


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


def _remember_source_lang(message_id: str, src: str) -> None:
    with connect() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = ?",
            ("voice_messages",),
        ).fetchone()
        if not row or not row["value"]:
            return
        try:
            messages = json.loads(row["value"])
        except Exception:
            return
        if not isinstance(messages, list):
            return
        changed = False
        for item in messages:
            if isinstance(item, dict) and str(item.get("id") or "") == message_id:
                if item.get("sourceLang") != src:
                    item["sourceLang"] = src
                    changed = True
                break
        if changed:
            conn.execute(
                """
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                ("voice_messages", json.dumps(messages, ensure_ascii=False)),
            )


def _source_path(item: dict) -> Path | None:
    name = str(item.get("audioPath") or "").strip()
    if not name:
        return None
    path = VOICE_DIR / name
    return path if path.is_file() else None


def _materialize_source(item: dict) -> tuple[Path, str]:
    path = _source_path(item)
    if path is not None:
        mime = MIME_BY_EXT.get(path.suffix.lower(), "application/octet-stream")
        return path, mime

    raw_b64 = str(item.get("audioBase64") or "").strip()
    if not raw_b64:
        raise FileNotFoundError("audio missing")
    try:
        data = base64.b64decode(raw_b64)
    except Exception as exc:
        raise FileNotFoundError("audio missing") from exc
    if not data:
        raise FileNotFoundError("audio missing")

    ext = str(item.get("audioExt") or ".m4a").lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    VOICE_DIR.mkdir(parents=True, exist_ok=True)
    restored = VOICE_DIR / f"{item.get('id')}{ext}"
    restored.write_bytes(data)
    return restored, MIME_BY_EXT.get(ext, "application/octet-stream")


def translated_path(message_id: str, lang: str) -> Path:
    safe = lang.replace("/", "-")
    return VOICE_DIR / f"{message_id}.{safe}.wav"


def _pcm16_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    if len(pcm) % 2:
        pcm = pcm[:-1]
    buf = io.BytesIO()
    with wave.open(buf, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(pcm)
    return buf.getvalue()


def _audio_bytes_for_phone(raw: bytes, mime_out: str) -> bytes:
    lower = (mime_out or "").lower()
    if raw[:4] == b"RIFF" or "wav" in lower:
        return raw
    rate = 24000
    match = re.search(r"rate=(\d+)", mime_out or "")
    if match:
        rate = int(match.group(1))
    return _pcm16_to_wav(raw, rate)


def _gemini_err(resp: httpx.Response, prefix: str) -> RuntimeError:
    message = ""
    try:
        payload = resp.json().get("error") or {}
        message = str(payload.get("message") or payload.get("status") or "")[:140]
    except Exception:
        message = (resp.text or "")[:140]
    if resp.status_code == 429:
        return RuntimeError(f"gemini_rate_limit:{message or 'rate_limit'}"[:180])
    return RuntimeError(f"{prefix} {resp.status_code}:{message}"[:180])


def _gemini_generate(client: httpx.Client, key: str, model: str, body: dict) -> httpx.Response:
    url = f"{GEMINI_BASE}/{model}:generateContent"
    last: httpx.Response | None = None
    for attempt in range(2):
        last = client.post(
            url,
            params={"key": key},
            headers={"Content-Type": "application/json", "x-goog-api-key": key},
            json=body,
        )
        if last.status_code != 429:
            return last
        time.sleep(0.8 * (attempt + 1))
    return last  # type: ignore[return-value]


def _gemini_text_from_response(resp: httpx.Response) -> str:
    data = resp.json()
    parts = (
        (((data.get("candidates") or [{}])[0].get("content") or {}).get("parts")) or []
    )
    chunks: list[str] = []
    for part in parts:
        if isinstance(part, dict) and part.get("text"):
            chunks.append(str(part["text"]))
    return "\n".join(chunks).strip()


def _normalize_src(raw: str) -> str:
    text = (raw or "other").strip().lower().replace("_", "-")
    if text in {"zh-tw", "zh", "zh-cn", "cmn", "chinese", "mandarin", "中文", "國語"}:
        return "zh-TW"
    if text in {"nan-tw", "nan", "hokkien", "taiwanese", "minnan", "台語", "閩南"}:
        return "nan-TW"
    if text in {"en", "eng", "english", "英文"}:
        return "en"
    return "other"


def _langs_match(src: str, target: str) -> bool:
    src_n = _normalize_src(src)
    if src_n == target:
        return True
    if target == "zh-TW" and src_n == "zh-TW":
        return True
    return False


def _parse_decide_json(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return {}


def _original_result(message_id: str, src: str = "") -> dict:
    return {
        "audioUrl": f"/messages/{message_id}/audio",
        "text": "",
        "skipped": True,
        "sourceLang": src or "",
    }


def _ensure_with_gemini(message_id: str, lang: str, source: Path, mime: str, item: dict) -> dict:
    key = _gemini_key()
    if not key:
        raise RuntimeError("GEMINI_API_KEY missing")

    out = translated_path(message_id, lang)
    meta_path = VOICE_DIR / f"{message_id}.{lang}.json"
    cached_src = _normalize_src(str(item.get("sourceLang") or ""))
    if cached_src in LANG_NAME and _langs_match(cached_src, lang):
        VOICE_DIR.mkdir(parents=True, exist_ok=True)
        meta_path.write_text(
            json.dumps(
                {"skipped": True, "sourceLang": cached_src, "provider": "gemini"},
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        return _original_result(message_id, cached_src)

    audio_b64 = base64.b64encode(source.read_bytes()).decode("ascii")
    decide_prompt = (
        f"Listen to this family voice note. The listener's voice language is {lang} "
        f"({LANG_NAME[lang]}).\n"
        "Reply with ONLY compact JSON, no markdown:\n"
        '{"src":"zh-TW"|"nan-TW"|"en"|"other","match":true|false,"text":""}\n'
        "Rules:\n"
        "- src = spoken language. Mandarin/Chinese → zh-TW. Taiwanese Hokkien → nan-TW. "
        "English → en.\n"
        "- match = true if no translation is needed for this listener "
        "(Mandarin/Chinese matches zh-TW; Taiwanese matches nan-TW; English matches en).\n"
        "- If match is true, text must be an empty string.\n"
        f"- If match is false, text = a short natural translation into {LANG_NAME[lang]} only."
    )

    with httpx.Client(timeout=60.0) as client:
        text_resp = _gemini_generate(
            client,
            key,
            TEXT_MODEL,
            {
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {"inlineData": {"mimeType": mime, "data": audio_b64}},
                            {"text": decide_prompt},
                        ],
                    }
                ]
            },
        )
        if text_resp.status_code >= 400:
            text_resp = _gemini_generate(
                client,
                key,
                "gemini-3-flash-preview",
                {
                    "contents": [
                        {
                            "role": "user",
                            "parts": [
                                {"inlineData": {"mimeType": mime, "data": audio_b64}},
                                {"text": decide_prompt},
                            ],
                        }
                    ]
                },
            )
        if text_resp.status_code >= 400:
            raise _gemini_err(text_resp, "gemini_text")

        decided = _parse_decide_json(_gemini_text_from_response(text_resp))
        src = _normalize_src(str(decided.get("src") or "other"))
        match = bool(decided.get("match"))
        if not match:
            match = _langs_match(src, lang)
        translated = str(decided.get("text") or "").strip()
        try:
            _remember_source_lang(message_id, src)
        except Exception:
            pass

        VOICE_DIR.mkdir(parents=True, exist_ok=True)
        if match:
            meta_path.write_text(
                json.dumps(
                    {"skipped": True, "sourceLang": src, "provider": "gemini"},
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            return _original_result(message_id, src)

        if not translated:
            raise RuntimeError("empty translation")

        tts_resp = _gemini_generate(
            client,
            key,
            TTS_MODEL,
            {
                "contents": [{"role": "user", "parts": [{"text": translated[:1200]}]}],
                "generationConfig": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": {
                            "prebuiltVoiceConfig": {
                                "voiceName": GEMINI_TTS_VOICE.get(lang, "Kore"),
                            }
                        }
                    },
                },
            },
        )
        if tts_resp.status_code >= 400:
            raise _gemini_err(tts_resp, "gemini_tts")

        parts = (
            (((tts_resp.json().get("candidates") or [{}])[0].get("content") or {}).get("parts"))
            or []
        )
        inline = next(
            (
                part.get("inlineData") or part.get("inline_data")
                for part in parts
                if isinstance(part, dict) and (part.get("inlineData") or part.get("inline_data"))
            ),
            None,
        )
        if not inline or not inline.get("data"):
            raise RuntimeError("gemini tts empty audio")
        raw = base64.b64decode(inline["data"])
        mime_out = str(inline.get("mimeType") or inline.get("mime_type") or "")
        out.write_bytes(_audio_bytes_for_phone(raw, mime_out))
        meta_path.write_text(
            json.dumps(
                {
                    "text": translated,
                    "sourceLang": src,
                    "skipped": False,
                    "provider": "gemini",
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

    return {
        "audioUrl": f"/messages/{message_id}/audio?lang={lang}",
        "text": translated,
        "skipped": False,
        "sourceLang": src,
    }


def ensure_translation(message_id: str, lang: str) -> dict:
    if lang not in LANG_NAME:
        raise ValueError("unsupported lang")

    out = translated_path(message_id, lang)
    meta_path = VOICE_DIR / f"{message_id}.{lang}.json"
    legacy_mp3 = VOICE_DIR / f"{message_id}.{lang}.mp3"
    if meta_path.is_file():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if meta.get("skipped"):
            return _original_result(message_id, str(meta.get("sourceLang") or ""))
        if out.is_file() or legacy_mp3.is_file():
            return {
                "audioUrl": f"/messages/{message_id}/audio?lang={lang}",
                "text": str(meta.get("text") or ""),
                "skipped": False,
                "sourceLang": str(meta.get("sourceLang") or ""),
            }

    item = _find_message(message_id)
    if not item:
        raise FileNotFoundError("message missing")
    source, mime = _materialize_source(item)

    if not _gemini_key():
        raise RuntimeError("GEMINI_API_KEY missing")
    return _ensure_with_gemini(message_id, lang, source, mime, item)

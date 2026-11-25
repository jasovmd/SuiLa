from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any

import httpx

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
TEXT_MODEL = "gemini-3.5-flash"
_CACHE: dict[str, str] = {}


def _key() -> str:
    return (os.getenv("GEMINI_API_KEY") or "").strip()


def _extract_text(resp: httpx.Response) -> str:
    data = resp.json()
    parts = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    chunks = [p.get("text", "") for p in parts if isinstance(p, dict)]
    return "\n".join(c for c in chunks if c).strip()


def build_ai_advice(report: dict[str, Any], facts: dict[str, Any]) -> str | None:
    key = _key()
    if not key:
        return None

    cache_src = json.dumps(
        {"facts": facts, "status": report.get("status"), "anomalies": report.get("anomalies")},
        ensure_ascii=False,
        sort_keys=True,
    )
    cache_key = hashlib.sha1(cache_src.encode("utf-8")).hexdigest()
    cached = _CACHE.get(cache_key)
    if cached:
        return cached

    prompt = {
        "role": "user",
        "parts": [
            {
                "text": (
                    "你是「水啦」App 的喝水習慣助理。根據下列事實，用繁體中文寫一段"
                    "溫和、簡短（80～160 字）的分析建議給長者本人看。"
                    "不要診斷疾病，不要改目標數字，不要用英文，不要列點超過 3 點。"
                    "若資料不足，就鼓勵繼續累積紀錄即可。\n\n"
                    f"事實 JSON：\n{json.dumps(facts, ensure_ascii=False)}\n\n"
                    f"規則整理：\n{json.dumps({k: report.get(k) for k in ('status','summary','anomalies','suggestions','offline_note','note')}, ensure_ascii=False)}"
                )
            }
        ],
    }
    gen = {"temperature": 0.1, "maxOutputTokens": 400}

    try:
        with httpx.Client(timeout=25.0) as client:
            resp = client.post(
                f"{GEMINI_BASE}/{TEXT_MODEL}:generateContent",
                params={"key": key},
                json={"contents": [prompt], "generationConfig": gen},
            )
            if resp.status_code >= 400:
                resp = client.post(
                    f"{GEMINI_BASE}/gemini-3-flash-preview:generateContent",
                    params={"key": key},
                    json={"contents": [prompt], "generationConfig": gen},
                )
            if resp.status_code >= 400:
                return None
            text = _extract_text(resp)
    except Exception:
        return None

    if not text:
        return None
    text = re.sub(r"^```\w*\n?|\n?```$", "", text.strip())[:600]
    if text:
        _CACHE[cache_key] = text
        if len(_CACHE) > 64:
            _CACHE.pop(next(iter(_CACHE)))
    return text or None

from __future__ import annotations

from collections import Counter
from datetime import datetime

from .ai_advice import build_ai_advice
from .db import connect
from .timeutil import TAIPEI, day_in_taipei, now_utc, parse_iso

MIN_DAYS = 3
MIN_EVENTS = 6
ONLINE_SECONDS = 45
_USABLE_MODES = frozenset({"real", "manual"})


def _median(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return float(ordered[mid])
    return (ordered[mid - 1] + ordered[mid]) / 2


def _online(last_seen: str | None, now: datetime) -> bool:
    if not last_seen:
        return False
    try:
        age = (now - parse_iso(last_seen)).total_seconds()
        return 0 <= age <= ONLINE_SECONDS
    except ValueError:
        return False


def analyze(device_id: str) -> dict:
    now = now_utc()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT measured_at, estimated_intake_ml, measurement_mode, time_verified
            FROM intake_events
            WHERE device_id = ?
            ORDER BY measured_at
            """,
            (device_id,),
        ).fetchall()
        hb = conn.execute(
            "SELECT last_seen_at FROM heartbeats WHERE device_id = ?",
            (device_id,),
        ).fetchone()

    online = _online(hb["last_seen_at"] if hb else None, now)
    usable: list[tuple[datetime, int]] = []
    for row in rows:
        mode = str(row["measurement_mode"] or "")
        if mode not in _USABLE_MODES or not row["time_verified"]:
            continue
        ml = int(row["estimated_intake_ml"])
        if ml < 5 or ml > 800:
            continue
        try:
            usable.append((parse_iso(row["measured_at"]), ml))
        except ValueError:
            continue

    by_day: dict = {}
    for dt, ml in usable:
        by_day.setdefault(day_in_taipei(dt), []).append((dt, ml))

    result = {
        "status": "accumulating",
        "message": "資料累積中",
        "days": len(by_day),
        "summary": "",
        "ai_advice": "",
        "anomalies": [],
        "suggestions": [],
        "online": online,
        "offline_note": "" if online else "設備未同步，不能把缺少紀錄當成沒有喝水。",
        "note": "這是習慣整理，不是疾病診斷，也不會更改飲水目標。",
        "basis": ["採用時間已確認的真實與手動紀錄", "天數或筆數不足，所以是資料累積中"],
    }
    compare_days = sorted(by_day.keys())
    if len(compare_days) < MIN_DAYS or len(usable) < MIN_EVENTS:
        if not online:
            result["offline_note"] = "設備未同步，今日不列入「沒有喝水」。"
        facts = {
            "days": len(by_day),
            "events": len(usable),
            "status": "accumulating",
            "online": online,
        }
        ai = build_ai_advice(result, facts)
        if ai:
            result["ai_advice"] = ai
            result["summary"] = ai
            result["message"] = ai
        return result

    totals = {d: sum(ml for _, ml in by_day[d]) for d in compare_days}
    history_days = compare_days[:-1]
    recent = compare_days[-1]
    history_median = _median([float(totals[d]) for d in history_days])
    anomalies: list[str] = []
    suggestions: list[dict] = []

    if history_median > 0 and totals[recent] < history_median * 0.7:
        anomalies.append("近期飲水量比過去習慣少")

    def gaps(day) -> list[float]:
        times = sorted(item[0] for item in by_day[day])
        return [(b - a).total_seconds() / 60 for a, b in zip(times, times[1:])]

    history_gaps: list[float] = []
    for day in history_days:
        history_gaps.extend(gaps(day))
    recent_gaps = gaps(recent)
    if history_gaps and recent_gaps:
        old_gap = _median(history_gaps)
        new_gap = _median(recent_gaps)
        if new_gap > old_gap * 1.5 and new_gap - old_gap >= 20:
            anomalies.append("近期飲水間隔變長")
            last_dt = max(item[0] for item in by_day[recent])
            hour = min(21, last_dt.astimezone(TAIPEI).hour + 2)
            suggestions.append(
                {
                    "time": f"{hour:02d}:00",
                    "text": f"可在 {hour:02d}:00 加一次提醒（需你確認）",
                }
            )

    hours = [
        item[0].astimezone(TAIPEI).hour
        for day in compare_days
        for item in by_day[day]
    ]
    common = Counter(hours).most_common(2)
    period = "、".join(f"{hour}點" for hour, _ in common)
    average = int(round(sum(totals.values()) / len(totals)))
    summary = f"已有 {len(compare_days)} 天確認紀錄，每日大約 {average} mL"
    if period:
        summary += f"，常在 {period} 喝水"
    if not online:
        result["offline_note"] = "設備未同步，今天不拿來判斷沒有喝水。"

    result.update(
        {
            "status": "ok",
            "message": summary,
            "summary": summary,
            "anomalies": anomalies,
            "suggestions": suggestions,
            "basis": [
                f"採用 {len(compare_days)} 天、時間已確認的真實與手動紀錄",
                "已排除模擬、時間未確認與不合理水量",
                f"近期約 {totals[recent]} mL，過去中位數約 {int(round(history_median))} mL",
            ],
        }
    )
    facts = {
        "days": len(compare_days),
        "events": len(usable),
        "averageMl": average,
        "recentMl": totals[recent],
        "historyMedianMl": int(round(history_median)),
        "commonHours": [hour for hour, _ in common],
        "anomalies": anomalies,
        "online": online,
        "status": "ok",
    }
    ai = build_ai_advice(result, facts)
    if ai:
        result["ai_advice"] = ai
        result["summary"] = ai
        result["message"] = ai
    return result

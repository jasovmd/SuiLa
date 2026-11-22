from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

TEST_DB = ROOT / "data" / "test_suila.db"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_file = tmp_path / "suila.db"
    monkeypatch.setenv("SUILA_TEST", "1")
    import app.db as db

    monkeypatch.setattr(db, "DB_PATH", db_file)
    from app.main import app

    db.init_db()
    with TestClient(app) as c:
        yield c


def test_intake_once_and_dedupe(client):
    payload = {
        "event_id": "evt-1",
        "device_id": "esp32-1",
        "measured_at": "2026-10-20T02:00:00Z",
        "estimated_intake_ml": 50,
        "measurement_mode": "sim",
        "time_verified": True,
    }
    r1 = client.post("/api/intake", json=payload)
    r2 = client.post("/api/intake", json=payload)
    assert r1.status_code == 200
    assert r1.json()["duplicated"] is False
    assert r2.json()["duplicated"] is True

    day = client.get("/api/intake/daily", params={"day": "2026-10-20"})
    body = day.json()
    assert body["total_ml"] == 50
    assert len(body["events"]) == 1


def test_unverified_excluded_from_total(client):
    client.post(
        "/api/intake",
        json={
            "event_id": "evt-u",
            "device_id": "esp32-1",
            "measured_at": "2026-10-20T03:00:00Z",
            "estimated_intake_ml": 80,
            "measurement_mode": "sim",
            "time_verified": False,
        },
    )
    body = client.get("/api/intake/daily", params={"day": "2026-10-20"}).json()
    assert body["total_ml"] == 0
    assert len(body["events"]) == 1


def test_goal_and_heartbeat(client):
    assert client.get("/api/goal").json()["daily_goal_ml"] == 2000
    assert client.put("/api/goal", json={"daily_goal_ml": 1800}).json()["daily_goal_ml"] == 1800
    hb = client.post(
        "/api/heartbeat",
        json={
            "device_id": "esp32-1",
            "measurement_mode": "sim",
            "sensor_ok": True,
            "baseline_ready": True,
            "message": "ok",
        },
    )
    assert hb.status_code == 200
    st = client.get("/api/devices/esp32-1/status").json()
    assert st["online"] is True
    assert st["sensor_ok"] is True


def test_analysis_needs_real_data(client):
    body = client.get("/api/analysis", params={"device_id": "esp32-1"}).json()
    assert body["status"] == "accumulating"
    assert body["message"] == "資料累積中"
    denied = client.post("/api/reminders/confirm", json={"time": "15:30", "confirm": False})
    assert denied.status_code == 400
    ok = client.post("/api/reminders/confirm", json={"time": "15:30", "confirm": True})
    assert ok.status_code == 200
    assert "15:30" in ok.json()["times"]

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient


TEST_DATA = Path(tempfile.mkdtemp(prefix="grow-api-test-"))
os.environ["GROW_DATA_DIR"] = str(TEST_DATA)

from app.main import app  # noqa: E402


def test_complete_garden_flow(monkeypatch) -> None:
    monkeypatch.setenv('GROW_ADMIN_PIN', '2468')
    monkeypatch.setattr('app.main.weather_is_stale', lambda: False)
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        dashboard = client.get("/api/v1/dashboard")
        assert dashboard.status_code == 200
        initial = dashboard.json()
        assert len(initial["plots"]) == 12
        assert sum(not item["segments"] for item in initial["plots"]) == 8
        assert initial["qrBindings"]["001"] == "001"
        assert client.get('/api/v1/auth/session').json()['authenticated'] is False
        assert client.post(
            '/api/v1/plots',
            json={'id': '13', 'name': '未授权', 'crop': '青菜', 'stage': '播种期'},
        ).status_code == 401
        assert client.post('/api/v1/auth/login', json={'pin': '2468'}).status_code == 200

        created = client.post(
            "/api/v1/plots",
            json={
                "id": "13",
                "name": "试验畦",
                "crop": "黄瓜",
                "variety": "水果黄瓜",
                "kind": "loofah",
                "stage": "幼苗期",
            },
        )
        assert created.status_code == 201
        assert created.json()["id"] == "013"

        record = client.post(
            "/api/v1/records",
            json={"plotId": "013", "action": "浇水", "note": "测试浇水"},
        )
        assert record.status_code == 201
        assert record.json()["note"] == "测试浇水"

        first_planting = client.get('/api/v1/plots/013/plantings').json()[0]
        first_id = first_planting['id']
        trace = client.get(f'/api/v1/plantings/{first_id}/trace')
        assert trace.status_code == 200
        assert trace.json()['planting']['crop'] == '黄瓜'
        assert any(item['id'] == record.json()['id'] for item in trace.json()['records'])

        next_planting = client.post('/api/v1/plots/013/plantings', json={
            'id': '013', 'name': '试验畦', 'crop': '番茄', 'variety': '小番茄',
        })
        assert next_planting.status_code == 201
        plantings = client.get('/api/v1/plantings').json()
        second_id = next(item['id'] for item in plantings if item['plot_id'] == '013' and item['crop'] == '番茄')
        assert first_id != second_id
        assert client.get(f'/api/v1/plantings/{first_id}/trace').json()['planting']['crop'] == '黄瓜'
        assert client.get(f'/api/v1/plantings/{second_id}/trace').json()['records'][0]['action'] == '开始新一茬'
        assert client.get('/api/v1/plantings/999999999/trace').status_code == 404

        binding = client.put("/api/v1/qr/88", json={"plotId": "013"})
        assert binding.status_code == 200
        assert binding.json() == {"code": "088", "plotId": "013", "status": "bound"}
        assert client.get("/api/v1/qr/088").json()["plotId"] == "013"

        issue = client.post(
            "/api/v1/issues",
            json={"plotId": "013", "kind": "pest", "name": "蚜虫", "severity": "轻微"},
        )
        assert issue.status_code == 201
        issue_id = issue.json()["id"]
        resolved = client.patch(f"/api/v1/issues/{issue_id}", json={"status": "resolved"})
        assert resolved.status_code == 200
        assert resolved.json()["status"] == "resolved"

        supplies = client.get("/api/v1/supplies").json()
        updated_supply = client.patch(
            f"/api/v1/supplies/{supplies[0]['id']}",
            json={"stock": 9},
        )
        assert updated_supply.status_code == 200
        assert updated_supply.json()["stock"] == 9

        page = client.get("/")
        assert page.status_code == 200
        assert "我的菜园" in page.text

        qr_page = client.get("/q/88", follow_redirects=False)
        assert qr_page.status_code == 302
        assert qr_page.headers["location"] == "/?qr=088"

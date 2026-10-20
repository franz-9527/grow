from concurrent.futures import ThreadPoolExecutor
import io
import json
import re
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from app import database
from app.media import compress_image_losslessly
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'grow.db')
    monkeypatch.setenv('GROW_ADMIN_PIN', '2468')
    monkeypatch.setattr('app.main.weather_is_stale', lambda: False)
    with TestClient(app) as client:
        assert client.post('/api/v1/auth/login', json={'pin': '2468'}).status_code == 200
        yield client


def test_manual_stage_and_new_planting_preserve_history(client):
    old = client.get('/api/v1/plots/002/plantings').json()[0]
    changed = client.patch('/api/v1/plots/002', json={'stage': '幼苗期'})
    assert changed.status_code == 200
    assert changed.json()['progress'] == 20
    assert client.get('/api/v1/records?plotId=002').json()[0]['note'] == '结果期 → 幼苗期'
    assert client.patch('/api/v1/plots/002', json={'stage': '不存在'}).status_code == 422
    assert client.patch('/api/v1/plots/002', json={'stage': None}).status_code == 422
    assert client.patch('/api/v1/plots/002', json={'crop': '生菜'}).status_code == 409
    response = client.post('/api/v1/plots/002/plantings', json={'id': '002', 'name': '东二畦', 'crop': '生菜', 'stage': '播种期'})
    assert response.status_code == 201
    assert response.json()['progress'] == 0
    history = client.get('/api/v1/plots/002/plantings').json()
    assert len(history) == 2
    assert history[1]['id'] == old['id'] and history[1]['status'] == 'ended'
    assert client.get('/api/v1/qr/002').json()['plot']['crop'] == '生菜'


def test_plot_position_can_be_saved_for_scene_layout(client):
    updated = client.patch(
        '/api/v1/plots/001',
        json={'position_x': 4.25, 'position_z': -2.75},
    )
    assert updated.status_code == 200
    assert updated.json()['position'] == {'x': 4.25, 'z': -2.75}
    saved = next(plot for plot in client.get('/api/v1/plots').json() if plot['id'] == '001')
    assert saved['position'] == {'x': 4.25, 'z': -2.75}


def test_ridge_segments_are_saved_and_bounded_by_real_length(client):
    original = next(plot for plot in client.get('/api/v1/plots').json() if plot['id'] == '001')
    assert original['size'] == {'width': 7.0, 'depth': 1.2}
    assert original['segments'][0]['crop'] == '青菜'
    empty = next(plot for plot in client.get('/api/v1/plots').json() if plot['id'] == '005')
    assert empty['segments'] == []
    assert empty['size']['depth'] == 1.2

    sections = [
        {'lengthM': 2.5, 'crop': '青菜', 'kind': 'leafy', 'stage': '幼苗期'},
        {'lengthM': 3.2, 'crop': '玉米', 'kind': 'corn', 'stage': '拔节期'},
    ]
    saved = client.put('/api/v1/plots/001/segments', json={'segments': sections})
    assert saved.status_code == 200
    assert saved.json()['segments'] == sections
    assert saved.json()['crop'] == '青菜、玉米'
    assert saved.json()['stage'] == '混种'
    assert next(plot for plot in client.get('/api/v1/plots').json() if plot['id'] == '001')['segments'] == sections
    assert client.put('/api/v1/plots/001/segments', json={'segments': [
        {**sections[0], 'lengthM': 7.1},
    ]}).status_code == 422
    assert client.patch('/api/v1/plots/001', json={'width_m': 5}).status_code == 409
    assert client.get('/api/v1/plots/001/plantings').json()[0]['crop'] == '青菜'

    planted = client.put('/api/v1/plots/005/segments', json={'segments': [sections[1]]})
    assert planted.status_code == 200
    assert planted.json()['segments'][0]['crop'] == '玉米'
    assert client.get('/api/v1/plots/005/plantings').json()[0]['crop'] == '玉米'
    cleared = client.put('/api/v1/plots/005/segments', json={'segments': []})
    assert cleared.status_code == 200
    assert cleared.json()['segments'] == []
    assert cleared.json()['crop'] == '休耕'
    assert cleared.json()['day'] == 0


def test_receipts_merge_and_concurrent_updates(client):
    parsed = client.post('/api/v1/supplies/parse', json={'text': '腐熟有机肥 5 公斤\n黄色粘虫板 3 张'})
    assert parsed.status_code == 200
    items = parsed.json()
    assert items[0]['name'] == '腐熟有机肥' and items[0]['unit'] == '千克'
    received = client.post('/api/v1/supplies/receive', json=items).json()
    assert received[0]['stock'] == 23
    supply_id = received[0]['id']
    with ThreadPoolExecutor(max_workers=4) as executor:
        responses = list(executor.map(lambda _: client.post('/api/v1/supplies/receive', json=[items[0]]), range(8)))
    assert all(response.status_code == 201 for response in responses)
    supplies = client.get('/api/v1/supplies').json()
    matched = [s for s in supplies if s['id'] == supply_id]
    assert matched[0]['stock'] == 63
    assert len([s for s in supplies if s['name'] == '腐熟有机肥']) == 1
    assert client.post('/api/v1/supplies/receive', json=[]).status_code == 422
    assert client.post('/api/v1/supplies/parse', json={'text': '无法识别数量'}).status_code == 422
    assert client.post('/api/v1/supplies/parse', json={'text': '种子 0 包'}).status_code == 422


def test_supply_delete_detaches_history_and_keeps_record(client):
    supply = client.post(
        '/api/v1/supplies/receive',
        json=[{'name': '可删除肥料', 'category': 'fertilizer', 'stock': 2, 'unit': '千克'}],
    ).json()[0]
    record = client.post(
        '/api/v1/records',
        json={
            'plotId': '001',
            'action': '施肥',
            'amount': 1,
            'unit': '千克',
            'supplyId': supply['id'],
        },
    )
    assert record.status_code == 201
    assert record.json()['supplyName'] == '可删除肥料'
    assert client.delete(f"/api/v1/supplies/{supply['id']}").status_code == 204
    assert all(item['id'] != supply['id'] for item in client.get('/api/v1/supplies').json())
    movements = client.get('/api/v1/stock-movements').json()
    deleted_movement = next(item for item in movements if item['name'] == '可删除肥料')
    assert deleted_movement['supply_id'] is None
    assert deleted_movement['unit'] == '千克'
    assert client.get('/api/v1/records').json()[0]['supplyName'] == '可删除肥料'
    assert client.delete(f"/api/v1/records/{record.json()['id']}").status_code == 204
    assert any(item['name'] == '可删除肥料' for item in client.get('/api/v1/stock-movements').json())
    # DELETE is idempotent so a stale browser row does not show a false error.
    assert client.delete(f"/api/v1/supplies/{supply['id']}").status_code == 204


def test_supply_can_be_updated_independently(client):
    supply = client.post(
        '/api/v1/supplies',
        json={
            'name': '可修改物资',
            'category': 'fertilizer',
            'stock': 2,
            'unit': '千克',
            'note': '旧备注',
        },
    ).json()
    updated = client.patch(
        f"/api/v1/supplies/{supply['id']}",
        json={
            'name': '修改后物资',
            'category': 'tool',
            'stock': 5,
            'unit': '把',
            'note': '新备注',
        },
    )
    assert updated.status_code == 200
    assert updated.json() | {'id': supply['id']} == {
        'id': supply['id'],
        'name': '修改后物资',
        'category': 'tool',
        'stock': 5,
        'unit': '把',
        'safeIntervalDays': 0,
        'note': '新备注',
        'imageUrl': '',
    }
    movements = client.get('/api/v1/stock-movements').json()
    assert any(item['name'] == '修改后物资' and item['delta'] == 3 for item in movements)


def test_v2_stock_movement_migration_keeps_snapshots(tmp_path, monkeypatch):
    legacy_path = tmp_path / 'legacy-v2.db'
    with sqlite3.connect(legacy_path) as conn:
        conn.executescript(
            """
            PRAGMA foreign_keys = ON;
            CREATE TABLE supplies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                stock REAL NOT NULL,
                unit TEXT NOT NULL,
                safe_interval_days INTEGER NOT NULL DEFAULT 0,
                note TEXT NOT NULL DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE garden_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plot_id TEXT NOT NULL,
                planting_id INTEGER,
                action TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                amount REAL,
                unit TEXT,
                occurred_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE stock_movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supply_id INTEGER NOT NULL REFERENCES supplies(id),
                delta REAL NOT NULL,
                balance REAL NOT NULL,
                reason TEXT NOT NULL,
                record_id INTEGER REFERENCES garden_records(id) ON DELETE SET NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            INSERT INTO supplies(name, category, stock, unit, updated_at)
            VALUES ('历史肥料', 'fertilizer', 2, '千克', '2026-09-12T00:00:00+08:00');
            INSERT INTO garden_records(plot_id, action, occurred_at, created_at)
            VALUES ('001', '施肥', '2026-09-12T00:00:00+08:00', '2026-09-12T00:00:00+08:00');
            INSERT INTO stock_movements(supply_id, delta, balance, reason, record_id, created_at)
            VALUES (1, 2, 2, '初始入库', 1, '2026-09-12T00:00:00+08:00');
            INSERT INTO settings(key, value, updated_at)
            VALUES ('initialized', '1', '2026-09-12T00:00:00+08:00');
            PRAGMA user_version = 2;
            """
        )
    monkeypatch.setattr(database, 'DB_PATH', legacy_path)
    database.init_db()
    with sqlite3.connect(legacy_path) as conn:
        conn.execute('PRAGMA foreign_keys = ON')
        columns = {
            row[1]: row
            for row in conn.execute('PRAGMA table_info(stock_movements)').fetchall()
        }
        assert columns['supply_id'][3] == 0
        movement = conn.execute(
            'SELECT supply_id, supply_name, supply_unit FROM stock_movements WHERE id = 1'
        ).fetchone()
        assert movement == (1, '历史肥料', '千克')
        record = conn.execute(
            'SELECT supply_name, supply_unit FROM garden_records WHERE id = 1'
        ).fetchone()
        assert record == ('历史肥料', '千克')
        conn.execute('DELETE FROM supplies WHERE id = 1')
        assert conn.execute(
            'SELECT supply_id, supply_name FROM stock_movements WHERE id = 1'
        ).fetchone() == (None, '历史肥料')
        assert conn.execute(
            'SELECT supply_name, supply_unit FROM garden_records WHERE id = 1'
        ).fetchone() == ('历史肥料', '千克')


def test_stock_record_transaction_and_reversal(client):
    supply = client.post('/api/v1/supplies/receive', json=[{'name': '测试肥料', 'category': 'fertilizer', 'stock': 5, 'unit': '千克'}]).json()[0]
    record = {'plotId': '001', 'action': '施肥', 'amount': 2, 'unit': '千克', 'supplyId': supply['id']}
    before = len(client.get('/api/v1/records').json())
    rejected = client.post('/api/v1/records', json={**record, 'amount': 6})
    assert rejected.status_code == 409
    assert len(client.get('/api/v1/records').json()) == before
    assert client.post('/api/v1/records', json={**record, 'unit': '克'}).status_code == 422
    added = client.post('/api/v1/records', json=record)
    assert added.status_code == 201
    assert client.get('/api/v1/stock-movements').json()[0]['balance'] == 3
    deleted = client.delete(f"/api/v1/records/{added.json()['id']}")
    assert deleted.status_code == 204
    movement = client.get('/api/v1/stock-movements').json()[0]
    assert movement['balance'] == 5 and movement['delta'] == 2
    assert client.delete(f"/api/v1/records/{added.json()['id']}").status_code == 404
    assert client.get('/api/v1/stock-movements').json()[0]['balance'] == 5


def test_stock_movement_can_be_deleted_without_changing_stock_or_records(client):
    supply = client.post(
        '/api/v1/supplies',
        json={'name': '可删流水物资', 'category': 'tool', 'stock': 4, 'unit': '把'},
    ).json()
    movement = next(
        item
        for item in client.get('/api/v1/stock-movements').json()
        if item['supply_id'] == supply['id']
    )
    assert client.delete(f"/api/v1/stock-movements/{movement['id']}").status_code == 204
    matched = next(item for item in client.get('/api/v1/supplies').json() if item['id'] == supply['id'])
    assert matched['stock'] == 4
    assert all(
        item['id'] != movement['id']
        for item in client.get('/api/v1/stock-movements').json()
    )
    assert client.delete(f"/api/v1/stock-movements/{movement['id']}").status_code == 204


def test_plot_supply_and_qiniu_upload_metadata(client, monkeypatch):
    created_plot = client.post(
        '/api/v1/plots',
        json={
            'id': '900',
            'name': '图片地块',
            'crop': '青菜',
            'image_url': 'http://qn.20m.cc/grow/plots/900/plot.jpg',
            'crop_image_url': 'http://qn.20m.cc/grow/crops/900/crop.jpg',
        },
    )
    assert created_plot.status_code == 201
    assert created_plot.json()['imageUrl'].endswith('/plot.jpg')
    assert created_plot.json()['cropImageUrl'].endswith('/crop.jpg')
    supply = client.post(
        '/api/v1/supplies',
        json={
            'name': '图片物资',
            'category': 'seed',
            'stock': 1,
            'unit': '包',
            'image_url': 'http://qn.20m.cc/grow/supplies/2/seed.jpg',
        },
    )
    assert supply.status_code == 201
    assert supply.json()['imageUrl'].endswith('/seed.jpg')

    monkeypatch.setenv('QINIU_ACCESS_KEY', 'test-ak')
    monkeypatch.setenv('QINIU_SECRET_KEY', 'test-sk')
    token = client.post(
        '/api/v1/media/upload-token',
        json={
            'category': 'plots',
            'owner_id': '001',
            'filename': '菜地照片.png',
            'content_type': 'image/png',
            'size': 1024,
        },
    )
    assert token.status_code == 200
    body = token.json()
    assert body['key'].startswith('grow/plots/001/')
    assert body['publicUrl'].startswith('http://qn.20m.cc/grow/plots/001/')
    assert body['uploadUrl'] == 'https://up-z0.qiniup.com'


def test_legacy_https_qiniu_urls_are_returned_over_http(client, monkeypatch):
    supply = client.post(
        '/api/v1/supplies',
        json={
            'name': '旧协议图片物资',
            'category': 'tool',
            'stock': 1,
            'unit': '件',
            'image_url': 'https://qn.20m.cc/grow/supplies/2/old.webp',
        },
    )
    assert supply.status_code == 201
    assert supply.json()['imageUrl'] == 'http://qn.20m.cc/grow/supplies/2/old.webp'
    image = client.post(
        f"/api/v1/supplies/{supply.json()['id']}/images",
        json={
            'image_url': 'https://qn.20m.cc/grow/supplies/2/old-gallery.webp',
        },
    )
    assert image.status_code == 201
    assert image.json()['imageUrl'] == 'http://qn.20m.cc/grow/supplies/2/old-gallery.webp'

    monkeypatch.setenv('QINIU_ACCESS_KEY', 'test-ak')
    monkeypatch.setenv('QINIU_SECRET_KEY', 'test-sk')
    monkeypatch.setenv('QINIU_PUBLIC_BASE_URL', 'https://qn.20m.cc')
    token = client.post(
        '/api/v1/media/upload-token',
        json={
            'category': 'supplies',
            'owner_id': str(supply.json()['id']),
            'filename': '旧图片.webp',
            'content_type': 'image/webp',
            'size': 1024,
        },
    )
    assert token.status_code == 200
    assert token.json()['publicUrl'].startswith('http://qn.20m.cc/grow/supplies/')


def test_issue_action_also_appears_in_farm_records(client):
    issue = client.post(
        '/api/v1/issues',
        json={
            'plotId': '001',
            'kind': 'pest',
            'name': '测试蚜虫',
            'severity': '轻微',
            'symptoms': '新叶卷曲',
            'treatment': '清水冲洗',
        },
    )
    assert issue.status_code == 201
    record = client.get('/api/v1/records?plotId=001').json()[0]
    assert record['action'] == '病虫草害'
    assert '测试蚜虫' in record['note']
    assert '新叶卷曲' in record['note']
    plot = next(item for item in client.get('/api/v1/plots').json() if item['id'] == '001')
    assert '病虫草害' in plot['lastAction']


def test_existing_issue_is_backfilled_into_farm_records(client):
    now = database.now_iso()
    with database.session() as conn:
        planting = conn.execute(
            "SELECT id FROM plantings WHERE plot_id = '001' AND status = 'active'"
        ).fetchone()
        issue = conn.execute(
            """INSERT INTO issues
               (plot_id, planting_id, kind, name, severity, symptoms, treatment,
                status, detected_at, created_at, updated_at)
               VALUES ('001', ?, 'weed', '历史杂草', '轻微', '根部有杂草',
                       '人工拔除', 'open', ?, ?, ?)""",
            (planting['id'], now, now, now),
        )
        issue_id = issue.lastrowid

    database.init_db()
    records = client.get('/api/v1/records?plotId=001').json()
    with database.session() as conn:
        record_id = conn.execute(
            "SELECT id FROM garden_records WHERE issue_id = ?",
            (issue_id,),
        ).fetchone()['id']
    record = next(item for item in records if item['id'] == record_id)
    assert record['action'] == '病虫草害'
    assert '历史杂草' in record['note']
    assert '人工拔除' in record['note']


def test_image_upload_is_normalized_to_2k_lossless_webp(client, monkeypatch):
    """The browser upload route must upload only the server-normalized WebP."""
    monkeypatch.setenv('QINIU_ACCESS_KEY', 'test-ak')
    monkeypatch.setenv('QINIU_SECRET_KEY', 'test-sk')
    captured: dict[str, bytes] = {}

    class FakeQiniuResponse:
        def __init__(self, payload: bytes):
            self.payload = payload

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def read(self) -> bytes:
            return self.payload

    def fake_urlopen(request, timeout):
        assert timeout == 30
        body = request.data
        assert isinstance(body, bytes)
        captured['body'] = body
        key = re.search(
            rb'name="key"\r\n\r\n([^\r\n]+)',
            body,
        ).group(1).decode('utf-8')
        return FakeQiniuResponse(json.dumps({'key': key}).encode('utf-8'))

    monkeypatch.setattr('app.media.urlopen', fake_urlopen)
    source_image = Image.new('RGB', (2400, 600), (39, 128, 75))
    source = io.BytesIO()
    source_image.save(source, format='PNG')

    response = client.post(
        '/api/v1/media/upload?category=plots&owner_id=001&filename=菜地.png',
        content=source.getvalue(),
        headers={'Content-Type': 'image/png'},
    )
    assert response.status_code == 201
    body = response.json()
    assert body['contentType'] == 'image/webp'
    assert body['width'] == 2048 and body['height'] == 512
    assert body['size'] <= 2 * 1024 * 1024
    assert body['url'].startswith('http://qn.20m.cc/grow/plots/001/')
    assert b'Content-Type: image/webp' in captured['body']

    small = io.BytesIO()
    Image.new('RGB', (2, 2), (17, 90, 201)).save(small, format='PNG')
    compressed, width, height = compress_image_losslessly(small.getvalue())
    with Image.open(io.BytesIO(compressed)) as normalized:
        assert (width, height) == (2, 2)
        assert normalized.getpixel((0, 0)) == (17, 90, 201)


def test_catalog_includes_thirty_local_pest_and_disease_images(client):
    catalog = client.get('/api/v1/catalog')
    assert catalog.status_code == 200
    image_threats = catalog.json()['threats']
    assert len(image_threats) == 30
    assert sum(item['kind'] == 'pest' for item in image_threats) == 15
    assert sum(item['kind'] == 'disease' for item in image_threats) == 15
    assert all(item['imageUrl'].startswith('/threats/') for item in image_threats)
    assert all('wikimedia' not in item['imageUrl'].lower() for item in image_threats)
    assert all(item['license'] and item['imageCredit'] and item['symptoms'] and item['suggestion'] for item in image_threats)


def test_threat_library_can_be_created_edited_and_deleted_without_issue_links(client):
    created = client.post(
        '/api/v1/threats',
        json={
            'kind': 'pest',
            'name': '测试菜园害虫',
            'aliases': ['测试虫'],
            'crops': ['青菜'],
            'symptoms': '叶面出现测试咬痕。',
            'suggestion': '先人工检查。',
            'season': '春季',
            'severity': '轻微',
            'image_url': '/threats/pest-01.jpg',
            'source_url': 'https://example.com/source',
            'image_credit': '测试来源',
            'license': '自有资料',
        },
    )
    assert created.status_code == 201
    threat = created.json()
    assert threat['id'] and threat['aliases'] == ['测试虫']
    issue = client.post(
        '/api/v1/issues',
        json={
            'plotId': '001',
            'kind': 'pest',
            'name': threat['name'],
            'severity': '轻微',
            'symptoms': '历史记录保留',
        },
    )
    assert issue.status_code == 201
    updated = client.patch(
        f"/api/v1/threats/{threat['id']}",
        json={'name': '测试菜园害虫（已编辑）', 'symptoms': '新的识别症状。'},
    )
    assert updated.status_code == 200
    assert updated.json()['name'] == '测试菜园害虫（已编辑）'
    assert client.delete(f"/api/v1/threats/{threat['id']}").status_code == 204
    assert all(
        item['id'] != threat['id']
        for item in client.get('/api/v1/catalog').json()['threats']
    )
    assert any(
        item['name'] == threat['name'] and item['symptoms'] == '历史记录保留'
        for item in client.get('/api/v1/issues').json()
    )


def test_growth_photo_supply_image_and_optional_seed_records(client):
    seed = client.post(
        '/api/v1/supplies',
        json={'name': '可选番茄种子', 'category': 'seed', 'stock': 1, 'unit': '包'},
    ).json()
    created = client.post(
        '/api/v1/plots',
        json={
            'id': '901',
            'name': '照片记录地块',
            'crop': '番茄',
            'kind': 'tomato',
            'seed_supply_id': seed['id'],
        },
    )
    assert created.status_code == 201
    assert created.json()['seedSupplyId'] == seed['id']
    assert created.json()['seedName'] == '可选番茄种子'

    photos = []
    for note in ('刚出新叶', '叶片展开'):
        response = client.post(
            '/api/v1/plots/901/growth-photos',
            json={
                'image_url': f'http://qn.20m.cc/grow/crops/901/growth/{note}.jpg',
                'note': note,
                'taken_at': '2026-09-13T08:30:00+08:00',
            },
        )
        assert response.status_code == 201
        photos.append(response.json())
    listed_photos = client.get('/api/v1/plots/901/growth-photos').json()
    assert len(listed_photos) == 2 and listed_photos[0]['crop'] == '番茄'
    assert client.delete(f"/api/v1/growth-photos/{photos[0]['id']}").status_code == 204
    assert len(client.get('/api/v1/plots/901/growth-photos').json()) == 1

    supply = client.post(
        '/api/v1/supplies',
        json={'name': '多图物资', 'category': 'tool', 'stock': 1, 'unit': '件'},
    ).json()
    images = [
        client.post(
            f"/api/v1/supplies/{supply['id']}/images",
            json={'image_url': f'http://qn.20m.cc/grow/supplies/{supply["id"]}/{i}.jpg'},
        ).json()
        for i in (1, 2)
    ]
    assert len(client.get(f"/api/v1/supplies/{supply['id']}/images").json()) == 2
    assert client.delete(f"/api/v1/supply-images/{images[0]['id']}").status_code == 204
    assert len(client.get(f"/api/v1/supplies/{supply['id']}/images").json()) == 1
    assert client.delete(f"/api/v1/supplies/{supply['id']}").status_code == 204
    assert client.delete(f"/api/v1/supplies/{seed['id']}").status_code == 204
    assert next(plot for plot in client.get('/api/v1/plots').json() if plot['id'] == '901')['seedSupplyId'] is None
    with sqlite3.connect(database.DB_PATH) as conn:
        assert conn.execute(
            'SELECT supply_id, supply_name FROM supply_images WHERE id = ?',
            (images[1]['id'],),
        ).fetchone() == (None, '多图物资')
        assert conn.execute(
            'SELECT seed_supply_id, seed_name FROM plantings WHERE plot_id = ?',
            ('901',),
        ).fetchone() == (None, '可选番茄种子')


def test_project_dotenv_loader_does_not_override_process_environment(tmp_path, monkeypatch):
    key = 'GROW_TEST_DOTENV_VALUE'
    monkeypatch.delenv(key, raising=False)
    env_file = tmp_path / '.env'
    env_file.write_text(
        f'export {key}="from-file" # comment\n', encoding='utf-8'
    )
    database._load_dotenv(env_file)
    assert database.os.getenv(key) == 'from-file'
    monkeypatch.setenv(key, 'from-process')
    database._load_dotenv(env_file)
    assert database.os.getenv(key) == 'from-process'


def test_qr_normalization_rebind_archive(client):
    assert client.put('/api/v1/qr/78', json={'plotId': '003'}).json()['code'] == '078'
    assert client.get('/api/v1/qr/078').json()['plot']['id'] == '003'
    assert client.put('/api/v1/qr/78', json={'plotId': '004'}).status_code == 200
    assert client.get('/api/v1/qr/078').json()['plot']['id'] == '004'
    assert client.get('/q/78', follow_redirects=False).headers['location'] == '/?qr=078'
    assert client.get('/api/v1/qr/１２３').status_code == 422
    assert client.get('/api/v1/qr/1234567').status_code == 422
    assert client.get('/api/v1/qr/999').json()['status'] == 'unbound'
    assert client.delete('/api/v1/plots/004').status_code == 204
    assert client.get('/api/v1/qr/078').json()['status'] == 'unbound'
    assert client.get('/api/v1/plots/004/plantings').json()[0]['status'] == 'ended'


def test_sqlite_file_and_idempotent_migration(client):
    db_path = database.DB_PATH
    assert db_path.read_bytes()[:16] == b'SQLite format 3\x00'
    with sqlite3.connect(db_path) as conn:
        assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert conn.execute('PRAGMA journal_mode').fetchone()[0] == 'delete'
        assert conn.execute('PRAGMA encoding').fetchone()[0] == 'UTF-8'
        assert conn.execute('PRAGMA foreign_key_check').fetchall() == []
        assert conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'index' AND sql LIKE '% WHERE %'"
        ).fetchall() == []
        conn.execute('PRAGMA user_version = 1')
    database.init_db()
    database.init_db()
    assert len(client.get('/api/v1/plots').json()) == 12
    assert len(list((db_path.parent / 'backups').glob('*.db'))) == 1
    with sqlite3.connect(db_path) as conn:
        assert conn.execute('PRAGMA user_version').fetchone()[0] == 8
    assert not Path(str(db_path) + '-wal').exists()


def test_water_record_does_not_invent_sensor_measurement(client):
    previous = client.get('/api/v1/plots').json()[0]['moisture']
    assert client.post('/api/v1/records', json={'plotId': '001', 'action': '浇水', 'amount': 2, 'unit': '升'}).status_code == 201
    assert client.get('/api/v1/plots').json()[0]['moisture'] == previous


def test_empty_garden_and_unknown_endpoints(client):
    for plot in client.get('/api/v1/plots').json():
        assert client.delete(f"/api/v1/plots/{plot['id']}").status_code == 204
    dashboard = client.get('/api/v1/dashboard').json()
    assert dashboard['plots'] == [] and dashboard['tasks'] == []
    assert client.get('/api/v1/missing').status_code == 404
    assert client.get('/data/grow.db').status_code == 404

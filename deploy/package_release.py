"""Build flat BaoTa installation/upgrade ZIPs from validated local outputs."""
from __future__ import annotations
import hashlib
import json
import shutil
import sqlite3
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / 'backend'
sys.path.insert(0, str(BACKEND))
from app.database import DATABASE_SCHEMA_VERSION, SCHEMA, _seed_threats, now_iso
from app.catalogs import THREATS
from manage_db import inspect

VERSION = 'v5.4'
RELEASE_DATE = '20260922'
RELEASE_NAME = f'2026-09-22-{VERSION}'
RELEASE = ROOT / 'deploy' / f'release-{RELEASE_DATE}-{VERSION}'
# The release directory is generated output. Rebuild it from scratch so a
# renamed Vite chunk from an earlier build can never remain in a new package.
if RELEASE.exists():
    shutil.rmtree(RELEASE)
RELEASE.mkdir(parents=True)
static = ROOT / 'frontend' / 'dist' / 'client'
if not (static / 'index.html').is_file():
    raise RuntimeError('请先成功完成前端生产构建')

shutil.copytree(BACKEND / 'app', RELEASE / 'app', dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
shutil.copytree(static, RELEASE / 'static' / 'client', dirs_exist_ok=True)
for name in ['requirements.txt', 'manage_db.py', '.env.example']:
    shutil.copy2(BACKEND / name, RELEASE / name)
deployment_guide = (ROOT / 'docs' / '宝塔-部署与升级.md').read_text(encoding='utf-8')
deployment_guide = deployment_guide.replace('V5.3', 'V5.4').replace('v5.3', 'v5.4').replace('20260913', RELEASE_DATE)
deployment_guide = deployment_guide.replace('v5.1/v5.2', 'v5.1/v5.2/v5.3')
deployment_guide = deployment_guide.replace(
    '# 一方菜园 V5.4 · 宝塔部署与升级',
    '# 一方菜园 V5.4 · 宝塔部署与升级\n\n本次升级优化三维菜园：支持旋转、缩放和平移，点击地块可自动聚焦；场景、模型、交互和仿真已模块化。二维码码牌扫码后会直接定位到绑定地块及对应作物记录。',
)
(RELEASE / 'README-先看这个.md').write_text(deployment_guide, encoding='utf-8')
shutil.copy2(
    ROOT / 'docs' / '病虫害图鉴图片来源与许可-v5.3.md',
    RELEASE / '病虫害图鉴图片来源与许可-v5.3.md',
)

# New installs start clean. Existing gardens must use the data-free upgrade ZIP.
data_dir = RELEASE / 'data'
data_dir.mkdir(exist_ok=True)
database = data_dir / 'grow.db'
if not database.exists():
    with sqlite3.connect(database) as conn:
        conn.execute('PRAGMA journal_mode = DELETE')
        conn.executescript(SCHEMA)
        conn.execute("INSERT INTO settings(key,value,updated_at) VALUES ('initialized','1',?)", (now_iso(),))
        conn.execute("INSERT INTO settings(key,value,updated_at) VALUES ('garden_name','我的菜园',?)", (now_iso(),))
        _seed_threats(conn)
        conn.execute(f'PRAGMA user_version = {DATABASE_SCHEMA_VERSION}')
        conn.commit()
        conn.execute('VACUUM')
report = inspect(database)
(RELEASE / 'SQLite检查报告.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
empty_database = ROOT / 'deploy' / f'grow-empty-{VERSION}-{RELEASE_DATE}.db'
shutil.copy2(database, empty_database)
with sqlite3.connect(database) as conn:
    (RELEASE / 'schema-and-initial-data.sql').write_text('\n'.join(conn.iterdump()), encoding='utf-8')

metadata = {'name':'一方菜园','release':RELEASE_NAME,'entrypoint':'app.main:app','port':8010,'database':'data/grow.db','sqlite_user_version':DATABASE_SCHEMA_VERSION,'sqlite_journal_mode':'delete','archive_layout':'flat','fresh_database':'empty','image_storage':'Qiniu Kodo；最长边 2048px；无损 WebP；成品不超过 2MB；grow/plots|grow/crops|grow/crops/{plot}/growth|grow/supplies|grow/threats','threat_images':'30 张本地下载的 Wikimedia Commons 图片（15 种虫害 + 15 种病害）；运行时不请求 Wiki','changes':'3D 场景模块化；OrbitControls 旋转/缩放/平移；Raycaster 地块选中与镜头聚焦；二维码扫码直达对应作物记录'}
(RELEASE / 'DEPLOYMENT.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')

archives: dict[str, dict[str, object]] = {}
for variant in ('install', 'upgrade'):
    path = ROOT / 'deploy' / f'grow-garden-{VERSION}-{variant}-{RELEASE_DATE}.zip'
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(RELEASE.rglob('*')):
            relative = file.relative_to(RELEASE)
            if not file.is_file() or '__pycache__' in relative.parts:
                continue
            if variant == 'upgrade' and (relative.parts[0] == 'data' or file.suffix == '.sql'):
                continue
            archive.write(file, relative.as_posix())
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        assert 'app/main.py' in archive.namelist() and 'static/client/index.html' in archive.namelist()
        if variant == 'upgrade':
            assert not any(name.startswith('data/') for name in archive.namelist())
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    archives[variant] = {
        'file': path.name,
        'bytes': path.stat().st_size,
        'sha256': digest,
    }
    print(f'{path.name}: {archives[variant]["bytes"]} bytes; sha256={digest}')

release_report = {
    'release': RELEASE_NAME,
    'sqlite': {
        'integrity': report['integrity'],
        'foreign_key_errors': report['foreign_key_errors'],
        'journal_mode': report['journal_mode'],
        'encoding': report['encoding'],
        'user_version': report['schema_version'],
        'tables': report['tables'],
        'empty_database': {
            'file': empty_database.name,
            'bytes': empty_database.stat().st_size,
            'sha256': hashlib.sha256(empty_database.read_bytes()).hexdigest(),
        },
    },
    'image_upload': {
        'format': 'lossless WebP',
        'max_edge_pixels': 2048,
        'max_result_bytes': 2 * 1024 * 1024,
        'max_source_bytes': 16 * 1024 * 1024,
    },
    'threat_catalog': {
        'total_with_images': sum(1 for item in THREATS if item.get('imageUrl')),
        'pests': sum(1 for item in THREATS if item.get('kind') == 'pest'),
        'diseases': sum(1 for item in THREATS if item.get('kind') == 'disease'),
        'image_delivery': 'bundled-local-download',
    },
    'archives': archives,
    'upgrade_contains_database': False,
}
(ROOT / 'deploy' / f'验证报告-{RELEASE_DATE}-{VERSION}.json').write_text(
    json.dumps(release_report, ensure_ascii=False, indent=2), encoding='utf-8'
)
print(f'SQLite: {report["integrity"]}; {report["journal_mode"]}; {report["encoding"]}; version {report["schema_version"]}')

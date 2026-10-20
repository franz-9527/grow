"""Package the existing BaoTa garden's v5.5 program-only upgrade."""
from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'backend' / 'app'
CLIENT = ROOT / 'frontend' / 'dist' / 'client'
OUTPUT = ROOT / 'deploy' / 'grow-garden-v5.5-upgrade-20260926.zip'

if not (CLIENT / 'index.html').is_file():
    raise SystemExit('请先在 frontend 运行 npm run build')

manifest = {
    'name': '一方菜园',
    'release': '2026-09-26-v5.5',
    'entrypoint': 'app.main:app',
    'port': 8010,
    'database': 'data/grow.db',
    'archive_layout': 'flat',
    'changes': '种植历史唯一编号与固定溯源链接；50×30 cm 可调 SVG 二维码标签',
}

with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as archive:
    for source, prefix in ((APP, 'app'), (CLIENT, 'static/client')):
        for file in sorted(source.rglob('*')):
            if not file.is_file() or '__pycache__' in file.parts or file.suffix == '.pyc':
                continue
            archive.write(file, f'{prefix}/{file.relative_to(source).as_posix()}')
    archive.writestr('DEPLOYMENT.json', json.dumps(manifest, ensure_ascii=False, indent=2))

with zipfile.ZipFile(OUTPUT) as archive:
    names = archive.namelist()
    assert archive.testzip() is None
    assert 'app/main.py' in names and 'static/client/index.html' in names
    assert not any(name.startswith('data/') or name == '.env' for name in names)

print(f'{OUTPUT.name}: {OUTPUT.stat().st_size} bytes')
print(f'SHA256: {hashlib.sha256(OUTPUT.read_bytes()).hexdigest()}')

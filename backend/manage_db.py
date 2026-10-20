"""SQLite validation and consistent backups; also usable from BaoTa Terminal."""
from __future__ import annotations
import argparse
import json
import sqlite3
from pathlib import Path


def inspect(path: Path) -> dict:
    if not path.is_file():
        raise ValueError('数据库文件不存在')
    with path.open('rb') as handle:
        header = handle.read(16)
    if header != b'SQLite format 3\x00':
        raise ValueError('不是标准 SQLite 3 数据库文件')
    with sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True) as conn:
        report = {
            'file': str(path.resolve()),
            'integrity': conn.execute('PRAGMA integrity_check').fetchone()[0],
            'foreign_key_errors': conn.execute('PRAGMA foreign_key_check').fetchall(),
            'journal_mode': conn.execute('PRAGMA journal_mode').fetchone()[0],
            'encoding': conn.execute('PRAGMA encoding').fetchone()[0],
            'schema_version': conn.execute('PRAGMA user_version').fetchone()[0],
            'tables': [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")],
        }
    if report['integrity'] != 'ok' or report['foreign_key_errors']:
        raise ValueError('数据库完整性检查未通过')
    return report


def backup(source: Path, target: Path):
    if target.exists():
        raise ValueError('目标文件已存在，请使用新的备份文件名')
    target.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True) as src:
        with sqlite3.connect(target) as dest:
            src.backup(dest)
            dest.execute('PRAGMA journal_mode = DELETE')
    return inspect(target)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='检查或备份菜园 SQLite 数据库')
    parser.add_argument('file', type=Path)
    parser.add_argument('--backup', type=Path, help='安全备份到一个新文件')
    args = parser.parse_args()
    print(json.dumps(backup(args.file, args.backup) if args.backup else inspect(args.file), ensure_ascii=False, indent=2))

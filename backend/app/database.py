from __future__ import annotations

import os
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterator
from zoneinfo import ZoneInfo


APP_ROOT = Path(__file__).resolve().parents[1]
SHANGHAI = ZoneInfo("Asia/Shanghai")
DATABASE_SCHEMA_VERSION = 8

FIELD_COLUMNS = (-10.0, -2.8, 8.5)
FIELD_ROWS = (-2.25, -0.8, 0.65, 2.1)
FIELD_SLOTS = tuple(
    (x, z, 10.0 if column == 2 else 7.0, 1.2, f"{row + 1}排{column + 1}垄")
    for row, z in enumerate(FIELD_ROWS)
    for column, x in enumerate(FIELD_COLUMNS)
)


def _load_dotenv(path: Path) -> None:
    """Load a small, dependency-free .env file without overriding real env vars."""
    if not path.is_file():
        return
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        return
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        value = value.strip()
        if value[:1] in {"'", '"'}:
            quote = value[0]
            closing = value.find(quote, 1)
            value = value[1:closing] if closing > 0 else value[1:]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        os.environ.setdefault(key, value)


# The packaged app keeps .env beside app/, so a BaoTa process can start with
# the panel's environment-variable option set to “无”.
_load_dotenv(APP_ROOT / ".env")


def _resolve_path(value: str | None, default: Path) -> Path:
    if not value:
        return default.resolve()
    path = Path(value)
    return (APP_ROOT / path).resolve() if not path.is_absolute() else path.resolve()


DATA_DIR = _resolve_path(os.getenv("GROW_DATA_DIR"), APP_ROOT / "data")
DB_PATH = _resolve_path(os.getenv("GROW_DB_PATH"), DATA_DIR / "grow.db")


def now_iso() -> str:
    return datetime.now(SHANGHAI).replace(microsecond=0).isoformat()


def today_iso() -> str:
    return datetime.now(SHANGHAI).date().isoformat()


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


@contextmanager
def session() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS plots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    area_m2 REAL NOT NULL DEFAULT 20,
    position_x REAL NOT NULL DEFAULT 0,
    position_z REAL NOT NULL DEFAULT 0,
    width_m REAL NOT NULL DEFAULT 6,
    depth_m REAL NOT NULL DEFAULT 4,
    soil_type TEXT NOT NULL DEFAULT '壤土',
    note TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plot_segments (
    plot_id TEXT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    length_m REAL NOT NULL CHECK(length_m > 0),
    crop TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'leafy',
    stage TEXT NOT NULL DEFAULT '播种期',
    PRIMARY KEY (plot_id, ordinal)
);

CREATE TABLE IF NOT EXISTS plantings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plot_id TEXT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
    crop TEXT NOT NULL,
    variety TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'leafy',
    stage TEXT NOT NULL DEFAULT '播种期',
    planted_on TEXT NOT NULL,
    expected_harvest_on TEXT,
    progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
    health TEXT NOT NULL DEFAULT '良好',
    moisture INTEGER NOT NULL DEFAULT 60 CHECK(moisture BETWEEN 0 AND 100),
    status TEXT NOT NULL DEFAULT 'active',
    plant_count INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    seed_supply_id INTEGER REFERENCES supplies(id) ON DELETE SET NULL,
    seed_name TEXT NOT NULL DEFAULT '',
    seed_unit TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plantings_plot_status
ON plantings(plot_id, status);

CREATE TABLE IF NOT EXISTS garden_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plot_id TEXT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
    planting_id INTEGER REFERENCES plantings(id) ON DELETE SET NULL,
    issue_id INTEGER,
    action TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    amount REAL,
    unit TEXT,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_plot_time
ON garden_records(plot_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plot_id TEXT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
    planting_id INTEGER REFERENCES plantings(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK(kind IN ('pest', 'disease', 'weed')),
    name TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT '轻微',
    symptoms TEXT NOT NULL DEFAULT '',
    treatment TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'monitoring', 'resolved')),
    detected_at TEXT NOT NULL,
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_issues_plot_status
ON issues(plot_id, status);

CREATE TABLE IF NOT EXISTS threats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK(kind IN ('pest', 'disease')),
    name TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    crops TEXT NOT NULL DEFAULT '[]',
    symptoms TEXT NOT NULL DEFAULT '',
    suggestion TEXT NOT NULL DEFAULT '',
    season TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL DEFAULT '中等',
    image_url TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    image_credit TEXT NOT NULL DEFAULT '',
    license TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_threats_name_kind
ON threats(kind, name);

CREATE INDEX IF NOT EXISTS idx_threats_active_kind
ON threats(active, kind, id);

CREATE TABLE IF NOT EXISTS qr_bindings (
    code TEXT PRIMARY KEY,
    plot_id TEXT REFERENCES plots(id) ON DELETE SET NULL,
    bound_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qr_active_plot
ON qr_bindings(plot_id);

CREATE TABLE IF NOT EXISTS supplies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('fertilizer', 'pesticide', 'tool', 'seed')),
    stock REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT '',
    safe_interval_days INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supplies_category
ON supplies(category);

CREATE TABLE IF NOT EXISTS weather_daily (
    weather_date TEXT PRIMARY KEY,
    scene TEXT NOT NULL CHECK(scene IN ('sunny', 'rain', 'mist')),
    condition TEXT NOT NULL,
    weather_code INTEGER,
    temperature_min REAL,
    temperature_max REAL,
    rainfall_mm REAL NOT NULL DEFAULT 0,
    wind_kmh REAL NOT NULL DEFAULT 0,
    humidity INTEGER,
    sunrise TEXT,
    sunset TEXT,
    is_day INTEGER,
    source TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supply_id INTEGER REFERENCES supplies(id) ON DELETE SET NULL,
    supply_name TEXT NOT NULL DEFAULT '',
    supply_unit TEXT NOT NULL DEFAULT '',
    delta REAL NOT NULL,
    balance REAL NOT NULL CHECK(balance >= 0),
    reason TEXT NOT NULL,
    record_id INTEGER REFERENCES garden_records(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_supply ON stock_movements(supply_id, id DESC);

CREATE TABLE IF NOT EXISTS growth_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plot_id TEXT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
    planting_id INTEGER REFERENCES plantings(id) ON DELETE SET NULL,
    crop_name TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    taken_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_growth_photos_plot_time
ON growth_photos(plot_id, taken_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS supply_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supply_id INTEGER REFERENCES supplies(id) ON DELETE SET NULL,
    supply_name TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supply_images_supply
ON supply_images(supply_id, id DESC);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def _ensure_columns(conn: sqlite3.Connection) -> None:
    migrations = {
        "plots": {
            "image_url": "ALTER TABLE plots ADD COLUMN image_url TEXT NOT NULL DEFAULT ''",
        },
        "plantings": {
            "image_url": "ALTER TABLE plantings ADD COLUMN image_url TEXT NOT NULL DEFAULT ''",
            "seed_supply_id": "ALTER TABLE plantings ADD COLUMN seed_supply_id INTEGER REFERENCES supplies(id) ON DELETE SET NULL",
            "seed_name": "ALTER TABLE plantings ADD COLUMN seed_name TEXT NOT NULL DEFAULT ''",
            "seed_unit": "ALTER TABLE plantings ADD COLUMN seed_unit TEXT NOT NULL DEFAULT ''",
        },
        "garden_records": {
            "issue_id": "ALTER TABLE garden_records ADD COLUMN issue_id INTEGER",
            "supply_name": "ALTER TABLE garden_records ADD COLUMN supply_name TEXT",
            "supply_unit": "ALTER TABLE garden_records ADD COLUMN supply_unit TEXT",
        },
        "supplies": {
            "active": "ALTER TABLE supplies ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1))",
            "image_url": "ALTER TABLE supplies ADD COLUMN image_url TEXT NOT NULL DEFAULT ''",
        },
        "weather_daily": {
            "sunrise": "ALTER TABLE weather_daily ADD COLUMN sunrise TEXT",
            "sunset": "ALTER TABLE weather_daily ADD COLUMN sunset TEXT",
            "is_day": "ALTER TABLE weather_daily ADD COLUMN is_day INTEGER",
        },
    }
    for table, columns in migrations.items():
        existing = {
            row[1]
            for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
        }
        for column, statement in columns.items():
            if column not in existing:
                conn.execute(statement)


def _migrate_stock_movements(conn: sqlite3.Connection) -> None:
    """Detach movement history from the supply row while preserving snapshots."""
    info = {
        row[1]: row
        for row in conn.execute("PRAGMA table_info(stock_movements)").fetchall()
    }
    if not info:
        return
    supply_id = info.get("supply_id")
    needs_rebuild = (
        "supply_name" not in info
        or "supply_unit" not in info
        or (supply_id is not None and supply_id[3] == 1)
    )
    if not needs_rebuild:
        return

    conn.execute(
        """CREATE TABLE stock_movements_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supply_id INTEGER REFERENCES supplies(id) ON DELETE SET NULL,
            supply_name TEXT NOT NULL DEFAULT '',
            supply_unit TEXT NOT NULL DEFAULT '',
            delta REAL NOT NULL,
            balance REAL NOT NULL CHECK(balance >= 0),
            reason TEXT NOT NULL,
            record_id INTEGER REFERENCES garden_records(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL
        )"""
    )
    conn.execute(
        """INSERT INTO stock_movements_new
        (id, supply_id, supply_name, supply_unit, delta, balance, reason, record_id, created_at)
        SELECT m.id, m.supply_id, COALESCE(s.name, ''), COALESCE(s.unit, ''),
               m.delta, m.balance, m.reason, m.record_id, m.created_at
        FROM stock_movements m
        LEFT JOIN supplies s ON s.id = m.supply_id"""
    )
    conn.execute("DROP TABLE stock_movements")
    conn.execute("ALTER TABLE stock_movements_new RENAME TO stock_movements")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_stock_supply ON stock_movements(supply_id, id DESC)")


def _backfill_record_supply_snapshots(conn: sqlite3.Connection) -> None:
    """Copy v2 movement names into records before a supply can be deleted."""
    columns = {
        row[1]
        for row in conn.execute("PRAGMA table_info(garden_records)").fetchall()
    }
    if not {"supply_name", "supply_unit"}.issubset(columns):
        return
    conn.execute(
        """UPDATE garden_records
        SET supply_name = CASE
                WHEN supply_name IS NOT NULL AND supply_name != '' THEN supply_name
                ELSE COALESCE((
                    SELECT COALESCE(NULLIF(m.supply_name, ''), s.name, '')
                    FROM stock_movements m
                    LEFT JOIN supplies s ON s.id = m.supply_id
                    WHERE m.record_id = garden_records.id
                    ORDER BY m.id DESC
                    LIMIT 1
                ), '')
            END,
            supply_unit = CASE
                WHEN supply_unit IS NOT NULL AND supply_unit != '' THEN supply_unit
                ELSE COALESCE((
                    SELECT COALESCE(NULLIF(m.supply_unit, ''), s.unit, '')
                    FROM stock_movements m
                    LEFT JOIN supplies s ON s.id = m.supply_id
                    WHERE m.record_id = garden_records.id
                    ORDER BY m.id DESC
                    LIMIT 1
                ), '')
            END
        WHERE (supply_name IS NULL OR supply_name = '' OR supply_unit IS NULL OR supply_unit = '')
          AND EXISTS (
              SELECT 1 FROM stock_movements m WHERE m.record_id = garden_records.id
          )"""
    )


def _backfill_issue_records(conn: sqlite3.Connection) -> None:
    """Create farm-record snapshots for issue entries made before v7."""
    columns = {
        row[1]
        for row in conn.execute("PRAGMA table_info(garden_records)").fetchall()
    }
    if "issue_id" not in columns:
        return

    issues = conn.execute(
        """SELECT id, plot_id, planting_id, name, symptoms, treatment,
                  detected_at, created_at
           FROM issues
           ORDER BY id"""
    ).fetchall()
    for issue in issues:
        if conn.execute(
            "SELECT 1 FROM garden_records WHERE issue_id = ? LIMIT 1",
            (issue["id"],),
        ).fetchone():
            continue
        note = (issue["name"] or "").strip()
        symptoms = (issue["symptoms"] or "").strip()
        treatment = (issue["treatment"] or "").strip()
        if symptoms:
            note += f"；症状：{symptoms}"
        if treatment:
            note += f"；处理：{treatment}"
        conn.execute(
            """INSERT INTO garden_records
               (plot_id, planting_id, issue_id, action, note, amount, unit,
                supply_name, supply_unit, occurred_at, created_at)
               VALUES (?, ?, ?, '病虫草害', ?, NULL, NULL, NULL, NULL, ?, ?)""",
            (
                issue["plot_id"],
                issue["planting_id"],
                issue["id"],
                note,
                issue["detected_at"],
                issue["created_at"],
            ),
        )


def _migrate_legacy_indexes(conn: sqlite3.Connection) -> None:
    """Replace SQLite 3.8+ partial indexes with 3.7-compatible indexes."""
    legacy_indexes = {
        row[0]: row[1]
        for row in conn.execute(
            "SELECT name, sql FROM sqlite_master WHERE type = 'index'"
        ).fetchall()
    }
    for name in ("idx_plantings_one_active_per_plot", "idx_qr_active_plot"):
        definition = legacy_indexes.get(name) or ""
        if " WHERE " not in f" {definition.upper()} ":
            continue
        conn.execute(f'DROP INDEX IF EXISTS "{name}"')
        if name == "idx_qr_active_plot":
            conn.execute("CREATE INDEX IF NOT EXISTS idx_qr_active_plot ON qr_bindings(plot_id)")


def init_db() -> None:
    with session() as conn:
        version = conn.execute('PRAGMA user_version').fetchone()[0]
        if version > DATABASE_SCHEMA_VERSION:
            raise RuntimeError('数据库版本高于当前程序，请使用匹配版本的程序，避免降级写入')
        has_tables = conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'plots'").fetchone()
        if version < 2 and has_tables:
            backups = DB_PATH.parent / 'backups'
            backups.mkdir(exist_ok=True)
            backup_path = backups / f"grow-before-v2-{datetime.now(SHANGHAI):%Y%m%d-%H%M%S-%f}.db"
            with sqlite3.connect(backup_path) as backup:
                conn.backup(backup)
        elif version < DATABASE_SCHEMA_VERSION and has_tables:
            backups = DB_PATH.parent / 'backups'
            backups.mkdir(exist_ok=True)
            backup_path = backups / f"grow-before-v8-{datetime.now(SHANGHAI):%Y%m%d-%H%M%S-%f}.db"
            with sqlite3.connect(backup_path) as backup:
                conn.backup(backup)
        # 宝塔 SQLite 管理器按单个数据库文件接入。DELETE 日志模式不会像
        # WAL 一样依赖 grow.db-wal / grow.db-shm 两个旁路文件，兼容性更好。
        conn.execute("PRAGMA journal_mode = DELETE")
        conn.execute("PRAGMA synchronous = NORMAL")
        _migrate_legacy_indexes(conn)
        conn.executescript(SCHEMA)
        _ensure_columns(conn)
        _migrate_stock_movements(conn)
        _backfill_record_supply_snapshots(conn)
        _backfill_issue_records(conn)
        _seed_threats(conn)
        _seed(conn)
        if version < 8:
            _ensure_field_layout(conn)
        conn.execute(f"PRAGMA user_version = {DATABASE_SCHEMA_VERSION}")
        conn.execute("PRAGMA optimize")


def _ensure_field_layout(conn: sqlite3.Connection) -> None:
    """Upgrade the sketch to twelve editable ridges, keeping existing plantings and records."""
    current = conn.execute(
        "SELECT id, area_m2, width_m, depth_m FROM plots WHERE active = 1 ORDER BY CAST(id AS INTEGER), id"
    ).fetchall()
    if not current:
        return
    chosen = (4, 5, 7, 8) if len(current) == 4 else tuple(range(min(len(current), 12)))
    used: set[int] = set()
    now = now_iso()
    for row, slot_index in zip(current, chosen):
        x, z, length, width, _ = FIELD_SLOTS[slot_index]
        old_area = float(row["area_m2"])
        old_product = float(row["width_m"]) * float(row["depth_m"])
        area = round(length * width, 2) if abs(old_area - old_product) < 0.15 else old_area
        conn.execute(
            """UPDATE plots SET position_x = ?, position_z = ?, width_m = ?, depth_m = ?,
               area_m2 = ?, updated_at = ? WHERE id = ?""",
            (x, z, length, width, area, now, row["id"]),
        )
        planting = conn.execute(
            """SELECT crop, kind, stage FROM plantings
               WHERE plot_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1""",
            (row["id"],),
        ).fetchone()
        if planting:
            conn.execute(
                """INSERT OR IGNORE INTO plot_segments
                   (plot_id, ordinal, length_m, crop, kind, stage)
                   VALUES (?, 0, ?, ?, ?, ?)""",
                (row["id"], length, planting["crop"], planting["kind"], planting["stage"]),
            )
        used.add(slot_index)
    next_id = max((int(row["id"]) for row in conn.execute("SELECT id FROM plots") if row["id"].isdigit()), default=0) + 1
    for slot_index, (x, z, length, width, name) in enumerate(FIELD_SLOTS):
        if slot_index in used:
            continue
        plot_id = str(next_id).zfill(3)
        next_id += 1
        conn.execute(
            """INSERT INTO plots
               (id, name, area_m2, position_x, position_z, width_m, depth_m,
                soil_type, note, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, '壤土', '', ?, ?)""",
            (plot_id, name, round(length * width, 2), x, z, length, width, now, now),
        )


def _seed(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT 1 FROM settings WHERE key = 'initialized'").fetchone():
        return
    conn.execute("INSERT INTO settings(key, value, updated_at) VALUES ('initialized', '1', ?)", (now_iso(),))
    exists = conn.execute("SELECT 1 FROM plots LIMIT 1").fetchone()
    if exists:
        return

    now = now_iso()
    today = date.today()
    plots = [
        ("001", "东一畦", 26.9, -7.1, -4.8, 6.4, 4.2, "壤土", "靠近水源"),
        ("002", "东二畦", 26.9, 1.3, -4.8, 6.4, 4.2, "壤土", "午后日照充足"),
        ("003", "西一畦", 28.8, -7.1, 2.4, 6.4, 4.5, "砂质壤土", "搭有瓜架"),
        ("004", "西二畦", 28.8, 1.3, 2.4, 6.4, 4.5, "壤土", "适合轮作"),
    ]
    conn.executemany(
        """INSERT INTO plots
        (id, name, area_m2, position_x, position_z, width_m, depth_m, soil_type, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [(*plot, now, now) for plot in plots],
    )

    plantings = [
        ("001", "青菜", "上海青", "leafy", "幼苗期", today - timedelta(days=16), 34, "良好", 72, 48),
        ("002", "番茄", "普罗旺斯", "tomato", "结果期", today - timedelta(days=68), 76, "留意", 46, 24),
        ("003", "白丝瓜", "香玉白丝瓜", "loofah", "开花期", today - timedelta(days=42), 58, "良好", 63, 12),
        ("004", "香葱", "四季小香葱", "scallion", "生长期", today - timedelta(days=29), 49, "良好", 67, 80),
    ]
    conn.executemany(
        """INSERT INTO plantings
        (plot_id, crop, variety, kind, stage, planted_on, progress, health, moisture, plant_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [(*item[:5], item[5].isoformat(), *item[6:], now, now) for item in plantings],
    )

    planting_ids = {
        row["plot_id"]: row["id"]
        for row in conn.execute("SELECT id, plot_id FROM plantings WHERE status = 'active'")
    }
    records = [
        ("003", "浇水", "约 12 升，根部浇灌", 12, "升", now),
        ("003", "除草", "清理田埂及根部杂草", None, None, (datetime.now(SHANGHAI) - timedelta(days=1)).isoformat(timespec="seconds")),
        ("002", "检查虫害", "发现少量白粉虱，继续观察", None, None, (datetime.now(SHANGHAI) - timedelta(days=1, hours=2)).isoformat(timespec="seconds")),
        ("001", "施肥", "少量有机液肥", 0.3, "升", (datetime.now(SHANGHAI) - timedelta(days=5)).isoformat(timespec="seconds")),
    ]
    conn.executemany(
        """INSERT INTO garden_records
        (plot_id, planting_id, action, note, amount, unit, occurred_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        [(plot_id, planting_ids[plot_id], action, note, amount, unit, occurred_at, now)
         for plot_id, action, note, amount, unit, occurred_at in records],
    )

    for code in ("001", "002", "003", "004"):
        conn.execute(
            "INSERT INTO qr_bindings(code, plot_id, bound_at, updated_at) VALUES (?, ?, ?, ?)",
            (code, code, now, now),
        )
    for code in ("005", "006"):
        conn.execute(
            "INSERT INTO qr_bindings(code, plot_id, bound_at, updated_at) VALUES (?, NULL, NULL, ?)",
            (code, now),
        )

    conn.executemany(
        """INSERT INTO supplies
        (name, category, stock, unit, safe_interval_days, note, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        [
            ("腐熟有机肥", "fertilizer", 18, "千克", 0, "基肥与追肥均可", now),
            ("水溶复合肥", "fertilizer", 2.5, "千克", 0, "按包装比例稀释", now),
            ("苦参碱", "pesticide", 1, "瓶", 3, "优先用于蚜虫、白粉虱", now),
            ("黄色粘虫板", "tool", 20, "张", 0, "悬挂于番茄附近", now),
        ],
    )

    conn.execute(
        """INSERT INTO weather_daily
        (weather_date, scene, condition, weather_code, temperature_min, temperature_max,
         rainfall_mm, wind_kmh, humidity, source, fetched_at)
        VALUES (?, 'rain', '小雨', 61, 22, 27, 4.2, 11, 83, 'initial', ?)""",
        (today_iso(), now),
    )
    conn.execute(
        "INSERT INTO settings(key, value, updated_at) VALUES ('garden_name', '我的菜园', ?)",
        (now,),
    )


def _seed_threats(conn: sqlite3.Connection) -> None:
    """Add missing built-in entries without overwriting administrator edits."""
    from .catalogs import THREATS

    existing = {
        (row["kind"], row["name"])
        for row in conn.execute("SELECT kind, name FROM threats").fetchall()
    }
    now = now_iso()
    for item in THREATS:
        key = (str(item["kind"]), str(item["name"]))
        if key in existing:
            continue
        conn.execute(
            """INSERT INTO threats
            (kind, name, aliases, crops, symptoms, suggestion, season, severity,
             image_url, source_url, image_credit, license, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                key[0],
                key[1],
                json.dumps(item.get("aliases", []), ensure_ascii=False),
                json.dumps(item.get("crops", []), ensure_ascii=False),
                str(item.get("symptoms", "")),
                str(item.get("suggestion", "")),
                str(item.get("season", "")),
                str(item.get("severity", "中等")),
                str(item.get("imageUrl", "")),
                str(item.get("sourceUrl", "")),
                str(item.get("imageCredit", "")),
                str(item.get("license", "")),
                now,
                now,
            ),
        )

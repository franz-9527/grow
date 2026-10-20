from __future__ import annotations

import asyncio
import json
import os
import sqlite3
from contextlib import asynccontextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from .catalogs import VEGETABLES
from .database import APP_ROOT, FIELD_SLOTS, SHANGHAI, init_db, now_iso, session
from .schemas import (
    AdminLogin,
    GrowthPhotoCreate,
    IssueCreate,
    IssueUpdate,
    MediaUploadTokenRequest,
    PlotCreate,
    PlotSegmentsUpdate,
    PlotUpdate,
    QrBindingUpdate,
    RecordCreate,
    SupplyCreate,
    SupplyImageCreate,
    SupplyUpdate,
    ThreatCreate,
    ThreatUpdate,
    UploadCategory,
)
from .weather import get_today_weather, refresh_weather, weather_is_stale
from .growth import STAGE_PROGRESS
from .inventory import router as inventory_router, move_stock
from .auth import login, logout, require_admin, session_status
from .media import (
    create_upload_token,
    max_source_image_bytes,
    normalize_public_image_url,
    upload_compressed_image,
)


STATIC_DIR = Path(os.getenv("GROW_STATIC_DIR", APP_ROOT / "static" / "client")).resolve()
API_PREFIX = "/api/v1"
SUPPLY_LIST_QUERY = """SELECT s.*,
    COALESCE(
        (SELECT NULLIF(si.image_url, '')
         FROM supply_images si
         WHERE si.supply_id = s.id
         ORDER BY si.id ASC LIMIT 1),
        NULLIF(s.image_url, '')
    ) AS primary_image_url
FROM supplies s
WHERE s.active = 1
ORDER BY s.category, s.name"""


def _safe_refresh_weather() -> None:
    try:
        refresh_weather()
    except Exception:
        # 网络失败时继续使用 SQLite 中最后一次成功的天气记录。
        return


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if weather_is_stale():
        asyncio.create_task(asyncio.to_thread(_safe_refresh_weather))
    yield


app = FastAPI(
    title="我的菜园 API",
    description="现实菜地管理、二维码绑定、农事记录、病虫害、肥料库存与绍兴越城天气。",
    version="5.5.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://grow.20m.cc",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)
app.include_router(inventory_router)


@app.post(f"{API_PREFIX}/auth/login")
def admin_login(payload: AdminLogin, request: Request, response: Response) -> dict[str, object]:
    return login(response, request, payload.pin)


@app.get(f"{API_PREFIX}/auth/session")
def admin_session(request: Request) -> dict[str, object]:
    return session_status(request)


@app.post(f"{API_PREFIX}/auth/logout")
def admin_logout(response: Response) -> dict[str, bool]:
    logout(response)
    return {"authenticated": False}


@app.post(f"{API_PREFIX}/media/upload-token", dependencies=[Depends(require_admin)])
def media_upload_token(payload: MediaUploadTokenRequest) -> dict[str, object]:
    return create_upload_token(payload)


@app.post(f"{API_PREFIX}/media/upload", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def media_upload(
    request: Request,
    category: UploadCategory = Query(),
    owner_id: str = Query(min_length=1, max_length=80),
    filename: str = Query(min_length=1, max_length=200),
) -> dict[str, object]:
    """Receive a raw browser image, enforce limits, then upload its lossless WebP."""
    content = bytearray()
    source_limit = max_source_image_bytes()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > source_limit:
            raise HTTPException(
                status_code=413,
                detail=f"原始图片不能超过 {source_limit // (1024 * 1024)} MB",
            )
    return await asyncio.to_thread(
        upload_compressed_image,
        category,
        owner_id,
        filename,
        bytes(content),
    )


def _normalize_code(code: str) -> str:
    if not code.isascii() or not code.isdigit() or len(code) > 6:
        raise HTTPException(status_code=422, detail="编号必须是 1 至 6 位数字")
    return code.zfill(3)


def _format_time(value: str) -> str:
    try:
        moment = datetime.fromisoformat(value)
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=SHANGHAI)
        today = datetime.now(SHANGHAI).date()
        if moment.date() == today:
            return f"今天 {moment:%H:%M}"
        if moment.date() == today.fromordinal(today.toordinal() - 1):
            return f"昨天 {moment:%H:%M}"
        return f"{moment.month}月{moment.day}日"
    except (TypeError, ValueError):
        return value


def _plot_rows(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """SELECT
            p.id, p.name, p.area_m2, p.position_x, p.position_z, p.width_m, p.depth_m,
            p.soil_type, p.note AS plot_note, p.image_url AS plot_image_url,
            pl.id AS planting_id, pl.crop, pl.variety, pl.kind, pl.stage, pl.planted_on,
            pl.expected_harvest_on, pl.progress, pl.health, pl.moisture, pl.plant_count,
            pl.note AS planting_note, pl.image_url AS crop_image_url,
            pl.seed_supply_id, pl.seed_name, pl.seed_unit, pl.updated_at
        FROM plots p
        LEFT JOIN plantings pl ON pl.plot_id = p.id AND pl.status = 'active'
        WHERE p.active = 1
        ORDER BY CAST(p.id AS INTEGER), p.id"""
    ).fetchall()


def _plot_to_api(conn: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
    planted_on = date.fromisoformat(row["planted_on"]) if row["planted_on"] else date.today()
    latest = conn.execute(
        """SELECT action, occurred_at FROM garden_records
        WHERE plot_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1""",
        (row["id"],),
    ).fetchone()
    last_action = "暂无操作记录"
    if latest:
        last_action = f"{_format_time(latest['occurred_at'])} 已{latest['action']}"
    sections = conn.execute(
        """SELECT length_m, crop, kind, stage FROM plot_segments
           WHERE plot_id = ? ORDER BY ordinal""",
        (row["id"],),
    ).fetchall()
    planted_sections = [section for section in sections if section["crop"]]
    crops = list(dict.fromkeys(section["crop"] for section in planted_sections))
    first_section = planted_sections[0] if planted_sections else None
    single_section = len(planted_sections) == 1
    display_stage = (
        first_section["stage"] if single_section else "混种" if planted_sections else "休耕"
    )
    return {
        "id": row["id"],
        "name": row["name"],
        "crop": "、".join(crops) if crops else "休耕",
        "variety": (row["variety"] or "未填写品种") if single_section and first_section["crop"] == row["crop"] else ("分段种植" if planted_sections else "待种植"),
        "kind": first_section["kind"] if first_section else "leafy",
        "stage": display_stage,
        "day": max((date.today() - planted_on).days, 0) if planted_sections else 0,
        "plantedOn": planted_on.isoformat(),
        "expectedHarvestOn": row["expected_harvest_on"],
        "progress": round(sum(STAGE_PROGRESS.get(section["stage"], 0) for section in planted_sections) / len(planted_sections)) if planted_sections else 0,
        "health": row["health"] or "良好",
        "moisture": row["moisture"] if row["moisture"] is not None else 60,
        "plantCount": row["plant_count"] or 0,
        "areaM2": row["area_m2"],
        "position": {"x": row["position_x"], "z": row["position_z"]},
        "size": {"width": row["width_m"], "depth": row["depth_m"]},
        "segments": [
            {"lengthM": section["length_m"], "crop": section["crop"],
             "kind": section["kind"], "stage": section["stage"]}
            for section in sections if section["crop"]
        ],
        "imageUrl": normalize_public_image_url(row["plot_image_url"]),
        "cropImageUrl": normalize_public_image_url(row["crop_image_url"]),
        "seedSupplyId": row["seed_supply_id"],
        "seedName": row["seed_name"] or "",
        "seedUnit": row["seed_unit"] or "",
        "soilType": row["soil_type"],
        "note": row["planting_note"] or row["plot_note"] or "",
        "lastAction": last_action,
    }


def _record_to_api(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "plotId": row["plot_id"],
        "action": row["action"],
        "time": _format_time(row["occurred_at"]),
        "occurredAt": row["occurred_at"],
        "note": row["note"],
        "amount": row["amount"],
        "unit": row["unit"],
        "supplyName": row["supply_name"] if "supply_name" in row.keys() else None,
        "supplyUnit": row["supply_unit"] if "supply_unit" in row.keys() else None,
    }


def _issue_to_api(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "plotId": row["plot_id"],
        "kind": row["kind"],
        "name": row["name"],
        "severity": row["severity"],
        "symptoms": row["symptoms"],
        "treatment": row["treatment"],
        "status": row["status"],
        "detectedAt": row["detected_at"],
        "resolvedAt": row["resolved_at"],
    }


def _supply_to_api(row: sqlite3.Row) -> dict[str, Any]:
    image_url = (
        row["primary_image_url"]
        if "primary_image_url" in row.keys()
        else row["image_url"]
    )
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "stock": row["stock"],
        "unit": row["unit"],
        "safeIntervalDays": row["safe_interval_days"],
        "note": row["note"],
        "imageUrl": normalize_public_image_url(image_url),
    }


def _json_list(value: str | None) -> list[str]:
    try:
        parsed = json.loads(value or "[]")
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item).strip() for item in parsed if str(item).strip()]


def _threat_to_api(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "kind": row["kind"],
        "name": row["name"],
        "aliases": _json_list(row["aliases"]),
        "crops": _json_list(row["crops"]),
        "symptoms": row["symptoms"] or "",
        "suggestion": row["suggestion"] or "",
        "season": row["season"] or "",
        "severity": row["severity"] or "中等",
        "imageUrl": normalize_public_image_url(row["image_url"]),
        "sourceUrl": row["source_url"] or "",
        "imageCredit": row["image_credit"] or "",
        "license": row["license"] or "",
    }


def _growth_photo_to_api(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "plotId": row["plot_id"],
        "plantingId": row["planting_id"],
        "crop": row["crop_name"] or "",
        "imageUrl": normalize_public_image_url(row["image_url"]),
        "note": row["note"],
        "takenAt": row["taken_at"],
        "createdAt": row["created_at"],
    }


def _supply_image_to_api(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "supplyId": row["supply_id"],
        "supplyName": row["supply_name"] or "",
        "imageUrl": normalize_public_image_url(row["image_url"]),
        "note": row["note"],
        "createdAt": row["created_at"],
    }


def _seed_snapshot(
    conn: sqlite3.Connection, seed_supply_id: int | None
) -> tuple[int | None, str, str]:
    """Return a loose seed snapshot; deleting the seed later stays safe."""
    if not seed_supply_id:
        return None, "", ""
    row = conn.execute(
        "SELECT id, name, unit FROM supplies "
        "WHERE id = ? AND active = 1 AND category = 'seed'",
        (seed_supply_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=422, detail="请选择有效的种子物资")
    return row["id"], row["name"], row["unit"]


def _datetime_iso(value: datetime | None) -> str:
    moment = value or datetime.now(SHANGHAI)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=SHANGHAI)
    return moment.astimezone(SHANGHAI).replace(microsecond=0).isoformat()


def _make_tasks(plots: list[dict[str, Any]], weather: dict[str, Any], issues: list[dict[str, Any]]) -> list[dict[str, str]]:
    tasks: list[dict[str, str]] = []
    for plot in plots:
        if plot["moisture"] < 50 and weather["scene"] != "rain":
            tasks.append({"plot": plot["id"], "title": f"给{plot['crop']}浇水", "note": f"当前土壤湿度 {plot['moisture']}%", "tone": "warning"})
        if plot["health"] == "留意":
            tasks.append({"plot": plot["id"], "title": f"检查{plot['crop']}叶片", "note": "当前标记为需要留意", "tone": "warning"})
        if plot["progress"] >= 85:
            tasks.append({"plot": plot["id"], "title": f"查看{plot['crop']}是否适合采收", "note": f"生长进度 {plot['progress']}%", "tone": "good"})
    for issue in issues[:3]:
        tasks.append({"plot": issue["plotId"], "title": f"跟进{issue['name']}", "note": f"状态：{issue['severity']} · {issue['status']}", "tone": "warning"})
    if weather["scene"] == "rain" and plots:
        tasks.append({"plot": plots[0]["id"] if plots else "001", "title": "雨后检查排水", "note": f"今日预计降水 {weather['rainfallMm']} mm", "tone": "normal"})
    if not tasks and plots:
        tasks.append({"plot": plots[0]["id"], "title": "巡园观察长势", "note": "今天没有紧急事项", "tone": "good"})
    return tasks[:8]


@app.get("/health")
def health() -> dict[str, str]:
    with session() as conn:
        conn.execute("SELECT 1").fetchone()
    return {"status": "ok", "service": "grow-garden", "time": now_iso()}


@app.get(f"{API_PREFIX}/dashboard")
def dashboard() -> dict[str, Any]:
    with session() as conn:
        plots = [_plot_to_api(conn, row) for row in _plot_rows(conn)]
        records = [
            _record_to_api(row)
            for row in conn.execute(
                "SELECT * FROM garden_records ORDER BY occurred_at DESC, id DESC LIMIT 100"
            ).fetchall()
        ]
        issues = [
            _issue_to_api(row)
            for row in conn.execute(
                "SELECT * FROM issues WHERE status != 'resolved' ORDER BY detected_at DESC, id DESC"
            ).fetchall()
        ]
        qr_bindings = {
            row["code"]: row["plot_id"] or "未绑定"
            for row in conn.execute(
                "SELECT code, plot_id FROM qr_bindings ORDER BY CAST(code AS INTEGER), code"
            ).fetchall()
        }
        supplies = [
            _supply_to_api(row)
            for row in conn.execute(SUPPLY_LIST_QUERY).fetchall()
        ]
    weather = get_today_weather()
    return {
        "gardenName": "我的菜园",
        "plots": plots,
        "records": records,
        "issues": issues,
        "qrBindings": qr_bindings,
        "supplies": supplies,
        "weather": weather,
        "tasks": _make_tasks(plots, weather, issues),
    }


@app.get(f"{API_PREFIX}/plots")
def list_plots() -> list[dict[str, Any]]:
    with session() as conn:
        return [_plot_to_api(conn, row) for row in _plot_rows(conn)]


@app.post(f"{API_PREFIX}/plots", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_plot(payload: PlotCreate) -> dict[str, Any]:
    now = now_iso()
    with session() as conn:
        occupied = conn.execute("SELECT position_x, position_z FROM plots WHERE active = 1").fetchall()
        free_slot = next(
            (slot for slot in FIELD_SLOTS if not any(
                abs(point["position_x"] - slot[0]) < 0.3 and abs(point["position_z"] - slot[1]) < 0.3
                for point in occupied
            )),
            None,
        )
        if free_slot is None:
            overflow = max(0, len(occupied) - len(FIELD_SLOTS))
            x = FIELD_SLOTS[overflow % 3][0]
            z = 3.55 + (overflow // 3) * 1.45
        else:
            x, z = free_slot[:2]
        seed_id, seed_name, seed_unit = _seed_snapshot(conn, payload.seed_supply_id)
        try:
            conn.execute(
                """INSERT INTO plots
                (id, name, area_m2, position_x, position_z, width_m, depth_m, soil_type, note, image_url, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (payload.id, payload.name, payload.area_m2, x, z, payload.width_m, payload.depth_m,
                 payload.soil_type, payload.note, payload.image_url, now, now),
            )
            conn.execute(
                """INSERT INTO plantings
                (plot_id, crop, variety, kind, stage, planted_on, progress, health, moisture,
                 plant_count, note, image_url, seed_supply_id, seed_name, seed_unit,
                 created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    payload.id,
                    payload.crop,
                    payload.variety,
                    payload.kind,
                    payload.stage,
                    payload.planted_on.isoformat(),
                    payload.progress if 'progress' in payload.model_fields_set else STAGE_PROGRESS[payload.stage],
                    payload.health,
                    payload.moisture,
                    payload.plant_count,
                    payload.note,
                    payload.crop_image_url,
                    seed_id,
                    seed_name,
                    seed_unit,
                    now,
                    now,
                ),
            )
            conn.execute(
                """INSERT INTO plot_segments (plot_id, ordinal, length_m, crop, kind, stage)
                   VALUES (?, 0, ?, ?, ?, ?)""",
                (payload.id, payload.width_m, payload.crop, payload.kind, payload.stage),
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="地块编号已存在") from exc
        row = next(item for item in _plot_rows(conn) if item["id"] == payload.id)
        return _plot_to_api(conn, row)


@app.patch(f"{API_PREFIX}/plots/{{plot_id}}", dependencies=[Depends(require_admin)])
def update_plot(plot_id: str, payload: PlotUpdate) -> dict[str, Any]:
    plot_id = _normalize_code(plot_id)
    values = payload.model_dump(exclude_unset=True)
    if 'stage' in values and 'progress' not in values:
        values['progress'] = STAGE_PROGRESS[values['stage']]
    plot_fields = {
        "name": "name",
        "area_m2": "area_m2",
        "width_m": "width_m",
        "depth_m": "depth_m",
        "position_x": "position_x",
        "position_z": "position_z",
        "soil_type": "soil_type",
        "note": "note",
        "image_url": "image_url",
    }
    planting_fields = {
        "crop": "crop",
        "variety": "variety",
        "kind": "kind",
        "stage": "stage",
        "planted_on": "planted_on",
        "progress": "progress",
        "health": "health",
        "moisture": "moisture",
        "plant_count": "plant_count",
        "note": "note",
        "crop_image_url": "image_url",
        "seed_supply_id": "seed_supply_id",
        "seed_name": "seed_name",
        "seed_unit": "seed_unit",
    }
    now = now_iso()
    with session() as conn:
        conn.execute('BEGIN IMMEDIATE')
        existing = conn.execute("SELECT 1 FROM plots WHERE id = ? AND active = 1", (plot_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="地块不存在")
        if 'width_m' in values:
            allocated = conn.execute(
                "SELECT COALESCE(SUM(length_m), 0) FROM plot_segments WHERE plot_id = ? AND crop != ''",
                (plot_id,),
            ).fetchone()[0]
            if float(allocated) > values['width_m'] + 0.001:
                raise HTTPException(409, '请先缩短分种区段，再缩短整条垄')
        previous = conn.execute("SELECT * FROM plantings WHERE plot_id = ? AND status = 'active'", (plot_id,)).fetchone()
        if previous and 'crop' in values and values['crop'] != previous['crop']:
            raise HTTPException(409, '更换蔬菜请使用「开始新一茬」，以保留历史种植记录')
        if 'seed_supply_id' in values:
            seed_id, seed_name, seed_unit = _seed_snapshot(conn, values['seed_supply_id'])
            values.update(
                seed_supply_id=seed_id,
                seed_name=seed_name,
                seed_unit=seed_unit,
            )
        if previous and 'stage' in values and values['stage'] != previous['stage']:
            conn.execute('INSERT INTO garden_records(plot_id, planting_id, action, note, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                         (plot_id, previous['id'], '生长阶段', f"{previous['stage']} → {values['stage']}", now, now))
        for source, column in plot_fields.items():
            if source in values:
                conn.execute(f"UPDATE plots SET {column} = ?, updated_at = ? WHERE id = ?", (values[source], now, plot_id))
        for source, column in planting_fields.items():
            if source in values:
                value = values[source].isoformat() if isinstance(values[source], date) else values[source]
                conn.execute(
                    f"UPDATE plantings SET {column} = ?, updated_at = ? WHERE plot_id = ? AND status = 'active'",
                    (value, now, plot_id),
                )
        if 'stage' in values:
            sections = conn.execute(
                "SELECT ordinal FROM plot_segments WHERE plot_id = ? AND crop != ''", (plot_id,)
            ).fetchall()
            if len(sections) == 1:
                conn.execute(
                    "UPDATE plot_segments SET stage = ? WHERE plot_id = ? AND ordinal = ?",
                    (values['stage'], plot_id, sections[0]['ordinal']),
                )
        row = next(item for item in _plot_rows(conn) if item["id"] == plot_id)
        return _plot_to_api(conn, row)


@app.put(f"{API_PREFIX}/plots/{{plot_id}}/segments", dependencies=[Depends(require_admin)])
def replace_plot_segments(plot_id: str, payload: PlotSegmentsUpdate) -> dict[str, Any]:
    plot_id = _normalize_code(plot_id)
    now = now_iso()
    with session() as conn:
        conn.execute('BEGIN IMMEDIATE')
        plot = conn.execute(
            "SELECT width_m FROM plots WHERE id = ? AND active = 1", (plot_id,)
        ).fetchone()
        if not plot:
            raise HTTPException(404, '地块不存在')
        allocated = sum(section.lengthM for section in payload.segments)
        if allocated > float(plot['width_m']) + 0.001:
            raise HTTPException(422, f'分段总长不能超过垄长 {plot["width_m"]:g} 米')
        conn.execute("DELETE FROM plot_segments WHERE plot_id = ?", (plot_id,))
        if payload.segments:
            conn.executemany(
                """INSERT INTO plot_segments
                   (plot_id, ordinal, length_m, crop, kind, stage)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                [
                    (plot_id, index, section.lengthM, section.crop, section.kind, section.stage)
                    for index, section in enumerate(payload.segments)
                ],
            )
            active = conn.execute(
                "SELECT 1 FROM plantings WHERE plot_id = ? AND status = 'active'", (plot_id,)
            ).fetchone()
            if not active:
                first = payload.segments[0]
                conn.execute(
                    """INSERT INTO plantings
                       (plot_id, crop, kind, stage, planted_on, progress, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (plot_id, first.crop, first.kind, first.stage, date.today().isoformat(),
                     STAGE_PROGRESS[first.stage], now, now),
                )
        else:
            # A blank allocation records the user's decision to clear this ridge.
            conn.execute(
                """INSERT INTO plot_segments
                   (plot_id, ordinal, length_m, crop, kind, stage)
                   VALUES (?, 0, ?, '', 'leafy', '播种期')""",
                (plot_id, plot['width_m']),
            )
        conn.execute("UPDATE plots SET updated_at = ? WHERE id = ?", (now, plot_id))
        row = next(item for item in _plot_rows(conn) if item["id"] == plot_id)
        return _plot_to_api(conn, row)


@app.post(f'{API_PREFIX}/plots/{{plot_id}}/plantings', status_code=201, dependencies=[Depends(require_admin)])
def start_planting(plot_id: str, payload: PlotCreate):
    plot_id = _normalize_code(plot_id)
    now = now_iso()
    with session() as conn:
        conn.execute('BEGIN IMMEDIATE')
        if not conn.execute('SELECT 1 FROM plots WHERE id = ? AND active = 1', (plot_id,)).fetchone():
            raise HTTPException(404, '地块不存在')
        seed_id, seed_name, seed_unit = _seed_snapshot(conn, payload.seed_supply_id)
        conn.execute("UPDATE plantings SET status = 'ended', updated_at = ? WHERE plot_id = ? AND status = 'active'", (now, plot_id))
        conn.execute("UPDATE issues SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE plot_id = ? AND status != 'resolved'", (now, now, plot_id))
        cursor = conn.execute('''INSERT INTO plantings(plot_id,crop,variety,kind,stage,planted_on,progress,health,moisture,plant_count,note,image_url,seed_supply_id,seed_name,seed_unit,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', (plot_id,payload.crop,payload.variety,payload.kind,payload.stage,payload.planted_on.isoformat(),
            payload.progress if 'progress' in payload.model_fields_set else STAGE_PROGRESS[payload.stage],payload.health,payload.moisture,payload.plant_count,payload.note,payload.crop_image_url,seed_id,seed_name,seed_unit,now,now))
        width = conn.execute("SELECT width_m FROM plots WHERE id = ?", (plot_id,)).fetchone()[0]
        conn.execute("DELETE FROM plot_segments WHERE plot_id = ?", (plot_id,))
        conn.execute(
            """INSERT INTO plot_segments (plot_id, ordinal, length_m, crop, kind, stage)
               VALUES (?, 0, ?, ?, ?, ?)""",
            (plot_id, width, payload.crop, payload.kind, payload.stage),
        )
        conn.execute('INSERT INTO garden_records(plot_id,planting_id,action,note,occurred_at,created_at) VALUES (?,?,?,?,?,?)',
                     (plot_id,cursor.lastrowid,'开始新一茬',f'{payload.crop} · {payload.variety}',now,now))
        return _plot_to_api(conn, next(row for row in _plot_rows(conn) if row['id'] == plot_id))


@app.get(f'{API_PREFIX}/plots/{{plot_id}}/plantings')
def planting_history(plot_id: str):
    with session() as conn:
        return [dict(row) for row in conn.execute('SELECT * FROM plantings WHERE plot_id = ? ORDER BY id DESC', (_normalize_code(plot_id),))]


@app.get(f'{API_PREFIX}/plantings')
def list_plantings() -> list[dict[str, Any]]:
    with session() as conn:
        return [dict(row) for row in conn.execute(
            'SELECT * FROM plantings ORDER BY id DESC'
        )]


@app.get(f'{API_PREFIX}/plantings/{{planting_id}}/trace')
def planting_trace(planting_id: int) -> dict[str, Any]:
    with session() as conn:
        planting = conn.execute(
            '''SELECT pl.*, p.name AS plot_name FROM plantings pl
               JOIN plots p ON p.id = pl.plot_id WHERE pl.id = ?''',
            (planting_id,),
        ).fetchone()
        if not planting:
            raise HTTPException(status_code=404, detail='种植记录不存在')
        records = conn.execute(
            '''SELECT * FROM garden_records WHERE planting_id = ?
               ORDER BY occurred_at ASC, id ASC''',
            (planting_id,),
        ).fetchall()
        photos = conn.execute(
            '''SELECT * FROM growth_photos WHERE planting_id = ?
               ORDER BY taken_at ASC, id ASC''',
            (planting_id,),
        ).fetchall()
        return {
            'planting': dict(planting),
            'records': [_record_to_api(row) for row in records],
            'photos': [_growth_photo_to_api(row) for row in photos],
        }


@app.delete(f"{API_PREFIX}/plots/{{plot_id}}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def archive_plot(plot_id: str) -> Response:
    plot_id = _normalize_code(plot_id)
    now = now_iso()
    with session() as conn:
        result = conn.execute(
            "UPDATE plots SET active = 0, updated_at = ? WHERE id = ? AND active = 1",
            (now, plot_id),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="地块不存在")
        conn.execute("UPDATE plantings SET status = 'ended', updated_at = ? WHERE plot_id = ? AND status = 'active'", (now, plot_id))
        conn.execute("UPDATE qr_bindings SET plot_id = NULL, bound_at = NULL, updated_at = ? WHERE plot_id = ?", (now, plot_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(f"{API_PREFIX}/records")
def list_records(plot_id: str | None = Query(default=None, alias="plotId"), limit: int = Query(default=100, ge=1, le=500)) -> list[dict[str, Any]]:
    with session() as conn:
        if plot_id:
            rows = conn.execute(
                "SELECT * FROM garden_records WHERE plot_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?",
                (_normalize_code(plot_id), limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM garden_records ORDER BY occurred_at DESC, id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [_record_to_api(row) for row in rows]


@app.post(f"{API_PREFIX}/records", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_record(payload: RecordCreate) -> dict[str, Any]:
    occurred_at = (payload.occurredAt or datetime.now(SHANGHAI)).isoformat(timespec="seconds")
    now = now_iso()
    with session() as conn:
        conn.execute('BEGIN IMMEDIATE')
        planting = conn.execute(
            """SELECT pl.id FROM plots p JOIN plantings pl ON pl.plot_id = p.id
            WHERE p.id = ? AND p.active = 1 AND pl.status = 'active'""",
            (payload.plotId,),
        ).fetchone()
        if not planting:
            raise HTTPException(status_code=404, detail="地块不存在或没有进行中的种植")
        supply = None
        if payload.supplyId is not None:
            if payload.amount is None or payload.amount <= 0:
                raise HTTPException(422, '领用物资需要填写大于零的数量')
            supply = conn.execute(
                'SELECT * FROM supplies WHERE id = ? AND active = 1',
                (payload.supplyId,),
            ).fetchone()
            if not supply or payload.unit != supply['unit']:
                raise HTTPException(422, '请使用所选物资的库存单位')
        cursor = conn.execute(
            """INSERT INTO garden_records
            (plot_id, planting_id, action, note, amount, unit, supply_name, supply_unit, occurred_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                payload.plotId,
                planting["id"],
                payload.action,
                payload.note,
                payload.amount,
                payload.unit,
                supply['name'] if supply else None,
                supply['unit'] if supply else None,
                occurred_at,
                now,
            ),
        )
        if supply:
            move_stock(conn, payload.supplyId, -payload.amount, f'{payload.plotId} 地块 · {payload.action}', cursor.lastrowid)
        row = conn.execute("SELECT * FROM garden_records WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return _record_to_api(row)


@app.delete(f"{API_PREFIX}/records/{{record_id}}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_record(record_id: int) -> Response:
    with session() as conn:
        conn.execute('BEGIN IMMEDIATE')
        movements = conn.execute('SELECT * FROM stock_movements WHERE record_id = ?', (record_id,)).fetchall()
        for movement in movements:
            if movement['supply_id'] is not None:
                move_stock(conn, movement['supply_id'], -movement['delta'], '撤销农事记录，退回物资')
        result = conn.execute("DELETE FROM garden_records WHERE id = ?", (record_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="记录不存在")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(f"{API_PREFIX}/qr")
def list_qr_bindings() -> dict[str, str]:
    with session() as conn:
        return {
            row["code"]: row["plot_id"] or "未绑定"
            for row in conn.execute("SELECT code, plot_id FROM qr_bindings ORDER BY CAST(code AS INTEGER), code")
        }


@app.get(f"{API_PREFIX}/qr/{{code}}")
def get_qr_binding(code: str) -> dict[str, Any]:
    code = _normalize_code(code)
    with session() as conn:
        row = conn.execute("SELECT code, plot_id, updated_at FROM qr_bindings WHERE code = ?", (code,)).fetchone()
        if not row or not row['plot_id']:
            return {'code': code, 'plotId': None, 'status': 'unbound'}
        plot = next((p for p in _plot_rows(conn) if p['id'] == row['plot_id']), None)
        if not plot:
            return {'code': code, 'plotId': None, 'status': 'unbound'}
        return {'code': code, 'plotId': row['plot_id'], 'status': 'bound', 'updatedAt': row['updated_at'], 'plot': _plot_to_api(conn, plot)}


@app.put(f"{API_PREFIX}/qr/{{code}}", dependencies=[Depends(require_admin)])
def bind_qr(code: str, payload: QrBindingUpdate) -> dict[str, str]:
    code = _normalize_code(code)
    now = now_iso()
    with session() as conn:
        plot = conn.execute("SELECT 1 FROM plots WHERE id = ? AND active = 1", (payload.plotId,)).fetchone()
        if not plot:
            raise HTTPException(status_code=404, detail="地块不存在")
        conn.execute(
            """INSERT INTO qr_bindings(code, plot_id, bound_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET
                plot_id=excluded.plot_id,
                bound_at=excluded.bound_at,
                updated_at=excluded.updated_at""",
            (code, payload.plotId, now, now),
        )
    return {"code": code, "plotId": payload.plotId, "status": "bound"}


@app.delete(f"{API_PREFIX}/qr/{{code}}", dependencies=[Depends(require_admin)])
def unbind_qr(code: str) -> dict[str, str]:
    code = _normalize_code(code)
    now = now_iso()
    with session() as conn:
        conn.execute(
            """INSERT INTO qr_bindings(code, plot_id, bound_at, updated_at)
            VALUES (?, NULL, NULL, ?)
            ON CONFLICT(code) DO UPDATE SET plot_id=NULL, bound_at=NULL, updated_at=excluded.updated_at""",
            (code, now),
        )
    return {"code": code, "status": "unbound"}


@app.get(f"{API_PREFIX}/issues")
def list_issues(plot_id: str | None = Query(default=None, alias="plotId"), include_resolved: bool = False) -> list[dict[str, Any]]:
    clauses = [] if include_resolved else ["status != 'resolved'"]
    values: list[Any] = []
    if plot_id:
        clauses.append("plot_id = ?")
        values.append(_normalize_code(plot_id))
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with session() as conn:
        rows = conn.execute(f"SELECT * FROM issues {where} ORDER BY detected_at DESC, id DESC", values).fetchall()
        return [_issue_to_api(row) for row in rows]


@app.post(f"{API_PREFIX}/issues", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_issue(payload: IssueCreate) -> dict[str, Any]:
    now = now_iso()
    with session() as conn:
        planting = conn.execute(
            "SELECT id FROM plantings WHERE plot_id = ? AND status = 'active'",
            (payload.plotId,),
        ).fetchone()
        if not planting:
            raise HTTPException(status_code=404, detail="地块不存在")
        cursor = conn.execute(
            """INSERT INTO issues
            (plot_id, planting_id, kind, name, severity, symptoms, treatment, detected_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (payload.plotId, planting["id"], payload.kind, payload.name, payload.severity, payload.symptoms, payload.treatment, now, now, now),
        )
        conn.execute("UPDATE plantings SET health = '留意', updated_at = ? WHERE id = ?", (now, planting["id"]))
        record_note = payload.name.strip()
        if payload.symptoms.strip():
            record_note += f"；症状：{payload.symptoms.strip()}"
        if payload.treatment.strip():
            record_note += f"；处理：{payload.treatment.strip()}"
        conn.execute(
            """INSERT INTO garden_records
            (plot_id, planting_id, issue_id, action, note, amount, unit,
             supply_name, supply_unit, occurred_at, created_at)
            VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)""",
            (payload.plotId, planting["id"], cursor.lastrowid, "病虫草害", record_note, now, now),
        )
        row = conn.execute("SELECT * FROM issues WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return _issue_to_api(row)


@app.patch(f"{API_PREFIX}/issues/{{issue_id}}", dependencies=[Depends(require_admin)])
def update_issue(issue_id: int, payload: IssueUpdate) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    allowed = {"severity", "symptoms", "treatment", "status"}
    now = now_iso()
    with session() as conn:
        issue = conn.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
        if not issue:
            raise HTTPException(status_code=404, detail="问题记录不存在")
        for field, value in values.items():
            if field in allowed:
                conn.execute(f"UPDATE issues SET {field} = ?, updated_at = ? WHERE id = ?", (value, now, issue_id))
        if values.get("status") == "resolved":
            conn.execute("UPDATE issues SET resolved_at = ? WHERE id = ?", (now, issue_id))
            remaining = conn.execute(
                "SELECT 1 FROM issues WHERE plot_id = ? AND status != 'resolved' AND id != ? LIMIT 1",
                (issue["plot_id"], issue_id),
            ).fetchone()
            if not remaining:
                conn.execute("UPDATE plantings SET health = '良好', updated_at = ? WHERE plot_id = ? AND status = 'active'", (now, issue["plot_id"]))
        row = conn.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
        return _issue_to_api(row)


@app.get(f"{API_PREFIX}/supplies")
def list_supplies() -> list[dict[str, Any]]:
    with session() as conn:
        return [
            _supply_to_api(row)
            for row in conn.execute(SUPPLY_LIST_QUERY)
        ]


@app.post(f"{API_PREFIX}/supplies", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_supply(payload: SupplyCreate) -> dict[str, Any]:
    with session() as conn:
        conn.execute('BEGIN IMMEDIATE')
        existing = conn.execute('SELECT * FROM supplies WHERE active = 1 AND name = ? AND category = ? AND unit = ? ORDER BY id LIMIT 1',
                                (payload.name, payload.category, payload.unit)).fetchone()
        if existing:
            move_stock(conn, existing['id'], payload.stock, payload.note or '补充入库')
            return _supply_to_api(conn.execute('SELECT * FROM supplies WHERE id = ?', (existing['id'],)).fetchone())
        cursor = conn.execute(
            """INSERT INTO supplies
            (name, category, stock, unit, safe_interval_days, note, image_url, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (payload.name, payload.category, payload.stock, payload.unit, payload.safe_interval_days, payload.note, payload.image_url, now_iso()),
        )
        row = conn.execute("SELECT * FROM supplies WHERE id = ?", (cursor.lastrowid,)).fetchone()
        conn.execute(
            """INSERT INTO stock_movements
            (supply_id, supply_name, supply_unit, delta, balance, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (row['id'], row['name'], row['unit'], row['stock'], row['stock'], '初始入库', now_iso()),
        )
        return _supply_to_api(row)


@app.patch(f"{API_PREFIX}/supplies/{{supply_id}}", dependencies=[Depends(require_admin)])
def update_supply(supply_id: int, payload: SupplyUpdate) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    allowed = {"name", "category", "stock", "unit", "safe_interval_days", "note", "image_url"}
    with session() as conn:
        conn.execute('BEGIN IMMEDIATE')
        if not conn.execute("SELECT 1 FROM supplies WHERE id = ? AND active = 1", (supply_id,)).fetchone():
            raise HTTPException(status_code=404, detail="物资不存在")
        for field, value in values.items():
            if field == 'stock':
                previous_stock = conn.execute('SELECT stock FROM supplies WHERE id = ?', (supply_id,)).fetchone()[0]
                move_stock(conn, supply_id, value - previous_stock, '库存盘点')
                continue
            if field in allowed:
                conn.execute(f"UPDATE supplies SET {field} = ?, updated_at = ? WHERE id = ?", (value, now_iso(), supply_id))
        row = conn.execute("SELECT * FROM supplies WHERE id = ?", (supply_id,)).fetchone()
        return _supply_to_api(row)


@app.delete(f"{API_PREFIX}/supplies/{{supply_id}}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_supply(supply_id: int) -> Response:
    with session() as conn:
        conn.execute('BEGIN IMMEDIATE')
        # DELETE is intentionally idempotent. A stale browser row should not
        # turn a completed delete into a misleading “物资不存在” error.
        conn.execute("DELETE FROM supplies WHERE id = ?", (supply_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(f"{API_PREFIX}/plots/{{plot_id}}/growth-photos")
def list_growth_photos(plot_id: str) -> list[dict[str, Any]]:
    plot_id = _normalize_code(plot_id)
    with session() as conn:
        if not conn.execute("SELECT 1 FROM plots WHERE id = ? AND active = 1", (plot_id,)).fetchone():
            raise HTTPException(status_code=404, detail="地块不存在")
        rows = conn.execute(
            "SELECT * FROM growth_photos WHERE plot_id = ? ORDER BY taken_at DESC, id DESC",
            (plot_id,),
        ).fetchall()
        return [_growth_photo_to_api(row) for row in rows]


@app.post(
    f"{API_PREFIX}/plots/{{plot_id}}/growth-photos",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
def create_growth_photo(plot_id: str, payload: GrowthPhotoCreate) -> dict[str, Any]:
    plot_id = _normalize_code(plot_id)
    now = now_iso()
    taken_at = _datetime_iso(payload.taken_at)
    with session() as conn:
        conn.execute('BEGIN IMMEDIATE')
        plot = conn.execute(
            "SELECT 1 FROM plots WHERE id = ? AND active = 1", (plot_id,)
        ).fetchone()
        if not plot:
            raise HTTPException(status_code=404, detail="地块不存在")
        planting = conn.execute(
            "SELECT id, crop FROM plantings WHERE plot_id = ? AND status = 'active'",
            (plot_id,),
        ).fetchone()
        cursor = conn.execute(
            """INSERT INTO growth_photos
            (plot_id, planting_id, crop_name, image_url, note, taken_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                plot_id,
                planting["id"] if planting else None,
                planting["crop"] if planting else "",
                payload.image_url,
                payload.note,
                taken_at,
                now,
            ),
        )
        row = conn.execute(
            "SELECT * FROM growth_photos WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        return _growth_photo_to_api(row)


@app.delete(
    f"{API_PREFIX}/growth-photos/{{photo_id}}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
def delete_growth_photo(photo_id: int) -> Response:
    with session() as conn:
        conn.execute("DELETE FROM growth_photos WHERE id = ?", (photo_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(f"{API_PREFIX}/supplies/{{supply_id}}/images")
def list_supply_images(supply_id: int) -> list[dict[str, Any]]:
    with session() as conn:
        if not conn.execute(
            "SELECT 1 FROM supplies WHERE id = ? AND active = 1", (supply_id,)
        ).fetchone():
            raise HTTPException(status_code=404, detail="物资不存在")
        rows = conn.execute(
            "SELECT * FROM supply_images WHERE supply_id = ? ORDER BY id ASC",
            (supply_id,),
        ).fetchall()
        return [_supply_image_to_api(row) for row in rows]


@app.post(
    f"{API_PREFIX}/supplies/{{supply_id}}/images",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
def create_supply_image(supply_id: int, payload: SupplyImageCreate) -> dict[str, Any]:
    now = now_iso()
    with session() as conn:
        conn.execute('BEGIN IMMEDIATE')
        supply = conn.execute(
            "SELECT name FROM supplies WHERE id = ? AND active = 1", (supply_id,)
        ).fetchone()
        if not supply:
            raise HTTPException(status_code=404, detail="物资不存在")
        cursor = conn.execute(
            """INSERT INTO supply_images
            (supply_id, supply_name, image_url, note, created_at)
            VALUES (?, ?, ?, ?, ?)""",
            (supply_id, supply["name"], payload.image_url, payload.note, now),
        )
        row = conn.execute(
            "SELECT * FROM supply_images WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        return _supply_image_to_api(row)


@app.delete(
    f"{API_PREFIX}/supply-images/{{image_id}}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
def delete_supply_image(image_id: int) -> Response:
    with session() as conn:
        conn.execute("DELETE FROM supply_images WHERE id = ?", (image_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _threat_db_values(values: dict[str, Any]) -> dict[str, Any]:
    db_values = dict(values)
    for field in ("aliases", "crops"):
        if field in db_values:
            db_values[field] = json.dumps(
                db_values[field], ensure_ascii=False, separators=(",", ":")
            )
    return db_values


@app.post(f"{API_PREFIX}/threats", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_threat(payload: ThreatCreate) -> dict[str, Any]:
    values = _threat_db_values(payload.model_dump())
    now = now_iso()
    with session() as conn:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            "SELECT id, active FROM threats WHERE kind = ? AND name = ?",
            (values["kind"], values["name"]),
        ).fetchone()
        if existing and existing["active"]:
            raise HTTPException(status_code=409, detail="同类型病虫害名称已存在")
        if existing:
            conn.execute(
                """UPDATE threats SET kind = ?, name = ?, aliases = ?, crops = ?,
                symptoms = ?, suggestion = ?, season = ?, severity = ?, image_url = ?,
                source_url = ?, image_credit = ?, license = ?, active = 1, updated_at = ?
                WHERE id = ?""",
                (
                    values["kind"], values["name"], values["aliases"], values["crops"],
                    values["symptoms"], values["suggestion"], values["season"],
                    values["severity"], values["image_url"], values["source_url"],
                    values["image_credit"], values["license"], now, existing["id"],
                ),
            )
            row = conn.execute("SELECT * FROM threats WHERE id = ?", (existing["id"],)).fetchone()
            return _threat_to_api(row)
        try:
            cursor = conn.execute(
                """INSERT INTO threats
                (kind, name, aliases, crops, symptoms, suggestion, season, severity,
                 image_url, source_url, image_credit, license, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    values["kind"], values["name"], values["aliases"], values["crops"],
                    values["symptoms"], values["suggestion"], values["season"],
                    values["severity"], values["image_url"], values["source_url"],
                    values["image_credit"], values["license"], now, now,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="同类型病虫害名称已存在") from exc
        row = conn.execute("SELECT * FROM threats WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return _threat_to_api(row)


@app.patch(f"{API_PREFIX}/threats/{{threat_id}}", dependencies=[Depends(require_admin)])
def update_threat(threat_id: int, payload: ThreatUpdate) -> dict[str, Any]:
    values = _threat_db_values(payload.model_dump(exclude_unset=True))
    if not values:
        with session() as conn:
            row = conn.execute(
                "SELECT * FROM threats WHERE id = ? AND active = 1", (threat_id,)
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="病虫害资料不存在")
            return _threat_to_api(row)
    allowed = {
        "kind", "name", "aliases", "crops", "symptoms", "suggestion", "season",
        "severity", "image_url", "source_url", "image_credit", "license",
    }
    fields = [field for field in values if field in allowed]
    with session() as conn:
        conn.execute("BEGIN IMMEDIATE")
        if not conn.execute(
            "SELECT 1 FROM threats WHERE id = ? AND active = 1", (threat_id,)
        ).fetchone():
            raise HTTPException(status_code=404, detail="病虫害资料不存在")
        assignments = ", ".join(f"{field} = ?" for field in fields)
        try:
            conn.execute(
                f"UPDATE threats SET {assignments}, updated_at = ? WHERE id = ?",
                [values[field] for field in fields] + [now_iso(), threat_id],
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="同类型病虫害名称已存在") from exc
        row = conn.execute("SELECT * FROM threats WHERE id = ?", (threat_id,)).fetchone()
        return _threat_to_api(row)


@app.delete(f"{API_PREFIX}/threats/{{threat_id}}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_threat(threat_id: int) -> Response:
    with session() as conn:
        conn.execute(
            "UPDATE threats SET active = 0, updated_at = ? WHERE id = ?",
            (now_iso(), threat_id),
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(f"{API_PREFIX}/catalog")
def catalog() -> dict[str, Any]:
    with session() as conn:
        rows = conn.execute(
            """SELECT * FROM threats WHERE active = 1
            ORDER BY CASE kind WHEN 'pest' THEN 0 ELSE 1 END, id"""
        ).fetchall()
    return {"vegetables": VEGETABLES, "threats": [_threat_to_api(row) for row in rows], 'stages': STAGE_PROGRESS}


@app.get(f"{API_PREFIX}/weather/today")
def today_weather() -> dict[str, Any]:
    return get_today_weather()


@app.post(f"{API_PREFIX}/weather/refresh", dependencies=[Depends(require_admin)])
async def update_weather() -> dict[str, Any]:
    try:
        return await asyncio.to_thread(refresh_weather)
    except Exception as exc:
        weather = get_today_weather()
        weather["warning"] = f"天气服务暂时不可用，已显示最近记录：{type(exc).__name__}"
        return weather


@app.get("/q/{code}")
def open_qr(code: str) -> RedirectResponse:
    return RedirectResponse(url=f"/?qr={_normalize_code(code)}", status_code=302)


@app.get("/", include_in_schema=False)
@app.get("/{asset_path:path}", include_in_schema=False)
def frontend(asset_path: str = "") -> Response:
    if asset_path == 'api' or asset_path.startswith('api/'):
        raise HTTPException(status_code=404, detail='接口不存在')
    if not STATIC_DIR.is_dir():
        return JSONResponse(
            {
                "name": "我的菜园 API",
                "message": "前端静态文件尚未构建，请查看 /api/docs。",
                "docs": "/api/docs",
            }
        )
    requested = (STATIC_DIR / asset_path).resolve()
    if not requested.is_relative_to(STATIC_DIR):
        raise HTTPException(status_code=404, detail="文件不存在")
    if requested.is_dir():
        requested = requested / "index.html"
    if requested.is_file():
        return FileResponse(requested)
    if asset_path.startswith("_next/") or Path(asset_path).suffix:
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(STATIC_DIR / "index.html")

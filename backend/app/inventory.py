from __future__ import annotations

import re
import sqlite3
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import Field
from .auth import require_admin
from .database import session, now_iso
from .schemas import InputModel, SupplyCreate

router = APIRouter(prefix='/api/v1')


class Receipt(SupplyCreate):
    stock: float = Field(gt=0, le=100000000)
    unit: str = Field(min_length=1, max_length=20)


class StockChange(InputModel):
    delta: float = Field(ge=-100000000, le=100000000)
    reason: str = Field(min_length=1, max_length=500)


class ReceiptText(InputModel):
    text: str = Field(min_length=1, max_length=2000)


def move_stock(conn: sqlite3.Connection, supply_id: int, delta: float, reason: str, record_id: int | None = None):
    # Caller holds BEGIN IMMEDIATE: checking and changing stock is one transaction.
    supply = conn.execute('SELECT * FROM supplies WHERE id = ? AND active = 1', (supply_id,)).fetchone()
    if not supply:
        raise HTTPException(404, '物资不存在')
    balance = round(supply['stock'] + delta, 6)
    if balance < 0:
        raise HTTPException(409, f"{supply['name']}库存不足，剩余 {supply['stock']} {supply['unit']}")
    conn.execute('UPDATE supplies SET stock = ?, updated_at = ? WHERE id = ?', (balance, now_iso(), supply_id))
    conn.execute(
        """INSERT INTO stock_movements
        (supply_id, supply_name, supply_unit, delta, balance, reason, record_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (supply_id, supply['name'], supply['unit'], delta, balance, reason, record_id, now_iso()),
    )
    return dict(conn.execute('SELECT * FROM supplies WHERE id = ?', (supply_id,)).fetchone())


@router.post('/supplies/parse')
def parse_receipt(payload: ReceiptText):
    items = []
    for line in re.split(r'[\n;；]+', payload.text):
        if not line.strip():
            continue
        match = re.fullmatch(r'\s*(.+?)\s*[x×*]?\s*(\d+(?:\.\d+)?)\s*(千克|公斤|kg|克|g|毫升|ml|升|L|l|瓶|袋|包|张|把|个|件|粒|株)\s*', line)
        if not match:
            raise HTTPException(422, f'无法识别「{line}」，请使用：物品名称 数量 单位，每行一项')
        name, quantity, unit = match.groups()
        unit = {'公斤': '千克', 'kg': '千克', 'g': '克', 'ml': '毫升', 'L': '升', 'l': '升'}.get(unit, unit)
        category = 'seed' if '种' in name else 'fertilizer' if '肥' in name else 'pesticide' if any(w in name for w in ('药', '杀', '菌', '碱')) else 'tool'
        try:
            item = Receipt(name=name, category=category, stock=float(quantity), unit=unit)
        except ValueError as exc:
            raise HTTPException(422, '名称、数量或单位无效，数量必须大于零') from exc
        items.append(item.model_dump())
    if not items:
        raise HTTPException(422, '请填写物品名称、数量和单位')
    return items


@router.post('/supplies/receive', status_code=201, dependencies=[Depends(require_admin)])
def receive_stock(items: list[Receipt]):
    if not items or len(items) > 100:
        raise HTTPException(422, '一次入库需要 1 至 100 项物品')
    results = []
    with session() as conn:
        conn.execute('BEGIN IMMEDIATE')
        for item in items:
            existing = conn.execute('SELECT * FROM supplies WHERE active = 1 AND name = ? AND category = ? AND unit = ? ORDER BY id LIMIT 1',
                                    (item.name, item.category, item.unit)).fetchone()
            if existing:
                supply_id = existing['id']
            else:
                supply_id = conn.execute('INSERT INTO supplies(name, category, stock, unit, safe_interval_days, note, image_url, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?, ?)',
                                         (item.name, item.category, item.unit, item.safe_interval_days, item.note, item.image_url, now_iso())).lastrowid
            results.append(move_stock(conn, supply_id, item.stock, item.note or '采购入库'))
    return results


@router.post('/supplies/{supply_id}/movements', dependencies=[Depends(require_admin)])
def change_stock(supply_id: int, payload: StockChange):
    if payload.delta == 0:
        raise HTTPException(422, '变动数量不能为零')
    with session() as conn:
        conn.execute('BEGIN IMMEDIATE')
        return move_stock(conn, supply_id, payload.delta, payload.reason)


@router.get('/stock-movements')
def movements():
    with session() as conn:
        return [
            dict(row)
            for row in conn.execute(
                """SELECT m.*,
                    COALESCE(NULLIF(m.supply_name, ''), s.name, '已删除物资') AS name,
                    COALESCE(NULLIF(m.supply_unit, ''), s.unit, '') AS unit
                FROM stock_movements m
                LEFT JOIN supplies s ON s.id = m.supply_id
                ORDER BY m.id DESC LIMIT 200"""
            )
        ]


@router.delete('/stock-movements/{movement_id}', status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_movement(movement_id: int) -> Response:
    """Delete only the audit row; keep current stock and garden records unchanged."""
    with session() as conn:
        conn.execute('BEGIN IMMEDIATE')
        # Idempotent for stale list views, just like supply deletion.
        conn.execute('DELETE FROM stock_movements WHERE id = ?', (movement_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)

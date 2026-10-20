'use client';
import { useEffect, useState } from 'react';
import {
  PackagePlus,
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import {
  gardenApi,
  type Receipt,
  type SupplyItem,
  type StockMovement,
} from '@/lib/api';
import { Field, Modal, categories, type RunAction } from './forms';
import { ImageViewer } from './image-viewer';
import { SupplyImages } from './supply-images';

export function InventoryPanel({
  supplies,
  run,
  busy,
}: {
  supplies: SupplyItem[];
  run: RunAction;
  busy: boolean;
}) {
  const [text, setText] = useState('');
  const [items, setItems] = useState<Receipt[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [selected, setSelected] = useState<SupplyItem | null>(null);
  const [editing, setEditing] = useState<SupplyItem | null>(null);
  const [deleting, setDeleting] = useState<SupplyItem | null>(null);
  const [deletingMovement, setDeletingMovement] =
    useState<StockMovement | null>(null);
  const [hiddenSupplyIds, setHiddenSupplyIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] =
    useState<SupplyItem['category']>('fertilizer');
  const [editStock, setEditStock] = useState('0');
  const [editUnit, setEditUnit] = useState('');
  const [editNote, setEditNote] = useState('');
  const [pendingSupplyFiles, setPendingSupplyFiles] = useState<File[]>([]);
  const [editImageNote, setEditImageNote] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [direction, setDirection] = useState('out');
  const [reason, setReason] = useState('日常领用');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    gardenApi
      .movements()
      .then((data) => {
        if (active) setMovements(data);
      })
      .catch(() => {
        if (active) setError('出入库流水暂时加载失败');
      });
    return () => {
      active = false;
      };
  }, [supplies]);
  useEffect(() => {
    setHiddenSupplyIds((current) => {
      const next = new Set(
        [...current].filter((id) => supplies.some((supply) => supply.id === id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [supplies]);
  const activeSupplies = supplies.filter((supply) => !hiddenSupplyIds.has(supply.id));
  const visible = activeSupplies.filter(
    (s) =>
      (filter === 'all' || s.category === filter) && s.name.includes(query),
  );
  const updateItem = (index: number, patch: Partial<Receipt>) =>
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const openEditor = (supply: SupplyItem) => {
    setEditing(supply);
    setEditName(supply.name);
    setEditCategory(supply.category);
    setEditStock(String(supply.stock));
    setEditUnit(supply.unit);
    setEditNote(supply.note);
    setPendingSupplyFiles([]);
    setEditImageNote('');
  };
  return (
    <div className="inventory-layout">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SUPPLIES</p>
            <h2>
              物资库存 <small>{activeSupplies.length} 种</small>
            </h2>
          </div>
          <PackagePlus />
        </div>
        <div className="filter-row">
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label="搜索物资"
              placeholder="搜索物品名称"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <NativeSelect
            aria-label="物资分类"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">全部分类</option>
            {Object.entries(categories).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="supply-list">
          {visible.map((s) => (
            <article key={s.id} className="supply-row">
              <div className="supply-symbol">
                {s.imageUrl ? (
                  <ImageViewer
                    src={s.imageUrl}
                    alt={`${s.name}图片`}
                    className="supply-symbol-image-trigger"
                    imageClassName="supply-symbol-image"
                  />
                ) : (
                  <PackagePlus size={21} />
                )}
              </div>
              <div>
                <strong>{s.name}</strong>
                <p>
                  {categories[s.category]}
                  {s.note && ` · ${s.note}`}
                </p>
              </div>
              <div className="stock-number">
                <strong>{s.stock}</strong>
                <span>{s.unit}</span>
              </div>
              <div className="supply-actions">
                <Button
                  variant="ghost"
                  aria-label={`编辑物资 ${s.name}`}
                  title="编辑物资"
                  disabled={busy}
                  onClick={() => openEditor(s)}
                >
                  <Pencil size={17} />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelected(s);
                    setQuantity('1');
                    setDirection('out');
                    setReason('日常领用');
                  }}
                  disabled={busy}
                >
                  出入库
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`删除物资 ${s.name}`}
                  title="删除物资"
                  disabled={busy}
                  onClick={() => setDeleting(s)}
                >
                  <Trash2 size={17} />
                </Button>
              </div>
            </article>
          ))}
          {!visible.length && (
            <p className="empty-state">暂无匹配物品，在右侧登记第一笔入库。</p>
          )}
        </div>
        <h3 className="subheading">最近出入库</h3>
        {error && <p role="alert">{error}</p>}
        <div className="movement-list">
          {movements.slice(0, 20).map((m) => (
            <div className="movement" key={m.id}>
              {m.delta >= 0 ? (
                <ArrowDownLeft size={18} />
              ) : (
                <ArrowUpRight size={18} />
              )}
              <div>
                <strong>{m.name}</strong>
                <p>
                  {m.reason} · {new Date(m.created_at).toLocaleString('zh-CN')}
                </p>
              </div>
              <span className={m.delta >= 0 ? 'positive' : 'negative'}>
                {m.delta > 0 ? '+' : ''}
                {m.delta} {m.unit}
                <small>结存 {m.balance}</small>
              </span>
              <Button
                variant="ghost"
                aria-label={`删除出入库流水 ${m.id}`}
                title="删除流水（不改变当前库存）"
                disabled={busy}
                onClick={() => setDeletingMovement(m)}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          {!movements.length && (
            <p className="empty-state">
              尚无出入库流水，现有库存作为期初余额。
            </p>
          )}
        </div>
      </section>
      <aside className="panel receipt-panel">
        <p className="eyebrow">QUICK RECEIVE</p>
        <h2>快捷入库</h2>
        <p className="muted">
          每行一项，自动识别名称、数量和单位。确认后，相同名称、分类和单位的库存会累加。
        </p>
        <Field label="入库清单">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setItems([]);
            }}
            placeholder={'腐熟有机肥 5 千克\n黄色粘虫板 20 张'}
            rows={5}
          />
        </Field>
        <Button
          disabled={busy || !text.trim()}
          variant="outline"
          onClick={() =>
            void run(
              async () => setItems(await gardenApi.parseReceipt(text)),
              '已识别，请核对后入库',
            )
          }
        >
          识别清单
        </Button>
        {items.map((item, index) => (
          <div className="receipt-item" key={index}>
            <Field label="物品名称">
              <input
                required
                value={item.name}
                onChange={(e) => updateItem(index, { name: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="数量">
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  value={item.stock}
                  onChange={(e) =>
                    updateItem(index, { stock: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="单位">
                <input
                  value={item.unit}
                  onChange={(e) => updateItem(index, { unit: e.target.value })}
                />
              </Field>
            </div>
            <Field label="分类">
              <NativeSelect
                value={item.category}
                onChange={(e) =>
                  updateItem(index, {
                    category: e.target.value as Receipt['category'],
                  })
                }
              >
                {Object.entries(categories).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        ))}
        {!!items.length && (
          <Button
            disabled={
              busy ||
              items.some(
                (i) => !i.name.trim() || !i.unit.trim() || i.stock <= 0,
              )
            }
            onClick={() =>
              void run(
                () => gardenApi.receiveStock(items),
                '入库成功，库存已累加',
              ).then((ok) => {
                if (ok) {
                  setItems([]);
                  setText('');
                }
              })
            }
          >
            确认 {items.length} 项入库
          </Button>
        )}
      </aside>
      {editing && (
        <Modal
          title={`编辑「${editing.name}」`}
          description="修改资料与库存，历史记录保留。"
          onClose={() => !busy && setEditing(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const stock = Number(editStock);
              const supplyId = editing.id;
              const files = [...pendingSupplyFiles];
              const imageNote = editImageNote.trim();
              void run(
                async () => {
                  const saved = await gardenApi.updateSupply(supplyId, {
                    name: editName.trim(),
                    category: editCategory,
                    stock,
                    unit: editUnit.trim(),
                    note: editNote.trim(),
                  });
                  for (const file of files) {
                    const uploaded = await gardenApi.uploadImage(
                      'supplies',
                      String(supplyId),
                      file,
                    );
                    await gardenApi.createSupplyImage(supplyId, {
                      image_url: uploaded.url,
                      note: imageNote,
                    });
                  }
                  return saved;
                },
                '物资已更新',
              ).then((ok) => ok && setEditing(null));
            }}
          >
            <Field label="物品名称">
              <input
                required
                maxLength={80}
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
            </Field>
            <Field label="分类">
              <NativeSelect
                value={editCategory}
                onChange={(event) =>
                  setEditCategory(event.target.value as SupplyItem['category'])
                }
              >
                {Object.entries(categories).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="form-grid">
              <Field label="库存数量">
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={editStock}
                  onChange={(event) => setEditStock(event.target.value)}
                />
              </Field>
              <Field label="单位">
                <input
                  maxLength={20}
                  value={editUnit}
                  onChange={(event) => setEditUnit(event.target.value)}
                />
              </Field>
            </div>
            <Field label="备注">
              <textarea
                maxLength={500}
                rows={3}
                value={editNote}
                onChange={(event) => setEditNote(event.target.value)}
              />
            </Field>
            <SupplyImages
              supply={editing}
              run={run}
              busy={busy}
              pendingFiles={pendingSupplyFiles}
              onPendingFilesChange={setPendingSupplyFiles}
              note={editImageNote}
              onNoteChange={setEditImageNote}
            />
            <Button
              type="submit"
              disabled={
                busy ||
                !editName.trim() ||
                !Number.isFinite(Number(editStock)) ||
                Number(editStock) < 0
              }
            >
              保存修改
            </Button>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal
          title={`${selected.name} · 出入库`}
          description={`当前库存 ${selected.stock} ${selected.unit}`}
          onClose={() => !busy && setSelected(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () =>
                  gardenApi.moveStock(
                    selected.id,
                    Number(quantity) * (direction === 'out' ? -1 : 1),
                    reason,
                  ),
                '库存已更新',
              ).then((ok) => ok && setSelected(null));
            }}
          >
            <Field label="操作">
              <NativeSelect
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                <option value="out">领用出库</option>
                <option value="in">补充入库</option>
              </NativeSelect>
            </Field>
            <Field label={`数量（${selected.unit}）`}>
              <input
                required
                type="number"
                min="0.000001"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
            <Field label="原因">
              <input
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <p className="muted">
              完成后库存：
              {Math.round(
                (selected.stock +
                  Number(quantity) * (direction === 'out' ? -1 : 1)) *
                  1e6,
              ) / 1e6}{' '}
              {selected.unit}
            </p>
            <Button
              type="submit"
              disabled={
                busy ||
                Number(quantity) <= 0 ||
                (direction === 'out' && Number(quantity) > selected.stock)
              }
            >
              确认保存
            </Button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title={`删除「${deleting.name}」？`}
          description="物资会从库存中删除；已发生的领用记录和出入库流水会保留名称、单位和数量，方便追溯。"
          onClose={() => !busy && setDeleting(null)}
        >
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void run(() => gardenApi.deleteSupply(deleting.id), '物资已删除', () => {
                setHiddenSupplyIds((current) => {
                  const next = new Set(current);
                  next.add(deleting.id);
                  return next;
                });
                setDeleting(null);
              })
            }
          >
            确认删除
          </Button>
        </Modal>
      )}
      {deletingMovement && (
        <Modal
          title="删除这条出入库流水？"
          description="只删除这条历史流水，不会改变当前库存，也不会删除关联的农事记录。"
          onClose={() => !busy && setDeletingMovement(null)}
        >
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void run(() => gardenApi.deleteMovement(deletingMovement.id), '出入库流水已删除', () => {
                setMovements((current) =>
                  current.filter((item) => item.id !== deletingMovement.id),
                );
                setDeletingMovement(null);
              })
            }
          >
            确认删除流水
          </Button>
        </Modal>
      )}
    </div>
  );
}

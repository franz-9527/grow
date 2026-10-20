'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import {
  gardenApi,
  type Plot,
  type PlotInput,
  type Catalog,
  type PlotKind,
  type SupplyItem,
  type ThreatLibraryItem,
} from '@/lib/api';
import { cropKindOptions } from '@/lib/crop-kinds';
import { Field, Modal, type RunAction } from './forms';
import { ImageUploader } from './image-uploader';
import { ThreatLibrary } from './threat-library';

export function PlotEditor({
  plot,
  mode,
  catalog,
  supplies,
  nextId,
  run,
  busy,
  onClose,
}: {
  plot?: Plot;
  mode: 'create' | 'edit' | 'plant';
  catalog: Catalog;
  supplies: SupplyItem[];
  nextId: string;
  run: RunAction;
  busy: boolean;
  onClose: () => void;
}) {
  const fresh = mode !== 'edit';
  const metadataOnly = mode === 'edit' && plot?.segments.length !== 1;
  const [pendingPlotImage, setPendingPlotImage] = useState<File | null>(null);
  const [pendingCropImage, setPendingCropImage] = useState<File | null>(null);
  const [form, setForm] = useState<PlotInput>({
    id: plot?.id || nextId,
    name: plot?.name || '',
    crop: fresh ? '青菜' : plot?.crop || '青菜',
    variety: fresh ? '' : plot?.variety || '',
    kind: fresh ? 'leafy' : plot?.kind || 'leafy',
    stage: fresh ? '播种期' : plot?.stage || '播种期',
    planted_on: fresh
      ? new Date().toLocaleDateString('en-CA')
      : plot?.plantedOn,
    plant_count: fresh ? 0 : plot?.plantCount || 0,
    area_m2: plot?.areaM2 || 8.4,
    width_m: plot?.size.width || 7,
    depth_m: plot?.size.depth || 1.2,
    soil_type: plot?.soilType || '壤土',
    note: fresh ? '' : plot?.note || '',
    image_url: mode === 'edit' ? plot?.imageUrl || '' : '',
    crop_image_url: mode === 'plant' ? '' : plot?.cropImageUrl || '',
    seed_supply_id:
      mode === 'edit' ? (plot?.seedSupplyId ?? undefined) : undefined,
  });
  const patch = (value: Partial<PlotInput>) =>
    setForm((prev) => ({ ...prev, ...value }));
  const chooseCrop = (crop: string) => {
    const vegetable = catalog.vegetables.find((v) => v.name === crop);
    patch({
      crop,
      ...(vegetable
        ? { kind: vegetable.kind, stage: vegetable.stages[0] }
        : {}),
    });
  };
  const stages =
    catalog.vegetables.find((v) => v.name === form.crop)?.stages ||
    Object.keys(catalog.stages);
  const options = [...new Set([...stages, form.stage])];
  return (
    <Modal
      title={
        mode === 'create'
          ? '新增地块'
          : mode === 'plant'
            ? '开始新一茬'
            : '编辑地块资料'
      }
      description={
        mode === 'plant'
          ? '结束当前种植并保留历史记录，未解决的病虫问题会随上一茬归档。'
          : '填写地块资料，保存后同步。'
      }
      onClose={() => !busy && onClose()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const payload = { ...form };
            const metadata: Partial<PlotInput> = {
              name: form.name,
              area_m2: form.area_m2,
              width_m: form.width_m,
              depth_m: form.depth_m,
              soil_type: form.soil_type,
              note: form.note,
              image_url: form.image_url,
            };
            const editPayload: Partial<PlotInput> = { ...payload };
            delete editPayload.crop;
            const saved =
              mode === 'create'
                ? await gardenApi.createPlot(payload)
                : mode === 'plant'
                  ? await gardenApi.startPlanting(plot!.id, payload)
                  : await gardenApi.updatePlot(
                      plot!.id,
                      metadataOnly ? metadata : editPayload,
                    );
            if (pendingPlotImage) {
              const uploaded = await gardenApi.uploadImage(
                'plots',
                saved.id,
                pendingPlotImage,
              );
              await gardenApi.updatePlot(saved.id, {
                image_url: uploaded.url,
              });
            }
            if (pendingCropImage) {
              const uploaded = await gardenApi.uploadImage(
                'crops',
                saved.id,
                pendingCropImage,
              );
              await gardenApi.updatePlot(saved.id, {
                crop_image_url: uploaded.url,
              });
            }
            return saved;
          }, '地块已保存').then((ok) => ok && onClose());
        }}
      >
        {mode !== 'plant' && (
          <div className="form-grid">
            <Field label="地块编号">
              <input
                required
                pattern="[0-9]{1,6}"
                inputMode="numeric"
                maxLength={6}
                disabled={mode === 'edit'}
                value={form.id}
                onChange={(e) => patch({ id: e.target.value })}
              />
            </Field>
            <Field label="地块名称">
              <input
                required
                maxLength={40}
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Field>
          </div>
        )}
        {!metadataOnly && (
          <>
            <div className="form-grid">
              <Field label="蔬菜名称">
                <input
                  list="vegetable-list"
                  required
                  disabled={mode === 'edit'}
                  maxLength={40}
                  value={form.crop}
                  onChange={(e) => chooseCrop(e.target.value)}
                />
                <datalist id="vegetable-list" aria-label="蔬菜名称建议">
                  {catalog.vegetables.map((v) => (
                    <option value={v.name} key={v.name}>
                      {v.name}
                    </option>
                  ))}
                </datalist>
              </Field>
              <Field label="品种">
                <input
                  maxLength={60}
                  value={form.variety}
                  onChange={(e) => patch({ variety: e.target.value })}
                />
              </Field>
            </div>
            <Field label="种子物资（可选，不影响作物记录）">
              <NativeSelect
                value={form.seed_supply_id ? String(form.seed_supply_id) : ''}
                onChange={(e) =>
                  patch({
                    seed_supply_id: e.target.value ? Number(e.target.value) : 0,
                  })
                }
              >
                <option value="">不关联种子</option>
                {supplies
                  .filter((supply) => supply.category === 'seed')
                  .map((supply) => (
                    <option key={supply.id} value={supply.id}>
                      {supply.name} · {supply.stock} {supply.unit}
                    </option>
                  ))}
              </NativeSelect>
              <small className="field-hint">
                只保存当时的种子名称快照；删除种子物资不会影响这块地。
              </small>
            </Field>
            <div className="form-grid">
              <Field label="作物形态">
                <NativeSelect
                  value={form.kind}
                  onChange={(e) => patch({ kind: e.target.value as PlotKind })}
                >
                  {cropKindOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.icon} {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="当前生长阶段">
                <NativeSelect
                  value={form.stage}
                  onChange={(e) => patch({ stage: e.target.value })}
                >
                  {options.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <div className="form-grid">
              <Field label="种植日期">
                <input
                  required
                  type="date"
                  value={form.planted_on}
                  onChange={(e) => patch({ planted_on: e.target.value })}
                />
              </Field>
              <Field label="种植数量（株）">
                <input
                  type="number"
                  min={0}
                  max={100000}
                  required
                  value={form.plant_count}
                  onChange={(e) =>
                    patch({ plant_count: Number(e.target.value) })
                  }
                />
              </Field>
            </div>
          </>
        )}
        {mode !== 'plant' && (
          <div className="form-grid">
            <Field label="垄长（米）">
              <input
                required
                type="number"
                min={0.1}
                max={30}
                step={0.1}
                value={form.width_m}
                onChange={(e) => {
                  const width = Number(e.target.value);
                  patch({
                    width_m: width,
                    area_m2: Number((width * (form.depth_m || 1.2)).toFixed(2)),
                  });
                }}
              />
            </Field>
            <Field label="垄宽（米）">
              <input
                required
                type="number"
                min={0.1}
                max={5}
                step={0.1}
                value={form.depth_m}
                onChange={(e) => {
                  const depth = Number(e.target.value);
                  patch({
                    depth_m: depth,
                    area_m2: Number(((form.width_m || 7) * depth).toFixed(2)),
                  });
                }}
              />
            </Field>
            <Field label="面积（平方米）">
              <input
                required
                type="number"
                min={0.1}
                max={667}
                step="any"
                value={form.area_m2}
                onChange={(e) => patch({ area_m2: Number(e.target.value) })}
              />
            </Field>
            <Field label="土壤类型">
              <input
                maxLength={30}
                value={form.soil_type}
                onChange={(e) => patch({ soil_type: e.target.value })}
              />
            </Field>
          </div>
        )}
        {mode !== 'plant' && (
          <ImageUploader
            value={form.image_url || ''}
            label="地块图片"
            pendingFile={pendingPlotImage}
            onPendingFileChange={setPendingPlotImage}
            disabled={busy}
            onChange={(image_url) => patch({ image_url })}
          />
        )}
        {!metadataOnly && (
          <ImageUploader
            value={form.crop_image_url || ''}
            label="作物封面（可选）"
            pendingFile={pendingCropImage}
            onPendingFileChange={setPendingCropImage}
            disabled={busy}
            onChange={(crop_image_url) => patch({ crop_image_url })}
          />
        )}
        <Field label="备注">
          <textarea
            rows={2}
            maxLength={500}
            value={form.note}
            onChange={(e) => patch({ note: e.target.value })}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? '保存中…' : '保存'}
        </Button>
      </form>
    </Modal>
  );
}

export function ActionEditor({
  plot,
  action,
  supplies,
  threats,
  run,
  busy,
  onClose,
}: {
  plot: Plot;
  action: string;
  supplies: SupplyItem[];
  threats: ThreatLibraryItem[];
  run: RunAction;
  busy: boolean;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState(
    action === '浇水' ? '升' : action === '采收' ? '千克' : '',
  );
  const [supplyId, setSupplyId] = useState('');
  const [issueKind, setIssueKind] = useState<'pest' | 'disease' | 'weed'>(
    'pest',
  );
  const [issueName, setIssueName] = useState('');
  const [treatment, setTreatment] = useState('');
  const [showThreatPicker, setShowThreatPicker] = useState(false);
  const applicable = supplies.filter((s) =>
    action === '施肥'
      ? s.category === 'fertilizer'
      : action === '打药'
        ? s.category === 'pesticide'
        : true,
  );
  const supply = supplies.find((s) => s.id === Number(supplyId));
  return (
    <Modal
      title={action === '病虫草害' ? '登记病虫草害' : `记录${action}`}
      description={`${plot.id} · ${plot.name} · ${plot.crop}`}
      onClose={() => !busy && onClose()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              action === '病虫草害'
                ? gardenApi.createIssue({
                    plotId: plot.id,
                    kind: issueKind,
                    name: issueName,
                    severity: '轻微',
                    symptoms: note,
                    treatment,
                  })
                : gardenApi.createRecord({
                    plotId: plot.id,
                    action,
                    note,
                    ...(amount !== '' ? { amount: Number(amount), unit } : {}),
                    ...(supplyId ? { supplyId: Number(supplyId) } : {}),
                  }),
            '记录已保存',
          ).then((ok) => ok && onClose());
        }}
      >
        {action === '病虫草害' ? (
          <>
            <Field label="问题类型">
              <NativeSelect
                value={issueKind}
                onChange={(e) =>
                  setIssueKind(e.target.value as typeof issueKind)
                }
              >
                <option value="pest">虫害</option>
                <option value="disease">病害</option>
                <option value="weed">草害</option>
              </NativeSelect>
            </Field>
            <Field label="问题名称">
              <input
                required
                maxLength={60}
                value={issueName}
                onChange={(e) => setIssueName(e.target.value)}
                placeholder="例如：蚜虫"
              />
            </Field>
            <div className="threat-picker-trigger">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowThreatPicker((current) => !current)}
              >
                {showThreatPicker ? '收起病虫害资料' : '从病虫害资料选择'}
              </Button>
              <small>选择后会自动带入名称、典型症状和处理建议。</small>
            </div>
            {showThreatPicker && (
              <ThreatLibrary
                compact
                threats={threats}
                crop={plot.crop}
                onSelect={(threat) => {
                  setIssueKind(threat.kind);
                  setIssueName(threat.name);
                  setNote(threat.symptoms);
                  setTreatment(threat.suggestion);
                  setShowThreatPicker(false);
                }}
              />
            )}
          </>
        ) : (
          <>
            <Field label="关联库存物品（可选）">
              <NativeSelect
                value={supplyId}
                onChange={(e) => {
                  setSupplyId(e.target.value);
                  const found = supplies.find(
                    (s) => s.id === Number(e.target.value),
                  );
                  if (found) setUnit(found.unit);
                }}
              >
                <option value="">不领用库存</option>
                {applicable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · 剩余 {s.stock} {s.unit}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="form-grid">
              <Field label="数量">
                <input
                  type="number"
                  min={supplyId ? '0.000001' : '0'}
                  step="any"
                  required={!!supplyId}
                  max={supply?.stock}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="单位">
                <input
                  required={!!amount}
                  disabled={!!supplyId}
                  maxLength={20}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              </Field>
            </div>
            {supply && (
              <p className="inline-notice">
                保存时自动扣减 {supply.name} {amount || 0} {supply.unit}。
              </p>
            )}
          </>
        )}
        <Field label={action === '病虫草害' ? '症状 / 处理备注' : '现场备注'}>
          <textarea
            maxLength={500}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {action === '病虫草害' && (
          <Field label="处理建议（可修改）">
            <textarea
              maxLength={500}
              rows={3}
              value={treatment}
              onChange={(e) => setTreatment(e.target.value)}
              placeholder="选择后会自动填入，可按现场情况补充"
            />
          </Field>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? '保存中…' : '确认保存'}
        </Button>
      </form>
    </Modal>
  );
}

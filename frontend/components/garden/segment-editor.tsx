'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { cropKindOptions } from '@/lib/crop-kinds';
import {
  gardenApi,
  type Catalog,
  type Plot,
  type PlotKind,
  type PlotSegment,
} from '@/lib/api';
import { Field, Modal, type RunAction } from './forms';

const segmentColors: Record<PlotKind, string> = {
  leafy: '#6d9b58',
  tomato: '#b6754e',
  loofah: '#5b9566',
  scallion: '#80a764',
  root: '#ad8b56',
  cabbage: '#65945d',
  herb: '#6c9c78',
  pepper: '#b47a4f',
  legume: '#65905b',
  corn: '#9aa052',
  strawberry: '#ad6e6e',
  mushroom: '#9b8b70',
  flower: '#ba9f58',
  tuber: '#9a8059',
};

export function SegmentEditor({
  plot,
  catalog,
  run,
  busy,
  onClose,
}: {
  plot: Plot;
  catalog: Catalog;
  run: RunAction;
  busy: boolean;
  onClose: () => void;
}) {
  const [segments, setSegments] = useState<PlotSegment[]>(() =>
    plot.segments.map((item) => ({ ...item })),
  );
  const length = plot.size.width;
  const used = segments.reduce(
    (sum, section) => sum + (Number(section.lengthM) || 0),
    0,
  );
  const remaining = Math.max(0, Math.round((length - used) * 100) / 100);
  const valid =
    segments.every(
      (section) => section.crop.trim() && section.lengthM >= 0.1,
    ) && used <= length + 0.001;
  const change = (index: number, value: Partial<PlotSegment>) =>
    setSegments((current) =>
      current.map((section, at) =>
        at === index ? { ...section, ...value } : section,
      ),
    );
  const add = () => {
    if (remaining < 0.1) return;
    setSegments((current) => [
      ...current,
      {
        lengthM: Math.min(2, remaining),
        crop: '青菜',
        kind: 'leafy',
        stage: '播种期',
      },
    ]);
  };
  const split = (index: number) => {
    setSegments((current) => {
      const section = current[index];
      if (!section || section.lengthM < 0.2 || current.length >= 24)
        return current;
      const first = Math.round(section.lengthM * 50) / 100;
      const second = Math.round((section.lengthM - first) * 100) / 100;
      return [
        ...current.slice(0, index),
        { ...section, lengthM: first },
        { ...section, lengthM: second },
        ...current.slice(index + 1),
      ];
    });
  };
  return (
    <Modal
      title={`${plot.name} · 分种布局`}
      description={`整条垄长 ${length} 米、宽 ${plot.size.depth} 米。按顺序分段，未分配的长度保留裸土。`}
      onClose={() => !busy && onClose()}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          void run(
            () =>
              gardenApi.updatePlotSegments(
                plot.id,
                segments.map((section) => ({
                  ...section,
                  crop: section.crop.trim(),
                  lengthM: Number(section.lengthM.toFixed(2)),
                })),
              ),
            '分种布局已保存',
          ).then((ok) => ok && onClose());
        }}
      >
        <div className="segment-preview" aria-label="沿垄长的分种预览">
          {segments.map((section, index) => (
            <div
              key={index}
              title={`${section.crop || '未命名'} ${section.lengthM || 0}米`}
              style={{
                width: `${Math.max(0, (section.lengthM / length) * 100)}%`,
                background: segmentColors[section.kind],
              }}
            />
          ))}
          {remaining > 0 && (
            <div
              className="segment-preview-empty"
              style={{ width: `${(remaining / length) * 100}%` }}
            />
          )}
        </div>
        <p className="segment-summary">
          已分配 {used.toFixed(2)} 米 · 剩余 {remaining.toFixed(2)} 米
        </p>
        <div className="segment-list">
          {segments.map((section, index) => {
            const stages =
              catalog.vegetables.find(
                (vegetable) => vegetable.name === section.crop,
              )?.stages || Object.keys(catalog.stages);
            return (
              <div className="segment-row" key={index}>
                <div className="segment-row-title">
                  <strong>第 {index + 1} 段</strong>
                  <div>
                    <button
                      type="button"
                      onClick={() => split(index)}
                      disabled={
                        busy || section.lengthM < 0.2 || segments.length >= 24
                      }
                    >
                      拆分
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSegments((current) =>
                          current.filter((_, at) => at !== index),
                        )
                      }
                      disabled={busy}
                    >
                      删除
                    </button>
                  </div>
                </div>
                <div className="segment-fields">
                  <Field label="长度（米）">
                    <input
                      type="number"
                      min="0.1"
                      max={length}
                      step="0.1"
                      required
                      value={section.lengthM}
                      onChange={(event) =>
                        change(index, { lengthM: Number(event.target.value) })
                      }
                    />
                  </Field>
                  <Field label="蔬菜">
                    <input
                      list="segment-vegetables"
                      maxLength={40}
                      required
                      value={section.crop}
                      onChange={(event) => {
                        const crop = event.target.value;
                        const vegetable = catalog.vegetables.find(
                          (item) => item.name === crop,
                        );
                        change(index, {
                          crop,
                          ...(vegetable
                            ? {
                                kind: vegetable.kind,
                                stage: vegetable.stages[0],
                              }
                            : {}),
                        });
                      }}
                    />
                  </Field>
                  <Field label="作物形态">
                    <NativeSelect
                      value={section.kind}
                      onChange={(event) =>
                        change(index, { kind: event.target.value as PlotKind })
                      }
                    >
                      {cropKindOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.icon} {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="生长阶段">
                    <NativeSelect
                      value={section.stage}
                      onChange={(event) =>
                        change(index, { stage: event.target.value })
                      }
                    >
                      {[...new Set([...stages, section.stage])].map((stage) => (
                        <option key={stage}>{stage}</option>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
        <datalist id="segment-vegetables">
          {catalog.vegetables.map((vegetable) => (
            <option key={vegetable.name} value={vegetable.name}>
              {vegetable.name}
            </option>
          ))}
        </datalist>
        <Button
          type="button"
          variant="outline"
          onClick={add}
          disabled={busy || remaining < 0.1 || segments.length >= 24}
        >
          ＋ 添加一段
        </Button>
        {!valid && (
          <p className="segment-error">
            每段至少 0.1 米，且分段总长不能超过整条垄。
          </p>
        )}
        <Button
          className="segment-save"
          type="submit"
          disabled={busy || !valid}
        >
          {busy ? '保存中…' : '保存分种布局'}
        </Button>
      </form>
    </Modal>
  );
}

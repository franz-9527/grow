'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { gardenApi, type ThreatLibraryItem, type ThreatPayload } from '@/lib/api';
import { ImageUploader } from './image-uploader';
import { Field, Modal, type RunAction } from './forms';

function splitTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[、，,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function ThreatEditor({
  threat,
  run,
  busy,
  onClose,
}: {
  threat?: ThreatLibraryItem;
  run: RunAction;
  busy: boolean;
  onClose: () => void;
}) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [form, setForm] = useState<ThreatPayload>({
    kind: threat?.kind === 'disease' ? 'disease' : 'pest',
    name: threat?.name || '',
    aliases: threat?.aliases || [],
    crops: threat?.crops || [],
    symptoms: threat?.symptoms || '',
    suggestion: threat?.suggestion || '',
    season: threat?.season || '',
    severity: threat?.severity || '中等',
    image_url: threat?.imageUrl || '',
    source_url: threat?.sourceUrl || '',
    image_credit: threat?.imageCredit || '',
    license: threat?.license || '',
  });
  const [aliasesText, setAliasesText] = useState((threat?.aliases || []).join('、'));
  const [cropsText, setCropsText] = useState((threat?.crops || []).join('、'));
  const patch = (value: Partial<ThreatPayload>) =>
    setForm((previous) => ({ ...previous, ...value }));

  return (
    <Modal
      title={threat ? '编辑病虫害资料' : '新增病虫害资料'}
      description="只维护图鉴资料，不影响历史记录。"
      onClose={() => !busy && onClose()}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const payload = {
            ...form,
            name: form.name.trim(),
            aliases: splitTags(aliasesText),
            crops: splitTags(cropsText),
          };
          void run(
            async () => {
              const saved = threat
                ? await gardenApi.updateThreat(threat.id, payload)
                : await gardenApi.createThreat(payload);
              if (pendingFile) {
                const uploaded = await gardenApi.uploadImage(
                  'threats',
                  String(saved.id),
                  pendingFile,
                );
                await gardenApi.updateThreat(saved.id, {
                  image_url: uploaded.url,
                });
              }
              return saved;
            },
            threat ? '病虫害资料已更新' : '病虫害资料已新增',
          ).then((ok) => ok && onClose());
        }}
      >
        <div className="form-grid">
          <Field label="资料类型">
            <NativeSelect
              value={form.kind}
              onChange={(event) =>
                patch({ kind: event.target.value as ThreatPayload['kind'] })
              }
            >
              <option value="pest">虫害</option>
              <option value="disease">病害</option>
            </NativeSelect>
          </Field>
          <Field label="名称">
            <input
              required
              maxLength={60}
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="例如：蚜虫"
            />
          </Field>
        </div>
        <Field label="别名（用顿号或逗号分隔）">
          <input
            maxLength={300}
            value={aliasesText}
            onChange={(event) => setAliasesText(event.target.value)}
            placeholder="例如：桃蚜、菜蚜"
          />
        </Field>
        <Field label="适用作物（用顿号或逗号分隔）">
          <input
            maxLength={300}
            value={cropsText}
            onChange={(event) => setCropsText(event.target.value)}
            placeholder="例如：青菜、番茄、辣椒"
          />
        </Field>
        <div className="form-grid">
          <Field label="严重程度">
            <NativeSelect
              value={form.severity}
              onChange={(event) =>
                patch({
                  severity: event.target.value as ThreatPayload['severity'],
                })
              }
            >
              <option value="轻微">轻微</option>
              <option value="中等">中等</option>
              <option value="严重">严重</option>
            </NativeSelect>
          </Field>
          <Field label="常见季节或条件">
            <input
              maxLength={100}
              value={form.season}
              onChange={(event) => patch({ season: event.target.value })}
              placeholder="例如：夏秋高温多雨"
            />
          </Field>
        </div>
        <Field label="识别症状">
          <textarea
            required
            rows={3}
            maxLength={500}
            value={form.symptoms}
            onChange={(event) => patch({ symptoms: event.target.value })}
            placeholder="记录叶片、茎、果实或虫体的直观特征"
          />
        </Field>
        <Field label="防治建议">
          <textarea
            rows={3}
            maxLength={500}
            value={form.suggestion}
            onChange={(event) => patch({ suggestion: event.target.value })}
            placeholder="记录人工处理、环境管理和复查建议"
          />
        </Field>
        <ImageUploader
          value={form.image_url}
          label="图鉴图片"
          pendingFile={pendingFile}
          onPendingFileChange={setPendingFile}
          disabled={busy}
          onChange={(image_url) => patch({ image_url })}
        />
        <div className="form-grid">
          <Field label="来源页（可选）">
            <input
              type="url"
              maxLength={500}
              value={form.source_url}
              onChange={(event) => patch({ source_url: event.target.value })}
              placeholder="https://…"
            />
          </Field>
          <Field label="许可说明（可选）">
            <input
              maxLength={100}
              value={form.license}
              onChange={(event) => patch({ license: event.target.value })}
              placeholder="例如：CC BY-SA 4.0"
            />
          </Field>
        </div>
        <Field label="图片署名（可选）">
          <input
            maxLength={200}
            value={form.image_credit}
            onChange={(event) => patch({ image_credit: event.target.value })}
            placeholder="例如：Wikimedia Commons（原作者见来源页）"
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? '保存中…' : '保存资料'}
        </Button>
      </form>
    </Modal>
  );
}

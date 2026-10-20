'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gardenApi, type SupplyImage, type SupplyItem } from '@/lib/api';
import { Field, Modal, type RunAction } from './forms';
import { ImageViewer } from './image-viewer';

const MAX_SOURCE_IMAGE_BYTES = 16 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function SupplyImages({
  supply,
  run,
  busy,
  pendingFiles,
  onPendingFilesChange,
  note,
  onNoteChange,
}: {
  supply: SupplyItem;
  run: RunAction;
  busy: boolean;
  pendingFiles: File[];
  onPendingFilesChange: (files: File[]) => void;
  note: string;
  onNoteChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<SupplyImage[]>([]);
  const [deleting, setDeleting] = useState<SupplyImage | null>(null);
  const [error, setError] = useState('');
  const pendingPreviews = useMemo(
    () =>
      pendingFiles.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [pendingFiles],
  );

  useEffect(() => {
    let active = true;
    gardenApi
      .supplyImages(supply.id)
      .then((items) => active && setImages(items))
      .catch(() => active && setError('物资图片暂时加载失败'));
    return () => {
      active = false;
    };
  }, [supply.id]);

  useEffect(() => {
    return () => pendingPreviews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [pendingPreviews]);

  const chooseFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    const invalidType = selected.some((file) => !IMAGE_TYPES.has(file.type));
    const invalidSize = selected.some(
      (file) => file.size > MAX_SOURCE_IMAGE_BYTES,
    );
    if (invalidType) {
      setError('有图片格式不支持，请重新选择。');
    } else if (invalidSize) {
      setError('图片不能超过 16 MB。');
    } else {
      setError('');
    }
    const existing = new Set(pendingFiles.map(fileKey));
    const valid = selected.filter(
      (file) =>
        IMAGE_TYPES.has(file.type) &&
        file.size <= MAX_SOURCE_IMAGE_BYTES &&
        !existing.has(fileKey(file)),
    );
    if (valid.length) onPendingFilesChange([...pendingFiles, ...valid]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removePending = (index: number) => {
    onPendingFilesChange(
      pendingFiles.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  return (
    <section className="supply-images">
      <div className="subheading-row">
        <div>
          <h3>物资图片</h3>
          <small>可多选，首图显示在库存卡片</small>
        </div>
        <span className="tag">{images.length + pendingFiles.length} 张</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        hidden
        onChange={(event) => chooseFiles(event.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus size={16} />
        选择图片
      </Button>
      {pendingFiles.length > 0 && (
        <p className="supply-images-pending">待保存 {pendingFiles.length} 张</p>
      )}
      <Field label="图片备注（可选）">
        <input
          maxLength={500}
          placeholder="同一批图片共用备注"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </Field>
      {error && <p className="form-error">{error}</p>}
      {images.length > 0 || pendingPreviews.length > 0 ? (
        <div className="supply-image-grid">
          {images.map((image, index) => (
            <article className="supply-image-card" key={image.id}>
              <div className="supply-image-preview-wrap">
                <ImageViewer
                  src={image.imageUrl}
                  alt={`${supply.name}图片`}
                  className="supply-image-view-trigger"
                  imageClassName="supply-image-thumbnail"
                />
                {index === 0 && (
                  <span className="supply-image-primary">首图</span>
                )}
              </div>
              <div>
                <strong>{displayDate(image.createdAt)}</strong>
                {image.note && <p>{image.note}</p>}
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`删除${supply.name}图片`}
                  disabled={busy}
                  onClick={() => setDeleting(image)}
                >
                  <Trash2 size={14} />
                  删除
                </Button>
              </div>
            </article>
          ))}
          {pendingPreviews.map(({ file, url }, index) => (
            <article
              className="supply-image-card is-pending"
              key={fileKey(file)}
            >
              <div className="supply-image-preview-wrap">
                <ImageViewer
                  src={url}
                  alt={`${file.name}预览`}
                  className="supply-image-view-trigger"
                  imageClassName="supply-image-thumbnail"
                />
                {images.length === 0 && index === 0 && (
                  <span className="supply-image-primary">首图</span>
                )}
              </div>
              <div>
                <strong>待保存</strong>
                <p>{file.name}</p>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`移除待保存图片 ${file.name}`}
                  disabled={busy}
                  onClick={() => removePending(index)}
                >
                  <X size={14} />
                  移除
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="supply-images-empty">还没有图片。</p>
      )}

      {deleting && (
        <Modal
          title="删除这张物资图片？"
          description="只删除图片，不影响库存和流水。"
          onClose={() => !busy && setDeleting(null)}
        >
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void run(
                () => gardenApi.deleteSupplyImage(deleting.id),
                '物资图片已删除',
                () => {
                  setImages((current) =>
                    current.filter((image) => image.id !== deleting.id),
                  );
                  setDeleting(null);
                },
              )
            }
          >
            确认删除
          </Button>
        </Modal>
      )}
    </section>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gardenApi, type GrowthPhoto, type Plot } from '@/lib/api';
import { Field, Modal, type RunAction } from './forms';
import { ImageUploader } from './image-uploader';
import { ImageViewer } from './image-viewer';

function localDateTimeValue() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

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

export function GrowthPhotos({
  plot,
  run,
  busy,
}: {
  plot: Plot;
  run: RunAction;
  busy: boolean;
}) {
  const [photos, setPhotos] = useState<GrowthPhoto[]>([]);
  const [recording, setRecording] = useState(false);
  const [deleting, setDeleting] = useState<GrowthPhoto | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [takenAt, setTakenAt] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setPhotos(await gardenApi.growthPhotos(plot.id));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生长照片加载失败');
    }
  };

  useEffect(() => {
    let active = true;
    gardenApi
      .growthPhotos(plot.id)
      .then((items) => active && setPhotos(items))
      .catch(() => active && setError('生长照片暂时加载失败'));
    return () => {
      active = false;
    };
  }, [plot.id]);

  const openRecorder = () => {
    setPendingFile(null);
    setNote('');
    setTakenAt(localDateTimeValue());
    setError('');
    setRecording(true);
  };

  return (
    <section className="growth-photos">
      <div className="subheading-row">
        <div>
          <h3>生长照片</h3>
          <small>每次拍照都是一条独立记录</small>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={openRecorder}
        >
          <Camera size={16} />
          拍照记录
        </Button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {photos.length ? (
        <div className="growth-photo-grid">
          {photos.map((photo) => (
            <article className="growth-photo-card" key={photo.id}>
              <ImageViewer
                src={photo.imageUrl}
                alt={`${photo.crop || plot.crop}生长记录`}
                className="growth-photo-view-trigger"
                imageClassName="growth-photo-thumbnail"
              />
              <div className="growth-photo-meta">
                <strong>{displayDate(photo.takenAt)}</strong>
                {photo.note && <p>{photo.note}</p>}
                <Button
                  variant="ghost"
                  aria-label={`删除${displayDate(photo.takenAt)}的生长照片`}
                  disabled={busy}
                  onClick={() => setDeleting(photo)}
                >
                  <Trash2 size={15} />
                  删除
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="growth-photo-empty">
          <Camera size={21} />
          <span>还没有生长照片，随手拍一张记录变化。</span>
        </div>
      )}

      {recording && (
        <Modal
          title={`记录${plot.crop}的生长状态`}
          description="照片会按时间保留。"
          onClose={() => !busy && setRecording(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!pendingFile || !takenAt) {
                setError('请先拍照或选择一张照片，并确认记录时间。');
                return;
              }
              void run(
                async () => {
                  const uploaded = await gardenApi.uploadImage(
                    'growth',
                    plot.id,
                    pendingFile,
                  );
                  return gardenApi.createGrowthPhoto(plot.id, {
                    image_url: uploaded.url,
                    note: note.trim(),
                    taken_at: new Date(takenAt).toISOString(),
                  });
                },
                '生长照片已记录',
              ).then((ok) => {
                if (ok) {
                  setRecording(false);
                  void load();
                }
              });
            }}
          >
            <ImageUploader
              value=""
              label="生长照片"
              pendingFile={pendingFile}
              onPendingFileChange={setPendingFile}
              capture="environment"
              disabled={busy}
            />
            <Field label="拍摄时间">
              <input
                required
                type="datetime-local"
                value={takenAt}
                onChange={(event) => setTakenAt(event.target.value)}
              />
            </Field>
            <Field label="生长备注（可选）">
              <textarea
                rows={3}
                maxLength={500}
                placeholder="例如：新叶展开，叶面没有虫斑"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={busy || !pendingFile}>
              保存这次生长记录
            </Button>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="删除这条生长照片？"
          description="只删除这条照片记录，不会影响作物、地块或其他生长记录。"
          onClose={() => !busy && setDeleting(null)}
        >
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void run(
                () => gardenApi.deleteGrowthPhoto(deleting.id),
                '生长照片已删除',
                () => {
                  setPhotos((current) =>
                    current.filter((photo) => photo.id !== deleting.id),
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

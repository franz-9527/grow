'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageViewer } from './image-viewer';

const MAX_SOURCE_IMAGE_BYTES = 16 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function ImageUploader({
  value,
  label,
  onChange,
  pendingFile,
  onPendingFileChange,
  disabled = false,
  capture,
  }: {
  value: string;
  label: string;
  onChange?: (url: string) => void;
  pendingFile: File | null;
  onPendingFileChange: (file: File | null) => void;
  disabled?: boolean;
  capture?: 'environment' | 'user';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const pendingPreview = useMemo(
    () => (pendingFile ? URL.createObjectURL(pendingFile) : ''),
    [pendingFile],
  );

  useEffect(() => {
    if (!pendingPreview) return;
    return () => URL.revokeObjectURL(pendingPreview);
  }, [pendingPreview]);

  const choose = (file?: File) => {
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      setError('图片格式不支持，请选择静态图片。');
      return;
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      setError('图片不能超过 16 MB。');
      return;
    }
    setError('');
    onPendingFileChange(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  const preview = pendingPreview || value;

  return (
    <div className="image-uploader">
      <span className="image-uploader-label">{label}</span>
      <div className="image-uploader-body">
        {preview ? (
          <ImageViewer
            src={preview}
            alt={`${label}预览`}
            className="image-uploader-preview-trigger"
            imageClassName="image-uploader-preview"
          />
        ) : (
          <div className="image-uploader-empty">
            <ImagePlus size={22} />
            <span>还没有图片</span>
          </div>
        )}
        <div className="image-uploader-actions">
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus size={16} />
            {preview ? '更换图片' : capture ? '拍照 / 选择' : '选择图片'}
          </Button>
          {!!preview && (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              aria-label={`移除${label}`}
              onClick={() => {
                setError('');
                onPendingFileChange(null);
                onChange?.('');
              }}
            >
              <Trash2 size={16} />
              移除
            </Button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        capture={capture}
        hidden
        onChange={(event) => choose(event.target.files?.[0])}
      />
      {pendingFile && <small className="image-uploader-hint">保存后上传</small>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

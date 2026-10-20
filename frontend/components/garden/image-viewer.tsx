'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function ImageViewer({
  src,
  alt,
  className = '',
  imageClassName = '',
  loading,
}: {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  loading?: 'eager' | 'lazy';
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`image-view-trigger ${className}`.trim()}
        aria-label={`查看${alt}`}
        title="点击查看大图"
        onClick={() => setOpen(true)}
      >
        <img className={imageClassName} src={src} alt={alt} loading={loading} />
      </button>
      <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
        <DialogContent className="image-viewer-dialog">
          <DialogHeader className="image-viewer-header">
            <DialogTitle>{alt}</DialogTitle>
          </DialogHeader>
          <img className="image-viewer-image" src={src} alt={alt} />
        </DialogContent>
      </Dialog>
    </>
  );
}

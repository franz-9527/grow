'use client';
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import NextImage from 'next/image';
import QRCode from 'qrcode';
import {
  Camera,
  ImagePlus,
  QrCode,
  Download,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { gardenApi, type Plot, type PlantingHistory } from '@/lib/api';
import { parseQrCode, qrLabelUrl } from '@/lib/qr';
import { Field, Modal, type RunAction } from './forms';
import { PlantingLabel } from './planting-label';
import { plantingIdFromUrl, plantingUrl } from '@/lib/planting-code';

export function QrPanel({
  plots,
  bindings,
  initialCode = '',
  initialPlantingId = null,
  run,
  busy,
  onOpen,
}: {
  plots: Plot[];
  bindings: Record<string, string>;
  initialCode?: string;
  initialPlantingId?: number | null;
  run: RunAction;
  busy: boolean;
  onOpen: (id: string) => void;
}) {
  const [raw, setRaw] = useState(initialCode);
  const [code, setCode] = useState(initialCode);
  const [plotId, setPlotId] = useState(plots[0]?.id || '');
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState('');
  const [plantings, setPlantings] = useState<PlantingHistory[]>([]);
  const [plantingError, setPlantingError] = useState('');
  const [label, setLabel] = useState<{ code: string; image: string } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<'bind' | 'unbind' | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const resolveRef = useRef<(raw: string) => void>(() => {});
  const lookupSequence = useRef(0);
  useEffect(() => {
    let active = true;
    void gardenApi.plantings()
      .then((items) => { if (active) setPlantings(items); })
      .catch((cause) => { if (active) setPlantingError(cause instanceof Error ? cause.message : '种植历史加载失败'); });
    return () => { active = false; };
  }, []);
  useEffect(
    () => () => {
      lookupSequence.current += 1;
    },
    [],
  );
  const read = async (value: string) => {
    const sequence = ++lookupSequence.current;
    try {
      const plantingId = plantingIdFromUrl(value, window.location.origin);
      if (plantingId) {
        window.location.assign(plantingUrl(plantingId, window.location.origin));
        return;
      }
      const parsed = parseQrCode(value);
      setCode(parsed);
      setRaw(parsed);
      setCamera(false);
      setError('');
      const result = await gardenApi.lookupQr(parsed);
      if (sequence !== lookupSequence.current) return;
      if (result.plotId) {
        onOpen(result.plotId);
      } else {
        setError(`编号 ${parsed} 尚未绑定，请选择地块后绑定。`);
      }
    } catch (e) {
      if (sequence !== lookupSequence.current) return;
      setError(e instanceof Error ? e.message : '二维码识别失败');
    }
  };
  useEffect(() => {
    resolveRef.current = (value) => {
      void read(value);
    };
  });
  useEffect(() => {
    if (!camera) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const scan = () => {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && ctx) {
        canvas.width = Math.min(v.videoWidth, 800);
        canvas.height = Math.round(
          (canvas.width * v.videoHeight) / v.videoWidth,
        );
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(data.data, data.width, data.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (qr) {
          try {
            if (!plantingIdFromUrl(qr.data, window.location.origin)) parseQrCode(qr.data);
            resolveRef.current(qr.data);
            return;
          } catch {
            setError('识别到其他二维码，请对准地块码或蔬菜溯源码');
          }
        }
      }
      timer = setTimeout(scan, 160);
    };
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            '当前浏览器无法调用相机，请使用 HTTPS 打开，或上传二维码图片',
          );
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
          scan();
        }
      } catch (e) {
        if (!stopped) {
          setError(
            e instanceof Error ? e.message : '无法打开摄像头，请检查相机权限',
          );
          setCamera(false);
        }
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camera]);
  const upload = async (file?: File) => {
    if (!file) return;
    setError('');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法读取图片');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(data.data, data.width, data.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (!qr)
        throw new Error('图片中没有识别到二维码，请上传清晰的完整二维码');
      await read(qr.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取失败');
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  const printLabel = async (value: string) => {
    try {
      setLabel({
        code: value,
        image: await QRCode.toDataURL(
          qrLabelUrl(value, window.location.origin),
          {
            width: 600,
            margin: 4,
            errorCorrectionLevel: 'M',
          },
        ),
      });
    } catch {
      setError('二维码生成失败，请重试');
    }
  };
  const bound =
    bindings[code] && bindings[code] !== '未绑定' ? bindings[code] : null;
  return (
    <div className="qr-layout">
      <section className="panel">
        <p className="eyebrow">SCAN & GROW</p>
        <h2>扫一扫，回到这块地</h2>
        <p className="muted">
          数字码用于识别地块；蔬菜溯源码可直接打开对应那一茬的历史记录。
        </p>
        <div className="scanner-box">
          {camera ? (
            <video ref={video} playsInline muted aria-label="二维码扫描相机" />
          ) : (
            <QrCode size={80} strokeWidth={1} />
          )}
          <span>
            {camera ? '将二维码放入画面中' : '支持地块码 · 蔬菜溯源码 · 图片识别'}
          </span>
        </div>
        <div className="button-row">
          <Button
            onClick={() => {
              setError('');
              setCamera((v) => !v);
            }}
          >
            <Camera size={17} />
            {camera ? '关闭相机' : '打开相机扫码'}
          </Button>
          <label className="upload-button">
            <ImagePlus size={17} />
            识别图片
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void read(raw);
          }}
        >
          <Field label="输入数字编号或粘贴二维码链接">
            <input
              required
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="例如 001"
              maxLength={2000}
            />
          </Field>
          <Button variant="outline" type="submit">
            打开对应地块
          </Button>
        </form>
        {error && <output className="inline-notice">{error}</output>}
        <div className="binding-form">
          <h3>绑定数字编号</h3>
          <div className="form-grid">
            <Field label="二维码编号">
              <input
                inputMode="numeric"
                maxLength={6}
                placeholder="001"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ''));
                  setConfirm(null);
                }}
              />
            </Field>
            <Field label="对应地块">
              <NativeSelect
                value={plotId}
                onChange={(e) => {
                  setPlotId(e.target.value);
                  setConfirm(null);
                }}
              >
                {plots.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.id} · {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <p className="muted">
            {bound ? `当前绑定：${bound} 地块` : '此编号尚未绑定'}
          </p>
          <Button
            disabled={busy || !code || !plotId}
            onClick={() => {
              const normalized = parseQrCode(code);
              setCode(normalized);
              if (
                bindings[normalized] &&
                bindings[normalized] !== '未绑定' &&
                bindings[normalized] !== plotId
              ) {
                setConfirm('bind');
              } else {
                void run(
                  () => gardenApi.bindQr(normalized, plotId),
                  '二维码已绑定',
                );
              }
            }}
          >
            绑定到所选地块
          </Button>
          {bound && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirm('unbind')}
            >
              解绑
            </Button>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>地块码牌</h2>
          <span className="count-badge">{Object.keys(bindings).length}</span>
        </div>
        {Object.entries(bindings).map(([value, id]) => (
          <article className="qr-row" key={value}>
            <div className="qr-number">{value}</div>
            <div>
              <strong>
                {plots.find((p) => p.id === id)?.name || '未绑定'}
              </strong>
              <p>
                {id === '未绑定'
                  ? '等待绑定'
                  : `地块 ${id} · ${plots.find((p) => p.id === id)?.crop || ''}`}
              </p>
            </div>
            <Button
              variant="ghost"
              aria-label={`打开二维码 ${value}`}
              onClick={() => {
                setCode(value);
                setRaw(value);
                void read(value);
              }}
            >
              <ExternalLink size={18} />
            </Button>
            <Button variant="outline" onClick={() => void printLabel(value)}>
              码牌
            </Button>
          </article>
        ))}
        {!Object.keys(bindings).length && (
          <p className="empty-state">先绑定一个数字编号，即可生成码牌。</p>
        )}
      </section>
      <div className="qr-label-full">
        {plantingError && <p className="form-error" role="alert">{plantingError}</p>}
        <PlantingLabel plantings={plantings} initialId={initialPlantingId} />
      </div>
      {confirm && (
        <Modal
          title={confirm === 'bind' ? '确认换绑二维码' : '确认解除绑定'}
          description={
            confirm === 'bind'
              ? `编号 ${code} 将从地块 ${bound} 换绑到地块 ${plotId}。旧码牌会打开新的地块。`
              : `编号 ${code} 将不再打开地块 ${bound}。`
          }
          onClose={() => setConfirm(null)}
        >
          <Button
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  confirm === 'bind'
                    ? gardenApi.bindQr(code, plotId)
                    : gardenApi.unbindQr(code),
                '绑定已更新',
              ).then((ok) => ok && setConfirm(null))
            }
          >
            确认{confirm === 'bind' ? '换绑' : '解绑'}
          </Button>
        </Modal>
      )}
      {label && (
        <Modal
          title={`地块码牌 · ${label.code}`}
          description="下载后可打印，固定在地块旁。二维码地址使用当前访问域名。"
          onClose={() => setLabel(null)}
        >
          <div className="print-label">
            <NextImage
              unoptimized
              width={600}
              height={600}
              src={label.image}
              alt={`编号 ${label.code} 的二维码`}
            />
            <strong>{label.code}</strong>
            <span>
              {plots.find((p) => p.id === bindings[label.code])?.name ||
                '待绑定地块'}
            </span>
          </div>
          <a
            className="download-button"
            href={label.image}
            download={`地块码牌-${label.code}.png`}
          >
            <Download size={18} />
            下载二维码图片
          </a>
        </Modal>
      )}
    </div>
  );
}

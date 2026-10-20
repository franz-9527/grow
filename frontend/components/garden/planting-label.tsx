'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { type PlantingHistory } from '@/lib/api';
import { plantingCode, plantingUrl } from '@/lib/planting-code';
import { Field } from './forms';

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character] || character);
const textLength = (value: string) => Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(value)).length || 1;

export function PlantingLabel({ plantings, initialId }: { plantings: PlantingHistory[]; initialId?: number | null }) {
  const [id, setId] = useState<number | null>(initialId || null);
  const [width, setWidth] = useState(50);
  const [height, setHeight] = useState(30);
  const [heading, setHeading] = useState('一方菜园');
  const [caption, setCaption] = useState('扫码查看这茬蔬菜的种植记录');
  const [color, setColor] = useState('#3c6748');
  const [generated, setGenerated] = useState<{ key: string; svg: string } | null>(null);
  const [error, setError] = useState('');
  const effectiveId = id ?? plantings[0]?.id ?? null;
  const selected = plantings.find((item) => item.id === effectiveId) || null;
  const validSize = Number.isFinite(width) && Number.isFinite(height) && width >= 1 && height >= 1 && width <= 200 && height <= 200 && height / width >= .15;
  const key = `${effectiveId}:${width}:${height}:${heading}:${caption}:${color}`;
  const svg = validSize && generated?.key === key ? generated.svg : '';

  useEffect(() => {
    if (!selected || !validSize) return;
    let active = true;
    const ratio = height / width;
    const canvasHeight = Math.round(1000 * ratio);
    const qrSize = Math.min(canvasHeight - 130, 370);
    const qrX = 1000 - qrSize - 65;
    const qrY = Math.round((canvasHeight - qrSize) / 2);
    void QRCode.toString(plantingUrl(selected.id, window.location.origin), {
      type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: color, light: '#ffffff' },
    }).then((qr) => {
      if (!active) return;
      // QRCode uses a variable module count, so retain its own viewBox.
      const positionedQr = qr.replace('<svg ', `<svg x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" `);
      const safeCrop = escapeXml(selected.crop);
      const safeVariety = escapeXml(selected.variety || '新鲜蔬菜');
      const safeHeading = escapeXml(heading || '一方菜园');
      const safeCaption = escapeXml(caption);
      const code = plantingCode(selected.id);
      const titleSize = Math.min(122, Math.max(45, canvasHeight * 0.2), 450 / textLength(selected.crop));
      const body = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}cm" height="${height}cm" viewBox="0 0 1000 ${canvasHeight}">
        <rect width="1000" height="${canvasHeight}" rx="24" fill="#fbfaf4"/>
        <rect x="20" y="20" width="960" height="${canvasHeight - 40}" rx="18" fill="none" stroke="${color}" stroke-width="3"/>
        <path d="M65 87 H${qrX - 35}" stroke="${color}" stroke-width="5"/>
        <text x="65" y="72" font-size="${Math.min(31, 450 / textLength(heading))}" font-family="sans-serif" letter-spacing="4" fill="${color}">${safeHeading}</text>
        <text x="65" y="${Math.round(canvasHeight * .45)}" font-size="${titleSize}" font-weight="700" font-family="sans-serif" fill="#23382a">${safeCrop}</text>
        <text x="69" y="${Math.round(canvasHeight * .45 + 62)}" font-size="${Math.min(35, 450 / textLength(selected.variety))}" font-family="sans-serif" fill="#61715e">${safeVariety}</text>
        <text x="69" y="${canvasHeight - 120}" font-size="29" font-family="sans-serif" fill="${color}">种植编号  ${code}</text>
        <text x="69" y="${canvasHeight - 73}" font-size="${Math.min(25, 450 / textLength(caption))}" font-family="sans-serif" fill="#71816e">${safeCaption}</text>
        ${positionedQr}
      </svg>`;
      setGenerated({ key, svg: body });
      setError('');
    }).catch(() => { if (active) setError('标签二维码生成失败'); });
    return () => { active = false; };
  }, [selected, validSize, width, height, heading, caption, color, key]);

  const download = () => {
    if (!svg || !selected) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `溯源标签-${plantingCode(selected.id)}-${width}x${height}cm.svg`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    if (!svg) return;
    const popup = window.open('', '_blank');
    if (!popup) { setError('请允许浏览器打开打印窗口'); return; }
    popup.document.title = '溯源标签';
    const style = popup.document.createElement('style');
    style.textContent = `@page{size:${width}cm ${height}cm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:${width}cm;height:${height}cm}@media screen{body{background:#ddd;padding:20px}svg{margin:auto;box-shadow:0 3px 20px #777}}`;
    popup.document.head.appendChild(style);
    popup.document.body.innerHTML = svg;
    popup.focus();
    popup.print();
  };

  return <section className="panel planting-label-panel">
    <div className="section-heading"><div><p className="eyebrow">GROWING TRACE</p><h2>蔬菜溯源标签</h2></div></div>
    <p className="muted">选择任意一茬历史蔬菜，调整标签后下载 SVG 或直接打印。二维码始终指向这茬蔬菜，不受地块换绑影响。</p>
    <div className="label-fields">
      <Field label="种植历史"><NativeSelect value={effectiveId || ''} onChange={(event) => setId(Number(event.target.value))}>
        {plantings.map((item) => <option key={item.id} value={item.id}>{plantingCode(item.id)} · {item.crop} · {item.plot_id} 地块</option>)}
      </NativeSelect></Field>
      <Field label="宽度（cm）"><input type="number" min="1" max="200" step="0.1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></Field>
      <Field label="高度（cm）"><input type="number" min="1" max="200" step="0.1" value={height} onChange={(event) => setHeight(Number(event.target.value))} /></Field>
      <Field label="抬头文字"><input maxLength={16} value={heading} onChange={(event) => setHeading(event.target.value)} /></Field>
      <Field label="底部说明"><input maxLength={28} value={caption} onChange={(event) => setCaption(event.target.value)} /></Field>
      <Field label="标签颜色"><NativeSelect value={color} onChange={(event) => setColor(event.target.value)}>
        <option value="#3c6748">菜园绿</option><option value="#314968">靛蓝</option><option value="#8a5937">泥土棕</option><option value="#242424">黑白</option>
      </NativeSelect></Field>
    </div>
    {svg && <div className="label-preview" style={{ aspectRatio: `${width} / ${height}` }} dangerouslySetInnerHTML={{ __html: svg }} />}
    {!plantings.length && <p className="empty-state">暂无种植历史。</p>}
    {!validSize && selected && <p className="form-error" role="alert">请输入 1～200 cm 的尺寸，且高度至少为宽度的 15%</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="button-row"><Button disabled={!svg} onClick={download}><Download size={17} /> 下载标签 SVG</Button><Button disabled={!svg} variant="outline" onClick={print}><Printer size={17} /> 打印标签</Button></div>
    {selected && <a className="trace-link" href={plantingUrl(selected.id, typeof window === 'undefined' ? 'http://localhost' : window.location.origin)} target="_blank" rel="noreferrer">查看该蔬菜的溯源页</a>}
  </section>;
}

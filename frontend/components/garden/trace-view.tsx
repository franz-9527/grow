'use client';

import { useEffect, useState } from 'react';
import NextImage from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Sprout } from 'lucide-react';
import { gardenApi, isStaticPreview, type PlantingTrace } from '@/lib/api';
import { plantingCode } from '@/lib/planting-code';

export function TraceView({ id }: { id: number }) {
  const [trace, setTrace] = useState<PlantingTrace | null>(null);
  const [error, setError] = useState('');
  const [staticPreview, setStaticPreview] = useState(false);

  useEffect(() => setStaticPreview(isStaticPreview()), []);

  useEffect(() => {
    let active = true;
    void gardenApi.plantingTrace(id)
      .then((result) => active && setTrace(result))
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : '加载失败'));
    return () => { active = false; };
  }, [id]);

  const planting = trace?.planting;
  return (
    <main className="trace-page">
      {staticPreview && <div className="preview-banner" role="status">免费网站预览 · 此溯源码展示的是演示种植记录。</div>}
      <Link className="trace-back" href="/"><ArrowLeft size={18} /> 返回菜园</Link>
      <div className="trace-heading"><Sprout size={28} /><span>一方菜园 · 种植溯源</span></div>
      {!planting && <p className="trace-loading">{error || '正在读取种植记录…'}</p>}
      {planting && (
        <>
          <header className="trace-hero">
            <p className="eyebrow">GROWING RECORD · {plantingCode(planting.id)}</p>
            <h1>{planting.crop}</h1>
            <p>{planting.variety || '未填写品种'} · {planting.status === 'active' ? '正在种植' : '已结束'}</p>
          </header>
          <section className="trace-card">
            <h2>这茬蔬菜</h2>
            <dl className="trace-facts">
              <div><dt>唯一编号</dt><dd>{plantingCode(planting.id)}</dd></div>
              <div><dt>种植地块</dt><dd>{planting.plot_name}（{planting.plot_id}）</dd></div>
              <div><dt>开始种植</dt><dd>{planting.planted_on}</dd></div>
              <div><dt>当前阶段</dt><dd>{planting.stage}</dd></div>
              {planting.expected_harvest_on && <div><dt>预计采收</dt><dd>{planting.expected_harvest_on}</dd></div>}
              {!!planting.plant_count && <div><dt>株数</dt><dd>{planting.plant_count}</dd></div>}
              {planting.seed_name && <div><dt>种子</dt><dd>{planting.seed_name} {planting.seed_unit}</dd></div>}
            </dl>
            {planting.note && <p className="trace-note">{planting.note}</p>}
          </section>
          <section className="trace-card">
            <h2>农事记录</h2>
            {trace!.records.length ? (
              <ol className="trace-timeline">
                {trace!.records.map((record) => (
                  <li key={record.id}>
                    <time>{new Date(record.occurredAt || record.time).toLocaleDateString('zh-CN')}</time>
                    <strong>{record.action}</strong>
                    <p>{record.note || '无备注'}{record.supplyName ? ` · ${record.supplyName}` : ''}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="muted">暂无农事记录。</p>}
          </section>
          {!!trace!.photos.length && <section className="trace-card">
            <h2>生长影像</h2>
            <div className="trace-photos">{trace!.photos.map((photo) => (
              <figure key={photo.id}>
                <NextImage unoptimized src={photo.imageUrl} alt={photo.note || `${planting.crop}生长照片`} width={600} height={450} />
                <figcaption>{photo.takenAt.slice(0, 10)} {photo.note}</figcaption>
              </figure>
            ))}</div>
          </section>}
        </>
      )}
    </main>
  );
}

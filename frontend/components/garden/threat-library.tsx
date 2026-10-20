'use client';

import { useMemo, useState } from 'react';
import {
  Bug,
  CalendarDays,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageViewer } from './image-viewer';
import type { ThreatLibraryItem } from '@/lib/api';

type Filter = 'all' | 'pest' | 'disease';

const filterLabels: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'pest', label: '虫害' },
  { id: 'disease', label: '病害' },
];

const kindCopy = {
  pest: '虫害',
  disease: '病害',
  weed: '草害',
} as const;

const severityTone = {
  轻微: 'light',
  中等: 'medium',
  严重: 'severe',
} as const;

export function ThreatLibrary({
  threats,
  crop,
  onSelect,
  compact = false,
  editable = false,
  onCreate,
  onEdit,
  onDelete,
}: {
  threats: ThreatLibraryItem[];
  crop?: string;
  onSelect?: (threat: ThreatLibraryItem) => void;
  compact?: boolean;
  editable?: boolean;
  onCreate?: () => void;
  onEdit?: (threat: ThreatLibraryItem) => void;
  onDelete?: (threat: ThreatLibraryItem) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      threats
        .filter((threat) => threat.kind !== 'weed')
        .filter((threat) => filter === 'all' || threat.kind === filter)
        .filter((threat) => {
          if (!normalizedQuery) return true;
          return [
            threat.name,
            threat.symptoms,
            threat.suggestion,
            threat.crops.join(' '),
            threat.aliases.join(' '),
          ]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery);
        })
        .sort(
          (left, right) =>
            Number(right.crops.includes(crop || '')) -
            Number(left.crops.includes(crop || '')),
        ),
    [crop, filter, normalizedQuery, threats],
  );

  return (
    <section className={`threat-library ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="threat-library-hero">
          <div>
            <span className="threat-library-kicker">
              菜园病虫害图鉴 · {threats.length} 条资料
            </span>
            <h2>病虫害防治</h2>
          </div>
          <div className="threat-hero-actions">
            {editable && onCreate && (
              <Button
                type="button"
                variant="outline"
                className="threat-add-button"
                onClick={onCreate}
              >
                <Plus size={16} />
                新增病虫害
              </Button>
            )}
            <ShieldCheck aria-hidden="true" />
          </div>
        </div>
      )}
      {compact && (
        <div className="threat-library-compact-heading">
          <div>
            <strong>为当前作物选择病虫害</strong>
            <span>
              {crop
                ? `优先显示适用于${crop}的条目`
                : '选择后会带入当前作物的问题登记'}
            </span>
          </div>
          <ShieldAlert size={19} aria-hidden="true" />
        </div>
      )}
      <div className="threat-library-controls">
        <label className="threat-search">
          <Search size={19} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索病虫害名称、症状或作物…"
            aria-label="搜索病虫害图鉴"
          />
        </label>
        <div
          className="threat-filter-tabs"
          role="tablist"
          aria-label="病虫害分类"
        >
          {filterLabels.map((item) => (
            <button
              type="button"
              key={item.id}
              role="tab"
              aria-selected={filter === item.id}
              className={filter === item.id ? 'active' : ''}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="threat-library-summary">
        <span>
          <Bug size={15} aria-hidden="true" />
          {visible.length} 种常见{filter === 'all' ? '病虫害' : kindCopy[filter]}
        </span>
        {crop && <small>已按 {crop} 的常见问题优先排序</small>}
      </div>
      <div className="threat-library-grid">
        {visible.map((threat) => (
          <article
            className="threat-library-card"
            key={threat.id || `${threat.kind}-${threat.name}`}
          >
            <div className="threat-image-wrap">
              <ImageViewer
                src={threat.imageUrl}
                alt={`${threat.name}症状示例`}
                className="threat-image-view-trigger"
                imageClassName="threat-image"
                loading="lazy"
              />
              <span className={`threat-kind ${threat.kind}`}>
                {threat.kind === 'pest' ? '🐛' : '🍂'} {kindCopy[threat.kind]}
              </span>
            </div>
            <div className="threat-library-card-body">
              <div className="threat-card-title">
                <h3>{threat.name}</h3>
                <span
                  className={`threat-severity ${severityTone[threat.severity]}`}
                >
                  ● {threat.severity}
                </span>
              </div>
              <p className="threat-symptoms">{threat.symptoms}</p>
              <p className="threat-advice">防治：{threat.suggestion}</p>
              <div className="threat-card-meta">
                <span>
                  <CalendarDays size={14} aria-hidden="true" /> {threat.season}
                </span>
                <span>{threat.crops.slice(0, 3).join('、')}</span>
              </div>
              <div
                className={`threat-card-actions ${
                  editable && !compact ? 'is-manage' : ''
                }`}
              >
                <div className="threat-source-meta">
                  {threat.sourceUrl ? (
                    <a
                      href={threat.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={`资料来源：${threat.imageCredit}（${threat.license}）`}
                    >
                      来源与许可
                    </a>
                  ) : threat.license ? (
                    <span className="threat-local-credit">{threat.license}</span>
                  ) : null}
                </div>
                {editable && !compact && (onEdit || onDelete) && (
                  <div className="threat-manage-actions">
                    {onEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`编辑${threat.name}`}
                        onClick={() => onEdit(threat)}
                      >
                        <Pencil size={15} />
                        编辑
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="threat-delete-button"
                        aria-label={`删除${threat.name}`}
                        onClick={() => onDelete(threat)}
                      >
                        <Trash2 size={15} />
                        删除
                      </Button>
                    )}
                  </div>
                )}
                {compact && onSelect && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onSelect(threat)}
                  >
                    关联当前作物
                  </Button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="threat-library-empty">
          没有找到匹配条目。可换关键词或分类。
        </div>
      )}
    </section>
  );
}

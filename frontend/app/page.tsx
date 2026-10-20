'use client';

import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Sprout,
  LayoutGrid,
  Package,
  QrCode,
  History,
  ListTodo,
  Plus,
  RefreshCw,
  CloudSun,
  Droplets,
  Leaf,
  Bug,
  FlaskConical,
  Scissors,
  Maximize2,
  Minimize2,
  Move,
  ArrowUpRight,
  Check,
  Pencil,
  RotateCcw,
  Trash2,
  LockKeyhole,
  UnlockKeyhole,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import {
  gardenApi,
  type Dashboard,
  type Catalog,
  type Plot,
  type SceneWeather,
  type PlantingHistory,
  type ThreatLibraryItem,
  AdminAuthRequiredError,
  isStaticPreview,
} from '@/lib/api';
import { InventoryPanel } from '@/components/garden/inventory-panel';
import { GrowthPhotos } from '@/components/garden/growth-photos';
import { ImageViewer } from '@/components/garden/image-viewer';
import { QrPanel } from '@/components/garden/qr-panel';
import { PlotEditor, ActionEditor } from '@/components/garden/plot-editor';
import { SegmentEditor } from '@/components/garden/segment-editor';
import { Field, Modal } from '@/components/garden/forms';
import { ThreatLibrary } from '@/components/garden/threat-library';
import { ThreatEditor } from '@/components/garden/threat-editor';
import { qrCodeFromLocation } from '@/lib/qr';
import { plantingCode, plantingUrl } from '@/lib/planting-code';
import { TraceView } from '@/components/garden/trace-view';
import { cropIconForKind } from '@/lib/crop-kinds';

const GardenScene = lazy(() =>
  import('@/components/garden-scene').then((m) => ({ default: m.GardenScene })),
);
const navigation = [
  { id: 'garden', label: '我的菜园', icon: LayoutGrid },
  { id: 'tasks', label: '待办巡园', icon: ListTodo },
  { id: 'threats', label: '病虫图鉴', icon: Bug },
  { id: 'inventory', label: '物资库存', icon: Package },
  { id: 'qr', label: '数字码牌', icon: QrCode },
  { id: 'records', label: '农事记录', icon: History },
] as const;
type Tab = (typeof navigation)[number]['id'];

function plantedCrops(plot: Plot) {
  const crops = [...new Set(plot.segments.map((segment) => segment.crop))];
  return crops.length ? crops.join('、') : '空垄';
}
const actions = [
  { name: '浇水', icon: Droplets },
  { name: '施肥', icon: FlaskConical },
  { name: '除草', icon: Leaf },
  { name: '病虫草害', icon: Bug },
  { name: '打药', icon: Sprout },
  { name: '采收', icon: Scissors },
];

export default function Home() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({
    vegetables: [],
    threats: [],
    stages: {},
  });
  const [status, setStatus] = useState<'loading' | 'online' | 'offline'>(
    'loading',
  );
  const [tab, setTab] = useState<Tab>('garden');
  const [selectedId, setSelectedId] = useState('001');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [mode, setMode] = useState<'manage' | 'game'>('manage');
  const [weather, setWeather] = useState<SceneWeather>('sunny');
  const [weatherAuto, setWeatherAuto] = useState(true);
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [full, setFull] = useState(false);
  const [editor, setEditor] = useState<'create' | 'edit' | 'plant' | null>(
    null,
  );
  const [segmentEditorOpen, setSegmentEditorOpen] = useState(false);
  const [threatEditor, setThreatEditor] = useState<
    ThreatLibraryItem | 'create' | null
  >(null);
  const [action, setAction] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: 'archive' | 'record' | 'threat';
    id: string | number;
  } | null>(null);
  const [qrCode, setQrCode] = useState('');
  const [recordFilter, setRecordFilter] = useState('all');
  const [history, setHistory] = useState<PlantingHistory[] | null>(null);
  const [labelPlantingId, setLabelPlantingId] = useState<number | null>(null);
  const [traceId, setTraceId] = useState<number | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [staticPreview, setStaticPreview] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  const [sceneFocusRequest, setSceneFocusRequest] = useState(0);
  const qrHandled = useRef(false);
  const plotDetailRef = useRef<HTMLElement>(null);

  useEffect(() => setStaticPreview(isStaticPreview()), []);

  const openPlot = useCallback((id: string, fromQr = false) => {
    setSelectedId(id);
    setTab('garden');
    setFull(false);
    setSceneFocusRequest((value) => value + 1);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        plotDetailRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
        plotDetailRef.current?.focus({ preventScroll: true });
      }),
    );
    if (fromQr)
      window.history.replaceState(null, '', `/${window.location.hash}`);
  }, []);

  const reload = useCallback(async () => {
    const [dashboard, cat] = await Promise.all([
      gardenApi.dashboard(),
      gardenApi.catalog(),
    ]);
    setData(dashboard);
    setCatalog(cat);
    setStatus('online');
    setSelectedId((prev) =>
      dashboard.plots.some((p) => p.id === prev)
        ? prev
        : dashboard.plots[0]?.id || '',
    );
  }, []);
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('trace');
    if (raw && /^\d+$/.test(raw) && Number(raw) > 0) {
      queueMicrotask(() => setTraceId(Number(raw)));
    }
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([gardenApi.dashboard(), gardenApi.catalog()])
      .then(([dashboard, cat]) => {
        if (!active) return;
        setData(dashboard);
        setCatalog(cat);
        setWeather(dashboard.weather.scene);
        setWeatherAuto(true);
        setStatus('online');
        setSelectedId(dashboard.plots[0]?.id || '');
      })
      .catch(() => {
        if (active) setStatus('offline');
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    void gardenApi
      .authSession()
      .then((session) => {
        if (active) setAdminUnlocked(session.authenticated);
      })
      .catch(() => {
        if (active) setAdminUnlocked(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (status !== 'online' || qrHandled.current) return;
    const code = qrCodeFromLocation(window.location);
    if (!code) return;
    qrHandled.current = true;
    void gardenApi
      .lookupQr(code)
      .then((result) => {
        setQrCode(code);
        if (result.plotId) {
          openPlot(result.plotId, true);
          setNotice({
            text: `已打开二维码 ${code} 绑定的地块 ${result.plotId}`,
            error: false,
          });
        } else {
          setTab('qr');
          setNotice({
            text: `二维码 ${code} 尚未绑定，请选择对应地块`,
            error: false,
          });
        }
      })
      .catch((e) => {
        qrHandled.current = false;
        setNotice({ text: String(e.message), error: true });
      });
  }, [openPlot, status]);
  useEffect(() => {
    if (!full) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener('keydown', key);
    };
  }, [full]);
  const run = async (
    operation: () => Promise<unknown>,
    message: string,
    onSuccess?: () => void,
  ) => {
    if (!adminUnlocked) {
      setPasswordError('');
      setPasswordOpen(true);
      setNotice({ text: '这项操作需要先解锁管理权限。', error: false });
      return false;
    }
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      await operation();
      onSuccess?.();
      setNotice({ text: message, error: false });
      try {
        await reload();
      } catch {
        setStatus('offline');
        setNotice({
          text: `${message}，但刷新失败，请点击同步读取最新数据。`,
          error: true,
        });
      }
      return true;
    } catch (e) {
      if (e instanceof AdminAuthRequiredError) {
        setAdminUnlocked(false);
        setPasswordError('管理会话已过期，请重新输入密码。');
        setPasswordOpen(true);
        return false;
      }
      setNotice({
        text: e instanceof Error ? e.message : '保存失败，请重试',
        error: true,
      });
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const submitPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      setPasswordError('请输入4位数字密码。');
      return;
    }
    setPasswordBusy(true);
    setPasswordError('');
    try {
      const session = await gardenApi.login(pin);
      setAdminUnlocked(session.authenticated);
      setPasswordOpen(false);
      setPin('');
      setNotice({ text: '管理权限已解锁，有效期30天。', error: false });
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : '密码验证失败，请重试。',
      );
    } finally {
      setPasswordBusy(false);
    }
  };
  const toggleAdmin = () => {
    if (!adminUnlocked) {
      setPasswordError('');
      setPasswordOpen(true);
      return;
    }
    void gardenApi
      .logout()
      .catch(() => undefined)
      .finally(() => {
        setAdminUnlocked(false);
        setNotice({ text: '管理权限已锁定。', error: false });
      });
  };
  const toggleLayoutEdit = () => {
    if (!adminUnlocked) {
      setPasswordError('');
      setPasswordOpen(true);
      setNotice({ text: '调整地块位置需要先解锁管理权限。', error: false });
      return;
    }
    setMode('manage');
    setLayoutEditMode((current) => !current);
  };
  const plots = useMemo(() => data?.plots || [], [data?.plots]);
  const selected = plots.find((p) => p.id === selectedId);
  const scenePlots = useMemo(
    () =>
      plots.map(
        ({
          id,
          kind,
          health,
          crop,
          stage,
          progress,
          plantCount,
          position,
          size,
          segments,
        }) => ({
          id,
          kind,
          health,
          position,
          size,
          segments,
          crop,
          stage,
          progress,
          plantCount,
        }),
      ),
    [plots],
  );
  const openAction = (name: string) => setAction(name);
  const title = navigation.find((n) => n.id === tab)?.label;
  const nextId = String(
    Math.max(0, ...plots.map((p) => Number(p.id))) + 1,
  ).padStart(3, '0');
  const sceneIsDay = useMemo(() => {
    if (!data) return true;
    const sunrise = data.weather.sunrise
      ? Date.parse(data.weather.sunrise)
      : Number.NaN;
    const sunset = data.weather.sunset
      ? Date.parse(data.weather.sunset)
      : Number.NaN;
    return Number.isFinite(sunrise) && Number.isFinite(sunset)
      ? clock >= sunrise && clock < sunset
      : data.weather.isDay;
  }, [clock, data]);
  const sceneWeather = weatherAuto && data ? data.weather.scene : weather;

  if (traceId !== null) return <TraceView id={traceId} />;

  return (
    <div className="garden-app">
      <aside className="app-sidebar">
        <Link className="brand" href="/">
          <span>
            <Sprout size={26} />
          </span>
          <div>
            一方菜园<small>GARDEN JOURNAL</small>
          </div>
        </Link>
        <div className="nav-caption">菜园工作台</div>
        <nav aria-label="主导航">
          {navigation.map((n) => (
            <button
              type="button"
              key={n.id}
              className={tab === n.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setTab(n.id)}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.id === 'tasks' && !!data?.tasks.length && (
                <b>{data.tasks.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="garden-avatar">
            <Sprout size={22} />
          </div>
          <div>
            <strong>{data?.gardenName || '我的菜园'}</strong>
            <small>
              <span className={`connection-dot ${status}`} />
              {status === 'online'
                ? '数据已连接'
                : status === 'loading'
                  ? '连接中'
                  : '连接已断开'}
            </small>
          </div>
        </div>
      </aside>
      <main className="app-main">
        {staticPreview && <div className="preview-banner" role="status">
          免费网站预览 · 当前显示独立演示数据，种植记录和标签仅供体验。
        </div>}
        <header className="topbar">
          <div>
            <span className="breadcrumb">菜园 / {title}</span>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            <span className="today">
              {new Date().toLocaleDateString('zh-CN', {
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              })}
            </span>
            <Button
              variant="outline"
              className={
                adminUnlocked ? 'admin-access unlocked' : 'admin-access'
              }
              aria-label={adminUnlocked ? '锁定管理权限' : '解锁管理权限'}
              onClick={toggleAdmin}
            >
              {adminUnlocked ? (
                <UnlockKeyhole size={17} />
              ) : (
                <LockKeyhole size={17} />
              )}
              <span>{adminUnlocked ? '管理已解锁' : '解锁管理'}</span>
            </Button>
            <Button
              variant="outline"
              aria-label="同步菜园数据"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const cat = await gardenApi.catalog();
                  setCatalog(cat);
                }, '数据已同步')
              }
            >
              <RefreshCw size={17} className={busy ? 'spinning' : ''} />
              <span>同步</span>
            </Button>
            <Button onClick={() => setTab('qr')}>
              <QrCode size={17} />
              <span>扫码管理</span>
            </Button>
          </div>
        </header>
        {notice && (
          <div
            className={`notice ${notice.error ? 'error' : ''}`}
            role={notice.error ? 'alert' : 'status'}
          >
            <span>{notice.text}</span>
            <button aria-label="关闭提示" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}
        {status === 'offline' && (
          <div className="notice error" role="alert">
            无法连接菜园服务。
            {data
              ? '当前显示上次读取的数据，保存前请先同步。'
              : '请启动后端服务后点击同步。这里不会用示例数据替代你的菜园。'}
          </div>
        )}
        {!data ? (
          <div className="loading-panel">
            <Sprout size={36} />
            <h2>{status === 'loading' ? '正在打开菜园…' : '等待连接菜园'}</h2>
            <p>地块、生长期和库存会保存在你的菜园数据库中。</p>
          </div>
        ) : (
          <>
            {tab === 'garden' && (
              <>
                <div className="overview-strip">
                  <div>
                    <span className="metric-icon">
                      <LayoutGrid size={20} />
                    </span>
                    <p>
                      管理地块
                      <strong>
                        {plots.length}
                        <small>块</small>
                      </strong>
                    </p>
                  </div>
                  <div>
                    <span className="metric-icon">
                      <Leaf size={20} />
                    </span>
                    <p>
                      种植面积
                      <strong>
                        {plots.reduce((n, p) => n + p.areaM2, 0).toFixed(1)}
                        <small>m²</small>
                      </strong>
                    </p>
                  </div>
                  <div>
                    <span className="metric-icon amber">
                      <Scissors size={20} />
                    </span>
                    <p>
                      待采收
                      <strong>
                        {plots.filter((p) => p.progress >= 85).length}
                        <small>块</small>
                      </strong>
                    </p>
                  </div>
                  <div className="weather-summary">
                    <CloudSun size={30} />
                    <p>
                      {data.weather.condition}
                      <strong>
                        {data.weather.temperatureMin ?? '—'}–
                        {data.weather.temperatureMax ?? '—'}°
                        <small>
                          绍兴 · 越城 · {sceneIsDay ? '白天' : '夜间'}
                        </small>
                      </strong>
                    </p>
                    <button
                      aria-label="更新实际天气"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const w = await gardenApi.refreshWeather();
                          setWeather(w.scene);
                          setWeatherAuto(true);
                          if (w.warning) throw new Error(w.warning);
                        }, '天气已更新')
                      }
                    >
                      <RefreshCw size={15} />
                    </button>
                  </div>
                </div>
                <section className="garden-workspace">
                  <div className="garden-left">
                    <section
                      className={`scene-card ${full ? 'scene-fullscreen' : ''}`}
                    >
                      <div className="scene-heading">
                        <div>
                          <span className="live-dot" />
                          三维菜园{' '}
                          <small className="scene-live-status">
                            当前时间 · {sceneIsDay ? '白天' : '夜间'}
                          </small>
                        </div>
                        <div className="scene-tools">
                          <NativeSelect
                            aria-label="场景模式"
                            value={mode}
                            onChange={(e) => {
                              const nextMode = e.target.value as typeof mode;
                              setMode(nextMode);
                              if (nextMode === 'game') setLayoutEditMode(false);
                            }}
                          >
                            <option value="manage">俯瞰管理</option>
                            <option value="game">走进菜园</option>
                          </NativeSelect>
                          <NativeSelect
                            aria-label="场景天气预览"
                            value={weatherAuto ? 'auto' : weather}
                            onChange={(e) => {
                              if (e.target.value === 'auto') {
                                setWeatherAuto(true);
                                setWeather(data.weather.scene);
                              } else {
                                setWeatherAuto(false);
                                setWeather(e.target.value as SceneWeather);
                              }
                            }}
                          >
                            <option value="auto">实时天气</option>
                            <option value="sunny">晴天</option>
                            <option value="rain">雨天</option>
                            <option value="mist">雾天</option>
                          </NativeSelect>
                          <Button
                            variant={layoutEditMode ? 'default' : 'outline'}
                            className="scene-layout-button"
                            disabled={status !== 'online'}
                            onClick={toggleLayoutEdit}
                          >
                            <Move size={15} />
                            <span>
                              {layoutEditMode ? '完成布局' : '编辑位置'}
                            </span>
                          </Button>
                          <button
                            className="icon-button"
                            aria-label={full ? '退出全屏' : '放大场景'}
                            onClick={() => setFull((v) => !v)}
                          >
                            {full ? (
                              <Minimize2 size={18} />
                            ) : (
                              <Maximize2 size={18} />
                            )}
                          </button>
                        </div>
                      </div>
                      <SceneBoundary>
                        <Suspense
                          fallback={
                            <div className="scene-loading">
                              正在准备三维菜园…
                            </div>
                          }
                        >
                          <GardenScene
                            plots={scenePlots}
                            selectedId={selectedId}
                            editMode={layoutEditMode}
                            mode={mode}
                            weather={sceneWeather}
                            isDay={sceneIsDay}
                            landscapeMode={full}
                            focusRequest={sceneFocusRequest}
                            onSelect={setSelectedId}
                            onPositionChange={(id, x, z) => {
                              void run(
                                () =>
                                  gardenApi.updatePlot(id, {
                                    position_x: x,
                                    position_z: z,
                                  }),
                                '地块位置已保存',
                              );
                            }}
                            onInteract={(id) => {
                              setSelectedId(id);
                              setFull(false);
                              openAction('浇水');
                            }}
                          />
                        </Suspense>
                      </SceneBoundary>
                      <div className="scene-footer">
                        <span>
                          <i className="legend-dot" />
                          当前选中{' '}
                          <strong>
                            {selected
                              ? `${selected.id} · ${selected.name}`
                              : '暂无地块'}
                          </strong>
                        </span>
                        <span>
                          {layoutEditMode
                            ? '拖动地块调整位置 · 松开自动保存'
                            : '点击田畦管理 · 支持自定义布局'}
                        </span>
                      </div>
                    </section>
                    <section className="plot-list-section">
                      <div className="section-heading">
                        <h2>
                          地块一览 <small>{plots.length} 块</small>
                        </h2>
                        <Button
                          variant="outline"
                          disabled={status !== 'online'}
                          onClick={() => setEditor('create')}
                        >
                          <Plus size={16} />
                          新增地块
                        </Button>
                      </div>
                      <div className="plot-grid">
                        {plots.map((p) => (
                          <button
                            key={p.id}
                            className={`plot-card ${p.id === selectedId ? 'selected' : ''}`}
                            onClick={() => setSelectedId(p.id)}
                          >
                            <div className="plot-card-top">
                              {p.imageUrl ? (
                                <img
                                  className="plot-thumb"
                                  src={p.imageUrl}
                                  alt=""
                                />
                              ) : (
                                <span className={`crop-emoji ${p.kind}`}>
                                  {p.segments.length
                                    ? cropIconForKind(p.kind)
                                    : '🟫'}
                                </span>
                              )}
                              <span className="plot-number">NO. {p.id}</span>
                              <ArrowUpRight size={17} />
                            </div>
                            <strong>
                              {p.name}
                              <span>{plantedCrops(p)}</span>
                            </strong>
                            <p>
                              {p.segments.length
                                ? p.segments.length > 1
                                  ? `${p.segments.length} 段分种`
                                  : `${p.stage} · 第 ${p.day} 天`
                                : '待分种'}
                            </p>
                            <div className="progress-track">
                              <i style={{ width: `${p.progress}%` }} />
                            </div>
                            <div className="plot-card-bottom">
                              <span
                                className={p.health === '留意' ? 'watch' : ''}
                              >
                                {!p.segments.length
                                  ? '● 待种植'
                                  : p.health === '留意'
                                    ? '● 需要留意'
                                    : '● 长势良好'}
                              </span>
                              <span>{p.areaM2} m²</span>
                            </div>
                          </button>
                        ))}
                      </div>
                      {!plots.length && (
                        <p className="empty-state">
                          还没有地块。点击“新增地块”开始记录种植。
                        </p>
                      )}
                    </section>
                  </div>
                  {selected && (
                    <aside
                      ref={plotDetailRef}
                      className="plot-detail"
                      key={selected.id}
                      tabIndex={-1}
                      aria-label={`地块 ${selected.id} 作物记录`}
                    >
                      <div className="detail-cover">
                        {selected.imageUrl ? (
                          <ImageViewer
                            src={selected.imageUrl}
                            alt={`${selected.name}地块图片`}
                            className="detail-photo-view-trigger"
                            imageClassName="detail-photo"
                          />
                        ) : (
                          <span className={`crop-emoji ${selected.kind}`}>
                            {selected.segments.length
                              ? cropIconForKind(selected.kind)
                              : '🟫'}
                          </span>
                        )}
                        <span className="detail-id">地块 {selected.id}</span>
                        <button
                          className="detail-edit-button"
                          aria-label="编辑地块资料"
                          onClick={() => setEditor('edit')}
                        >
                          <Pencil size={17} />
                        </button>
                        <h2>{selected.name}</h2>
                        <p>
                          {plantedCrops(selected)}{' '}
                          <span>
                            ·{' '}
                            {selected.segments.length > 1
                              ? `${selected.segments.length} 段分种`
                              : selected.variety || '未填写品种'}
                          </span>
                        </p>
                        {selected.seedName && (
                          <p className="detail-seed">
                            关联种子 · {selected.seedName}
                            {selected.seedUnit && `（${selected.seedUnit}）`}
                          </p>
                        )}
                      </div>
                      <div className="detail-content">
                        {selected.cropImageUrl && (
                          <div className="crop-photo-row">
                            <ImageViewer
                              src={selected.cropImageUrl}
                              alt={`${selected.crop}作物图片`}
                              className="crop-photo-view-trigger"
                              imageClassName="crop-photo"
                            />
                            <div>
                              <span>当前作物</span>
                              <strong>{selected.crop}</strong>
                            </div>
                          </div>
                        )}
                        <div className="detail-facts">
                          <div>
                            <span>
                              {selected.segments.length ? '已种植' : '分种状态'}
                            </span>
                            <strong>
                              {selected.segments.length ? selected.day : '空垄'}
                              {selected.segments.length > 0 && (
                                <small>天</small>
                              )}
                            </strong>
                          </div>
                          <div>
                            <span>
                              {selected.segments.length > 1
                                ? '分种区段'
                                : '种植数量'}
                            </span>
                            <strong>
                              {selected.segments.length > 1
                                ? selected.segments.length
                                : selected.plantCount}
                              <small>
                                {selected.segments.length > 1 ? '段' : '株'}
                              </small>
                            </strong>
                          </div>
                          <div>
                            <span>面积</span>
                            <strong>
                              {selected.areaM2}
                              <small>m²</small>
                            </strong>
                          </div>
                        </div>
                        <div className="segment-detail">
                          <div className="segment-detail-header">
                            <h3>分种布局</h3>
                            <button
                              type="button"
                              onClick={() => setSegmentEditorOpen(true)}
                            >
                              编辑分种
                            </button>
                          </div>
                          <p className="segment-summary">
                            垄长 {selected.size.width} 米 · 垄宽{' '}
                            {selected.size.depth} 米
                          </p>
                          <div className="segment-detail-list">
                            {selected.segments.length ? (
                              selected.segments.map((section, index) => (
                                <span key={index}>
                                  {section.crop} · {section.lengthM} 米 ·{' '}
                                  {section.stage}
                                </span>
                              ))
                            ) : (
                              <span>
                                整垄空置，点击“编辑分种”开始安排蔬菜。
                              </span>
                            )}
                          </div>
                        </div>
                        {selected.segments.length === 1 && (
                          <GrowthControl
                            key={`${selected.id}-${selected.stage}-${selected.health}-${selected.moisture}`}
                            plot={selected}
                            catalog={catalog}
                            busy={busy || status !== 'online'}
                            run={run}
                          />
                        )}
                        {selected.segments.length > 0 && (
                          <GrowthPhotos
                            plot={selected}
                            busy={busy || status !== 'online'}
                            run={run}
                          />
                        )}
                        <div className="subheading-row">
                          <h3>记一笔农事</h3>
                          <small>保存即同步</small>
                        </div>
                        <div className="action-grid">
                          {actions.map((a) => (
                            <button
                              key={a.name}
                              disabled={busy || status !== 'online'}
                              onClick={() => openAction(a.name)}
                            >
                              <a.icon size={21} />
                              <span>{a.name}</span>
                            </button>
                          ))}
                        </div>
                        <div className="latest-action">
                          <History size={16} />
                          <span>{selected.lastAction}</span>
                        </div>
                        <div className="detail-links">
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => setEditor('plant')}
                          >
                            <RotateCcw size={16} />
                            开始新一茬
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              void gardenApi
                                .plantingHistory(selected.id)
                                .then(setHistory)
                                .catch((e) =>
                                  setNotice({ text: e.message, error: true }),
                                )
                            }
                          >
                            种植历史
                          </Button>
                        </div>
                        <button
                          className="archive-link"
                          disabled={busy}
                          onClick={() =>
                            setConfirm({ kind: 'archive', id: selected.id })
                          }
                        >
                          归档此地块
                        </button>
                      </div>
                    </aside>
                  )}
                </section>
              </>
            )}
            {tab === 'threats' && (
              <ThreatLibrary
                threats={catalog.threats}
                editable
                onCreate={() => setThreatEditor('create')}
                onEdit={(threat) => setThreatEditor(threat)}
                onDelete={(threat) =>
                  setConfirm({ kind: 'threat', id: threat.id })
                }
              />
            )}
            {tab === 'inventory' && (
              <InventoryPanel
                supplies={data.supplies}
                run={run}
                busy={busy || status !== 'online'}
              />
            )}
            {tab === 'qr' && (
              <QrPanel
                plots={plots}
                bindings={data.qrBindings}
                initialCode={qrCode}
                initialPlantingId={labelPlantingId}
                run={run}
                busy={busy || status !== 'online'}
                onOpen={openPlot}
              />
            )}
            {tab === 'tasks' && (
              <div className="tasks-layout">
                <section className="panel">
                  <p className="eyebrow">TODAY IN THE GARDEN</p>
                  <h2>今日巡园</h2>
                  <p className="muted">根据手动记录的长势、湿度和天气整理。</p>
                  {data.tasks.map((task, i) => (
                    <button
                      className="task-row"
                      key={`${task.plot}-${i}`}
                      onClick={() => openPlot(task.plot)}
                    >
                      <span className={`task-bar ${task.tone}`} />
                      <div>
                        <strong>{task.title}</strong>
                        <p>{task.note}</p>
                      </div>
                      <span className="task-plot">地块 {task.plot}</span>
                      <ArrowUpRight size={18} />
                    </button>
                  ))}
                  {!data.tasks.length && (
                    <p className="empty-state">当前没有巡园事项。</p>
                  )}
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <h2>病虫草害跟进</h2>
                    <Bug size={21} />
                  </div>
                  {data.issues.map((issue) => (
                    <article className="issue-card" key={issue.id}>
                      <span className="tag amber">{issue.severity}</span>
                      <h3>{issue.name}</h3>
                      <p>{issue.symptoms || '暂无症状说明'}</p>
                      <p>{issue.treatment}</p>
                      <div className="button-row">
                        <Button
                          variant="outline"
                          onClick={() => openPlot(issue.plotId)}
                        >
                          地块 {issue.plotId}
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => gardenApi.resolveIssue(issue.id),
                              '问题已标记解决',
                            )
                          }
                        >
                          <Check size={16} />
                          已解决
                        </Button>
                      </div>
                    </article>
                  ))}
                  {!data.issues.length && (
                    <div className="empty-state">
                      <Leaf size={30} />
                      <p>暂无待跟进问题</p>
                    </div>
                  )}
                </section>
              </div>
            )}
            {tab === 'records' && (
              <section className="panel records-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">GARDEN JOURNAL</p>
                    <h2>农事记录</h2>
                  </div>
                  <NativeSelect
                    aria-label="筛选地块记录"
                    value={recordFilter}
                    onChange={(e) => setRecordFilter(e.target.value)}
                  >
                    <option value="all">全部地块</option>
                    {[
                      ...new Set([
                        ...plots.map((p) => p.id),
                        ...data.records.map((r) => r.plotId),
                      ]),
                    ].map((id) => (
                      <option value={id} key={id}>
                        地块 {id}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                {data.records
                  .filter(
                    (r) => recordFilter === 'all' || r.plotId === recordFilter,
                  )
                  .map((r) => (
                    <article className="record-row" key={r.id}>
                      <div className="record-icon">
                        <History size={20} />
                      </div>
                      <div>
                        <strong>
                          {r.action} <span>地块 {r.plotId}</span>
                        </strong>
                        <p>
                          {r.note || '未添加备注'}
                          {r.amount != null && ` · ${r.amount} ${r.unit || ''}`}
                          {r.supplyName && ` · 领用${r.supplyName}`}
                        </p>
                        <small>
                          {r.occurredAt
                            ? new Date(r.occurredAt).toLocaleString('zh-CN')
                            : r.time}
                        </small>
                      </div>
                      <Button
                        variant="ghost"
                        aria-label={`删除记录 ${r.id}`}
                        disabled={busy}
                        onClick={() => setConfirm({ kind: 'record', id: r.id })}
                      >
                        <Trash2 size={17} />
                      </Button>
                    </article>
                  ))}
                {!data.records.filter(
                  (r) => recordFilter === 'all' || r.plotId === recordFilter,
                ).length && <p className="empty-state">暂无农事记录。</p>}
              </section>
            )}
          </>
        )}
        <footer className="page-footer">
          <Sprout size={14} /> 一方菜园 <span>认真记录，每一季生长。</span>
        </footer>
      </main>
      {editor && (
        <PlotEditor
          key={`${editor}-${selectedId}`}
          plot={editor === 'create' ? undefined : selected}
          mode={editor}
          nextId={nextId}
          catalog={catalog}
          supplies={data?.supplies || []}
          run={run}
          busy={busy}
          onClose={() => setEditor(null)}
        />
      )}
      {segmentEditorOpen && selected && (
        <SegmentEditor
          key={selected.id}
          plot={selected}
          catalog={catalog}
          run={run}
          busy={busy}
          onClose={() => setSegmentEditorOpen(false)}
        />
      )}
      {action && selected && (
        <ActionEditor
          plot={selected}
          action={action}
          supplies={data?.supplies || []}
          threats={catalog.threats}
          run={run}
          busy={busy}
          onClose={() => {
            setAction(null);
          }}
        />
      )}
      {threatEditor && (
        <ThreatEditor
          key={
            threatEditor === 'create'
              ? 'new-threat'
              : `threat-${threatEditor.id}`
          }
          threat={threatEditor === 'create' ? undefined : threatEditor}
          run={run}
          busy={busy}
          onClose={() => setThreatEditor(null)}
        />
      )}
      {confirm && (
        <Modal
          title={
            confirm.kind === 'archive'
              ? '归档这块地？'
              : confirm.kind === 'threat'
                ? '删除这条病虫害资料？'
                : '删除这条农事记录？'
          }
          description={
            confirm.kind === 'archive'
              ? '地块将从菜园隐藏，二维码会解除绑定。历史种植和农事记录会保留。'
              : confirm.kind === 'threat'
                ? '只会从图鉴中隐藏这条资料，不会删除已经存在的作物病虫害记录。'
                : '如果这条记录领用了库存，对应数量会自动退回。'
          }
          onClose={() => !busy && setConfirm(null)}
        >
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  confirm.kind === 'archive'
                    ? gardenApi.archivePlot(String(confirm.id))
                    : confirm.kind === 'threat'
                      ? gardenApi.deleteThreat(Number(confirm.id))
                      : gardenApi.deleteRecord(Number(confirm.id)),
                confirm.kind === 'threat' ? '病虫害资料已删除' : '操作已完成',
              ).then((ok) => ok && setConfirm(null))
            }
          >
            确认{confirm.kind === 'archive' ? '归档' : '删除'}
          </Button>
        </Modal>
      )}
      {passwordOpen && (
        <Modal
          title="解锁管理操作"
          description="查看页面仍然公开；新增、编辑、删除和库存变更需要4位数字密码。验证后本设备保持30天。"
          onClose={() => {
            if (passwordBusy) return;
            setPasswordOpen(false);
            setPasswordError('');
          }}
        >
          <form onSubmit={submitPassword}>
            <Field label="4位管理密码">
              <input
                autoFocus
                required
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                pattern="[0-9]{4}"
                maxLength={4}
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, '').slice(0, 4))
                }
                placeholder="请输入4位数字"
              />
            </Field>
            {passwordError && (
              <p className="form-error" role="alert">
                {passwordError}
              </p>
            )}
            <Button type="submit" disabled={passwordBusy || pin.length !== 4}>
              {passwordBusy ? '验证中…' : '解锁管理'}
            </Button>
          </form>
        </Modal>
      )}
      {history && (
        <Modal
          title="种植历史"
          description="每一茬种植均独立保留，农事记录可在记录页查看。"
          onClose={() => setHistory(null)}
        >
          {history.map((p) => (
            <article className="history-row" key={p.id}>
              <strong>
                {p.crop} · {p.variety}
              </strong>
              <p className="planting-code">唯一编号：{plantingCode(p.id)}</p>
              <p>
                {p.planted_on} 开始 · {p.stage} ·{' '}
                {p.status === 'active' ? '正在种植' : '已结束'}
                {p.seed_name &&
                  ` · 种子：${p.seed_name}${p.seed_unit ? `（${p.seed_unit}）` : ''}`}
              </p>
              <div className="history-actions">
                <a href={plantingUrl(p.id, typeof window === 'undefined' ? 'http://localhost' : window.location.origin)} target="_blank" rel="noreferrer">打开溯源链接</a>
                <Button variant="outline" onClick={() => { setLabelPlantingId(p.id); setHistory(null); setTab('qr'); }}>制作标签</Button>
              </div>
            </article>
          ))}
        </Modal>
      )}
    </div>
  );
}

function GrowthControl({
  plot,
  catalog,
  busy,
  run,
}: {
  plot: Plot;
  catalog: Catalog;
  busy: boolean;
  run: (fn: () => Promise<unknown>, message: string) => Promise<boolean>;
}) {
  const [stage, setStage] = useState(plot.stage);
  const [moisture, setMoisture] = useState(String(plot.moisture));
  const [health, setHealth] = useState(plot.health);
  const options = [
    ...new Set([
      ...(catalog.vegetables.find((v) => v.name === plot.crop)?.stages ||
        Object.keys(catalog.stages)),
      plot.stage,
    ]),
  ];
  const changed =
    stage !== plot.stage ||
    Number(moisture) !== plot.moisture ||
    health !== plot.health;
  return (
    <section className="growth-control">
      <div className="subheading-row">
        <h3>生长阶段</h3>
        <span className="tag">手动管理</span>
      </div>
      <div className="stage-steps">
        {options.map((s, i) => (
          <span
            key={s}
            title={s}
            className={
              s === stage ? 'current' : i < options.indexOf(stage) ? 'done' : ''
            }
          />
        ))}
      </div>
      <Field label="当前阶段">
        <NativeSelect value={stage} onChange={(e) => setStage(e.target.value)}>
          {options.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </NativeSelect>
      </Field>
      <div className="form-grid">
        <Field label="记录湿度（%）">
          <input
            aria-label="记录湿度"
            type="number"
            min={0}
            max={100}
            value={moisture}
            onChange={(e) => setMoisture(e.target.value)}
          />
        </Field>
        <Field label="健康状态">
          <NativeSelect
            value={health}
            onChange={(e) => setHealth(e.target.value as typeof health)}
          >
            <option>良好</option>
            <option>留意</option>
          </NativeSelect>
        </Field>
      </div>
      <p className="growth-note">
        阶段由你确认，3D 长势随阶段变化。湿度为人工记录值。
      </p>
      <Button
        className="save-growth"
        disabled={
          busy ||
          !changed ||
          moisture === '' ||
          Number(moisture) < 0 ||
          Number(moisture) > 100 ||
          !Number.isInteger(Number(moisture))
        }
        onClick={() =>
          void run(
            () =>
              gardenApi.updatePlot(plot.id, {
                ...(stage !== plot.stage ? { stage } : {}),
                moisture: Number(moisture),
                health,
              }),
            '生长状态已更新',
          )
        }
      >
        <Check size={16} />
        保存生长状态
      </Button>
    </section>
  );
}

class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-loading">
        <Leaf size={32} />
        <p>此设备暂时无法显示 3D 场景</p>
        <span>可以继续使用下方地块卡片管理菜园。</span>
      </div>
    ) : (
      this.props.children
    );
  }
}

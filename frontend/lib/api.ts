import type { PlotKind } from './crop-kinds';

export type { PlotKind };
export type SceneWeather = 'sunny' | 'rain' | 'mist';

export type PlotSegment = {
  lengthM: number;
  crop: string;
  kind: PlotKind;
  stage: string;
};

export type Plot = {
  id: string;
  name: string;
  crop: string;
  variety: string;
  kind: PlotKind;
  stage: string;
  day: number;
  plantedOn: string;
  progress: number;
  health: '良好' | '留意';
  moisture: number;
  plantCount: number;
  areaM2: number;
  position: { x: number; z: number };
  size: { width: number; depth: number };
  segments: PlotSegment[];
  soilType: string;
  note: string;
  lastAction: string;
  imageUrl: string;
  cropImageUrl: string;
  seedSupplyId: number | null;
  seedName: string;
  seedUnit: string;
};

export type RecordItem = {
  id: number;
  plotId: string;
  action: string;
  time: string;
  occurredAt?: string;
  note: string;
  amount?: number | null;
  unit?: string | null;
  supplyName?: string | null;
  supplyUnit?: string | null;
};

export type WeatherDetail = {
  date: string;
  scene: SceneWeather;
  condition: string;
  temperatureMin: number | null;
  temperatureMax: number | null;
  rainfallMm: number;
  windKmh: number;
  humidity: number | null;
  sunrise: string | null;
  sunset: string | null;
  isDay: boolean;
  source: string;
  fetchedAt: string;
  warning?: string;
};

export type AdminSession = {
  authenticated: boolean;
  expiresAt: string | null;
  maxAgeDays: number;
};

export type TaskItem = {
  plot: string;
  title: string;
  note: string;
  tone: 'warning' | 'normal' | 'good';
};

export type IssueItem = {
  id: number;
  plotId: string;
  kind: 'pest' | 'disease' | 'weed';
  name: string;
  severity: string;
  symptoms: string;
  treatment: string;
  status: 'open' | 'monitoring' | 'resolved';
};

export type SupplyItem = {
  id: number;
  name: string;
  category: 'fertilizer' | 'pesticide' | 'tool' | 'seed';
  stock: number;
  unit: string;
  safeIntervalDays: number;
  note: string;
  imageUrl: string;
};

export type GrowthPhoto = {
  id: number;
  plotId: string;
  plantingId: number | null;
  crop: string;
  imageUrl: string;
  note: string;
  takenAt: string;
  createdAt: string;
};

export type SupplyImage = {
  id: number;
  supplyId: number | null;
  supplyName: string;
  imageUrl: string;
  note: string;
  createdAt: string;
};

export type Dashboard = {
  gardenName: string;
  plots: Plot[];
  records: RecordItem[];
  qrBindings: Record<string, string>;
  weather: WeatherDetail;
  tasks: TaskItem[];
  issues: IssueItem[];
  supplies: SupplyItem[];
};

export type PlotInput = {
  id: string;
  name: string;
  crop: string;
  variety: string;
  kind: PlotKind;
  stage: string;
  planted_on?: string;
  progress?: number;
  health?: '良好' | '留意';
  moisture?: number;
  plant_count?: number;
  area_m2?: number;
  width_m?: number;
  depth_m?: number;
  position_x?: number;
  position_z?: number;
  soil_type?: string;
  note?: string;
  image_url?: string;
  crop_image_url?: string;
  seed_supply_id?: number;
};

export type UploadCategory =
  | 'plots'
  | 'crops'
  | 'supplies'
  | 'growth'
  | 'threats';

export type UploadToken = {
  uploadUrl: string;
  token: string;
  key: string;
  publicUrl: string;
  publicBaseUrl: string;
  contentType: string;
  maxBytes: number;
  expiresAt: string;
  bucket: string;
  region: string;
};

export type CompressedImageUpload = {
  url: string;
  contentType: 'image/webp';
  size: number;
  sourceSize: number;
  width: number;
  height: number;
};

const API_ROOT = '/api/v1';

type PreviewData = {
  dashboard: Dashboard;
  catalog: Catalog;
  plantings: PlantingHistory[];
  traces: Record<string, PlantingTrace>;
};

let previewDataPromise: Promise<PreviewData> | null = null;

export function isStaticPreview(): boolean {
  return typeof window !== 'undefined' &&
    window.location.hostname.endsWith('.chatgpt.site');
}

async function previewRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (init?.method && init.method.toUpperCase() !== 'GET') {
    throw new Error('免费网站预览使用演示数据，无法保存修改。');
  }
  previewDataPromise ??= fetch('/preview-data.json').then((response) => {
    if (!response.ok) throw new Error('演示数据加载失败');
    return response.json() as Promise<PreviewData>;
  }).catch((error) => {
    previewDataPromise = null;
    throw error;
  });
  const demo = await previewDataPromise;
  let result: unknown;
  if (path === '/dashboard') result = demo.dashboard;
  else if (path === '/catalog') result = demo.catalog;
  else if (path === '/plantings') result = demo.plantings;
  else if (path === '/auth/session') result = { authenticated: false, expiresAt: null, maxAgeDays: 0 };
  else if (path === '/weather/today') result = demo.dashboard.weather;
  else if (path === '/stock-movements') result = [];
  else {
    const trace = /^\/plantings\/(\d+)\/trace$/.exec(path);
    const history = /^\/plots\/([^/]+)\/plantings$/.exec(path);
    const photos = /^\/plots\/([^/]+)\/growth-photos$/.exec(path);
    const images = /^\/supplies\/\d+\/images$/.exec(path);
    const qr = /^\/qr\/(.+)$/.exec(path);
    if (trace) result = demo.traces[trace[1]];
    else if (history) result = demo.plantings.filter((item) => item.plot_id === history[1]);
    else if (photos || images) result = [];
    else if (qr) {
      const code = decodeURIComponent(qr[1]);
      const plotId = demo.dashboard.qrBindings[code] || null;
      result = { code, plotId, status: plotId ? 'bound' : 'unbound' };
    }
  }
  if (result === undefined) throw new Error('演示记录不存在');
  return result as T;
}

export class AdminAuthRequiredError extends Error {
  constructor(message = '请先输入4位管理密码') {
    super(message);
    this.name = 'AdminAuthRequiredError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (isStaticPreview()) return previewRequest<T>(path, init);
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: string | Array<{ msg: string }>;
    } | null;
    const message =
      typeof body?.detail === 'string'
        ? body.detail
        : body?.detail?.map((item) => item.msg).join('；') ||
          `请求失败（${response.status}）`;
    if (response.status === 401) throw new AdminAuthRequiredError(message);
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function uploadImage(
  category: UploadCategory,
  ownerId: string,
  file: File,
): Promise<CompressedImageUpload> {
  if (isStaticPreview()) throw new Error('免费网站预览使用演示数据，无法上传图片。');
  const search = new URLSearchParams({
    category,
    owner_id: ownerId || 'general',
    filename: file.name || 'image',
  });
  const response = await fetch(`${API_ROOT}/media/upload?${search}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
    credentials: 'include',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: string | Array<{ msg: string }>;
    } | null;
    const message =
      typeof body?.detail === 'string'
        ? body.detail
        : body?.detail?.map((item) => item.msg).join('；') ||
          `图片上传失败（${response.status}）`;
    if (response.status === 401) throw new AdminAuthRequiredError(message);
    throw new Error(message);
  }
  return response.json() as Promise<CompressedImageUpload>;
}

export const gardenApi = {
  dashboard: () => request<Dashboard>('/dashboard'),
  authSession: () => request<AdminSession>('/auth/session'),
  login: (pin: string) =>
    request<AdminSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
  logout: () =>
    request<{ authenticated: false }>('/auth/logout', { method: 'POST' }),
  createRecord: (payload: {
    plotId: string;
    action: string;
    note: string;
    amount?: number;
    unit?: string;
    supplyId?: number;
  }) =>
    request<RecordItem>('/records', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteRecord: (recordId: number) =>
    request<void>(`/records/${recordId}`, { method: 'DELETE' }),
  bindQr: (code: string, plotId: string) =>
    request<{ code: string; plotId: string; status: string }>(`/qr/${code}`, {
      method: 'PUT',
      body: JSON.stringify({ plotId }),
    }),
  unbindQr: (code: string) =>
    request<{ code: string; status: string }>(`/qr/${code}`, {
      method: 'DELETE',
    }),
  lookupQr: (code: string) =>
    request<{ code: string; plotId: string | null; status: string }>(
      `/qr/${code}`,
    ),
  createPlot: (payload: PlotInput) =>
    request<Plot>('/plots', { method: 'POST', body: JSON.stringify(payload) }),
  updatePlot: (plotId: string, payload: Partial<PlotInput>) =>
    request<Plot>(`/plots/${plotId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updatePlotSegments: (plotId: string, segments: PlotSegment[]) =>
    request<Plot>(`/plots/${plotId}/segments`, {
      method: 'PUT',
      body: JSON.stringify({ segments }),
    }),
  archivePlot: (plotId: string) =>
    request<void>(`/plots/${plotId}`, { method: 'DELETE' }),
  createIssue: (payload: {
    plotId: string;
    kind: 'pest' | 'disease' | 'weed';
    name: string;
    severity: string;
    symptoms?: string;
    treatment?: string;
  }) =>
    request<IssueItem>('/issues', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resolveIssue: (issueId: number) =>
    request<IssueItem>(`/issues/${issueId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved' }),
    }),
  updateSupply: (
    supplyId: number,
    payload: {
      name?: string;
      category?: SupplyItem['category'];
      stock?: number;
      unit?: string;
      safe_interval_days?: number;
      note?: string;
      image_url?: string;
    },
  ) =>
    request<SupplyItem>(`/supplies/${supplyId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteSupply: (supplyId: number) =>
    request<void>(`/supplies/${supplyId}`, { method: 'DELETE' }),
  deleteMovement: (movementId: number) =>
    request<void>(`/stock-movements/${movementId}`, { method: 'DELETE' }),
  mediaUploadToken: (payload: {
    category: UploadCategory;
    owner_id: string;
    filename: string;
    content_type: string;
    size: number;
  }) =>
    request<UploadToken>('/media/upload-token', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  uploadImage: (category: UploadCategory, ownerId: string, file: File) =>
    uploadImage(category, ownerId, file),
  todayWeather: () => request<WeatherDetail>('/weather/today'),
  refreshWeather: () =>
    request<WeatherDetail>('/weather/refresh', { method: 'POST' }),
  createThreat: (payload: ThreatPayload) =>
    request<ThreatLibraryItem>('/threats', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateThreat: (threatId: number, payload: Partial<ThreatPayload>) =>
    request<ThreatLibraryItem>(`/threats/${threatId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteThreat: (threatId: number) =>
    request<void>(`/threats/${threatId}`, { method: 'DELETE' }),
  catalog: () => request<Catalog>('/catalog'),
  parseReceipt: (text: string) =>
    request<Receipt[]>('/supplies/parse', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  receiveStock: (items: Receipt[]) =>
    request<unknown>('/supplies/receive', {
      method: 'POST',
      body: JSON.stringify(items),
    }),
  moveStock: (id: number, delta: number, reason: string) =>
    request<unknown>(`/supplies/${id}/movements`, {
      method: 'POST',
      body: JSON.stringify({ delta, reason }),
    }),
  movements: () => request<StockMovement[]>('/stock-movements'),
  startPlanting: (id: string, payload: PlotInput) =>
    request<Plot>(`/plots/${id}/plantings`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  plantingHistory: (id: string) =>
    request<PlantingHistory[]>(`/plots/${id}/plantings`),
  plantings: () => request<PlantingHistory[]>('/plantings'),
  plantingTrace: (id: number) =>
    request<PlantingTrace>(`/plantings/${id}/trace`),
  growthPhotos: (id: string) =>
    request<GrowthPhoto[]>(`/plots/${id}/growth-photos`),
  createGrowthPhoto: (
    id: string,
    payload: { image_url: string; note?: string; taken_at?: string },
  ) =>
    request<GrowthPhoto>(`/plots/${id}/growth-photos`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteGrowthPhoto: (photoId: number) =>
    request<void>(`/growth-photos/${photoId}`, { method: 'DELETE' }),
  supplyImages: (id: number) =>
    request<SupplyImage[]>(`/supplies/${id}/images`),
  createSupplyImage: (
    id: number,
    payload: { image_url: string; note?: string },
  ) =>
    request<SupplyImage>(`/supplies/${id}/images`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteSupplyImage: (imageId: number) =>
    request<void>(`/supply-images/${imageId}`, { method: 'DELETE' }),
};

export type Receipt = {
  name: string;
  category: SupplyItem['category'];
  stock: number;
  unit: string;
  note?: string;
  image_url?: string;
};
export type StockMovement = {
  id: number;
  supply_id: number | null;
  supply_name: string;
  supply_unit: string;
  name: string;
  delta: number;
  balance: number;
  unit: string;
  reason: string;
  created_at: string;
  record_id: number | null;
};
export type Catalog = {
  vegetables: Array<{
    name: string;
    kind: PlotKind;
    stages: string[];
    days: number;
  }>;
  threats: ThreatLibraryItem[];
  stages: Record<string, number>;
};
export type ThreatLibraryItem = {
  id: number;
  kind: 'pest' | 'disease' | 'weed';
  name: string;
  aliases: string[];
  crops: string[];
  symptoms: string;
  suggestion: string;
  season: string;
  severity: '轻微' | '中等' | '严重';
  imageUrl: string;
  sourceUrl: string;
  imageCredit: string;
  license: string;
};
export type ThreatPayload = {
  kind: 'pest' | 'disease';
  name: string;
  aliases: string[];
  crops: string[];
  symptoms: string;
  suggestion: string;
  season: string;
  severity: '轻微' | '中等' | '严重';
  image_url: string;
  source_url: string;
  image_credit: string;
  license: string;
};
export type PlantingHistory = {
  id: number;
  plot_id: string;
  crop: string;
  variety: string;
  stage: string;
  planted_on: string;
  status: string;
  expected_harvest_on?: string | null;
  plant_count?: number;
  note?: string;
  image_url?: string;
  seed_name?: string;
  seed_unit?: string;
};

export type PlantingTrace = {
  planting: PlantingHistory & { plot_name: string };
  records: RecordItem[];
  photos: GrowthPhoto[];
};

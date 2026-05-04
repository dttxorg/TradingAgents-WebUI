import type {
  BacktestRecord,
  BacktestRecordList,
  BacktestRunResponse,
  BacktestScheduleConfig,
  BacktestTickerSummary,
  BatchRunResponse,
  BootstrapStatus,
  HistoricalReport,
  Metadata,
  ModelFetchResponse,
  OrderListResponse,
  OrderRecord,
  PricingConfig,
  PublicPricing,
  ReportHistoryList,
  ReportsPayload,
  RunInfo,
  RunListResponse,
  SecretStatus,
  SessionResponse,
  User,
  UserListResponse,
  WebConfig,
} from './types';

function formatErrorValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => formatErrorValue(item))
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.join('\n') : null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const message = formatErrorValue(record.message ?? record.msg ?? record.error);
    if (message) {
      const location = Array.isArray(record.loc)
        ? record.loc
            .map((item) => String(item))
            .filter((item) => item !== 'body')
            .join('.')
        : '';
      return location ? `${location}: ${message}` : message;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function apiErrorMessage(body: string, statusText: string): string {
  if (!body) return statusText;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed === 'object' && parsed !== null && ('detail' in parsed || 'message' in parsed || 'error' in parsed)) {
      return formatErrorValue((parsed as Record<string, unknown>).detail ?? (parsed as Record<string, unknown>).message ?? (parsed as Record<string, unknown>).error) ?? statusText;
    }
    return formatErrorValue(parsed) ?? statusText;
  } catch {
    return body;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    credentials: 'same-origin',
    ...options,
  });
  if (!response.ok) {
    const body = await response.text();
    const message = apiErrorMessage(body, response.statusText);
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  bootstrapStatus: () => request<BootstrapStatus>('/api/auth/bootstrap/status'),
  bootstrap: (payload: { username: string; password: string; displayName?: string | null; initialBalance?: string }) =>
    request<SessionResponse>('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(payload) }),
  login: (username: string, password: string) =>
    request<SessionResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ status: string }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<SessionResponse>('/api/auth/me'),
  metadata: () => request<Metadata>('/api/metadata'),
  config: () => request<WebConfig>('/api/config'),
  saveConfig: (config: WebConfig) =>
    request<WebConfig>('/api/config', { method: 'PUT', body: JSON.stringify(config) }),
  secretStatus: () => request<SecretStatus>('/api/secrets/status'),
  saveSecrets: (values: Record<string, string>) =>
    request<SecretStatus>('/api/secrets', {
      method: 'PUT',
      body: JSON.stringify({ values }),
    }),
  createRun: (config: WebConfig) =>
    request<RunInfo>('/api/runs', {
      method: 'POST',
      body: JSON.stringify({
        ticker: config.ticker,
        analysisDate: config.analysisDate,
        config,
      }),
    }),
  createBatchRuns: (tickers: string[], config: WebConfig) =>
    request<BatchRunResponse>('/api/runs/batch', {
      method: 'POST',
      body: JSON.stringify({
        tickers,
        analysisDate: config.analysisDate,
        config,
      }),
    }),
  run: (id: string) => request<RunInfo>(`/api/runs/${id}`),
  runs: (activeOnly = false) => request<RunListResponse>(`/api/runs?activeOnly=${activeOnly ? 'true' : 'false'}`),
  cancelRun: (id: string) =>
    request<RunInfo>(`/api/runs/${id}/cancel`, {
      method: 'POST',
    }),
  reports: (id: string) => request<ReportsPayload>(`/api/runs/${id}/reports`),
  reportHistory: (limit = 50) => request<ReportHistoryList>(`/api/reports/history?limit=${limit}`),
  historicalReport: (id: string) => request<HistoricalReport>(`/api/reports/history/${encodeURIComponent(id)}`),
  fetchModels: (provider: string, baseUrl: string | null) =>
    request<ModelFetchResponse>('/api/models/fetch', {
      method: 'POST',
      body: JSON.stringify({ provider, baseUrl }),
    }),
  publicPricing: () => request<PublicPricing>('/api/billing/pricing/public'),
  orders: (limit = 100) => request<OrderListResponse>(`/api/billing/orders?limit=${limit}`),
  adminUsers: () => request<UserListResponse>('/api/admin/users'),
  adminCreateUser: (payload: { username: string; password: string; displayName?: string | null; role: 'admin' | 'user'; initialBalance: string; isActive?: boolean }) =>
    request<User>('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  adminUpdateUser: (id: string, payload: Partial<{ displayName: string | null; role: 'admin' | 'user'; isActive: boolean; password: string | null }>) =>
    request<User>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  adminRechargeUser: (id: string, payload: { amount: string; externalOrderId?: string | null; note?: string | null }) =>
    request<OrderRecord>(`/api/admin/users/${encodeURIComponent(id)}/recharge`, { method: 'POST', body: JSON.stringify(payload) }),
  adminPricing: () => request<PricingConfig>('/api/admin/billing/pricing'),
  adminSavePricing: (pricing: PricingConfig) =>
    request<PricingConfig>('/api/admin/billing/pricing', { method: 'PUT', body: JSON.stringify(pricing) }),
  adminOrders: (limit = 200) => request<OrderListResponse>(`/api/admin/orders?limit=${limit}`),
  backtestConfig: () => request<BacktestScheduleConfig>('/api/backtests/config'),
  saveBacktestConfig: (config: BacktestScheduleConfig) =>
    request<BacktestScheduleConfig>('/api/backtests/config', { method: 'PUT', body: JSON.stringify(config) }),
  runBacktests: (payload: { runId?: string | null; ticker?: string | null; limit?: number }) =>
    request<BacktestRunResponse>('/api/backtests/run', { method: 'POST', body: JSON.stringify(payload) }),
  runBacktestRecord: (runId: string) =>
    request<BacktestRecord>(`/api/backtests/records/${encodeURIComponent(runId)}/run`, { method: 'POST' }),
  backtestRecord: (runId: string) => request<BacktestRecord>(`/api/backtests/records/${encodeURIComponent(runId)}`),
  backtestRecords: (ticker?: string | null, limit = 100) =>
    request<BacktestRecordList>(`/api/backtests/records?limit=${limit}${ticker ? `&ticker=${encodeURIComponent(ticker)}` : ''}`),
  backtestSummary: (ticker: string) => request<BacktestTickerSummary>(`/api/backtests/summary/${encodeURIComponent(ticker)}`),
};

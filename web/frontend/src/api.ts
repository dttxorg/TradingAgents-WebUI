import type { BatchRunResponse, HistoricalReport, Metadata, ModelFetchResponse, ReportHistoryList, ReportsPayload, RunInfo, RunListResponse, SecretStatus, WebConfig } from './types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || response.statusText);
  }
  return response.json() as Promise<T>;
}

export const api = {
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
};

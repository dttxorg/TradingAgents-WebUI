import type { HistoricalReport, Metadata, ReportHistoryList, ReportsPayload, RunInfo, SecretStatus, WebConfig } from './types';

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
  run: (id: string) => request<RunInfo>(`/api/runs/${id}`),
  reports: (id: string) => request<ReportsPayload>(`/api/runs/${id}/reports`),
  reportHistory: (limit = 50) => request<ReportHistoryList>(`/api/reports/history?limit=${limit}`),
  historicalReport: (id: string) => request<HistoricalReport>(`/api/reports/history/${encodeURIComponent(id)}`),
};

export type Option<T = string> = {
  label: string;
  value: T;
  description?: string;
  defaultBaseUrl?: string | null;
  apiKeyField?: string | null;
  modelFetch?: string;
  region?: 'global' | 'china' | 'local' | 'custom' | string;
  options?: string[];
  key?: string;
};

export type Metadata = {
  analysts: Option[];
  researchDepths: Option<number>[];
  providers: Option[];
  models: Record<string, Record<'quick' | 'deep', Option[]>>;
  languages: Option[];
  dataVendorCategories: Array<{ key: string; label: string; options: string[] }>;
  customDataMethods: Array<{ method: string; category: string; label: string; defaultPath: string }>;
  secretFields: string[];
};

export type CustomDataInterface = {
  baseUrl: string | null;
  endpoints: Record<string, string>;
};

export type WebConfig = {
  ticker: string;
  analysisDate: string;
  outputLanguage: string;
  analysts: string[];
  researchDepth: 1 | 3 | 5;
  llmProvider: string;
  backendUrl: string | null;
  quickThinkLlm: string;
  deepThinkLlm: string;
  googleThinkingLevel: string | null;
  openaiReasoningEffort: string | null;
  anthropicEffort: string | null;
  checkpointEnabled: boolean;
  maxRecurLimit: number;
  dataVendors: Record<string, string>;
  customDataInterfaces: Record<string, CustomDataInterface>;
};

export type SecretStatus = Record<string, { configured: boolean; masked: string | null }>;

export type RunInfo = {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  ticker: string;
  analysisDate: string;
  submittedAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  error?: string | null;
  decision?: string | null;
  stats: Record<string, number>;
};

export type RunEvent = {
  id: number;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

export type ReportsPayload = {
  runId: string;
  reports: Record<string, unknown>;
  finalReport?: string | null;
  decision?: string | null;
};

export type ReportHistoryItem = {
  runId: string;
  ticker: string;
  analysisDate: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  submittedAt: string;
  endedAt?: string | null;
  decision?: string | null;
  provider: string;
  outputLanguage: string;
  analysts: string[];
  researchDepth: number;
  stats: Record<string, number>;
  archivedAt: string;
};

export type ReportHistoryList = {
  items: ReportHistoryItem[];
};

export type HistoricalReport = {
  schemaVersion: number;
  archivedAt: string;
  run: RunInfo;
  config: WebConfig;
  reports: Record<string, unknown>;
  finalReport?: string | null;
  decision?: string | null;
};

export type ModelFetchResponse = {
  provider: string;
  baseUrl?: string | null;
  source: string;
  models: Array<{ label: string; value: string }>;
};

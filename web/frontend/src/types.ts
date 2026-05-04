export type Option<T = string> = {
  label: string;
  value: T;
  description?: string;
  defaultBaseUrl?: string | null;
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

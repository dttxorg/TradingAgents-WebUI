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
  stockMarkets: Array<{ key: string; label: string; description: string }>;
  providers: Option[];
  models: Record<string, Record<'quick' | 'deep', Option[]>>;
  languages: Option[];
  deepseekThinkingModes: Option<'default' | 'enabled' | 'disabled'>[];
  dataVendorCategories: Array<{ key: string; label: string; options: string[] }>;
  customDataMethods: Array<{ method: string; category: string; label: string; defaultPath: string }>;
  llmRouteTargets: Array<{
    key: string;
    label: string;
    stage: string;
    defaultModelRole: 'quick' | 'deep';
    parallelizable: boolean;
    apiKeyField: string;
    description: string;
  }>;
  secretFields: string[];
};

export type CustomDataInterface = {
  baseUrl: string | null;
  endpoints: Record<string, string>;
};

export type LLMRouteConfig = {
  enabled: boolean;
  provider: string | null;
  backendUrl: string | null;
  modelId: string | null;
};

export type MarketProfileConfig = {
  region: string;
  appendRegionSuffix: boolean;
  weight: string;
  marketProfile: string;
};

export type WebConfig = {
  ticker: string;
  analysisDate: string;
  stockMarket: string;
  marketProfiles: Record<string, MarketProfileConfig>;
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
  deepseekThinkingMode: 'default' | 'enabled' | 'disabled';
  checkpointEnabled: boolean;
  maxRecurLimit: number;
  maxParallelRuns: number;
  parallelInitialAnalysts: boolean;
  dataVendors: Record<string, string>;
  toolVendors: Record<string, string>;
  llmRoutes: Record<string, LLMRouteConfig>;
  customDataInterfaces: Record<string, CustomDataInterface>;
};

export type SecretStatus = Record<string, { configured: boolean; masked: string | null }>;

export type UserRole = 'admin' | 'user';

export type User = {
  id: string;
  username: string;
  displayName?: string | null;
  role: UserRole;
  balance: string;
  frozenBalance: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SessionResponse = {
  user: User;
};

export type BootstrapStatus = {
  required: boolean;
};

export type BillingMode = 'token' | 'per_run' | 'hybrid';

export type PricingConfig = {
  currency: string;
  billingMode: BillingMode;
  tokenMultiplier: string;
  inputTokenPricePer1m: string;
  outputTokenPricePer1m: string;
  fixedRunPrice: string;
  minimumRunCharge: string;
  preauthMultiplier: string;
  preauthFloor: string;
  depthMultipliers: Record<string, string>;
  fixedPricesByDepth: Record<string, string>;
  estimatedInputTokensByDepth: Record<string, number>;
  estimatedOutputTokensByDepth: Record<string, number>;
  modelPriceOverrides: Record<string, { inputTokenPricePer1m?: string | null; outputTokenPricePer1m?: string | null; multiplier?: string | null }>;
};

export type PublicPricing = Pick<
  PricingConfig,
  'currency' | 'billingMode' | 'tokenMultiplier' | 'inputTokenPricePer1m' | 'outputTokenPricePer1m' | 'fixedRunPrice' | 'minimumRunCharge' | 'depthMultipliers' | 'fixedPricesByDepth'
>;

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  llmCalls: number;
  toolCalls: number;
};

export type RunBilling = {
  orderId: string;
  status: string;
  currency: string;
  preauthorizedAmount: string;
  actualAmount: string;
  refundedAmount: string;
  overageAmount: string;
  balanceAfter?: string | null;
  usage: TokenUsage;
};

export type OrderRecord = {
  id: string;
  userId: string;
  type: 'analysis' | 'recharge' | 'adjustment';
  status: string;
  currency: string;
  amount: string;
  frozenAmount: string;
  actualAmount: string;
  refundedAmount: string;
  overageAmount: string;
  balanceAfter?: string | null;
  runId?: string | null;
  externalOrderId?: string | null;
  description?: string | null;
  usage: TokenUsage;
  pricingSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type OrderListResponse = {
  orders: OrderRecord[];
};

export type UserListResponse = {
  users: User[];
};

export type RunInfo = {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  ticker: string;
  analysisDate: string;
  userId?: string | null;
  orderId?: string | null;
  submittedAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  error?: string | null;
  decision?: string | null;
  stats: Record<string, number>;
  billing?: RunBilling | null;
};

export type BatchRunResponse = {
  runs: RunInfo[];
};

export type RunListResponse = {
  runs: RunInfo[];
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
  userId?: string | null;
  ticker: string;
  analysisDate: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
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

export type BacktestScheduleConfig = {
  enabled: boolean;
  intervalMinutes: number;
  reviewWindowDays: number;
  maxReportsPerCycle: number;
  checkpointEnabled: boolean;
  priceDataSource: 'yfinance' | 'custom';
  customBaseUrl?: string | null;
  customEndpoint: string;
};

export type BacktestRecord = {
  id: string;
  runId: string;
  userId?: string | null;
  ticker: string;
  analysisDate: string;
  status: 'pending' | 'running' | 'waiting_data' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  lastCheckpoint?: string | null;
  resumeCount: number;
  error?: string | null;
  plan: {
    decision?: string | null;
    entryPlan?: string | null;
    stopPlan?: string | null;
    targetPlan?: string | null;
    positionPlan?: string | null;
    riskPlan?: string | null;
    observationOrder: string[];
    assumptions: string[];
    entryLevels: number[];
    stopLevels: number[];
    targetLevels: number[];
    stopOffset?: number | null;
    action: 'buy' | 'sell' | 'hold' | 'unknown';
    needsManualReview: boolean;
  };
  result: {
    outcome: 'target_hit' | 'stop_hit' | 'entry_not_hit' | 'ambiguous' | 'manual_review' | 'waiting_data' | 'not_actionable';
    entryHit?: boolean | null;
    entryHitDate?: string | null;
    entryHitPrice?: number | null;
    targetHit?: boolean | null;
    targetHitDate?: string | null;
    targetHitPrice?: number | null;
    stopHit?: boolean | null;
    stopHitDate?: string | null;
    stopHitPrice?: number | null;
    barsChecked: number;
    priceSource?: string | null;
    notes: string[];
  };
  checkpoints: Array<{ key: string; status: string; updatedAt: string; message?: string | null }>;
};

export type BacktestRunResponse = {
  records: BacktestRecord[];
  skippedCompleted: number;
};

export type BacktestRecordList = {
  records: BacktestRecord[];
};

export type BacktestTickerSummary = {
  ticker: string;
  totalReports: number;
  recordsTotal: number;
  completedRecords: number;
  pendingRecords: number;
  actionableRecords: number;
  entryHits: number;
  targetHits: number;
  stopHits: number;
  ambiguous: number;
  manualReview: number;
  waitingData: number;
};

export type ModelFetchResponse = {
  provider: string;
  baseUrl?: string | null;
  source: string;
  models: Array<{ label: string; value: string }>;
};

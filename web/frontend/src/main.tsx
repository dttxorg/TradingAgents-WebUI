import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import {
  Activity,
  ArrowUp,
  BadgeCheck,
  BarChart3,
  Bot,
  Brain,
  Check,
  CircleAlert,
  CircleDot,
  Copy,
  CreditCard,
  Database,
  Download,
  FileText,
  Filter,
  Gauge,
  History,
  KeyRound,
  Languages,
  Lightbulb,
  ListOrdered,
  LogIn,
  Loader2,
  Maximize2,
  Play,
  Printer,
  RefreshCw,
  ReceiptText,
  Save,
  Search,
  Server,
  Settings2,
  Square,
  TerminalSquare,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { api } from './api';
import type {
  AnalysisEstimate,
  BacktestRecord,
  BacktestScheduleConfig,
  BacktestTickerSummary,
  HistoricalReport,
  Metadata,
  OrderRecord,
  PricingConfig,
  PublicPricing,
  ReportHistoryItem,
  ReportsPayload,
  RunEvent,
  RunInfo,
  SecretStatus,
  User,
  WebConfig,
} from './types';
import {
  ashareFundamentalsBaseUrlFromConfig,
  ashareFundamentalsMarkets,
  configForBackend,
  hydrateLongbridgeProxyConfig,
  isAshareFundamentalsVendor,
  isCustomLikeDataVendor,
  isLongbridgeProxyBaseUrl,
  isLongbridgeProxyVendor,
  longbridgeProxyCategories,
  marketDataOverride,
  normalizeDisplayVendor,
  syncAshareFundamentalsBaseUrl,
  syncLongbridgeProxyBaseUrl,
  updateMarketCustomDataBaseUrl,
  updateMarketCustomDataEndpoint,
  updateMarketDataVendor,
  updateMarketToolVendor,
  vendorOptions,
} from './configMapping';
import './styles.css';
import { messages, type Locale } from './i18n/messages';
import { Field } from './components/Field';

type ViewMode = 'workspace' | 'settings';
type SettingsSection = 'model' | 'market' | 'data' | 'routes' | 'backtest' | 'billing' | 'users';
type HistoryFilters = { query: string; ticker: string; status: string; provider: string; date: string };
type ImportMetaWithEnv = ImportMeta & { env?: Record<string, string | undefined> };

const LONGBRIDGE_PROXY_ENV =
  ((import.meta as ImportMetaWithEnv).env?.VITE_LONGBRIDGE_PROXY_URL ?? '').trim();
const ASHARE_FUNDAMENTALS_ENV =
  ((import.meta as ImportMetaWithEnv).env?.VITE_ASHARE_FUNDAMENTALS_URL ?? '').trim();

const analystLabels: Record<Locale, Record<string, string>> = {
  en: {},
  zh: {
    market: '市场分析师',
    social: '社交情绪分析师',
    news: '新闻分析师',
    fundamentals: '基本面分析师',
  },
};

const dataVendorLabels: Record<Locale, Record<string, string>> = {
  en: {},
  zh: {
    core_stock_apis: '核心股票接口',
    technical_indicators: '技术指标',
    fundamental_data: '基本面数据',
    news_data: '新闻数据',
  },
};

const stockMarketLabels: Record<Locale, Record<string, string>> = {
  en: {},
  zh: {
    us: '美股',
    hk: '港股',
    sh: '上证',
    sz: '深证',
  },
};

const customMethodLabels: Record<Locale, Record<string, string>> = {
  en: {},
  zh: {
    get_stock_data: '股票价格',
    get_indicators: '技术指标',
    get_fundamentals: '基本面摘要',
    get_balance_sheet: '资产负债表',
    get_cashflow: '现金流量表',
    get_income_statement: '利润表',
    get_news: '个股新闻',
    get_global_news: '全球新闻',
    get_insider_transactions: '内部交易',
  },
};

const reportLabels: Record<Locale, Record<string, string>> = {
  en: {},
  zh: {
    market_report: '市场分析',
    sentiment_report: '情绪分析',
    news_report: '新闻分析',
    fundamentals_report: '基本面分析',
    investment_debate_state: '研究辩论',
    investment_plan: '研究结论',
    trader_investment_plan: '交易计划',
    risk_debate_state: '风险辩论',
    final_trade_decision: '最终交易决策',
    buffett_review: '巴菲特视角参考',
    munger_review: '芒格视角参考',
  },
};

const eventLabels: Record<Locale, Record<string, string>> = {
  en: {},
  zh: {
    status: '状态',
    progress: '进度',
    message: '消息',
    tool: '工具',
    llm: '模型',
    configuration: '配置',
    reports: '报告',
  },
};

const agentLabels: Record<Locale, Record<string, string>> = {
  en: {},
  zh: {
    'Market Analyst': '市场分析师',
    'Social Analyst': '社交情绪分析师',
    'News Analyst': '新闻分析师',
    'Fundamentals Analyst': '基本面分析师',
    'Bull Researcher': '多头研究员',
    'Bear Researcher': '空头研究员',
    'Research Manager': '研究经理',
    Trader: '交易员',
    'Aggressive Analyst': '激进风险分析师',
    'Neutral Analyst': '中性风险分析师',
    'Conservative Analyst': '保守风险分析师',
    'Portfolio Manager': '组合经理',
    'Buffett Reviewer': '巴菲特参考评审',
    'Munger Reviewer': '芒格参考评审',
    'Buffett Reference Reviewer': '巴菲特参考评审',
    'Munger Reference Reviewer': '芒格参考评审',
  },
};

const emptyMetadata: Metadata = {
  analysts: [],
  researchDepths: [],
  stockMarkets: [],
  providers: [],
  models: {},
  languages: [],
  deepseekThinkingModes: [],
  dataVendorCategories: [],
  customDataMethods: [],
  llmRouteTargets: [],
  secretFields: [],
};

function detectLocale(): Locale {
  const saved = window.localStorage.getItem('tradingagents-webui-locale');
  if (saved === 'en' || saved === 'zh') return saved;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function App() {
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const [activeView, setActiveView] = useState<ViewMode>('workspace');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('model');
  const [authChecked, setAuthChecked] = useState(false);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [metadata, setMetadata] = useState<Metadata>(emptyMetadata);
  const [config, setConfig] = useState<WebConfig | null>(null);
  const [tickerList, setTickerList] = useState('');
  const [secretStatus, setSecretStatus] = useState<SecretStatus>({});
  const [publicPricing, setPublicPricing] = useState<PublicPricing | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminPricing, setAdminPricing] = useState<PricingConfig | null>(null);
  const [backtestConfig, setBacktestConfig] = useState<BacktestScheduleConfig | null>(null);
  const [backtestRecord, setBacktestRecord] = useState<BacktestRecord | null>(null);
  const [backtestSummary, setBacktestSummary] = useState<BacktestTickerSummary | null>(null);
  const [modelPriceDraft, setModelPriceDraft] = useState('');
  const [adminOrders, setAdminOrders] = useState<OrderRecord[]>([]);
  const [newUserDraft, setNewUserDraft] = useState({ username: '', password: '', displayName: '', role: 'user' as 'admin' | 'user', initialBalance: '0' });
  const [rechargeDraft, setRechargeDraft] = useState<Record<string, string>>({});
  const [secretDraft, setSecretDraft] = useState<Record<string, string>>({});
  const [discoveredModels, setDiscoveredModels] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [longbridgeProxyBaseUrl] = useState(LONGBRIDGE_PROXY_ENV);
  const [ashareFundamentalsBaseUrl, setAshareFundamentalsBaseUrl] = useState(ASHARE_FUNDAMENTALS_ENV);
  const [activeRun, setActiveRun] = useState<RunInfo | null>(null);
  const [batchRuns, setBatchRuns] = useState<RunInfo[]>([]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [reports, setReports] = useState<ReportsPayload | null>(null);
  const [viewedArchive, setViewedArchive] = useState<HistoricalReport | null>(null);
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>({ query: '', ticker: '', status: '', provider: '', date: '' });
  const [reportTab, setReportTab] = useState('finalReport');
  const [reportSearch, setReportSearch] = useState('');
  const [reportProgress, setReportProgress] = useState(0);
  const [isReaderOpen, setReaderOpen] = useState(false);
  const [pendingRun, setPendingRun] = useState<{ config: WebConfig; tickers: string[]; estimate: AnalysisEstimate } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [isRunning, setRunning] = useState(false);
  const [isEstimatingRun, setEstimatingRun] = useState(false);
  const [isFetchingModels, setFetchingModels] = useState(false);
  const [isBacktestRunning, setBacktestRunning] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reportViewRef = useRef<HTMLElement | null>(null);

  const t = messages[locale];
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  async function loadWorkspaceData(user: User) {
    setError(null);
    const [metadataValue, configValue, pricingValue, historyValue, activeRunsValue, orderValue, backtestConfigValue] = await Promise.all([
      api.metadata(),
      api.config(),
      api.publicPricing(),
      api.reportHistory(),
      api.runs(true),
      api.orders(),
      api.backtestConfig(),
    ]);
    const loadedMetadata = { ...emptyMetadata, ...metadataValue };
    setMetadata(loadedMetadata);
    const hydratedConfig = hydrateLongbridgeProxyConfig(configValue, longbridgeProxyBaseUrl, loadedMetadata.customDataMethods, ashareFundamentalsBaseUrl);
    const inferredAshareBaseUrl = ashareFundamentalsBaseUrl || ashareFundamentalsBaseUrlFromConfig(hydratedConfig);
    if (!ashareFundamentalsBaseUrl && inferredAshareBaseUrl) setAshareFundamentalsBaseUrl(inferredAshareBaseUrl);
    setConfig(
      inferredAshareBaseUrl === ashareFundamentalsBaseUrl
        ? hydratedConfig
        : hydrateLongbridgeProxyConfig(configValue, longbridgeProxyBaseUrl, loadedMetadata.customDataMethods, inferredAshareBaseUrl),
    );
    setTickerList(configValue.ticker);
    setPublicPricing(pricingValue);
    setHistory(historyValue.items);
    setOrders(orderValue.orders);
    setBacktestConfig(backtestConfigValue);
    if (user.role === 'admin') {
      const [secretValue, pricingConfig, usersValue, adminOrderValue] = await Promise.all([
        api.secretStatus(),
        api.adminPricing(),
        api.adminUsers(),
        api.adminOrders(),
      ]);
      setSecretStatus(secretValue);
      setAdminPricing(pricingConfig);
      setModelPriceDraft(JSON.stringify(pricingConfig.modelPriceOverrides ?? {}, null, 2));
      setAdminUsers(usersValue.users);
      setAdminOrders(adminOrderValue.orders);
    } else {
      setSecretStatus({});
      setAdminPricing(null);
      setModelPriceDraft('');
      setAdminUsers([]);
      setAdminOrders([]);
    }
    if (activeRunsValue.runs.length > 0) {
      const activeRuns = [...activeRunsValue.runs].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
      setBatchRuns(activeRuns);
      setActiveRun(activeRuns[0]);
      setRunning(true);
      attachEvents(activeRuns[0].id, activeRuns, 0);
    }
  }

  useEffect(() => {
    api.bootstrapStatus()
      .then(async (status) => {
        setBootstrapRequired(status.required);
        if (status.required) return;
        const session = await api.me();
        setCurrentUser(session.user);
        await loadWorkspaceData(session.user);
      })
      .catch(() => undefined)
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!isRunning) return undefined;
    const timer = window.setInterval(() => {
      api.runs(true)
        .then((value) => {
          if (value.runs.length > 0) {
            const activeRuns = [...value.runs].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
            setBatchRuns((current) => mergeRunLists(current, activeRuns));
          }
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    if (!currentUser) return undefined;
    const candidate = viewedArchive?.run ?? activeRun;
    if (!candidate) {
      setBacktestRecord(null);
      setBacktestSummary(null);
      return undefined;
    }
    let cancelled = false;
    api.backtestSummary(candidate.ticker)
      .then((summary) => {
        if (!cancelled) setBacktestSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setBacktestSummary(null);
      });
    if (viewedArchive || candidate.status === 'succeeded') {
      api.backtestRecord(candidate.id)
        .then((record) => {
          if (!cancelled) setBacktestRecord(record);
        })
        .catch(() => {
          if (!cancelled) setBacktestRecord(null);
        });
    } else {
      setBacktestRecord(null);
    }
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, activeRun?.id, activeRun?.status, activeRun?.ticker, viewedArchive?.run.id, viewedArchive?.run.ticker]);

  useEffect(() => {
    if (!isReaderOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReaderOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isReaderOpen]);

  useEffect(() => {
    setReportProgress(0);
    reportViewRef.current?.scrollTo({ top: 0 });
  }, [reportTab, selectedHistoryId, activeRun?.id, viewedArchive?.run.id]);

  function changeLocale(value: Locale) {
    setLocale(value);
    window.localStorage.setItem('tradingagents-webui-locale', value);
  }

  async function handleAuthenticated(sessionUser: User) {
    setCurrentUser(sessionUser);
    setBootstrapRequired(false);
    await loadWorkspaceData(sessionUser);
  }

  async function signOut() {
    await api.logout().catch(() => undefined);
    eventSourceRef.current?.close();
    setCurrentUser(null);
    setConfig(null);
    setActiveRun(null);
    setBatchRuns([]);
    setEvents([]);
    setReports(null);
    setOrders([]);
    setAdminUsers([]);
    setBacktestConfig(null);
    setBacktestRecord(null);
    setBacktestSummary(null);
    setActiveView('workspace');
  }

  async function refreshAccountAndBilling() {
    const [session, orderValue, pricingValue] = await Promise.all([api.me(), api.orders(), api.publicPricing()]);
    setCurrentUser(session.user);
    setOrders(orderValue.orders);
    setPublicPricing(pricingValue);
    if (session.user.role === 'admin') {
      const [usersValue, adminOrderValue, pricingConfig] = await Promise.all([api.adminUsers(), api.adminOrders(), api.adminPricing()]);
      setAdminUsers(usersValue.users);
      setAdminOrders(adminOrderValue.orders);
      setAdminPricing(pricingConfig);
      setModelPriceDraft(JSON.stringify(pricingConfig.modelPriceOverrides ?? {}, null, 2));
    }
  }

  function updateAdminPricing<K extends keyof PricingConfig>(key: K, value: PricingConfig[K]) {
    setAdminPricing((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateDepthPrice(kind: 'depthMultipliers' | 'fixedPricesByDepth' | 'estimatedInputTokensByDepth' | 'estimatedOutputTokensByDepth', depth: '1' | '3' | '5', value: string) {
    setAdminPricing((current) => {
      if (!current) return current;
      const next = { ...current[kind] } as Record<string, string | number>;
      next[depth] = kind.startsWith('estimated') ? clampNumber(value, 0, 20_000_000) : value;
      return { ...current, [kind]: next };
    });
  }

  async function saveAdminPricing() {
    if (!adminPricing) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const overrides = JSON.parse(modelPriceDraft || '{}') as PricingConfig['modelPriceOverrides'];
      const saved = await api.adminSavePricing({ ...adminPricing, modelPriceOverrides: overrides });
      setAdminPricing(saved);
      setModelPriceDraft(JSON.stringify(saved.modelPriceOverrides ?? {}, null, 2));
      setPublicPricing(await api.publicPricing());
      setNotice(t.priceSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function createAdminManagedUser() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.adminCreateUser({ ...newUserDraft, displayName: newUserDraft.displayName || null, isActive: true });
      setNewUserDraft({ username: '', password: '', displayName: '', role: 'user', initialBalance: '0' });
      await refreshAccountAndBilling();
      setNotice(t.userCreated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function rechargeUser(userId: string) {
    const amount = rechargeDraft[userId];
    if (!amount) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.adminRechargeUser(userId, { amount, note: 'Manual WebUI recharge' });
      setRechargeDraft((current) => ({ ...current, [userId]: '' }));
      await refreshAccountAndBilling();
      setNotice(t.rechargeDone);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const provider = useMemo(
    () => metadata.providers.find((item) => item.value === config?.llmProvider),
    [metadata.providers, config?.llmProvider],
  );

  const providerModels = config ? mergedProviderModels(config.llmProvider) : undefined;
  const isCustomOpenAi = config?.llmProvider === 'custom_openai';
  const customNeedsManualModel = isCustomOpenAi && !discoveredModels[config?.llmProvider ?? '']?.length;
  const showDeepSeekThinkingMode = Boolean(config && (isCustomOpenAi || isDeepSeekConfig(config, provider)));
  const currentAshareFundamentalsBaseUrl = config ? (ashareFundamentalsBaseUrl || ashareFundamentalsBaseUrlFromConfig(config)) : ashareFundamentalsBaseUrl;
  const outputLocale = outputLanguageLocale(config?.outputLanguage ?? 'English');
  const setupRecommendations = useMemo(
    () => (config ? buildSetupRecommendations(config, metadata, secretStatus, provider, locale, longbridgeProxyBaseUrl, currentAshareFundamentalsBaseUrl) : []),
    [config, metadata, secretStatus, provider, locale, longbridgeProxyBaseUrl, currentAshareFundamentalsBaseUrl],
  );
  const currentMarketProfile = config ? config.marketProfiles?.[config.stockMarket] : undefined;

  function updateConfig<K extends keyof WebConfig>(key: K, value: WebConfig[K]) {
    setConfig((current) => (current ? { ...current, [key]: value } : current));
  }

  function changeStockMarket(value: string) {
    if (!config) return;
    setConfig({ ...config, stockMarket: value });
  }

  function changeProvider(nextProvider: string) {
    if (!config) return;
    const nextProviderMeta = metadata.providers.find((item) => item.value === nextProvider);
    const fetched = discoveredModels[nextProvider];
    const nextModels = fetched?.length ? { quick: fetched, deep: fetched } : metadata.models[nextProvider];
    setConfig({
      ...config,
      llmProvider: nextProvider,
      backendUrl: nextProviderMeta?.defaultBaseUrl ?? null,
      quickThinkLlm: nextModels?.quick?.[0]?.value ?? config.quickThinkLlm,
      deepThinkLlm: nextModels?.deep?.[0]?.value ?? config.deepThinkLlm,
    });
  }

  function toggleAnalyst(value: string) {
    if (!config) return;
    const hasValue = config.analysts.includes(value);
    const next = hasValue ? config.analysts.filter((item) => item !== value) : [...config.analysts, value];
    if (next.length === 0) return;
    updateConfig('analysts', metadata.analysts.map((item) => item.value).filter((item) => next.includes(item)));
  }

  function updateVendor(key: string, value: string) {
    if (!config) return;
    const nextConfig = {
      ...config,
      dataVendors: { ...config.dataVendors, [key]: normalizeDisplayVendor(value) },
    };
    if (isLongbridgeProxyVendor(value)) {
      setConfig(syncLongbridgeProxyBaseUrl(nextConfig, longbridgeProxyBaseUrl, metadata.customDataMethods));
    } else if (isAshareFundamentalsVendor(value)) {
      setConfig(syncAshareFundamentalsBaseUrl(nextConfig, currentAshareFundamentalsBaseUrl, metadata.customDataMethods));
    } else {
      setConfig(nextConfig);
    }
  }

  function updateToolVendor(method: string, value: string) {
    if (!config) return;
    const next = { ...(config.toolVendors ?? {}) };
    if (value) {
      next[method] = normalizeDisplayVendor(value);
    } else {
      delete next[method];
    }
    const nextConfig = { ...config, toolVendors: next };
    if (isLongbridgeProxyVendor(value)) {
      setConfig(syncLongbridgeProxyBaseUrl(nextConfig, longbridgeProxyBaseUrl, metadata.customDataMethods));
    } else if (isAshareFundamentalsVendor(value)) {
      setConfig(syncAshareFundamentalsBaseUrl(nextConfig, currentAshareFundamentalsBaseUrl, metadata.customDataMethods));
    } else {
      setConfig(nextConfig);
    }
  }

  function updateLlmRoute(routeKey: string, patch: Partial<WebConfig['llmRoutes'][string]>) {
    if (!config) return;
    const current = config.llmRoutes?.[routeKey] ?? { enabled: false, provider: null, backendUrl: null, modelId: null };
    updateConfig('llmRoutes', {
      ...(config.llmRoutes ?? {}),
      [routeKey]: { ...current, ...patch },
    });
  }

  function changeTickerList(value: string) {
    setTickerList(value);
    const [firstTicker] = parseTickerList(value);
    if (firstTicker) {
      updateConfig('ticker', firstTicker);
    }
  }

  function updateMarketProfile(market: string, patch: Partial<WebConfig['marketProfiles'][string]>) {
    if (!config) return;
    const current = config.marketProfiles?.[market] ?? { region: '', appendRegionSuffix: true, weight: '1', marketProfile: '' };
    updateConfig('marketProfiles', {
      ...(config.marketProfiles ?? {}),
      [market]: { ...current, ...patch },
    });
  }

  function updateMarketVendor(market: string, category: string, value: string) {
    if (!config) return;
    const nextConfig = updateMarketDataVendor(config, market, category, value, metadata.customDataMethods);
    if (isLongbridgeProxyVendor(value)) {
      setConfig(syncLongbridgeProxyBaseUrl(nextConfig, longbridgeProxyBaseUrl, metadata.customDataMethods));
    } else if (isAshareFundamentalsVendor(value)) {
      setConfig(syncAshareFundamentalsBaseUrl(nextConfig, currentAshareFundamentalsBaseUrl, metadata.customDataMethods));
    } else {
      setConfig(nextConfig);
    }
  }

  function updateMarketMethodVendor(market: string, method: string, value: string) {
    if (!config) return;
    const nextConfig = updateMarketToolVendor(config, market, method, value, metadata.customDataMethods);
    if (isLongbridgeProxyVendor(value)) {
      setConfig(syncLongbridgeProxyBaseUrl(nextConfig, longbridgeProxyBaseUrl, metadata.customDataMethods));
    } else if (isAshareFundamentalsVendor(value)) {
      setConfig(syncAshareFundamentalsBaseUrl(nextConfig, currentAshareFundamentalsBaseUrl, metadata.customDataMethods));
    } else {
      setConfig(nextConfig);
    }
  }

  function updateMarketCustomBaseUrl(market: string, category: string, value: string) {
    if (!config) return;
    const nextConfig = updateMarketCustomDataBaseUrl(config, market, category, value);
    setConfig(
      isLongbridgeProxyBaseUrl(value, longbridgeProxyBaseUrl) || isLongbridgeProxyBaseUrl(value, currentAshareFundamentalsBaseUrl)
        ? hydrateLongbridgeProxyConfig(nextConfig, longbridgeProxyBaseUrl, metadata.customDataMethods, currentAshareFundamentalsBaseUrl)
        : nextConfig,
    );
  }

  function updateMarketCustomEndpoint(market: string, category: string, method: string, value: string) {
    if (!config) return;
    setConfig(updateMarketCustomDataEndpoint(config, market, category, method, value));
  }

  function updateMarketGroupVendor(markets: string[], category: string, value: string) {
    if (!config) return;
    let nextConfig = config;
    markets.forEach((market) => {
      nextConfig = updateMarketDataVendor(nextConfig, market, category, value, metadata.customDataMethods);
    });
    if (isLongbridgeProxyVendor(value)) {
      setConfig(syncLongbridgeProxyBaseUrl(nextConfig, longbridgeProxyBaseUrl, metadata.customDataMethods));
    } else if (isAshareFundamentalsVendor(value)) {
      setConfig(syncAshareFundamentalsBaseUrl(nextConfig, currentAshareFundamentalsBaseUrl, metadata.customDataMethods));
    } else {
      setConfig(nextConfig);
    }
  }

  function updateMarketGroupMethodVendor(markets: string[], method: string, value: string) {
    if (!config) return;
    let nextConfig = config;
    markets.forEach((market) => {
      nextConfig = updateMarketToolVendor(nextConfig, market, method, value, metadata.customDataMethods);
    });
    if (isLongbridgeProxyVendor(value)) {
      setConfig(syncLongbridgeProxyBaseUrl(nextConfig, longbridgeProxyBaseUrl, metadata.customDataMethods));
    } else if (isAshareFundamentalsVendor(value)) {
      setConfig(syncAshareFundamentalsBaseUrl(nextConfig, currentAshareFundamentalsBaseUrl, metadata.customDataMethods));
    } else {
      setConfig(nextConfig);
    }
  }

  function updateMarketGroupCustomBaseUrl(markets: string[], category: string, value: string) {
    if (!config) return;
    let nextConfig = config;
    markets.forEach((market) => {
      nextConfig = updateMarketCustomDataBaseUrl(nextConfig, market, category, value);
    });
    setConfig(
      isLongbridgeProxyBaseUrl(value, longbridgeProxyBaseUrl) || isLongbridgeProxyBaseUrl(value, currentAshareFundamentalsBaseUrl)
        ? hydrateLongbridgeProxyConfig(nextConfig, longbridgeProxyBaseUrl, metadata.customDataMethods, currentAshareFundamentalsBaseUrl)
        : nextConfig,
    );
  }

  function updateMarketGroupCustomEndpoint(markets: string[], category: string, method: string, value: string) {
    if (!config) return;
    let nextConfig = config;
    markets.forEach((market) => {
      nextConfig = updateMarketCustomDataEndpoint(nextConfig, market, category, method, value);
    });
    setConfig(nextConfig);
  }

  function updateBacktestConfig<K extends keyof BacktestScheduleConfig>(key: K, value: BacktestScheduleConfig[K]) {
    setBacktestConfig((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveConfig(configForBackend(config, longbridgeProxyBaseUrl, metadata.customDataMethods, currentAshareFundamentalsBaseUrl));
      setConfig(hydrateLongbridgeProxyConfig(saved, longbridgeProxyBaseUrl, metadata.customDataMethods, currentAshareFundamentalsBaseUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveBacktestSettings() {
    if (!backtestConfig) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await api.saveBacktestConfig(backtestConfig);
      setBacktestConfig(saved);
      if (secretDraft.BACKTEST_DATA_API_KEY?.trim()) {
        const status = await api.saveSecrets({ BACKTEST_DATA_API_KEY: secretDraft.BACKTEST_DATA_API_KEY });
        setSecretStatus(status);
        setSecretDraft((current) => ({ ...current, BACKTEST_DATA_API_KEY: '' }));
      }
      setNotice(t.saveBacktestSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveSecrets() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveSecrets(secretDraft);
      setSecretStatus(saved);
      setSecretDraft({});
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function fetchModelsForCurrentProvider() {
    if (!config || !provider || provider.modelFetch === 'none') return;
    setFetchingModels(true);
    setError(null);
    try {
      if (Object.values(secretDraft).some((value) => value.trim())) {
        await api.saveSecrets(secretDraft);
        setSecretDraft({});
        setSecretStatus(await api.secretStatus());
      }
      const response = await api.fetchModels(config.llmProvider, config.backendUrl ?? provider.defaultBaseUrl ?? null);
      const fetched = response.models;
      setDiscoveredModels((current) => ({ ...current, [config.llmProvider]: fetched }));
      if (fetched.length > 0) {
        setConfig((current) => {
          if (!current) return current;
          return {
            ...current,
            quickThinkLlm: fetched.some((model) => model.value === current.quickThinkLlm) ? current.quickThinkLlm : fetched[0].value,
            deepThinkLlm: fetched.some((model) => model.value === current.deepThinkLlm) ? current.deepThinkLlm : fetched[0].value,
          };
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingModels(false);
    }
  }

  function mergedProviderModels(providerValue: string) {
    const fetched = discoveredModels[providerValue];
    if (fetched?.length) {
      return { quick: fetched, deep: fetched };
    }
    return metadata.models[providerValue];
  }

  function modelOptionsFor(mode: 'quick' | 'deep', value: string) {
    const options = providerModels?.[mode] ?? [];
    return options.some((item) => item.value === value) ? options : [{ label: value, value }, ...options];
  }

  function routeModelOptions(mode: 'quick' | 'deep', providerValue: string, value: string) {
    const fetched = discoveredModels[providerValue];
    const options = fetched?.length ? fetched : metadata.models[providerValue]?.[mode] ?? [];
    return options.some((item) => item.value === value) ? options : [{ label: value, value }, ...options];
  }

  async function startRun() {
    if (!config) return;
    const tickers = parseTickerList(tickerList || config.ticker);
    if (tickers.length === 0) {
      setError(locale === 'zh' ? '至少需要一个股票代码。' : 'At least one ticker is required.');
      return;
    }
    const runConfig = configForBackend({ ...config, ticker: tickers[0] }, longbridgeProxyBaseUrl, metadata.customDataMethods, currentAshareFundamentalsBaseUrl);
    setEstimatingRun(true);
    setError(null);
    setNotice(null);
    try {
      const estimate = await api.estimateRun(runConfig, tickers.length);
      setPendingRun({ config: runConfig, tickers, estimate });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEstimatingRun(false);
    }
  }

  async function confirmPendingRun() {
    if (!pendingRun) return;
    const { config: runConfig, tickers } = pendingRun;
    setPendingRun(null);
    setRunning(true);
    setError(null);
    setEvents([]);
    setReports(null);
    setSelectedHistoryId(null);
    setViewedArchive(null);
    setBatchRuns([]);
    try {
      const saved = isAdmin ? await api.saveConfig(runConfig) : runConfig;
      if (isAdmin) setConfig(hydrateLongbridgeProxyConfig(saved, longbridgeProxyBaseUrl, metadata.customDataMethods, currentAshareFundamentalsBaseUrl));
      if (tickers.length > 1) {
        const batch = await api.createBatchRuns(tickers, saved);
        setBatchRuns(batch.runs);
        setActiveRun(batch.runs[0]);
        attachEvents(batch.runs[0].id, batch.runs, 0);
        return;
      }
      const run = await api.createRun(saved);
      setActiveRun(run);
      attachEvents(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
    }
  }

  async function stopAnalysis() {
    const targets = batchRuns.length > 0 ? batchRuns.filter((run) => run.status === 'queued' || run.status === 'running') : activeRun ? [activeRun] : [];
    if (targets.length === 0) return;
    setError(null);
    try {
      const cancelled = await Promise.all(targets.map((run) => api.cancelRun(run.id)));
      setBatchRuns((current) => mergeRunLists(current, cancelled));
      const updatedActive = cancelled.find((run) => run.id === activeRun?.id) ?? cancelled[0];
      setActiveRun(updatedActive);
      if (cancelled.every((run) => run.status === 'cancelled')) {
        setRunning(false);
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
      }
      api.runs(true).then((value) => {
        if (value.runs.length === 0) setRunning(false);
      }).catch(() => undefined);
      refreshAccountAndBilling().catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function runDisplayedBacktest() {
    const target = viewedArchive?.run ?? activeRun;
    if (!target) return;
    setBacktestRunning(true);
    setError(null);
    try {
      const record = await api.runBacktestRecord(target.id);
      setBacktestRecord(record);
      setBacktestSummary(await api.backtestSummary(record.ticker));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBacktestRunning(false);
    }
  }

  function attachEvents(runId: string, sequence?: RunInfo[], sequenceIndex = 0) {
    eventSourceRef.current?.close();
    const source = new EventSource(`/api/runs/${runId}/events`);
    eventSourceRef.current = source;
    const onEvent = (message: MessageEvent) => {
      const event = JSON.parse(message.data) as RunEvent;
      setEvents((current) => [...current, event].slice(-200));
      if (event.type === 'reports') {
        setReports(event.payload as unknown as ReportsPayload);
      }
      if (event.type === 'status') {
        api.run(runId).then((run) => {
          setActiveRun(run);
          if (sequence) {
            setBatchRuns((current) => current.map((item) => (item.id === run.id ? run : item)));
          }
          if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
            source.close();
            if (eventSourceRef.current === source) eventSourceRef.current = null;
            api.reports(runId).then(setReports).catch(() => undefined);
            const nextRun = sequence?.slice(sequenceIndex + 1).find((item) => item.status === 'queued' || item.status === 'running');
            if (nextRun) {
              setActiveRun(nextRun);
              attachEvents(nextRun.id, sequence ?? [], sequence?.findIndex((item) => item.id === nextRun.id) ?? 0);
              return;
            }
            setRunning(false);
            api.reportHistory().then((value) => setHistory(value.items)).catch(() => undefined);
            refreshAccountAndBilling().catch(() => undefined);
          }
        });
      }
    };
    ['status', 'progress', 'message', 'tool', 'llm', 'configuration', 'reports'].forEach((name) => {
      source.addEventListener(name, onEvent);
    });
    source.onerror = () => {
      source.close();
      if (eventSourceRef.current === source) eventSourceRef.current = null;
      setRunning(false);
    };
  }

  async function loadHistoricalReport(runId: string) {
    setError(null);
    try {
      const archive = await api.historicalReport(runId);
      setViewedArchive(archive);
      setSelectedHistoryId(runId);
      setReportTab('finalReport');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function showCurrentRun() {
    setViewedArchive(null);
    setSelectedHistoryId(null);
    setReportTab('finalReport');
  }

  function viewOrderRun(runId: string) {
    if (history.some((item) => item.runId === runId)) {
      void loadHistoricalReport(runId);
      return;
    }
    void selectLiveRun(runId);
  }

  async function selectLiveRun(runId: string) {
    setError(null);
    setSelectedHistoryId(null);
    setViewedArchive(null);
    setEvents([]);
    setReports(null);
    try {
      const run = await api.run(runId);
      setActiveRun(run);
      api.reports(runId).then(setReports).catch(() => undefined);
      attachEvents(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!authChecked) {
    return (
      <main className="boot">
        <Loader2 className="spin" size={26} />
        <span>{t.loading}</span>
      </main>
    );
  }

  if (bootstrapRequired) {
    return <AuthScreen mode="bootstrap" locale={locale} labels={t} onLocaleChange={changeLocale} onAuthenticated={handleAuthenticated} />;
  }

  if (!currentUser) {
    return <AuthScreen mode="login" locale={locale} labels={t} onLocaleChange={changeLocale} onAuthenticated={handleAuthenticated} />;
  }

  if (!config) {
    return (
      <main className="boot">
        <Loader2 className="spin" size={26} />
        <span>{t.loading}</span>
      </main>
    );
  }

  const customLanguage =
    !metadata.languages.some((language) => language.value === config.outputLanguage) ? config.outputLanguage : '';
  const progress = [...events].reverse().find((event) => event.type === 'progress')?.payload as
    | { agents?: Record<string, string>; stats?: Record<string, number>; elapsedSeconds?: number }
    | undefined;
  const agentStatus = progress?.agents ?? {};
  const timeEstimate = estimateRunTime(events, agentStatus, progress, activeRun, locale);
  const configuredTickerCount = parseTickerList(tickerList || config.ticker).length || 1;
  const firstInputTicker = parseTickerList(tickerList || config.ticker)[0] ?? config.ticker;
  const effectiveTicker = formatMarketTicker(firstInputTicker, currentMarketProfile);
  const marketDataRouteCount = Object.values(config.marketDataOverrides ?? {}).reduce(
    (total, override) => total + Object.keys(override.dataVendors ?? {}).length + Object.keys(override.toolVendors ?? {}).length,
    0,
  );
  const customRouteCount = Object.keys(config.toolVendors ?? {}).length + marketDataRouteCount + Object.values(config.llmRoutes ?? {}).filter((route) => route.enabled).length;
  const displayedReports: ReportsPayload | null =
    selectedHistoryId && viewedArchive
      ? {
          runId: viewedArchive.run.id,
          reports: viewedArchive.reports,
          finalReport: viewedArchive.finalReport,
          decision: viewedArchive.decision,
        }
      : reports;
  const displayedRun = selectedHistoryId && viewedArchive ? viewedArchive.run : activeRun;
  const runBilling = displayedRun?.billing ?? activeRun?.billing ?? null;
  const reportEntries = displayedReports?.reports ? Object.entries(displayedReports.reports) : [];
  const backtestObservation = buildBacktestObservation(displayedReports, displayedRun, outputLocale);
  const referenceTimeline = metadata.llmRouteTargets
    .filter((target) => target.stage === 'reference')
    .filter((target) => !Object.keys(agentStatus).some((name) => name.toLowerCase().includes(target.key.replace('_reviewer', ''))))
    .map((target) => ({
      key: target.key,
      label: routeLabel(target.label, outputLocale),
      status: activeRun ? 'pending' : 'idle',
    }));
  const dataApiSecretFields = metadata.secretFields.filter((field) => ['ALPHA_VANTAGE_API_KEY', 'CUSTOM_DATA_API_KEY'].includes(field));
  const reportTabs = [
    { key: 'finalReport', label: t.final },
    { key: 'backtestWatch', label: t.backtestWatch },
    ...reportEntries.map(([key]) => ({ key, label: reportLabels[locale][key] ?? cleanLabel(key) })),
  ];
  const activeReportTitle = reportTabs.find((item) => item.key === reportTab)?.label ?? t.noReportLoaded;
  const activeReportMarkdown =
    reportTab === 'finalReport'
      ? displayedReports?.finalReport ?? t.noReport
      : stringifyReport(displayedReports?.reports?.[reportTab], t.noReport);
  const reportHeadings = reportTab === 'backtestWatch' ? [] : extractMarkdownHeadings(activeReportMarkdown);
  const reportSearchMatches = reportTab === 'backtestWatch' || !reportSearch.trim()
    ? 0
    : countTextMatches(activeReportMarkdown, reportSearch);
  const filteredHistory = history.filter((item) => matchesHistoryFilters(item, historyFilters));
  const settingsTabs: Array<{ key: SettingsSection; label: string; icon: React.ReactNode }> = [
    { key: 'model', label: t.settingsModelTab, icon: <Settings2 size={15} /> },
    { key: 'market', label: t.settingsMarketTab, icon: <BarChart3 size={15} /> },
    { key: 'data', label: t.settingsDataTab, icon: <Database size={15} /> },
    { key: 'routes', label: t.settingsRoutesTab, icon: <Activity size={15} /> },
    { key: 'backtest', label: t.settingsBacktestTab, icon: <History size={15} /> },
    { key: 'billing', label: t.settingsBillingTab, icon: <CreditCard size={15} /> },
    { key: 'users', label: t.settingsUsersTab, icon: <Users size={15} /> },
  ];
  const reportContext = displayedReports ? (
    <div className="report-context">
      <strong>
        {displayedRun?.ticker ?? displayedReports.runId.slice(0, 8)} · {displayedRun?.analysisDate ?? displayedReports.runId.slice(0, 8)}
      </strong>
      <span>{selectedHistoryId ? t.archivedReport : t.currentReport}</span>
      {selectedHistoryId && (reports || activeRun) && (
        <button className="text-button" onClick={showCurrentRun}>
          {t.showCurrentRun}
        </button>
      )}
    </div>
  ) : null;
  const handleReportScroll = (event: React.UIEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const maxScroll = target.scrollHeight - target.clientHeight;
    setReportProgress(maxScroll <= 0 ? 100 : Math.round((target.scrollTop / maxScroll) * 100));
  };
  const copyActiveReport = async () => {
    try {
      await navigator.clipboard.writeText(activeReportMarkdown);
      setNotice(t.reportCopied);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const downloadActiveReport = () => {
    const blob = new Blob([activeReportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = reportFileName(displayedRun?.ticker ?? displayedReports?.runId ?? 'report', reportTab);
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(t.reportDownloaded);
  };
  const scrollReportToTop = () => {
    reportViewRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const renderReportBody = () => (
    <article className="report-view" ref={reportViewRef} onScroll={handleReportScroll}>
      {reportTab === 'backtestWatch' ? (
        <BacktestObservationView
          observation={backtestObservation}
          record={backtestRecord}
          summary={backtestSummary}
          labels={t}
          locale={outputLocale}
          onRun={runDisplayedBacktest}
          isRunning={isBacktestRunning}
        />
      ) : (
        <div className="markdown-report">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
            {activeReportMarkdown}
          </ReactMarkdown>
        </div>
      )}
    </article>
  );
  const renderReportReader = () => (
    <div className="report-reader">
      <nav className="report-nav" aria-label={t.currentSection}>
        {reportTabs.map((item) => (
          <button
            key={item.key}
            className={reportTab === item.key ? 'active' : ''}
            onClick={() => setReportTab(item.key)}
            aria-current={reportTab === item.key ? 'page' : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="report-reader-main">
        <div className="report-toolbar">
          <div className="report-toolbar-title">
            <span>{t.currentSection}</span>
            <strong>{activeReportTitle}</strong>
          </div>
          {reportTab !== 'backtestWatch' && (
            <div className="report-actions">
              <label className="report-search">
                <Search size={15} />
                <input
                  value={reportSearch}
                  onChange={(event) => setReportSearch(event.target.value)}
                  placeholder={t.reportSearch}
                />
                {reportSearch.trim() && <small>{reportSearchMatches} {t.searchMatches}</small>}
              </label>
              <button className="icon-button" onClick={copyActiveReport} aria-label={t.copyMarkdown} title={t.copyMarkdown}>
                <Copy size={15} />
              </button>
              <button className="icon-button" onClick={downloadActiveReport} aria-label={t.exportMarkdown} title={t.exportMarkdown}>
                <Download size={15} />
              </button>
              <button className="icon-button" onClick={() => window.print()} aria-label={t.exportPdf} title={t.exportPdf}>
                <Printer size={15} />
              </button>
              <button className="icon-button" onClick={scrollReportToTop} aria-label={t.backToTop} title={t.backToTop}>
                <ArrowUp size={15} />
              </button>
            </div>
          )}
        </div>
        <div className="reader-progress" aria-label={`${t.readingProgress}: ${reportProgress}%`}>
          <span style={{ width: `${reportProgress}%` }} />
        </div>
        <div className={reportHeadings.length > 0 ? 'report-content-layout has-toc' : 'report-content-layout'}>
          {reportHeadings.length > 0 && (
            <aside className="report-toc" aria-label={t.tableOfContents}>
              <div className="report-toc-title">
                <FileText size={15} />
                {t.tableOfContents}
              </div>
              {reportHeadings.map((heading) => (
                <button
                  key={`${heading.id}-${heading.index}`}
                  className={`depth-${heading.depth}`}
                  onClick={() => document.getElementById(heading.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
                >
                  {heading.text}
                </button>
              ))}
            </aside>
          )}
          {renderReportBody()}
        </div>
      </div>
    </div>
  );
  const aShareMarketKeys = metadata.stockMarkets.map((market) => market.key).filter((key) => key === 'sh' || key === 'sz');
  const marketDataSections = [
    ...metadata.stockMarkets
      .filter((market) => market.key !== 'sh' && market.key !== 'sz')
      .map((market) => ({ key: market.key, label: marketLabel(market.key, locale), markets: [market.key] })),
    ...(aShareMarketKeys.length > 0
      ? [{ key: 'a-share', label: locale === 'zh' ? 'A 股' : 'A shares', markets: aShareMarketKeys }]
      : []),
  ];
  const marketGroupHasOverride = (markets: string[]) => markets.some((market) => {
    const override = marketDataOverride(config, market);
    return (
      Object.keys(override.dataVendors ?? {}).length > 0 ||
      Object.keys(override.toolVendors ?? {}).length > 0 ||
      Object.keys(override.customDataInterfaces ?? {}).length > 0
    );
  });
  const sharedMarketValue = (markets: string[], valueForMarket: (market: string) => string | undefined) => {
    const values = markets.map((market) => valueForMarket(market) ?? '');
    return values.every((value) => value === values[0]) ? values[0] : '';
  };
  const marketGroupUsesCustomRoute = (markets: string[], category: string, methods: Metadata['customDataMethods']) => (
    markets.some((market) => {
      const override = marketDataOverride(config, market);
      return (
        isCustomLikeDataVendor(override.dataVendors?.[category]) ||
        methods.some((method) => isCustomLikeDataVendor(override.toolVendors?.[method.method]))
      );
    })
  );
  const marketGroupCustomSettings = (markets: string[], category: string) => {
    const settings = markets
      .map((market) => marketDataOverride(config, market).customDataInterfaces?.[category])
      .find((item) => item?.baseUrl || Object.keys(item?.endpoints ?? {}).length > 0);
    return settings ?? { baseUrl: null, endpoints: {} };
  };

  return (
    <main className="app-shell" lang={locale === 'zh' ? 'zh-CN' : 'en'}>
      <header className="topbar">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>{t.title}</h1>
        </div>
        <div className="status-cluster">
          <div className="view-switch" aria-label="Console view">
            <button className={activeView === 'workspace' ? 'active' : ''} onClick={() => setActiveView('workspace')}>
              {t.workspace}
            </button>
            {isAdmin && (
              <button className={activeView === 'settings' ? 'active' : ''} onClick={() => setActiveView('settings')}>
                <Settings2 size={14} />
                {t.settings}
              </button>
            )}
          </div>
          <div className="locale-switch" aria-label="Interface language">
            <button className={locale === 'en' ? 'active' : ''} onClick={() => changeLocale('en')}>
              EN
            </button>
            <button className={locale === 'zh' ? 'active' : ''} onClick={() => changeLocale('zh')}>
              中文
            </button>
          </div>
          <span className={`run-pill ${activeRun?.status ?? 'idle'}`}>
            <CircleDot size={14} />
            {statusLabel(activeRun?.status ?? 'idle', locale)}
          </span>
          <span className="account-pill">
            <Wallet size={14} />
            {currentUser.username} · {formatMoney(currentUser.balance, publicPricing?.currency)}
          </span>
          <button className="secondary" onClick={signOut}>
            {t.signOut}
          </button>
          <button className="primary" onClick={startRun} disabled={isRunning || isEstimatingRun}>
            {isRunning || isEstimatingRun ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
            {t.runAnalysis}
          </button>
          {isRunning && (
            <button className="secondary danger" onClick={stopAnalysis}>
              <Square size={15} />
              {t.stopAnalysis}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="alert">
          <CircleAlert size={18} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="notice">
          <Check size={18} />
          <span>{notice}</span>
        </div>
      )}

      {activeView === 'settings' && isAdmin ? (
        <section className={`settings-grid settings-section-${settingsSection}`}>
          <section className="settings-main">
            <nav className="settings-tabs" aria-label={t.settings}>
              {settingsTabs.map((item) => (
                <button
                  key={item.key}
                  className={settingsSection === item.key ? 'active' : ''}
                  onClick={() => setSettingsSection(item.key)}
                  aria-current={settingsSection === item.key ? 'page' : undefined}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
            {settingsSection === 'model' && (
            <Panel title={t.connectionSettings} icon={<Settings2 size={17} />}>
              <div className="form-grid settings-form">
                <Field label={t.provider}>
                  <select value={config.llmProvider} onChange={(event) => changeProvider(event.target.value)}>
                    {metadata.providers.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t.providerRegion}>
                  <input value={provider?.region ?? '-'} readOnly />
                  </Field>
                <label className="field wide">
                  <span>{t.baseUrl}</span>
                  <input
                    value={config.backendUrl ?? ''}
                    onChange={(event) => updateConfig('backendUrl', event.target.value || null)}
                    placeholder={provider?.defaultBaseUrl ?? t.providerDefault}
                  />
                </label>
              </div>

              {provider?.apiKeyField && (
                <label className="secret-row provider-secret">
                  <span>
                    {provider.apiKeyField}
                    <small>{secretStatus[provider.apiKeyField]?.configured ? secretStatus[provider.apiKeyField]?.masked : t.notConfigured}</small>
                  </span>
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder={secretStatus[provider.apiKeyField]?.configured ? t.replaceValue : t.pasteKey}
                    value={secretDraft[provider.apiKeyField] ?? ''}
                    onChange={(event) => setSecretDraft((current) => ({ ...current, [provider.apiKeyField!]: event.target.value }))}
                  />
                </label>
              )}

              <div className="tool-row settings-model-row">
                <Selector
                  icon={<Brain size={16} />}
                  label={t.quickModel}
                  value={config.quickThinkLlm}
                  options={modelOptionsFor('quick', config.quickThinkLlm)}
                  onChange={(value) => updateConfig('quickThinkLlm', value)}
                />
                <Selector
                  icon={<Bot size={16} />}
                  label={t.deepModel}
                  value={config.deepThinkLlm}
                  options={modelOptionsFor('deep', config.deepThinkLlm)}
                  onChange={(value) => updateConfig('deepThinkLlm', value)}
                />
                <button className="secondary model-fetch-button" onClick={fetchModelsForCurrentProvider} disabled={isFetchingModels || provider?.modelFetch === 'none'}>
                  {isFetchingModels ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                  {isFetchingModels ? t.fetchingModels : t.fetchModels}
                </button>
              </div>
              {provider?.modelFetch === 'none' && <p className="hint">{t.modelFetchUnavailable}</p>}
              {discoveredModels[config.llmProvider]?.length > 0 && (
                <p className="hint">{discoveredModels[config.llmProvider].length} {t.fetchedModels}</p>
              )}
              {showDeepSeekThinkingMode && (
                <div className="settings-thinking-row">
                  <Field label={t.deepseekThinkingMode}>
                    <select
                      value={config.deepseekThinkingMode ?? 'disabled'}
                      onChange={(event) => updateConfig('deepseekThinkingMode', event.target.value as WebConfig['deepseekThinkingMode'])}
                    >
                      {deepseekThinkingOptions(metadata, locale).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    </Field>
                  <p className="inline-hint">{t.deepseekThinkingHint}</p>
                </div>
              )}

              <div className="section-title">
                <Languages size={16} />
                {t.outputLanguage}
              </div>
              <div className="chip-grid settings-language-grid">
                {metadata.languages.map((language) => (
                  <button
                    key={language.value}
                    className={config.outputLanguage === language.value ? 'chip active' : 'chip'}
                    onClick={() => updateConfig('outputLanguage', language.value)}
                  >
                    {language.label}
                  </button>
                ))}
                <input
                  className="chip-input"
                  placeholder={t.customLanguage}
                  value={customLanguage}
                  onChange={(event) => updateConfig('outputLanguage', event.target.value)}
                />
              </div>

              <div className="actions-row">
                <button className="secondary" onClick={saveSecrets} disabled={isSaving}>
                  <Save size={16} />
                  {t.saveSecrets}
                </button>
                <button className="secondary" onClick={saveConfig} disabled={isSaving}>
                  <Save size={16} />
                  {t.saveDefaults}
                </button>
              </div>
            </Panel>
            )}

            {settingsSection === 'market' && (
            <Panel title={t.marketSettings} icon={<BarChart3 size={17} />}>
              <p className="hint">
                {locale === 'zh'
                  ? '用户可以只输入裸代码；每个市场可单独决定是否自动拼接 .region。无论是否拼后缀，market_profile prompt 都会注入到智能体上下文。'
                  : 'Users can enter bare symbols; each market controls whether .region is appended. The market_profile prompt is injected either way.'}
              </p>
              <div className="market-profile-grid">
                {metadata.stockMarkets.map((market) => {
                  const profile = config.marketProfiles?.[market.key] ?? { region: '', appendRegionSuffix: true, weight: '1', marketProfile: '' };
                  return (
                    <section key={market.key} className={config.stockMarket === market.key ? 'market-profile-card active' : 'market-profile-card'}>
                      <div className="route-card-head">
                        <div>
                          <strong>{stockMarketLabels[locale][market.key] ?? market.label}</strong>
                          <small>{market.description}</small>
                        </div>
                      </div>
                      <label className="toggle-row compact-toggle">
                        <input
                          type="checkbox"
                          checked={profile.appendRegionSuffix ?? true}
                          onChange={(event) => updateMarketProfile(market.key, { appendRegionSuffix: event.target.checked })}
                        />
                        <span>{t.appendRegionSuffix}</span>
                      </label>
                      <div className="market-profile-fields">
                        <Field label={t.marketRegion}>
                          <input
                            value={profile.region}
                            onChange={(event) => updateMarketProfile(market.key, { region: event.target.value })}
                            placeholder={market.key === 'us' ? 'us' : market.key === 'hk' ? 'hk' : market.key === 'sh' ? 'ss' : 'sz'}
                          />
                          </Field>
                        <Field label={t.marketWeight}>
                          <input
                            value={profile.weight}
                            onChange={(event) => updateMarketProfile(market.key, { weight: event.target.value })}
                            inputMode="decimal"
                          />
                          </Field>
                      </div>
                      <Field label={t.marketPrompt}>
                        <textarea
                          value={profile.marketProfile}
                          onChange={(event) => updateMarketProfile(market.key, { marketProfile: event.target.value })}
                        />
                        </Field>
                    </section>
                  );
                })}
              </div>
              <div className="actions-row">
                <button className="secondary" onClick={saveConfig} disabled={isSaving}>
                  <Save size={16} />
                  {t.saveDefaults}
                </button>
              </div>
            </Panel>
            )}

            {settingsSection === 'data' && (
            <Panel title={t.dataVendors} icon={<Database size={17} />}>
              {metadata.dataVendorCategories.map((category) => (
                <Field key={category.key} label={dataVendorLabels[locale][category.key] ?? category.label}>
                  <select value={config.dataVendors[category.key] ?? ''} onChange={(event) => updateVendor(category.key, event.target.value)}>
                    {category.options.filter((option) => option !== 'custom').map((option) => (
                      <option key={option} value={option}>
                        {dataVendorOptionLabel(option, locale)}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
              <div className="section-title">
                <ListOrdered size={16} />
                {t.methodOverrides}
              </div>
              <div className="method-vendor-list">
                {metadata.customDataMethods.map((method) => {
                  const category = metadata.dataVendorCategories.find((item) => item.key === method.category);
                  const categoryVendor = config.dataVendors[method.category] ?? '';
                  return (
                    <label key={method.method} className="field method-vendor-row">
                      <span>
                        {customMethodLabels[locale][method.method] ?? method.label}
                        <small>{dataVendorLabels[locale][method.category] ?? category?.label ?? method.category}</small>
                      </span>
                      <select value={(config.toolVendors ?? {})[method.method] ?? ''} onChange={(event) => updateToolVendor(method.method, event.target.value)}>
                        <option value="">{t.useCategoryDefault} ({dataVendorOptionLabel(categoryVendor, locale)})</option>
                        {(category?.options ?? []).filter((option) => option !== 'custom').map((option) => (
                          <option key={option} value={option}>
                            {dataVendorOptionLabel(option, locale)}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </Panel>
            )}

            {settingsSection === 'data' && (
            <Panel title={t.marketDataVendors} icon={<Database size={17} />}>
              <p className="hint">{t.marketDataHint}</p>
              {dataApiSecretFields.length > 0 && (
                <section className="data-secret-card">
                  <div className="section-title">
                    <KeyRound size={16} />
                    {t.dataApiKeys}
                  </div>
                  <div className="data-secret-grid">
                    {dataApiSecretFields.map((field) => (
                      <label key={field} className="secret-row">
                        <span>
                          {field}
                          <small>{secretStatus[field]?.configured ? secretStatus[field]?.masked : t.notConfigured}</small>
                        </span>
                        <input
                          type="password"
                          autoComplete="off"
                          placeholder={secretStatus[field]?.configured ? t.replaceValue : t.pasteKey}
                          value={secretDraft[field] ?? ''}
                          onChange={(event) => setSecretDraft((current) => ({ ...current, [field]: event.target.value }))}
                        />
                      </label>
                    ))}
                  </div>
                  <button className="secondary" onClick={saveSecrets} disabled={isSaving}>
                    <Save size={16} />
                    {t.saveSecrets}
                  </button>
                </section>
              )}
              <div className="market-data-list">
                {marketDataSections.map((section) => {
                  const hasOverride = marketGroupHasOverride(section.markets);
                  const sectionMarket = section.markets[0];
                  return (
                    <details key={section.key} className={hasOverride ? 'market-data-section active' : 'market-data-section'} open={section.markets.includes(config.stockMarket) || hasOverride}>
                      <summary>
                        <span>{section.label}</span>
                        <small>{hasOverride ? t.marketOverrideConfigured : t.inheritDefault}</small>
                      </summary>
                      <div className="market-category-list">
                        {metadata.dataVendorCategories.map((category) => {
                          const methods = metadata.customDataMethods.filter((method) => method.category === category.key);
                          const inherited = config.dataVendors[category.key] ?? '';
                          const value = sharedMarketValue(section.markets, (market) => marketDataOverride(config, market).dataVendors?.[category.key]);
                          const selectedCustom = marketGroupUsesCustomRoute(section.markets, category.key, methods);
                          const settings = marketGroupCustomSettings(section.markets, category.key);
                          return (
                            <section key={`${section.key}-${category.key}`} className={selectedCustom ? 'market-route-card active' : 'market-route-card'}>
                              <div className="market-route-head">
                                <Field label={dataVendorLabels[locale][category.key] ?? category.label}>
                                  <select value={value} onChange={(event) => updateMarketGroupVendor(section.markets, category.key, event.target.value)}>
                                    <option value="">{t.inheritDefault} ({dataVendorOptionLabel(inherited, locale)})</option>
                                    {vendorOptions(category.options, { category: category.key, market: sectionMarket }).map((option) => (
                                      <option key={option} value={option}>
                                        {dataVendorOptionLabel(option, locale)}
                                      </option>
                                    ))}
                                  </select>
                                  </Field>
                                {selectedCustom && (
                                  <Field label={t.baseUrl}>
                                    <input
                                      value={settings.baseUrl ?? ''}
                                      onChange={(event) => updateMarketGroupCustomBaseUrl(section.markets, category.key, event.target.value)}
                                      placeholder="https://data.example.com"
                                    />
                                    </Field>
                                )}
                              </div>
                              <div className="method-vendor-list market-method-list">
                                {methods.map((method) => {
                                  const inheritedOverride = sharedMarketValue(section.markets, (market) => marketDataOverride(config, market).dataVendors?.[method.category]);
                                  const methodInherited = inheritedOverride || config.dataVendors[method.category] || '';
                                  const methodValue = sharedMarketValue(section.markets, (market) => marketDataOverride(config, market).toolVendors?.[method.method]);
                                  return (
                                    <section key={`${section.key}-${method.method}`} className={selectedCustom ? 'market-method-row active' : 'market-method-row'}>
                                      <label className="field method-vendor-row">
                                        <span>
                                          {customMethodLabels[locale][method.method] ?? method.label}
                                          <small>{dataVendorLabels[locale][method.category] ?? category.label}</small>
                                        </span>
                                        <select value={methodValue} onChange={(event) => updateMarketGroupMethodVendor(section.markets, method.method, event.target.value)}>
                                          <option value="">{t.useCategoryDefault} ({dataVendorOptionLabel(methodInherited, locale)})</option>
                                          {vendorOptions(category.options, { category: method.category, method: method.method, market: sectionMarket }).map((option) => (
                                            <option key={option} value={option}>
                                              {dataVendorOptionLabel(option, locale)}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      {selectedCustom && (
                                        <label className="field endpoint-field">
                                          <span>{t.endpointPath}</span>
                                          <input
                                            value={settings.endpoints?.[method.method] ?? method.defaultPath}
                                            onChange={(event) => updateMarketGroupCustomEndpoint(section.markets, category.key, method.method, event.target.value)}
                                            placeholder={method.defaultPath}
                                          />
                                        </label>
                                      )}
                                    </section>
                                  );
                                })}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            </Panel>
            )}

            {settingsSection === 'routes' && (
            <Panel title={t.parallelRoutes} icon={<Activity size={17} />}>
              <p className="hint">{t.parallelRoutesHint}</p>
              <div className="route-grid">
                {metadata.llmRouteTargets.map((target) => {
                  const route = config.llmRoutes?.[target.key] ?? { enabled: false, provider: null, backendUrl: null, modelId: null };
                  const routeProvider = route.provider || config.llmProvider;
                  const routeProviderMeta = metadata.providers.find((item) => item.value === routeProvider);
                  const routeModels = routeModelOptions(target.defaultModelRole, routeProvider, route.modelId || modelForRole(config, target.defaultModelRole));
                  return (
                    <section key={target.key} className={route.enabled ? 'route-card active' : 'route-card'}>
                      <div className="route-card-head">
                        <div>
                          <strong>{routeLabel(target.label, locale)}</strong>
                          <small>{target.parallelizable ? t.parallelReady : t.sequential}</small>
                        </div>
                        <label className="mini-toggle">
                          <input
                            type="checkbox"
                            checked={route.enabled}
                            onChange={(event) => updateLlmRoute(target.key, { enabled: event.target.checked })}
                          />
                          <span>{t.routeEnabled}</span>
                        </label>
                      </div>
                      <p className="hint">{locale === 'zh' ? routeDescription(target.stage, target.parallelizable) : target.description}</p>
                      <div className="route-fields">
                        <Field label={t.provider}>
                          <select value={route.provider ?? ''} onChange={(event) => updateLlmRoute(target.key, { provider: event.target.value || null })}>
                            <option value="">{t.inheritMainProvider}</option>
                            {metadata.providers.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                          </Field>
                        <Field label={t.routeBaseUrl}>
                          <input
                            value={route.backendUrl ?? ''}
                            onChange={(event) => updateLlmRoute(target.key, { backendUrl: event.target.value || null })}
                            placeholder={routeProviderMeta?.defaultBaseUrl ?? t.providerDefault}
                          />
                          </Field>
                        <Field label={t.routeModel}>
                          <select value={route.modelId ?? ''} onChange={(event) => updateLlmRoute(target.key, { modelId: event.target.value || null })}>
                            <option value="">{modelForRole(config, target.defaultModelRole)}</option>
                            {routeModels.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                          </Field>
                        <label className="secret-row route-secret">
                          <span>
                            {target.apiKeyField}
                            <small>{secretStatus[target.apiKeyField]?.configured ? secretStatus[target.apiKeyField]?.masked : t.notConfigured}</small>
                          </span>
                          <input
                            type="password"
                            autoComplete="off"
                            placeholder={secretStatus[target.apiKeyField]?.configured ? t.replaceValue : t.pasteKey}
                            value={secretDraft[target.apiKeyField] ?? ''}
                            onChange={(event) => setSecretDraft((current) => ({ ...current, [target.apiKeyField]: event.target.value }))}
                          />
                        </label>
                      </div>
                    </section>
                  );
                })}
              </div>
              <div className="actions-row">
                <button className="secondary" onClick={saveSecrets} disabled={isSaving}>
                  <Save size={16} />
                  {t.saveSecrets}
                </button>
                <button className="secondary" onClick={saveConfig} disabled={isSaving}>
                  <Save size={16} />
                  {t.saveDefaults}
                </button>
              </div>
            </Panel>
            )}

            {settingsSection === 'backtest' && (
            <Panel title={t.backtestSchedule} icon={<History size={17} />}>
              {backtestConfig ? (
                <div className="backtest-settings">
                  <div className="form-grid backtest-settings-grid">
                    <label className="toggle-row compact-toggle">
                      <input
                        type="checkbox"
                        checked={backtestConfig.enabled}
                        onChange={(event) => updateBacktestConfig('enabled', event.target.checked)}
                      />
                      <span>{t.schedulerEnabled}</span>
                    </label>
                    <label className="toggle-row compact-toggle">
                      <input
                        type="checkbox"
                        checked={backtestConfig.checkpointEnabled}
                        onChange={(event) => updateBacktestConfig('checkpointEnabled', event.target.checked)}
                      />
                      <span>{t.checkpointResume}</span>
                    </label>
                    <Field label={t.intervalMinutes}>
                      <input
                        type="number"
                        min={5}
                        max={43200}
                        value={backtestConfig.intervalMinutes}
                        onChange={(event) => updateBacktestConfig('intervalMinutes', clampNumber(event.target.value, 5, 43200))}
                      />
                      </Field>
                    <Field label={t.reviewWindowDays}>
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={backtestConfig.reviewWindowDays}
                        onChange={(event) => updateBacktestConfig('reviewWindowDays', clampNumber(event.target.value, 1, 3650))}
                      />
                      </Field>
                    <Field label={t.maxReportsPerCycle}>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={backtestConfig.maxReportsPerCycle}
                        onChange={(event) => updateBacktestConfig('maxReportsPerCycle', clampNumber(event.target.value, 1, 500))}
                      />
                      </Field>
                    <Field label={t.priceDataSource}>
                      <select value={backtestConfig.priceDataSource} onChange={(event) => updateBacktestConfig('priceDataSource', event.target.value as BacktestScheduleConfig['priceDataSource'])}>
                        <option value="yfinance">yfinance</option>
                        <option value="custom">custom</option>
                      </select>
                      </Field>
                  </div>

                  <div className={backtestConfig.priceDataSource === 'custom' ? 'custom-interface active' : 'custom-interface'}>
                    <div className="endpoint-grid">
                      <Field label={t.customBacktestApi}>
                        <input
                          value={backtestConfig.customBaseUrl ?? ''}
                          onChange={(event) => updateBacktestConfig('customBaseUrl', event.target.value || null)}
                          placeholder="https://prices.example.com/api"
                        />
                        </Field>
                      <Field label={t.customBacktestEndpoint}>
                        <input
                          value={backtestConfig.customEndpoint}
                          onChange={(event) => updateBacktestConfig('customEndpoint', event.target.value)}
                          placeholder="/backtest/prices"
                        />
                        </Field>
                    </div>
                    <label className="secret-row provider-secret">
                      <span>
                        BACKTEST_DATA_API_KEY
                        <small>{secretStatus.BACKTEST_DATA_API_KEY?.configured ? secretStatus.BACKTEST_DATA_API_KEY?.masked : t.notConfigured}</small>
                      </span>
                      <input
                        type="password"
                        autoComplete="off"
                        placeholder={secretStatus.BACKTEST_DATA_API_KEY?.configured ? t.replaceValue : t.pasteKey}
                        value={secretDraft.BACKTEST_DATA_API_KEY ?? ''}
                        onChange={(event) => setSecretDraft((current) => ({ ...current, BACKTEST_DATA_API_KEY: event.target.value }))}
                      />
                    </label>
                  </div>
                  <p className="hint">
                    {locale === 'zh'
                      ? 'custom 复盘行情接口应返回 bars/data 数组，每项包含 date、open、high、low、close。已完成的复盘记录不会再次执行；等待数据或失败的记录会从检查点续跑。'
                      : 'A custom review price API should return a bars/data array with date, open, high, low, close. Completed review records are not rerun; waiting-data or failed records resume from checkpoints.'}
                  </p>
                  <button className="secondary full" onClick={saveBacktestSettings} disabled={isSaving}>
                    <Save size={16} />
                    {t.saveBacktestSettings}
                  </button>
                </div>
              ) : (
                <span className="empty">-</span>
              )}
            </Panel>
            )}
          </section>

          <aside className="settings-side">
            {settingsSection === 'billing' && (
            <Panel title={t.adminBilling} icon={<CreditCard size={17} />}>
              {adminPricing ? (
                <div className="billing-form">
                  <div className="form-grid billing-grid">
                    <Field label={t.billingMode}>
                      <select value={adminPricing.billingMode} onChange={(event) => updateAdminPricing('billingMode', event.target.value as PricingConfig['billingMode'])}>
                        <option value="token">token</option>
                        <option value="per_run">per_run</option>
                        <option value="hybrid">hybrid</option>
                      </select>
                      </Field>
                    <Field label={t.tokenMultiplier}>
                      <input value={adminPricing.tokenMultiplier} onChange={(event) => updateAdminPricing('tokenMultiplier', event.target.value)} inputMode="decimal" />
                      </Field>
                    <Field label={`${t.inputTokens} / 1M`}>
                      <input value={adminPricing.inputTokenPricePer1m} onChange={(event) => updateAdminPricing('inputTokenPricePer1m', event.target.value)} inputMode="decimal" />
                    </Field>
                    <Field label={`${t.outputTokens} / 1M`}>
                      <input value={adminPricing.outputTokenPricePer1m} onChange={(event) => updateAdminPricing('outputTokenPricePer1m', event.target.value)} inputMode="decimal" />
                    </Field>
                    <Field label={t.fixedCharge}>
                      <input value={adminPricing.fixedRunPrice} onChange={(event) => updateAdminPricing('fixedRunPrice', event.target.value)} inputMode="decimal" />
                      </Field>
                    <Field label={t.preauth}>
                      <input value={adminPricing.preauthMultiplier} onChange={(event) => updateAdminPricing('preauthMultiplier', event.target.value)} inputMode="decimal" />
                      </Field>
                  </div>
                  <div className="depth-price-grid">
                    {(['1', '3', '5'] as const).map((depth) => (
                      <section key={depth} className="depth-price-card">
                        <strong>{researchDepthLabel(Number(depth), depth, locale)}</strong>
                        <Field label={t.tokenMultiplier}>
                          <input value={adminPricing.depthMultipliers[depth] ?? '1'} onChange={(event) => updateDepthPrice('depthMultipliers', depth, event.target.value)} inputMode="decimal" />
                          </Field>
                        <Field label={t.fixedCharge}>
                          <input value={adminPricing.fixedPricesByDepth[depth] ?? '0'} onChange={(event) => updateDepthPrice('fixedPricesByDepth', depth, event.target.value)} inputMode="decimal" />
                          </Field>
                        <Field label={t.inputTokens}>
                          <input value={adminPricing.estimatedInputTokensByDepth[depth] ?? 0} onChange={(event) => updateDepthPrice('estimatedInputTokensByDepth', depth, event.target.value)} inputMode="numeric" />
                          </Field>
                        <Field label={t.outputTokens}>
                          <input value={adminPricing.estimatedOutputTokensByDepth[depth] ?? 0} onChange={(event) => updateDepthPrice('estimatedOutputTokensByDepth', depth, event.target.value)} inputMode="numeric" />
                          </Field>
                      </section>
                    ))}
                  </div>
                  <Field label={t.modelOverrides}>
                    <textarea
                      value={modelPriceDraft}
                      onChange={(event) => setModelPriceDraft(event.target.value)}
                      spellCheck={false}
                    />
                    </Field>
                  <button className="secondary full" onClick={saveAdminPricing} disabled={isSaving}>
                    <Save size={16} />
                    {t.saveDefaults}
                  </button>
                </div>
              ) : (
                <span className="empty">-</span>
              )}
            </Panel>
            )}

            {settingsSection === 'users' && (
            <Panel title={t.adminUsers} icon={<Users size={17} />}>
              <div className="new-user-grid">
                <input placeholder={t.username} value={newUserDraft.username} onChange={(event) => setNewUserDraft((current) => ({ ...current, username: event.target.value }))} />
                <input placeholder={t.password} type="password" value={newUserDraft.password} onChange={(event) => setNewUserDraft((current) => ({ ...current, password: event.target.value }))} />
                <input placeholder={t.initialBalance} value={newUserDraft.initialBalance} onChange={(event) => setNewUserDraft((current) => ({ ...current, initialBalance: event.target.value }))} />
                <select value={newUserDraft.role} onChange={(event) => setNewUserDraft((current) => ({ ...current, role: event.target.value as 'admin' | 'user' }))}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                <button className="secondary" onClick={createAdminManagedUser} disabled={isSaving}>
                  <UserPlus size={16} />
                  {t.newUser}
                </button>
              </div>
              <div className="user-list">
                {adminUsers.map((user) => (
                  <section key={user.id} className="user-row">
                    <div>
                      <strong>{user.username}</strong>
                      <small>{user.role} · {formatMoney(user.balance, publicPricing?.currency)} · {t.frozen} {formatMoney(user.frozenBalance, publicPricing?.currency)}</small>
                    </div>
                    <div className="recharge-row">
                      <input placeholder={t.recharge} value={rechargeDraft[user.id] ?? ''} onChange={(event) => setRechargeDraft((current) => ({ ...current, [user.id]: event.target.value }))} inputMode="decimal" />
                      <button className="secondary" onClick={() => rechargeUser(user.id)} disabled={isSaving}>
                        <Wallet size={15} />
                        {t.recharge}
                      </button>
                    </div>
                  </section>
                ))}
              </div>
            </Panel>
            )}

            {settingsSection !== 'billing' && settingsSection !== 'users' && (
            <Panel title={t.setupRecommendations} icon={<Lightbulb size={17} />}>
              <div className="recommendation-list">
                {setupRecommendations.map((item) => (
                  <div key={item} className="recommendation-row">
                    <CircleAlert size={15} />
                    <span>{item}</span>
                  </div>
                ))}
                {setupRecommendations.length === 0 && <span className="empty">{t.recommendationsOk}</span>}
              </div>
            </Panel>
            )}

          </aside>
        </section>
      ) : (
        <section className="workspace-grid workspace-view">
        <section className="workspace-overview">
          <div className="overview-card flow-card">
            <div>
              <span>{t.activeWorkflow}</span>
              <strong>{activeRun?.ticker ?? effectiveTicker}</strong>
            </div>
            <div className={`flow-line ${activeRun?.status ?? 'idle'}`}>
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <Metric label={t.configuredAgents} value={`${config.analysts.length} / ${metadata.analysts.length || 4}`} />
          <div className="overview-card price-card">
            <span>{t.pricingPublic}</span>
            <strong>{publicPricing ? `${publicPricing.billingMode} · x${publicPricing.tokenMultiplier}` : '-'}</strong>
            <small>{publicPricing ? `${t.tokenPrice}: ${formatMoney(publicPricing.inputTokenPricePer1m, publicPricing.currency, 6)}/${formatMoney(publicPricing.outputTokenPricePer1m, publicPricing.currency, 6)} · ${t.fixedCharge}: ${formatMoney(publicPricing.fixedRunPrice, publicPricing.currency)}` : '-'}</small>
          </div>
          <Metric label={t.dataRouteCount} value={customRouteCount} />
          <Metric label={t.estimateTotal} value={timeEstimate.totalSeconds ? formatDuration(timeEstimate.totalSeconds, locale) : t.estimateWaiting} />
          <Metric label={t.estimateRemaining} value={timeEstimate.remainingSeconds != null ? formatDuration(timeEstimate.remainingSeconds, locale) : '-'} />
          <div className="overview-progress">
            <div>
              <span>{configuredTickerCount > 1 ? `${configuredTickerCount} tickers` : config.outputLanguage}</span>
              <small>{timeEstimate.confidence ? `${timeEstimate.confidence} ${t.estimateConfidence}` : t.estimateWaiting}</small>
            </div>
            <div className="estimate-bar" aria-hidden="true">
              <span style={{ width: `${timeEstimate.percent}%` }} />
            </div>
          </div>
        </section>

        <section className="main-column">
          <Panel title={t.analysisSetup} icon={<Settings2 size={17} />}>
            <div className="form-grid">
              <label className="field ticker-list-field">
                <span>{t.tickerList}</span>
                <textarea value={tickerList} onChange={(event) => changeTickerList(event.target.value)} placeholder="SPY, 0700, 600519, 000001" />
                <small>{t.tickerListHint}</small>
              </label>
              <Field label={t.stockMarket}>
                <select value={config.stockMarket} onChange={(event) => changeStockMarket(event.target.value)}>
                  {metadata.stockMarkets.map((market) => (
                    <option key={market.key} value={market.key}>
                      {stockMarketLabels[locale][market.key] ?? market.label}
                    </option>
                  ))}
                </select>
                <small className="field-hint">{t.effectiveTicker}: {effectiveTicker}</small>
                </Field>
              <Field label={t.analysisDate}>
                <input
                  type="date"
                  max={today()}
                  value={config.analysisDate}
                  onChange={(event) => updateConfig('analysisDate', event.target.value)}
                />
                </Field>
              {isAdmin && (
                <Field label={t.provider}>
                  <select
                    value={config.llmProvider}
                    onChange={(event) => changeProvider(event.target.value)}
                  >
                    {metadata.providers.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  </Field>
              )}
            </div>

            <div className={isAdmin ? 'tool-row' : 'tool-row single-control'}>
              {isAdmin && (customNeedsManualModel ? (
                <>
                  <Field label={t.quickModel}>
                    <input
                      value={config.quickThinkLlm}
                      onChange={(event) => updateConfig('quickThinkLlm', event.target.value)}
                      placeholder={t.customModelId}
                    />
                    </Field>
                  <Field label={t.deepModel}>
                    <input
                      value={config.deepThinkLlm}
                      onChange={(event) => updateConfig('deepThinkLlm', event.target.value)}
                      placeholder={t.customModelId}
                    />
                    </Field>
                </>
              ) : (
                <>
                  <Selector
                    icon={<Brain size={16} />}
                    label={t.quickModel}
                    value={config.quickThinkLlm}
                    options={modelOptionsFor('quick', config.quickThinkLlm)}
                    onChange={(value) => updateConfig('quickThinkLlm', value)}
                  />
                  <Selector
                    icon={<Bot size={16} />}
                    label={t.deepModel}
                    value={config.deepThinkLlm}
                    options={modelOptionsFor('deep', config.deepThinkLlm)}
                    onChange={(value) => updateConfig('deepThinkLlm', value)}
                  />
                </>
              ))}
              <Selector
                icon={<Gauge size={16} />}
                label={t.depth}
                value={String(config.researchDepth)}
                options={metadata.researchDepths.map((item) => ({ label: researchDepthLabel(Number(item.value), item.label, locale), value: String(item.value) }))}
                onChange={(value) => updateConfig('researchDepth', Number(value) as 1 | 3 | 5)}
              />
            </div>

            <div className="section-title">
              <BarChart3 size={16} />
              {t.analysts}
            </div>
            <div className="chip-grid">
              {metadata.analysts.map((analyst) => (
                <button
                  key={analyst.value}
                  className={config.analysts.includes(analyst.value) ? 'chip active' : 'chip'}
                  onClick={() => toggleAnalyst(analyst.value)}
                >
                  {config.analysts.includes(analyst.value) && <Check size={14} />}
                  {analystLabels[locale][analyst.value] ?? analyst.label}
                </button>
              ))}
            </div>

            {isAdmin && (
              <>
                <div className="advanced-grid">
                  <Field label={t.openaiReasoning}>
                    <select value={config.openaiReasoningEffort ?? ''} onChange={(event) => updateConfig('openaiReasoningEffort', event.target.value || null)}>
                      <option value="">{t.providerDefault}</option>
                      <option value="low">{t.low}</option>
                      <option value="medium">{t.medium}</option>
                      <option value="high">{t.high}</option>
                    </select>
                    </Field>
                  <Field label={t.geminiThinking}>
                    <select value={config.googleThinkingLevel ?? ''} onChange={(event) => updateConfig('googleThinkingLevel', event.target.value || null)}>
                      <option value="">{t.providerDefault}</option>
                      <option value="minimal">{t.minimal}</option>
                      <option value="high">{t.high}</option>
                    </select>
                    </Field>
                  <Field label={t.anthropicEffort}>
                    <select value={config.anthropicEffort ?? ''} onChange={(event) => updateConfig('anthropicEffort', event.target.value || null)}>
                      <option value="">{t.providerDefault}</option>
                      <option value="low">{t.low}</option>
                      <option value="medium">{t.medium}</option>
                      <option value="high">{t.high}</option>
                    </select>
                    </Field>
                  <Field label={t.parallelRuns}>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={config.maxParallelRuns}
                      onChange={(event) => updateConfig('maxParallelRuns', clampNumber(event.target.value, 1, 8))}
                    />
                    </Field>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={config.checkpointEnabled}
                      onChange={(event) => updateConfig('checkpointEnabled', event.target.checked)}
                    />
                    <span>{t.checkpointResume}</span>
                  </label>
                </div>

                <div className="actions-row">
                  <button className="secondary" onClick={saveConfig} disabled={isSaving}>
                    <Save size={16} />
                    {t.saveDefaults}
                  </button>
                </div>
              </>
            )}
            {batchRuns.length > 0 && (
              <div className="batch-queue">
                <div className="section-title">
                  <ListOrdered size={16} />
                  {t.batchQueue}
                </div>
                <div className="batch-list">
                  {batchRuns.map((run, index) => (
                    <button key={run.id} className={`batch-chip ${run.status}`} onClick={() => selectLiveRun(run.id)}>
                      {index + 1}. {run.ticker}
                      <small>{statusLabel(run.status, outputLocale)}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel title={t.agentTimeline} icon={<Activity size={17} />}>
            <div className="agent-grid">
              {Object.entries(agentStatus).map(([agent, status]) => (
                <span key={agent} className={`agent ${status}`}>
                  <BadgeCheck size={15} />
                  {agentLabels[outputLocale][agent] ?? agent}
                  <small>{statusLabel(status, outputLocale)}</small>
                </span>
              ))}
              {referenceTimeline.map((agent) => (
                <span key={agent.key} className={`agent reference ${agent.status}`}>
                  <BadgeCheck size={15} />
                  {agent.label}
                  <small>{statusLabel(agent.status, outputLocale)}</small>
                </span>
              ))}
              {Object.keys(agentStatus).length === 0 && referenceTimeline.length === 0 && <span className="empty">{t.timelineEmpty}</span>}
            </div>
            <div className="metrics-row">
              <Metric label={t.llmCalls} value={progress?.stats?.llm_calls ?? activeRun?.stats?.llm_calls ?? 0} />
              <Metric label={t.toolCalls} value={progress?.stats?.tool_calls ?? activeRun?.stats?.tool_calls ?? 0} />
              <Metric label={t.inputTokens} value={runBilling?.usage.inputTokens ?? progress?.stats?.tokens_in ?? activeRun?.stats?.tokens_in ?? 0} />
              <Metric label={t.outputTokens} value={runBilling?.usage.outputTokens ?? progress?.stats?.tokens_out ?? activeRun?.stats?.tokens_out ?? 0} />
              <Metric label={t.runCost} value={runBilling ? formatMoney(runBilling.actualAmount, runBilling.currency) : '-'} />
              <Metric label={t.preauth} value={runBilling ? formatMoney(runBilling.preauthorizedAmount, runBilling.currency) : '-'} />
              <Metric label={t.balance} value={runBilling?.balanceAfter ? formatMoney(runBilling.balanceAfter, runBilling.currency) : formatMoney(currentUser.balance, publicPricing?.currency)} />
              <Metric label={t.elapsed} value={`${progress?.elapsedSeconds ?? 0}s`} />
            </div>
            <div className="timeline-estimate">
              <div className="estimate-bar" aria-hidden="true">
                <span style={{ width: `${timeEstimate.percent}%` }} />
              </div>
              <span>
                {t.estimateRemaining}: {timeEstimate.remainingSeconds != null ? formatDuration(timeEstimate.remainingSeconds, outputLocale) : '-'}
                {timeEstimate.confidence ? ` · ${timeEstimate.confidence} ${t.estimateConfidence}` : ''}
              </span>
            </div>
          </Panel>

          <Panel
            title={t.reports}
            icon={<Server size={17} />}
            className="report-panel"
            actions={
              <button className="icon-button" onClick={() => setReaderOpen(true)} aria-label={t.openReportReader} title={t.openReportReader}>
                <Maximize2 size={16} />
              </button>
            }
          >
            {reportContext}
            {renderReportReader()}
          </Panel>

        </section>

        <aside className="right-rail">
          <Panel title={t.reportHistory} icon={<History size={17} />}>
            <div className="history-filter-bar">
              <label className="filter-input wide">
                <Search size={14} />
                <input
                  value={historyFilters.query}
                  onChange={(event) => setHistoryFilters((current) => ({ ...current, query: event.target.value }))}
                  placeholder={t.reportSearch}
                />
              </label>
              <label className="filter-input">
                <Filter size={14} />
                <input
                  value={historyFilters.ticker}
                  onChange={(event) => setHistoryFilters((current) => ({ ...current, ticker: event.target.value }))}
                  placeholder={t.ticker}
                />
              </label>
              <select value={historyFilters.status} onChange={(event) => setHistoryFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="">{locale === 'zh' ? '状态' : 'Status'}</option>
                {['succeeded', 'failed', 'cancelled', 'running', 'queued'].map((status) => (
                  <option key={status} value={status}>{statusLabel(status, locale)}</option>
                ))}
              </select>
              <input
                type="date"
                value={historyFilters.date}
                onChange={(event) => setHistoryFilters((current) => ({ ...current, date: event.target.value }))}
              />
              <input
                value={historyFilters.provider}
                onChange={(event) => setHistoryFilters((current) => ({ ...current, provider: event.target.value }))}
                placeholder={t.provider}
              />
            </div>
            <div className="history-list">
              {filteredHistory.map((item) => (
                <button
                  key={item.runId}
                  className={selectedHistoryId === item.runId ? 'history-row active' : 'history-row'}
                  onClick={() => loadHistoricalReport(item.runId)}
                >
                  <span>
                    <strong>{item.ticker}</strong>
                    <small>{item.analysisDate}</small>
                  </span>
                  <span>
                    <small>{item.provider}</small>
                    <em>{item.decision ?? statusLabel(item.status, locale)}</em>
                  </span>
                </button>
              ))}
              {filteredHistory.length === 0 && <span className="empty">{t.historyEmpty}</span>}
            </div>
          </Panel>

          <Panel title={t.orders} icon={<ReceiptText size={17} />}>
            <div className="order-list">
              {orders.slice(0, 8).map((order) => (
                <div key={order.id} className="order-row">
                  <span>
                    <strong>{orderTypeLabel(order.type, t)}</strong>
                    <small>{statusLabel(order.status, locale)} · {new Date(order.createdAt).toLocaleString()}</small>
                    {order.errorSummary && (
                      <p className="order-error">{t.errorSummary}: {order.errorSummary}</p>
                    )}
                    {order.status === 'failed_settled' && (
                      <small>
                        {t.failureStage}: {order.errorStage ?? '-'} · {t.chargedOnFailure}: {order.chargedOnFailure ? t.yes : t.no}
                      </small>
                    )}
                  </span>
                  <span>
                    <em>{formatMoney(order.actualAmount || order.amount || order.frozenAmount, order.currency)}</em>
                    <small>{order.runId ? order.runId.slice(0, 8) : order.externalOrderId ?? '-'}</small>
                    {order.runId && (
                      <button className="text-button compact" onClick={() => viewOrderRun(order.runId!)}>
                        {t.viewRun}
                      </button>
                    )}
                  </span>
                </div>
              ))}
              {orders.length === 0 && <span className="empty">{t.orders}: -</span>}
            </div>
          </Panel>

          <Panel title={t.eventStream} icon={<TerminalSquare size={17} />}>
            <div className="event-list">
              {[...events].reverse().slice(0, 30).map((event) => (
                <div key={`${event.id}-${event.timestamp}`} className="event-row">
                  <span>{eventLabels[outputLocale][event.type] ?? event.type}</span>
                  <p>{eventSummary(event, outputLocale)}</p>
                </div>
              ))}
              {events.length === 0 && <span className="empty">{t.eventsEmpty}</span>}
            </div>
          </Panel>

        </aside>
        {isReaderOpen && (
          <div className="reader-overlay" role="dialog" aria-modal="true" aria-label={t.reports}>
            <section className="reader-modal">
              <div className="reader-modal-header">
                <div>
                  <span>{t.reports}</span>
                  <strong>{activeReportTitle}</strong>
                </div>
                <button className="icon-button" onClick={() => setReaderOpen(false)} aria-label={t.closeReportReader} title={t.closeReportReader}>
                  <X size={17} />
                </button>
              </div>
              {reportContext}
              {renderReportReader()}
            </section>
          </div>
        )}
        {pendingRun && (
          <div className="reader-overlay" role="dialog" aria-modal="true" aria-label={t.confirmRunTitle}>
            <section className="confirm-modal">
              <div className="reader-modal-header">
                <div>
                  <span>{t.runAnalysis}</span>
                  <strong>{t.confirmRunTitle}</strong>
                </div>
                <button className="icon-button" onClick={() => setPendingRun(null)} aria-label={t.cancel} title={t.cancel}>
                  <X size={17} />
                </button>
              </div>
              <p className="hint">{t.confirmRunBody}</p>
              <div className="confirm-metrics">
                <Metric label={t.estimatedFreeze} value={formatMoney(pendingRun.estimate.preauthorizedAmount, pendingRun.estimate.currency)} />
                <Metric label={t.estimatedCharge} value={formatMoney(pendingRun.estimate.estimatedAmount, pendingRun.estimate.currency)} />
                <Metric label={t.runCount} value={pendingRun.estimate.runCount} />
                <Metric label={t.workerCount} value={pendingRun.estimate.maxParallelRuns} />
              </div>
              <div className="confirm-summary">
                <span>{t.provider}: <strong>{pendingRun.estimate.modelProvider}</strong></span>
                <span>{t.quickModel}: <strong>{pendingRun.estimate.quickModel}</strong></span>
                <span>{t.deepModel}: <strong>{pendingRun.estimate.deepModel}</strong></span>
                <span>{t.tickerList}: <strong>{pendingRun.tickers.join(', ')}</strong></span>
              </div>
              <div className="actions-row">
                <button className="secondary" onClick={() => setPendingRun(null)}>
                  {t.cancel}
                </button>
                <button className="primary" onClick={confirmPendingRun} disabled={isRunning}>
                  <Play size={16} />
                  {t.confirmStart}
                </button>
              </div>
            </section>
          </div>
        )}
        </section>
      )}
    </main>
  );
}

function AuthScreen({
  mode,
  locale,
  labels,
  onLocaleChange,
  onAuthenticated,
}: {
  mode: 'login' | 'bootstrap';
  locale: Locale;
  labels: Record<string, string>;
  onLocaleChange: (locale: Locale) => void;
  onAuthenticated: (user: User) => Promise<void>;
}) {
  const [username, setUsername] = useState(mode === 'bootstrap' ? 'admin' : '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [initialBalance, setInitialBalance] = useState('100.00');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      setError(labels.usernameTooShort);
      setLoading(false);
      return;
    }
    if (password.length < 8) {
      setError(labels.passwordTooShort);
      setLoading(false);
      return;
    }
    if (mode === 'bootstrap' && (!initialBalance.trim() || Number.isNaN(Number(initialBalance)))) {
      setError(labels.invalidInitialBalance);
      setLoading(false);
      return;
    }
    try {
      const session =
        mode === 'bootstrap'
          ? await api.bootstrap({ username: trimmedUsername, password, displayName: displayName || null, initialBalance })
          : await api.login(trimmedUsername, password);
      await onAuthenticated(session.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell" lang={locale === 'zh' ? 'zh-CN' : 'en'}>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-card-head">
          <div>
            <p className="eyebrow">{labels.eyebrow}</p>
            <h1>{mode === 'bootstrap' ? labels.bootstrapTitle : labels.loginTitle}</h1>
          </div>
          <div className="locale-switch" aria-label="Interface language">
            <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => onLocaleChange('en')}>
              EN
            </button>
            <button type="button" className={locale === 'zh' ? 'active' : ''} onClick={() => onLocaleChange('zh')}>
              中文
            </button>
          </div>
        </div>
        {error && (
          <div className="alert compact">
            <CircleAlert size={18} />
            <span>{error}</span>
          </div>
        )}
        <Field label={labels.username}>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </Field>
        <Field label={labels.password}>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'bootstrap' ? 'new-password' : 'current-password'} />
        </Field>
        {mode === 'bootstrap' && (
          <>
            <Field label={labels.displayName}>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </Field>
            <Field label={labels.initialBalance}>
              <input value={initialBalance} onChange={(event) => setInitialBalance(event.target.value)} inputMode="decimal" />
            </Field>
          </>
        )}
        <button className="primary full" type="submit" disabled={loading}>
          {loading ? <Loader2 className="spin" size={17} /> : mode === 'bootstrap' ? <UserPlus size={17} /> : <LogIn size={17} />}
          {mode === 'bootstrap' ? labels.createAdmin : labels.signIn}
        </button>
      </form>
    </main>
  );
}

function Panel({
  title,
  icon,
  actions,
  className,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className ? `panel ${className}` : 'panel'}>
      <div className="panel-header">
        <div className="panel-title">
          <span>{icon}</span>
          <h2>{title}</h2>
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function Selector({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="selector">
      <span>
        {icon}
        {label}
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.length === 0 && <option value={value}>{value}</option>}
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type TimeEstimate = {
  totalSeconds: number | null;
  remainingSeconds: number | null;
  percent: number;
  confidence: string | null;
};

function estimateRunTime(
  events: RunEvent[],
  agentStatus: Record<string, string>,
  progress: { elapsedSeconds?: number } | undefined,
  activeRun: RunInfo | null,
  locale: Locale,
): TimeEstimate {
  const statusValues = Object.values(agentStatus);
  const totalAgents = statusValues.length;
  const completed = statusValues.filter((status) => status === 'completed').length;
  const isDone = activeRun?.status === 'succeeded' || activeRun?.status === 'failed' || activeRun?.status === 'cancelled';
  const elapsedSeconds = Math.max(0, Math.round(progress?.elapsedSeconds ?? elapsedFromRun(events, activeRun)));

  if (!activeRun || elapsedSeconds === 0) {
    return { totalSeconds: null, remainingSeconds: null, percent: 0, confidence: null };
  }
  if (isDone) {
    return { totalSeconds: elapsedSeconds, remainingSeconds: 0, percent: 100, confidence: confidenceLabel('high', locale) };
  }
  if (totalAgents === 0) {
    return { totalSeconds: null, remainingSeconds: null, percent: 8, confidence: null };
  }

  const progressUnits = completed > 0 ? completed : statusValues.some((status) => status === 'in_progress') ? 0.45 : 0;
  if (progressUnits === 0) {
    return { totalSeconds: null, remainingSeconds: null, percent: 5, confidence: null };
  }

  const totalSeconds = Math.max(elapsedSeconds, Math.round((elapsedSeconds / progressUnits) * totalAgents));
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const percent = Math.max(6, Math.min(96, Math.round((elapsedSeconds / totalSeconds) * 100)));
  const confidence =
    completed >= Math.max(3, Math.ceil(totalAgents * 0.5))
      ? confidenceLabel('high', locale)
      : completed >= 1
        ? confidenceLabel('medium', locale)
        : confidenceLabel('low', locale);
  return { totalSeconds, remainingSeconds, percent, confidence };
}

function elapsedFromRun(events: RunEvent[], activeRun: RunInfo | null) {
  const latestEvent = events.at(-1);
  const endTime = latestEvent ? Date.parse(latestEvent.timestamp) : Date.now();
  const startTime = activeRun?.startedAt ? Date.parse(activeRun.startedAt) : activeRun?.submittedAt ? Date.parse(activeRun.submittedAt) : endTime;
  if (!Number.isFinite(endTime) || !Number.isFinite(startTime)) return 0;
  return Math.max(0, (endTime - startTime) / 1000);
}

function formatDuration(seconds: number, locale: Locale) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainingSeconds = total % 60;
  if (minutes <= 0) return locale === 'zh' ? `${remainingSeconds}秒` : `${remainingSeconds}s`;
  if (remainingSeconds === 0) return locale === 'zh' ? `${minutes}分` : `${minutes}m`;
  return locale === 'zh' ? `${minutes}分${remainingSeconds}秒` : `${minutes}m ${remainingSeconds}s`;
}

function formatMoney(value: string | number | null | undefined, currency = 'USD', fractionDigits = 4) {
  const amount = Number(value ?? 0);
  const digits = Math.max(0, Math.min(6, fractionDigits));
  if (!Number.isFinite(amount)) return `0 ${currency}`;
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
  }).format(amount);
  return `${formatted} ${currency}`;
}

function formatNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '-';
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function confidenceLabel(value: 'low' | 'medium' | 'high', locale: Locale) {
  if (locale === 'zh') {
    return value === 'high' ? '高' : value === 'medium' ? '中' : '低';
  }
  return value;
}

type BacktestObservation = {
  hasReport: boolean;
  decision: string;
  entry: string;
  stop: string;
  targets: string;
  position: string;
  risks: string;
  order: string[];
  assumptions: string[];
};

function BacktestObservationView({
  observation,
  record,
  summary,
  labels,
  locale,
  onRun,
  isRunning,
}: {
  observation: BacktestObservation;
  record: BacktestRecord | null;
  summary: BacktestTickerSummary | null;
  labels: Record<string, string>;
  locale: Locale;
  onRun: () => void;
  isRunning: boolean;
}) {
  if (!observation.hasReport && !record) {
    return <span className="empty">{labels.backtestNoReport}</span>;
  }
  const completed = record?.status === 'completed';
  const actionLabel = completed ? labels.alreadyReviewed : record ? labels.resumeBacktest : labels.runBacktest;
  const plan = record?.plan;
  const result = record?.result;
  return (
    <div className="observation-view">
      <div className="backtest-record-head">
        <div>
          <span>{labels.backtestRecord}</span>
          <strong>{record ? `${labels.backtestStatus}: ${statusLabel(record.status, locale)}` : labels.noBacktestRecord}</strong>
          {record && (
            <small>
              {labels.resumeCount}: {record.resumeCount} · {labels.checkpoints}: {record.lastCheckpoint ?? '-'}
            </small>
          )}
        </div>
        <button className={completed ? 'secondary' : 'primary'} onClick={onRun} disabled={isRunning || completed || !observation.hasReport}>
          {isRunning ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
          {actionLabel}
        </button>
      </div>

      {summary && (
        <section className="backtest-summary">
          <div className="section-title compact-title">
            <BarChart3 size={16} />
            {labels.tickerHitSummary}: {summary.ticker}
          </div>
          <div className="backtest-summary-grid">
            <Metric label={labels.reports} value={summary.totalReports} />
            <Metric label={labels.backtestRecord} value={`${summary.completedRecords}/${summary.recordsTotal}`} />
            <Metric label={labels.entryHit} value={summary.entryHits} />
            <Metric label={labels.targetHit} value={summary.targetHits} />
            <Metric label={labels.stopHit} value={summary.stopHits} />
            <Metric label={labels.backtestOutcome} value={`${summary.manualReview}/${summary.ambiguous}/${summary.waitingData}`} />
          </div>
        </section>
      )}

      {record && (
        <section className="backtest-result">
          <div className="result-row">
            <span>{labels.backtestOutcome}</span>
            <strong>{statusLabel(result?.outcome ?? record.status, locale)}</strong>
          </div>
          <div className="result-row">
            <span>{labels.priceSource}</span>
            <strong>{result?.priceSource ?? '-'}</strong>
          </div>
          <div className="result-row">
            <span>{labels.barsChecked}</span>
            <strong>{result?.barsChecked ?? 0}</strong>
          </div>
          <div className="hit-grid">
            <HitCard label={labels.entryHit} hit={result?.entryHit} date={result?.entryHitDate} price={result?.entryHitPrice} labels={labels} locale={locale} />
            <HitCard label={labels.targetHit} hit={result?.targetHit} date={result?.targetHitDate} price={result?.targetHitPrice} labels={labels} locale={locale} />
            <HitCard label={labels.stopHit} hit={result?.stopHit} date={result?.stopHitDate} price={result?.stopHitPrice} labels={labels} locale={locale} />
          </div>
          {result?.notes?.length ? (
            <ul className="note-list">
              {result.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      <div className="observation-grid">
        <ObservationCard label={labels.extractedDecision} value={plan?.decision ?? observation.decision} />
        <ObservationCard label={labels.entryPlan} value={plan?.entryPlan ?? observation.entry} />
        <ObservationCard label={labels.stopPlan} value={plan?.stopPlan ?? observation.stop} />
        <ObservationCard label={labels.targetPlan} value={plan?.targetPlan ?? observation.targets} />
        <ObservationCard label={labels.positionPlan} value={plan?.positionPlan ?? observation.position} />
        <ObservationCard label={labels.riskPlan} value={plan?.riskPlan ?? observation.risks} />
      </div>
      <section className="observation-section">
        <h3>{labels.observationOrder}</h3>
        <ol>
          {(plan?.observationOrder?.length ? plan.observationOrder : observation.order).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>
      <section className="observation-section">
        <h3>{labels.assumptionChecks}</h3>
        <ul>
          {(plan?.assumptions?.length ? plan.assumptions : observation.assumptions).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      {record?.checkpoints?.length ? (
        <section className="observation-section">
          <h3>{labels.checkpoints}</h3>
          <div className="checkpoint-list">
            {record.checkpoints.map((checkpoint) => (
              <div key={checkpoint.key} className={`checkpoint-row ${checkpoint.status}`}>
                <span>{cleanLabel(checkpoint.key)}</span>
                <strong>{statusLabel(checkpoint.status, locale)}</strong>
                <small>{new Date(checkpoint.updatedAt).toLocaleString()}</small>
                {checkpoint.message && <p>{checkpoint.message}</p>}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function HitCard({
  label,
  hit,
  date,
  price,
  labels,
  locale,
}: {
  label: string;
  hit?: boolean | null;
  date?: string | null;
  price?: number | null;
  labels: Record<string, string>;
  locale: Locale;
}) {
  return (
    <section className={`hit-card ${hit ? 'hit' : 'miss'}`}>
      <span>{label}</span>
      <strong>{hit == null ? '-' : hit ? (locale === 'zh' ? '是' : 'Yes') : (locale === 'zh' ? '否' : 'No')}</strong>
      <small>
        {labels.hitDate}: {date ?? '-'} · {labels.hitPrice}: {formatNumber(price)}
      </small>
    </section>
  );
}

function ObservationCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="observation-card">
      <span>{label}</span>
      <p>{value || '-'}</p>
    </section>
  );
}

function modelForRole(config: WebConfig, role: 'quick' | 'deep') {
  return role === 'deep' ? config.deepThinkLlm : config.quickThinkLlm;
}

function routeLabel(value: string, locale: Locale) {
  return agentLabels[locale][value] ?? value;
}

function routeDescription(stage: string, parallelizable: boolean) {
  if (stage === 'reference') return '该参考评审在组合经理决策之后运行，不改写主流程结论；可单独配置模型，用完整 skill 做收尾审视。';
  if (parallelizable) return '该初始分析节点与其他初始分析师没有强顺序依赖，适合后续并行扇出，也适合配置独立 API Key 分摊限流。';
  if (stage === 'research') return '该研究辩论节点依赖前文对话，保持顺序执行；独立 API 路由主要用于分摊限流。';
  if (stage === 'risk') return '该风控辩论节点依赖交易计划和前序风控意见，保持顺序执行；独立 API 路由主要用于分摊限流。';
  return '该节点依赖上一阶段输出，保持默认顺序执行；独立 API 路由主要用于分摊限流。';
}

function clampNumber(value: string, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function mergeRunLists(current: RunInfo[], active: RunInfo[]) {
  const merged = new Map(current.map((run) => [run.id, run]));
  active.forEach((run) => merged.set(run.id, run));
  return [...merged.values()].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

function buildBacktestObservation(payload: ReportsPayload | null, run: RunInfo | null, locale: Locale): BacktestObservation {
  const text = reportText(payload);
  const hasReport = Boolean(text.trim());
  const fallback = locale === 'zh' ? '报告未明确给出，需要人工确认。' : 'Not explicit in the report; confirm manually.';
  const decision =
    extractReportLine(text, [
      /最终交易建议\s*[：:]\s*([^\n]+)/i,
      /最终交易决策\s*[：:]\s*([^\n]+)/i,
      /Final\s+(?:trading\s+)?(?:recommendation|decision)\s*[：:]\s*([^\n]+)/i,
      /Portfolio Manager Decision\s*\n+([^\n]+)/i,
    ]) || payload?.decision || run?.decision || fallback;
  const entry =
    extractReportLine(text, [
      /[-*]\s*(?:\*\*)?(?:策略|入场|买入计划)(?:\*\*)?\s*[：:]\s*([^\n]+)/i,
      /(?:Entry|Strategy)\s*(?:plan)?\s*[：:]\s*([^\n]+)/i,
    ]) || fallback;
  const stop =
    extractReportLine(text, [
      /[-*]\s*(?:\*\*)?(?:止损|止损位)(?:\*\*)?\s*[：:]\s*([^\n]+)/i,
      /(?:Stop|Stop loss)\s*[：:]\s*([^\n]+)/i,
    ]) || fallback;
  const targets =
    extractReportLine(text, [
      /[-*]\s*(?:\*\*)?(?:目标|目标价|止盈)(?:\*\*)?\s*[：:]\s*([^\n]+)/i,
      /(?:Target|Targets|Take profit)\s*[：:]\s*([^\n]+)/i,
    ]) || fallback;
  const position =
    extractReportLine(text, [
      /[-*]\s*(?:\*\*)?(?:仓位|头寸)(?:\*\*)?\s*[：:]\s*([^\n]+)/i,
      /(?:Position|Sizing)\s*[：:]\s*([^\n]+)/i,
    ]) || fallback;
  const risks =
    extractReportLine(text, [
      /[-*]\s*(?:\*\*)?(?:风险提示|风险|失效条件)(?:\*\*)?\s*[：:]\s*([^\n]+)/i,
      /(?:Risk|Invalidation)\s*(?:trigger|note|condition)?s?\s*[：:]\s*([^\n]+)/i,
    ]) || fallback;

  const zh = locale === 'zh';
  const order = zh
    ? [
        '先观察价格是否触达报告给出的入场条件或回调区域；没有触发入场前，不统计止损和目标是否命中。',
        '一旦触发入场，记录成交日期和成交价；后续止损、目标都从这个时间点之后开始判断。',
        '按时间顺序比较止损位、第一目标、第二目标和风险失效条件；顺序比单纯是否触达更重要。',
        '如果同一根 K 线同时覆盖入场、止损或目标，需要使用更细粒度行情确认先后顺序。',
      ]
    : [
        'First check whether price reaches the report entry condition or pullback zone; before entry, stop/target hits are not counted.',
        'After entry, record the fill date and fill price; stop and target checks start after that fill.',
        'Compare stop, first target, second target, and invalidation triggers chronologically; sequence matters more than simple touch/no-touch.',
        'If one candle contains entry, stop, or target at the same time, use finer-grained data to resolve the order.',
      ];
  const assumptions = zh
    ? [
        stop.includes('入场价') || /entry/i.test(stop)
          ? '止损描述为“入场价下方”的价差规则，应在实际成交后用成交价计算，不应直接用当前价计算。'
          : '止损基准没有完全明确，复盘时需要确认它是固定价格、相对入场价，还是关键支撑位。',
        /ATR|支撑|support/i.test(stop)
          ? '如果 ATR 止损和关键支撑位同时存在，需要确定采用哪个规则，或采用二者中更保守的一档。'
          : '如果报告没有给出 ATR/支撑位细节，后续自动回测只能先标记为人工复核项。',
        '复盘观察只拆解报告和执行顺序，不改动 TradingAgents 后端分析框架。',
      ]
    : [
        /entry/i.test(stop) || stop.includes('入场价')
          ? 'The stop is described as a distance below entry, so compute it from the actual fill price rather than the current price.'
          : 'The stop basis is not fully explicit; confirm whether it is a fixed price, relative to entry, or tied to support.',
        /ATR|support|支撑/i.test(stop)
          ? 'When ATR stop and support stop both appear, decide which rule is authoritative, or use the more conservative level.'
          : 'If ATR/support details are absent, mark the stop as a manual review item before automated backtesting.',
        'This observation layer parses the report and execution sequence without changing the TradingAgents backend framework.',
      ];

  return { hasReport, decision, entry, stop, targets, position, risks, order, assumptions };
}

function reportText(payload: ReportsPayload | null) {
  if (!payload) return '';
  const parts = [payload.finalReport ?? '', payload.decision ?? ''];
  Object.values(payload.reports ?? {}).forEach((value) => {
    parts.push(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  });
  return parts.filter(Boolean).join('\n\n');
}

function extractReportLine(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\*\*/g, '').trim();
  }
  return '';
}

function parseTickerList(value: string) {
  const tickers: string[] = [];
  value
    .split(/[\s,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const ticker = item.includes('.') ? item.replace(/\s+/g, '').toUpperCase() : item.replace(/\s+/g, '').toUpperCase();
      if (ticker && !tickers.includes(ticker)) tickers.push(ticker);
    });
  return tickers.slice(0, 50);
}

function formatMarketTicker(ticker: string, profile?: { region?: string | null; appendRegionSuffix?: boolean | null }) {
  const symbol = ticker.trim().replace(/\s+/g, '').toUpperCase();
  if (profile?.appendRegionSuffix === false) return symbol;
  const region = profile?.region?.trim().replace(/^\.+/, '') ?? '';
  if (!symbol || !region || symbol.includes('.')) return symbol;
  return `${symbol}.${region}`;
}

function outputLanguageLocale(language: string): Locale {
  const normalized = language.trim().toLowerCase();
  return normalized.startsWith('chinese') || normalized === '中文' || normalized.startsWith('zh') ? 'zh' : 'en';
}

function dataVendorOptionLabel(option: string, locale: Locale) {
  if (isLongbridgeProxyVendor(option)) {
    return locale === 'zh'
      ? 'longbridge_proxy / 长桥只读代理（高级预设）'
      : 'longbridge_proxy / Longbridge read-only proxy (advanced preset)';
  }
  if (isAshareFundamentalsVendor(option)) {
    return locale === 'zh'
      ? 'a_share_fundamentals / A 股基本面接口（高级预设）'
      : 'a_share_fundamentals / A-share fundamentals (advanced preset)';
  }
  if (option === 'custom') {
    return locale === 'zh' ? 'custom / 自定义市场数据源' : 'custom / Custom market data source';
  }
  return option;
}

function marketLabel(key: string, locale: Locale) {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      us: 'US stocks',
      hk: 'Hong Kong stocks',
      sh: 'Shanghai A shares',
      sz: 'Shenzhen A shares',
    },
    zh: {
      us: '美股',
      hk: '港股',
      sh: '上证 A 股',
      sz: '深证 A 股',
    },
  };
  return labels[locale][key] ?? key;
}

function isDeepSeekConfig(config: WebConfig, provider?: Metadata['providers'][number]) {
  const values = [
    config.llmProvider,
    provider?.label ?? '',
    config.backendUrl ?? '',
    config.quickThinkLlm,
    config.deepThinkLlm,
    ...Object.values(config.llmRoutes ?? {}).flatMap((route) => [
      route.provider ?? '',
      route.backendUrl ?? '',
      route.modelId ?? '',
    ]),
  ];
  return values.some((value) => value.toLowerCase().includes('deepseek'));
}

function deepseekThinkingOptions(metadata: Metadata, locale: Locale) {
  if (metadata.deepseekThinkingModes.length > 0) {
    return metadata.deepseekThinkingModes.map((option) => ({
      value: option.value,
      label: locale === 'zh' ? deepseekThinkingLabel(option.value, locale) : option.label,
    }));
  }
  return (['disabled', 'default', 'enabled'] as const).map((value) => ({
    value,
    label: deepseekThinkingLabel(value, locale),
  }));
}

function deepseekThinkingLabel(value: 'default' | 'enabled' | 'disabled', locale: Locale) {
  const labels = {
    en: {
      default: 'Default',
      enabled: 'Enabled',
      disabled: 'Disabled',
    },
    zh: {
      default: '默认',
      enabled: '启用',
      disabled: '禁用（推荐）',
    },
  };
  return labels[locale][value];
}

function buildSetupRecommendations(
  config: WebConfig,
  metadata: Metadata,
  secretStatus: SecretStatus,
  provider: Metadata['providers'][number] | undefined,
  locale: Locale,
  longbridgeProxyBaseUrl: string,
  ashareFundamentalsBaseUrl: string,
) {
  const items: string[] = [];
  const toolVendors = config.toolVendors ?? {};
  const methodCategory = Object.fromEntries(metadata.customDataMethods.map((method) => [method.method, method.category]));
  const marketOverrides = config.marketDataOverrides ?? {};
  const selectedVendors = [
    ...Object.values(config.dataVendors),
    ...Object.values(toolVendors),
    ...Object.values(marketOverrides).flatMap((override) => [
      ...Object.values(override.dataVendors ?? {}),
      ...Object.values(override.toolVendors ?? {}),
    ]),
  ];

  if (provider?.apiKeyField && !secretStatus[provider.apiKeyField]?.configured) {
    items.push(locale === 'zh' ? `当前模型供应商需要配置 ${provider.apiKeyField}。` : `Configure ${provider.apiKeyField} for the selected LLM provider.`);
  }

  if (selectedVendors.includes('alpha_vantage') && !secretStatus.ALPHA_VANTAGE_API_KEY?.configured) {
    items.push(locale === 'zh' ? '已选择 Alpha Vantage 数据源，需要配置 ALPHA_VANTAGE_API_KEY。' : 'Alpha Vantage is selected for data, so ALPHA_VANTAGE_API_KEY is required.');
  }

  if (isDeepSeekConfig(config, provider) && config.deepseekThinkingMode !== 'disabled') {
    items.push(locale === 'zh'
      ? 'DeepSeek 工具调用工作流建议将 Thinking Mode 设为 Disabled，避免 reasoning_content 回传错误。'
      : 'DeepSeek tool-calling workflows should use Thinking Mode = Disabled to avoid reasoning_content replay errors.');
  }

  const customCategories = new Set<string>();
  const longbridgeCategories = longbridgeProxyCategories(config, metadata.customDataMethods);
  const ashareMarkets = ashareFundamentalsMarkets(config, metadata.customDataMethods);
  Object.entries(config.dataVendors).forEach(([category, vendor]) => {
    if (isCustomLikeDataVendor(vendor)) customCategories.add(category);
  });
  Object.entries(toolVendors).forEach(([method, vendor]) => {
    if (isCustomLikeDataVendor(vendor) && methodCategory[method]) customCategories.add(methodCategory[method]);
  });
  Object.entries(marketOverrides).forEach(([market, override]) => {
    Object.entries(override.dataVendors ?? {}).forEach(([category, vendor]) => {
      if (isCustomLikeDataVendor(vendor)) customCategories.add(`${market}.${category}`);
    });
    Object.entries(override.toolVendors ?? {}).forEach(([method, vendor]) => {
      if (isCustomLikeDataVendor(vendor) && methodCategory[method]) customCategories.add(`${market}.${methodCategory[method]}`);
    });
  });

  const directCustomCategories = new Set<string>();
  Object.entries(config.dataVendors).forEach(([category, vendor]) => {
    if (vendor === 'custom') directCustomCategories.add(category);
  });
  Object.entries(toolVendors).forEach(([method, vendor]) => {
    if (vendor === 'custom' && methodCategory[method]) directCustomCategories.add(methodCategory[method]);
  });
  Object.entries(marketOverrides).forEach(([market, override]) => {
    Object.entries(override.dataVendors ?? {}).forEach(([category, vendor]) => {
      if (vendor === 'custom') directCustomCategories.add(`${market}.${category}`);
    });
    Object.entries(override.toolVendors ?? {}).forEach(([method, vendor]) => {
      if (vendor === 'custom' && methodCategory[method]) directCustomCategories.add(`${market}.${methodCategory[method]}`);
    });
  });

  if (directCustomCategories.size > 0 && !secretStatus.CUSTOM_DATA_API_KEY?.configured) {
    items.push(locale === 'zh' ? '已启用 custom 市场数据源，建议配置 CUSTOM_DATA_API_KEY 保护自定义数据服务。' : 'Custom market data routes are enabled; configure CUSTOM_DATA_API_KEY to protect the custom data service.');
  }

  const missingLongbridgeBase = new Set<string>();
  Object.entries(config.dataVendors).forEach(([category, vendor]) => {
    if (isLongbridgeProxyVendor(vendor) && !(longbridgeProxyBaseUrl.trim() || config.customDataInterfaces[category]?.baseUrl)) {
      missingLongbridgeBase.add(category);
    }
  });
  Object.entries(toolVendors).forEach(([method, vendor]) => {
    const category = methodCategory[method];
    if (category && isLongbridgeProxyVendor(vendor) && !(longbridgeProxyBaseUrl.trim() || config.customDataInterfaces[category]?.baseUrl)) {
      missingLongbridgeBase.add(category);
    }
  });
  Object.entries(marketOverrides).forEach(([market, override]) => {
    const marketCategories = new Set<string>();
    Object.entries(override.dataVendors ?? {}).forEach(([category, vendor]) => {
      if (isLongbridgeProxyVendor(vendor)) marketCategories.add(category);
    });
    Object.entries(override.toolVendors ?? {}).forEach(([method, vendor]) => {
      const category = methodCategory[method];
      if (category && isLongbridgeProxyVendor(vendor)) marketCategories.add(category);
    });
    marketCategories.forEach((category) => {
      if (!override.customDataInterfaces?.[category]?.baseUrl) {
        missingLongbridgeBase.add(`${market}.${category}`);
      }
    });
  });
  if (missingLongbridgeBase.size > 0) {
    const names = [...missingLongbridgeBase].map((category) => {
      if (!category.includes('.')) return dataVendorLabels[locale][category] ?? category;
      const [market, marketCategory] = category.split('.');
      return `${marketLabel(market, locale)} / ${dataVendorLabels[locale][marketCategory] ?? marketCategory}`;
    }).join(', ');
    items.push(locale === 'zh' ? `已选择长桥只读代理，但 Longbridge Proxy Base URL 为空：${names}。` : `Longbridge read-only proxy is selected, but Longbridge Proxy Base URL is empty for: ${names}.`);
  }

  if (ashareMarkets.size > 0 && !ashareFundamentalsBaseUrl.trim()) {
    items.push(locale === 'zh'
      ? '已选择 A 股基本面接口，但 A 股基本面 Base URL 为空。'
      : 'A-share fundamentals preset is selected, but its Base URL is empty.');
  }

  const missingCustomBase = [...customCategories].filter((category) => {
    if (!category.includes('.')) {
      return !longbridgeCategories.has(category) && !config.customDataInterfaces[category]?.baseUrl;
    }
    const [market, marketCategory] = category.split('.');
    const marketVendor = marketOverrides[market]?.dataVendors?.[marketCategory];
    return !isLongbridgeProxyVendor(marketVendor) && !marketOverrides[market]?.customDataInterfaces?.[marketCategory]?.baseUrl;
  });
  if (missingCustomBase.length > 0) {
    const names = missingCustomBase.map((category) => {
      if (!category.includes('.')) return dataVendorLabels[locale][category] ?? category;
      const [market, marketCategory] = category.split('.');
      return `${marketLabel(market, locale)} / ${dataVendorLabels[locale][marketCategory] ?? marketCategory}`;
    }).join(', ');
    items.push(locale === 'zh' ? `这些 custom 市场数据源还缺少 Base URL：${names}。` : `Custom market data Base URL is missing for: ${names}.`);
  }

  const newsMethods = metadata.customDataMethods.filter((method) => method.category === 'news_data');
  const newsUsesYfinance = newsMethods.some((method) => (toolVendors[method.method] || config.dataVendors.news_data) === 'yfinance');
  if (newsUsesYfinance) {
    items.push(locale === 'zh' ? '新闻数据仍有方法使用 yfinance；如需更完整的个股新闻/全球新闻，建议将 get_news 与 get_global_news 分别配置为 Alpha Vantage 或 custom。' : 'Some news methods still use yfinance; for fuller ticker/global news coverage, route get_news and get_global_news to Alpha Vantage or custom services.');
  }

  const enabledRoutes = metadata.llmRouteTargets.filter((target) => config.llmRoutes?.[target.key]?.enabled);
  const missingRouteKeys = enabledRoutes.filter((target) => !secretStatus[target.apiKeyField]?.configured);
  if (missingRouteKeys.length > 0) {
    const names = missingRouteKeys.map((target) => routeLabel(target.label, locale)).join(', ');
    items.push(locale === 'zh' ? `这些 LLM 路由没有独立 API Key，会回退到供应商默认 Key：${names}。` : `These LLM routes do not have separate API keys and will fall back to the provider key: ${names}.`);
  }

  if (config.maxParallelRuns > 1 && enabledRoutes.length === 0) {
    items.push(locale === 'zh' ? '已启用多个单股票任务 worker；列表批量提交仍会按顺序执行。如需同时跑多个独立任务，建议为初始分析师配置独立 LLM 路由，避免挤在同一个 API Key 上。' : 'Multiple single-run workers are enabled; ticker-list batches still run in order. For concurrent standalone jobs, consider separate analyst LLM routes so they do not share one API key.');
  }

  return items;
}

function cleanLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (item) => item.toUpperCase());
}

type ReportHeading = {
  id: string;
  depth: number;
  text: string;
  index: number;
};

const markdownComponents: Components = {
  h1({ children }) {
    return <h1 id={slugifyHeading(reactNodeText(children))}>{children}</h1>;
  },
  h2({ children }) {
    return <h2 id={slugifyHeading(reactNodeText(children))}>{children}</h2>;
  },
  h3({ children }) {
    return <h3 id={slugifyHeading(reactNodeText(children))}>{children}</h3>;
  },
  h4({ children }) {
    return <h4 id={slugifyHeading(reactNodeText(children))}>{children}</h4>;
  },
};

function reactNodeText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(reactNodeText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return reactNodeText(node.props.children);
  return '';
}

function stripMarkdownInline(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifyHeading(value: string) {
  const slug = stripMarkdownInline(value)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

function extractMarkdownHeadings(markdown: string): ReportHeading[] {
  const headings: ReportHeading[] = [];
  markdown.split('\n').forEach((line) => {
    const match = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (!match) return;
    const text = stripMarkdownInline(match[2]);
    if (!text) return;
    headings.push({ id: slugifyHeading(text), depth: match[1].length, text, index: headings.length });
  });
  return headings;
}

function countTextMatches(text: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;
  const haystack = text.toLowerCase();
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function matchesHistoryFilters(item: ReportHistoryItem, filters: HistoryFilters) {
  const ticker = filters.ticker.trim().toLowerCase();
  const provider = filters.provider.trim().toLowerCase();
  const query = filters.query.trim().toLowerCase();
  if (ticker && !item.ticker.toLowerCase().includes(ticker)) return false;
  if (filters.status && item.status !== filters.status) return false;
  if (filters.date && item.analysisDate !== filters.date && !item.submittedAt.startsWith(filters.date) && !item.archivedAt.startsWith(filters.date)) return false;
  if (provider && !item.provider.toLowerCase().includes(provider)) return false;
  if (query) {
    const text = [
      item.ticker,
      item.analysisDate,
      item.provider,
      item.decision ?? '',
      item.status,
      item.analysts.join(' '),
      String(item.researchDepth),
    ].join(' ').toLowerCase();
    if (!text.includes(query)) return false;
  }
  return true;
}

function orderTypeLabel(value: OrderRecord['type'], labels: Record<string, string>) {
  if (value === 'analysis') return labels.orderTypeAnalysis;
  if (value === 'recharge') return labels.orderTypeRecharge;
  return labels.orderTypeAdjustment;
}

function reportFileName(tickerOrRunId: string, section: string) {
  const safeTicker = tickerOrRunId.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
  const safeSection = section.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  return `tradingagents-${safeTicker}-${safeSection}.md`;
}

function researchDepthLabel(value: number, fallback: string, locale: Locale) {
  if (locale === 'en') return fallback;
  if (value === 1) return '浅层';
  if (value === 3) return '中等';
  if (value === 5) return '深度';
  return fallback;
}

function statusLabel(value: string, locale: Locale) {
  const statusMessages: Record<string, string> = messages[locale];
  return statusMessages[value] ?? value;
}

function stringifyReport(value: unknown, emptyText: string) {
  if (!value) return emptyText;
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function eventSummary(event: RunEvent, locale: Locale) {
  const payload = event.payload;
  if (typeof payload.message === 'string') return translateEventMessage(payload.message, locale);
  if (typeof payload.content === 'string') return translateEventContent(payload.content, locale).slice(0, 160);
  if (typeof payload.name === 'string') return payload.name;
  if (typeof payload.status === 'string') return statusLabel(payload.status, locale);
  return JSON.stringify(payload).slice(0, 160);
}

function translateEventMessage(value: string, locale: Locale) {
  if (locale === 'en') return value;
  const known: Record<string, string> = {
    'Run queued.': '任务已进入队列。',
    'Analysis started.': '分析已开始。',
    'Resolving memory log context.': '正在读取历史记忆上下文。',
    'Analysis completed.': '分析已完成。',
  };
  return known[value] ?? value;
}

function translateEventContent(value: string, locale: Locale) {
  if (locale === 'en') return value;
  const noDataMatch = value.match(/^No (income statement|cash flow|balance sheet) data found for symbol '([^']+)'/);
  if (noDataMatch) {
    const label: Record<string, string> = {
      'income statement': '利润表',
      'cash flow': '现金流量表',
      'balance sheet': '资产负债表',
    };
    return `未找到 ${noDataMatch[2]} 的${label[noDataMatch[1]]}数据。`;
  }
  return value
    .replace(/# Company Fundamentals for ([^\n#]+)/g, '# 公司基本面：$1')
    .replace(/# Data retrieved on:/g, '# 数据获取时间：')
    .replace(/\bName:/g, '名称：')
    .replace(/\bPE Ratio \(TTM\):/g, '市盈率 (TTM)：')
    .replace(/\bPrice to Book:/g, '市净率：');
}

createRoot(document.getElementById('root')!).render(<App />);

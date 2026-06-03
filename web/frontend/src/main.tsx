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
import { SaveButton } from './components/SaveButton';
import { Chip } from './components/Chip';
import { Modal } from './components/Modal';
import { AuthScreen } from './views/AuthScreen';
import { WorkspaceView } from './views/WorkspaceView';
import { SettingsView } from './views/SettingsView';

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
        <SettingsView
          state={{
            t, locale, config, metadata, publicPricing,
            secretStatus, secretDraft, settingsSection, settingsTabs,
            provider, discoveredModels, isFetchingModels,
            showDeepSeekThinkingMode, customLanguage, backtestConfig,
            adminPricing, modelPriceDraft, newUserDraft, rechargeDraft,
            adminUsers, setupRecommendations, dataApiSecretFields,
            marketDataSections, isSaving,
            stockMarketLabels, dataVendorLabels, customMethodLabels,
          }}
          handlers={{
            setSettingsSection, changeProvider, updateConfig, setSecretDraft,
            fetchModelsForCurrentProvider, updateMarketProfile, saveConfig,
            saveSecrets, updateVendor, updateToolVendor,
            updateMarketGroupVendor, updateMarketGroupCustomBaseUrl,
            updateMarketGroupMethodVendor, updateMarketGroupCustomEndpoint,
            updateLlmRoute, updateBacktestConfig, saveBacktestSettings,
            updateAdminPricing, updateDepthPrice, setModelPriceDraft,
            setNewUserDraft, createAdminManagedUser, setRechargeDraft,
            rechargeUser, saveAdminPricing,
          }}
          helpers={{
            formatMoney, clampNumber, researchDepthLabel, modelOptionsFor,
            dataVendorOptionLabel, marketGroupHasOverride, sharedMarketValue,
            marketGroupUsesCustomRoute, marketGroupCustomSettings,
            marketDataOverride,
            routeModelOptions, modelForRole, routeLabel, routeDescription,
            deepseekThinkingOptions, vendorOptions,
            Panel, Field, Selector, SaveButton, Chip,
            Loader2, Settings2, Brain, Bot, RefreshCw, Languages,
            BarChart3, Database, ListOrdered, KeyRound, Activity,
            History, CreditCard, Users, UserPlus, Wallet,
            Lightbulb, CircleAlert,
          }}
        />
      ) : (
        <WorkspaceView
          state={{
            t, config, metadata, publicPricing, currentUser,
            effectiveTicker, configuredTickerCount, customRouteCount,
            customNeedsManualModel, activeRun, batchRuns, runBilling,
            events, orders, pendingRun, tickerList, isAdmin, isRunning,
            isSaving, isReaderOpen, selectedHistoryId, historyFilters,
            filteredHistory, activeReportTitle,
            reportContext, agentStatus, progress, timeEstimate,
            referenceTimeline, locale, outputLocale, analystLabels,
            dataVendorLabels, eventLabels, stockMarketLabels,
          }}
          handlers={{
            changeProvider, changeStockMarket, changeTickerList,
            updateConfig, toggleAnalyst, saveConfig, selectLiveRun,
            setReaderOpen, setPendingRun, setHistoryFilters,
            loadHistoricalReport, viewOrderRun, confirmPendingRun,
            onSetHistoryFilter: (field: string, value: string) =>
              setHistoryFilters((current) => ({ ...current, [field]: value })),
          }}
          helpers={{
            formatMoney, formatDuration, statusLabel, today,
            clampNumber, researchDepthLabel, orderTypeLabel,
            eventSummary, modelOptionsFor, renderReportReader,
            Panel, Metric, Selector, Field, Chip, SaveButton, Modal,
            Settings2, Brain, Bot, Gauge, BarChart3, ListOrdered,
            Activity, BadgeCheck, Server, Maximize2, History, Search,
            Filter, ReceiptText, TerminalSquare, Play, Check,
          }}
        />
      )}
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

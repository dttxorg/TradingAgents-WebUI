import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bot,
  Brain,
  Check,
  CircleAlert,
  CircleDot,
  CreditCard,
  Database,
  Gauge,
  History,
  KeyRound,
  Languages,
  Lightbulb,
  ListOrdered,
  LogIn,
  Loader2,
  Play,
  RefreshCw,
  ReceiptText,
  Save,
  Server,
  Settings2,
  Square,
  TerminalSquare,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from './api';
import type {
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
import './styles.css';

type Locale = 'en' | 'zh';
type ViewMode = 'workspace' | 'settings';

const messages = {
  en: {
    loading: 'Loading TradingAgents console',
    eyebrow: 'TradingAgents Web Console',
    title: 'Multi-agent market research workspace',
    runAnalysis: 'Run analysis',
    stopAnalysis: 'Stop analysis',
    workspace: 'Workspace',
    settings: 'Settings',
    activeWorkflow: 'Active workflow',
    configuredAgents: 'Configured agents',
    dataRouteCount: 'Data routes',
    estimateTotal: 'Estimated total',
    estimateRemaining: 'Remaining',
    estimateWaiting: 'Waiting for first checkpoint',
    estimateConfidence: 'confidence',
    connections: 'Settings / API keys',
    notConfigured: 'Not configured',
    replaceValue: 'Replace value',
    pasteKey: 'Paste key',
    saveSecrets: 'Save secrets',
    dataVendors: 'Data vendors',
    analysisSetup: 'Analysis setup',
    ticker: 'Ticker',
    tickerList: 'Ticker list',
    tickerListHint: 'Enter bare symbols. The selected market profile appends the configured region suffix automatically.',
    stockMarket: 'Stock market',
    marketSettings: 'Market profiles',
    marketRegion: 'Region suffix',
    marketWeight: 'Market weight',
    marketPrompt: 'Market profile prompt',
    effectiveTicker: 'Runtime symbol',
    usMarket: 'US stocks',
    hkMarket: 'Hong Kong stocks',
    shMarket: 'Shanghai A shares',
    szMarket: 'Shenzhen A shares',
    analysisDate: 'Analysis date',
    provider: 'Provider',
    providerRegion: 'Region',
    baseUrl: 'Base URL',
    providerDefault: 'Provider default',
    quickModel: 'Quick model',
    deepModel: 'Deep model',
    depth: 'Depth',
    outputLanguage: 'Output language',
    customLanguage: 'Custom language',
    customModelId: 'Custom model ID',
    analysts: 'Analysts',
    openaiReasoning: 'OpenAI reasoning',
    geminiThinking: 'Gemini thinking',
    anthropicEffort: 'Anthropic effort',
    checkpointResume: 'Checkpoint resume',
    parallelRuns: 'Single-run workers',
    saveDefaults: 'Save defaults',
    connectionSettings: 'Provider settings',
    allApiKeys: 'API keys',
    fetchModels: 'Fetch models',
    fetchingModels: 'Fetching',
    modelFetchUnavailable: 'Model discovery is not available for this provider.',
    fetchedModels: 'models loaded',
    parallelRoutes: 'Parallel/API routing',
    parallelRoutesHint: 'Initial analysts are the safest fan-out candidates. Debate, trader, and risk nodes keep order but can use separate API routes to avoid one provider bottleneck.',
    routeEnabled: 'Enable route',
    routeModel: 'Route model',
    routeApiKey: 'Route API key',
    routeBaseUrl: 'Route Base URL',
    inheritMainProvider: 'Inherit main provider',
    parallelReady: 'parallel-ready',
    sequential: 'sequential',
    agentTimeline: 'Agent timeline',
    timelineEmpty: 'Run an analysis to populate the agent timeline.',
    llmCalls: 'LLM calls',
    toolCalls: 'Tool calls',
    elapsed: 'Elapsed',
    runId: 'Run ID',
    eventStream: 'Event stream',
    eventsEmpty: 'Live graph events will appear here.',
    reportHistory: 'Report history',
    historyEmpty: 'No archived reports yet.',
    currentReport: 'Current run',
    showCurrentRun: 'Show current run',
    archivedReport: 'Archived report',
    customInterfaces: 'Settings / Custom APIs',
    customOpenAiHint: 'OpenAI-compatible Base URL, model IDs, and CUSTOM_OPENAI_API_KEY.',
    customDataHint: 'Choose custom as a data vendor, then point that category at an HTTP service.',
    methodOverrides: 'Method-level data routes',
    useCategoryDefault: 'Use category default',
    setupRecommendations: 'Setup recommendations',
    recommendationsOk: 'Core settings look ready for the selected routes.',
    batchQueue: 'Batch queue',
    endpointPath: 'Endpoint path',
    baseUrlRequired: 'Base URL for selected custom data categories',
    reports: 'Reports',
    final: 'Final',
    backtestWatch: 'Backtest watch',
    backtestSchedule: 'Backtest schedule',
    backtestNoReport: 'No report content to observe yet.',
    runBacktest: 'Run review',
    resumeBacktest: 'Resume review',
    backtestRecord: 'Review record',
    backtestStatus: 'Review status',
    backtestOutcome: 'Outcome',
    backtestApi: 'Review price API',
    priceDataSource: 'Price source',
    customBacktestApi: 'Custom price API',
    customBacktestEndpoint: 'Custom endpoint',
    saveBacktestSettings: 'Save review settings',
    alreadyReviewed: 'Already reviewed',
    noBacktestRecord: 'No persistent review record yet.',
    schedulerEnabled: 'Enable scheduler',
    intervalMinutes: 'Interval minutes',
    reviewWindowDays: 'Review window days',
    maxReportsPerCycle: 'Reports per cycle',
    checkpoints: 'Checkpoints',
    tickerHitSummary: 'Ticker hit summary',
    resumeCount: 'Resume count',
    barsChecked: 'Bars checked',
    priceSource: 'Price source',
    entryHit: 'Entry hit',
    targetHit: 'Target hit',
    stopHit: 'Stop hit',
    hitDate: 'Hit date',
    hitPrice: 'Hit price',
    extractedDecision: 'Decision',
    entryPlan: 'Entry plan',
    stopPlan: 'Stop plan',
    targetPlan: 'Targets',
    positionPlan: 'Position',
    riskPlan: 'Risk triggers',
    observationOrder: 'Observation order',
    assumptionChecks: 'Assumptions to confirm',
    noReport: 'No report yet.',
    loginTitle: 'Sign in',
    bootstrapTitle: 'Create admin account',
    username: 'Username',
    password: 'Password',
    displayName: 'Display name',
    initialBalance: 'Initial balance',
    usernameTooShort: 'Username must be at least 3 characters.',
    passwordTooShort: 'Password must be at least 8 characters.',
    invalidInitialBalance: 'Initial balance must be a valid number.',
    signIn: 'Sign in',
    createAdmin: 'Create admin',
    signOut: 'Sign out',
    account: 'Account',
    balance: 'Balance',
    frozen: 'Frozen',
    role: 'Role',
    pricingPublic: 'Pricing',
    billingMode: 'Billing mode',
    tokenMultiplier: 'Token multiplier',
    tokenPrice: 'Token price',
    fixedCharge: 'Fixed charge',
    modelOverrides: 'Model price overrides',
    runCost: 'Run cost',
    preauth: 'Pre-auth',
    refund: 'Refund',
    tokenDetails: 'Token details',
    inputTokens: 'Input',
    outputTokens: 'Output',
    orders: 'Orders',
    adminBilling: 'Admin / Billing',
    adminUsers: 'Admin / Users',
    recharge: 'Recharge',
    newUser: 'New user',
    active: 'Active',
    inactive: 'Inactive',
    priceSaved: 'Pricing saved',
    userCreated: 'User created',
    rechargeDone: 'Recharge completed',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    minimal: 'Minimal',
    idle: 'idle',
    queued: 'queued',
    running: 'running',
    pending: 'pending',
    waiting_data: 'waiting for data',
    target_hit: 'target hit',
    stop_hit: 'stop hit',
    entry_not_hit: 'entry not hit',
    ambiguous: 'ambiguous',
    manual_review: 'manual review',
    not_actionable: 'not actionable',
    succeeded: 'succeeded',
    failed: 'failed',
    cancelled: 'cancelled',
  },
  zh: {
    loading: '正在加载 TradingAgents 控制台',
    eyebrow: 'TradingAgents Web 控制台',
    title: '多智能体金融市场研究工作台',
    runAnalysis: '开始分析',
    stopAnalysis: '停止分析',
    workspace: '工作台',
    settings: '设置',
    activeWorkflow: '当前工作流',
    configuredAgents: '已配置智能体',
    dataRouteCount: '数据路由',
    estimateTotal: '预计总耗时',
    estimateRemaining: '剩余时间',
    estimateWaiting: '等待首个检查点',
    estimateConfidence: '可信度',
    connections: '设置 / API 密钥',
    notConfigured: '未配置',
    replaceValue: '替换当前值',
    pasteKey: '粘贴密钥',
    saveSecrets: '保存密钥',
    dataVendors: '数据源',
    analysisSetup: '分析配置',
    ticker: '股票代码',
    tickerList: '股票列表',
    tickerListHint: '只输入裸股票代码，不需要填写点号；系统会按所选市场自动追加配置的 region 后缀。',
    stockMarket: '股票市场',
    marketSettings: '市场配置',
    marketRegion: 'Region 后缀',
    marketWeight: '市场权重',
    marketPrompt: 'Market profile Prompt',
    effectiveTicker: '实际调用代码',
    usMarket: '美股',
    hkMarket: '港股',
    shMarket: '上证',
    szMarket: '深证',
    analysisDate: '分析日期',
    provider: '模型供应商',
    providerRegion: '区域',
    baseUrl: '接口地址',
    providerDefault: '使用供应商默认值',
    quickModel: '快速模型',
    deepModel: '深度模型',
    depth: '研究深度',
    outputLanguage: '报告输出语言',
    customLanguage: '自定义语言',
    customModelId: '自定义模型 ID',
    analysts: '分析师团队',
    openaiReasoning: 'OpenAI 推理强度',
    geminiThinking: 'Gemini 思考模式',
    anthropicEffort: 'Anthropic Effort',
    checkpointResume: '启用断点续跑',
    parallelRuns: '单股票任务 worker 数',
    saveDefaults: '保存默认配置',
    connectionSettings: '供应商设置',
    allApiKeys: 'API 密钥',
    fetchModels: '拉取模型',
    fetchingModels: '拉取中',
    modelFetchUnavailable: '该供应商暂不支持自动拉取模型。',
    fetchedModels: '个模型已加载',
    parallelRoutes: '并行/API 路由',
    parallelRoutesHint: '四个初始分析师最适合后续并行扇出；辩论、交易员和风控节点保持顺序，但可以分配独立 API 路由，避免单个供应商限流拖慢整体运行。',
    routeEnabled: '启用路由',
    routeModel: '路由模型',
    routeApiKey: '路由 API Key',
    routeBaseUrl: '路由接口地址',
    inheritMainProvider: '继承主供应商',
    parallelReady: '可并行',
    sequential: '顺序执行',
    agentTimeline: '智能体时间线',
    timelineEmpty: '运行一次分析后，这里会显示智能体进度。',
    llmCalls: 'LLM 调用',
    toolCalls: '工具调用',
    elapsed: '耗时',
    runId: '运行 ID',
    eventStream: '事件流',
    eventsEmpty: '实时图执行事件会显示在这里。',
    reportHistory: '历史报告',
    historyEmpty: '暂无历史报告。',
    currentReport: '当前运行',
    showCurrentRun: '查看当前运行',
    archivedReport: '历史报告',
    customInterfaces: '设置 / 自定义接口',
    customOpenAiHint: 'OpenAI-compatible Base URL、模型 ID 和 CUSTOM_OPENAI_API_KEY。',
    customDataHint: '将数据源选择为 custom 后，把对应分类指向你的 HTTP 数据服务。',
    methodOverrides: '按后端方法单独设置数据源',
    useCategoryDefault: '使用分类默认值',
    setupRecommendations: '设置建议',
    recommendationsOk: '当前模型和数据路由的核心设置已就绪。',
    batchQueue: '批量队列',
    endpointPath: '接口路径',
    baseUrlRequired: '已选择 custom 的数据分类需要填写 Base URL',
    reports: '报告',
    final: '最终报告',
    backtestWatch: '回测观察',
    backtestSchedule: '复盘周期',
    backtestNoReport: '暂无可复盘的报告内容。',
    runBacktest: '运行复盘',
    resumeBacktest: '断点续跑',
    backtestRecord: '复盘记录',
    backtestStatus: '复盘状态',
    backtestOutcome: '命中结果',
    backtestApi: '复盘行情 API',
    priceDataSource: '行情来源',
    customBacktestApi: '自定义行情 API',
    customBacktestEndpoint: '自定义接口路径',
    saveBacktestSettings: '保存复盘设置',
    alreadyReviewed: '已出具复盘记录',
    noBacktestRecord: '尚未生成持久化复盘记录。',
    schedulerEnabled: '启用定时复盘',
    intervalMinutes: '周期分钟数',
    reviewWindowDays: '复盘窗口天数',
    maxReportsPerCycle: '每轮报告数',
    checkpoints: '检查点',
    tickerHitSummary: '同股命中汇总',
    resumeCount: '续跑次数',
    barsChecked: '检查 K 线数',
    priceSource: '行情来源',
    entryHit: '入场命中',
    targetHit: '目标命中',
    stopHit: '止损命中',
    hitDate: '命中日期',
    hitPrice: '命中价格',
    extractedDecision: '交易建议',
    entryPlan: '入场计划',
    stopPlan: '止损计划',
    targetPlan: '目标位',
    positionPlan: '仓位',
    riskPlan: '风险触发',
    observationOrder: '复盘顺序',
    assumptionChecks: '需要确认的假设',
    noReport: '暂无报告。',
    loginTitle: '登录',
    bootstrapTitle: '创建管理员账号',
    username: '用户名',
    password: '密码',
    displayName: '显示名称',
    initialBalance: '初始余额',
    usernameTooShort: '用户名至少需要 3 个字符。',
    passwordTooShort: '密码至少需要 8 个字符。',
    invalidInitialBalance: '初始余额必须是有效数字。',
    signIn: '登录',
    createAdmin: '创建管理员',
    signOut: '退出登录',
    account: '账号',
    balance: '余额',
    frozen: '冻结',
    role: '权限',
    pricingPublic: '价格公示',
    billingMode: '计费模式',
    tokenMultiplier: '消耗倍数',
    tokenPrice: 'Token 单价',
    fixedCharge: '按次费用',
    modelOverrides: '模型组合价格',
    runCost: '本次费用',
    preauth: '预冻结',
    refund: '退回',
    tokenDetails: 'Token 明细',
    inputTokens: '输入',
    outputTokens: '输出',
    orders: '订单',
    adminBilling: '管理员 / 计费',
    adminUsers: '管理员 / 用户',
    recharge: '充值',
    newUser: '新建用户',
    active: '启用',
    inactive: '禁用',
    priceSaved: '价格已保存',
    userCreated: '用户已创建',
    rechargeDone: '充值完成',
    low: '低',
    medium: '中',
    high: '高',
    minimal: '最小',
    idle: '空闲',
    queued: '排队中',
    running: '运行中',
    pending: '等待中',
    waiting_data: '等待数据',
    target_hit: '目标命中',
    stop_hit: '止损命中',
    entry_not_hit: '未触发入场',
    ambiguous: '顺序不明',
    manual_review: '人工复核',
    not_actionable: '不可执行',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已停止',
  },
};

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
  },
};

const emptyMetadata: Metadata = {
  analysts: [],
  researchDepths: [],
  stockMarkets: [],
  providers: [],
  models: {},
  languages: [],
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
  const [activeRun, setActiveRun] = useState<RunInfo | null>(null);
  const [batchRuns, setBatchRuns] = useState<RunInfo[]>([]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [reports, setReports] = useState<ReportsPayload | null>(null);
  const [viewedArchive, setViewedArchive] = useState<HistoricalReport | null>(null);
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [reportTab, setReportTab] = useState('finalReport');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [isRunning, setRunning] = useState(false);
  const [isFetchingModels, setFetchingModels] = useState(false);
  const [isBacktestRunning, setBacktestRunning] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const t = messages[locale];
  const isAdmin = currentUser?.role === 'admin';

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
    setMetadata({ ...emptyMetadata, ...metadataValue });
    setConfig(configValue);
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
  const outputLocale = outputLanguageLocale(config?.outputLanguage ?? 'English');
  const setupRecommendations = useMemo(
    () => (config ? buildSetupRecommendations(config, metadata, secretStatus, provider, locale) : []),
    [config, metadata, secretStatus, provider, locale],
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
    updateConfig('dataVendors', { ...config.dataVendors, [key]: value });
  }

  function updateToolVendor(method: string, value: string) {
    if (!config) return;
    const next = { ...(config.toolVendors ?? {}) };
    if (value) {
      next[method] = value;
    } else {
      delete next[method];
    }
    updateConfig('toolVendors', next);
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
    const current = config.marketProfiles?.[market] ?? { region: '', weight: '1', marketProfile: '' };
    updateConfig('marketProfiles', {
      ...(config.marketProfiles ?? {}),
      [market]: { ...current, ...patch },
    });
  }

  function updateCustomDataBaseUrl(category: string, value: string) {
    if (!config) return;
    const current = config.customDataInterfaces[category] ?? { baseUrl: null, endpoints: {} };
    updateConfig('customDataInterfaces', {
      ...config.customDataInterfaces,
      [category]: { ...current, baseUrl: value || null },
    });
  }

  function updateCustomDataEndpoint(category: string, method: string, value: string) {
    if (!config) return;
    const current = config.customDataInterfaces[category] ?? { baseUrl: null, endpoints: {} };
    updateConfig('customDataInterfaces', {
      ...config.customDataInterfaces,
      [category]: {
        ...current,
        endpoints: { ...current.endpoints, [method]: value },
      },
    });
  }

  function updateBacktestConfig<K extends keyof BacktestScheduleConfig>(key: K, value: BacktestScheduleConfig[K]) {
    setBacktestConfig((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveConfig(config);
      setConfig(saved);
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
    const runConfig = { ...config, ticker: tickers[0] };
    setRunning(true);
    setError(null);
    setEvents([]);
    setReports(null);
    setSelectedHistoryId(null);
    setViewedArchive(null);
    setBatchRuns([]);
    try {
      const saved = isAdmin ? await api.saveConfig(runConfig) : runConfig;
      if (isAdmin) setConfig(saved);
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
  const customRouteCount = Object.keys(config.toolVendors ?? {}).length + Object.values(config.llmRoutes ?? {}).filter((route) => route.enabled).length;
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
          <button className="primary" onClick={startRun} disabled={isRunning}>
            {isRunning ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
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
        <section className="settings-grid">
          <section className="settings-main">
            <Panel title={t.connectionSettings} icon={<Settings2 size={17} />}>
              <div className="form-grid settings-form">
                <label className="field">
                  <span>{t.provider}</span>
                  <select value={config.llmProvider} onChange={(event) => changeProvider(event.target.value)}>
                    {metadata.providers.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t.providerRegion}</span>
                  <input value={provider?.region ?? '-'} readOnly />
                </label>
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

            <Panel title={t.marketSettings} icon={<BarChart3 size={17} />}>
              <p className="hint">
                {locale === 'zh'
                  ? '用户只输入裸代码；运行前会按所选市场自动拼接 .region，并把 market_profile prompt 注入到智能体上下文。'
                  : 'Users enter bare symbols; before execution the backend appends .region for the selected market and injects a market_profile prompt into the agent context.'}
              </p>
              <div className="market-profile-grid">
                {metadata.stockMarkets.map((market) => {
                  const profile = config.marketProfiles?.[market.key] ?? { region: '', weight: '1', marketProfile: '' };
                  return (
                    <section key={market.key} className={config.stockMarket === market.key ? 'market-profile-card active' : 'market-profile-card'}>
                      <div className="route-card-head">
                        <div>
                          <strong>{stockMarketLabels[locale][market.key] ?? market.label}</strong>
                          <small>{market.description}</small>
                        </div>
                      </div>
                      <div className="market-profile-fields">
                        <label className="field">
                          <span>{t.marketRegion}</span>
                          <input
                            value={profile.region}
                            onChange={(event) => updateMarketProfile(market.key, { region: event.target.value })}
                            placeholder={market.key === 'us' ? 'us' : market.key === 'hk' ? 'hk' : market.key === 'sh' ? 'ss' : 'sz'}
                          />
                        </label>
                        <label className="field">
                          <span>{t.marketWeight}</span>
                          <input
                            value={profile.weight}
                            onChange={(event) => updateMarketProfile(market.key, { weight: event.target.value })}
                            inputMode="decimal"
                          />
                        </label>
                      </div>
                      <label className="field">
                        <span>{t.marketPrompt}</span>
                        <textarea
                          value={profile.marketProfile}
                          onChange={(event) => updateMarketProfile(market.key, { marketProfile: event.target.value })}
                        />
                      </label>
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
                        <label className="field">
                          <span>{t.provider}</span>
                          <select value={route.provider ?? ''} onChange={(event) => updateLlmRoute(target.key, { provider: event.target.value || null })}>
                            <option value="">{t.inheritMainProvider}</option>
                            {metadata.providers.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>{t.routeBaseUrl}</span>
                          <input
                            value={route.backendUrl ?? ''}
                            onChange={(event) => updateLlmRoute(target.key, { backendUrl: event.target.value || null })}
                            placeholder={routeProviderMeta?.defaultBaseUrl ?? t.providerDefault}
                          />
                        </label>
                        <label className="field">
                          <span>{t.routeModel}</span>
                          <select value={route.modelId ?? ''} onChange={(event) => updateLlmRoute(target.key, { modelId: event.target.value || null })}>
                            <option value="">{modelForRole(config, target.defaultModelRole)}</option>
                            {routeModels.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </label>
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

            <Panel title={t.customInterfaces} icon={<Server size={17} />}>
              <p className="hint">{t.customOpenAiHint}</p>
              <p className="hint">{t.customDataHint}</p>
              <div className="custom-interface-list">
                {metadata.dataVendorCategories.map((category) => {
                  const settings = config.customDataInterfaces[category.key] ?? { baseUrl: null, endpoints: {} };
                  const methods = metadata.customDataMethods.filter((method) => method.category === category.key);
                  const selectedCustom =
                    config.dataVendors[category.key] === 'custom' ||
                    methods.some((method) => (config.toolVendors ?? {})[method.method] === 'custom');
                  return (
                    <section key={category.key} className={selectedCustom ? 'custom-interface active' : 'custom-interface'}>
                      <label className="field">
                        <span>{dataVendorLabels[locale][category.key] ?? category.label}</span>
                        <input
                          value={settings.baseUrl ?? ''}
                          onChange={(event) => updateCustomDataBaseUrl(category.key, event.target.value)}
                          placeholder="https://data.example.com"
                        />
                      </label>
                      <div className="endpoint-grid">
                        {methods.map((method) => (
                          <label key={method.method} className="field">
                            <span>{customMethodLabels[locale][method.method] ?? method.label}</span>
                            <input
                              value={settings.endpoints[method.method] ?? method.defaultPath}
                              onChange={(event) => updateCustomDataEndpoint(category.key, method.method, event.target.value)}
                              placeholder={t.endpointPath}
                            />
                          </label>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
              <p className="hint">{t.baseUrlRequired}</p>
            </Panel>

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
                    <label className="field">
                      <span>{t.intervalMinutes}</span>
                      <input
                        type="number"
                        min={5}
                        max={43200}
                        value={backtestConfig.intervalMinutes}
                        onChange={(event) => updateBacktestConfig('intervalMinutes', clampNumber(event.target.value, 5, 43200))}
                      />
                    </label>
                    <label className="field">
                      <span>{t.reviewWindowDays}</span>
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={backtestConfig.reviewWindowDays}
                        onChange={(event) => updateBacktestConfig('reviewWindowDays', clampNumber(event.target.value, 1, 3650))}
                      />
                    </label>
                    <label className="field">
                      <span>{t.maxReportsPerCycle}</span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={backtestConfig.maxReportsPerCycle}
                        onChange={(event) => updateBacktestConfig('maxReportsPerCycle', clampNumber(event.target.value, 1, 500))}
                      />
                    </label>
                    <label className="field">
                      <span>{t.priceDataSource}</span>
                      <select value={backtestConfig.priceDataSource} onChange={(event) => updateBacktestConfig('priceDataSource', event.target.value as BacktestScheduleConfig['priceDataSource'])}>
                        <option value="yfinance">yfinance</option>
                        <option value="custom">custom</option>
                      </select>
                    </label>
                  </div>

                  <div className={backtestConfig.priceDataSource === 'custom' ? 'custom-interface active' : 'custom-interface'}>
                    <div className="endpoint-grid">
                      <label className="field">
                        <span>{t.customBacktestApi}</span>
                        <input
                          value={backtestConfig.customBaseUrl ?? ''}
                          onChange={(event) => updateBacktestConfig('customBaseUrl', event.target.value || null)}
                          placeholder="https://prices.example.com/api"
                        />
                      </label>
                      <label className="field">
                        <span>{t.customBacktestEndpoint}</span>
                        <input
                          value={backtestConfig.customEndpoint}
                          onChange={(event) => updateBacktestConfig('customEndpoint', event.target.value)}
                          placeholder="/backtest/prices"
                        />
                      </label>
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
          </section>

          <aside className="settings-side">
            <Panel title={t.adminBilling} icon={<CreditCard size={17} />}>
              {adminPricing ? (
                <div className="billing-form">
                  <div className="form-grid billing-grid">
                    <label className="field">
                      <span>{t.billingMode}</span>
                      <select value={adminPricing.billingMode} onChange={(event) => updateAdminPricing('billingMode', event.target.value as PricingConfig['billingMode'])}>
                        <option value="token">token</option>
                        <option value="per_run">per_run</option>
                        <option value="hybrid">hybrid</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>{t.tokenMultiplier}</span>
                      <input value={adminPricing.tokenMultiplier} onChange={(event) => updateAdminPricing('tokenMultiplier', event.target.value)} inputMode="decimal" />
                    </label>
                    <label className="field">
                      <span>{t.inputTokens} / 1M</span>
                      <input value={adminPricing.inputTokenPricePer1m} onChange={(event) => updateAdminPricing('inputTokenPricePer1m', event.target.value)} inputMode="decimal" />
                    </label>
                    <label className="field">
                      <span>{t.outputTokens} / 1M</span>
                      <input value={adminPricing.outputTokenPricePer1m} onChange={(event) => updateAdminPricing('outputTokenPricePer1m', event.target.value)} inputMode="decimal" />
                    </label>
                    <label className="field">
                      <span>{t.fixedCharge}</span>
                      <input value={adminPricing.fixedRunPrice} onChange={(event) => updateAdminPricing('fixedRunPrice', event.target.value)} inputMode="decimal" />
                    </label>
                    <label className="field">
                      <span>{t.preauth}</span>
                      <input value={adminPricing.preauthMultiplier} onChange={(event) => updateAdminPricing('preauthMultiplier', event.target.value)} inputMode="decimal" />
                    </label>
                  </div>
                  <div className="depth-price-grid">
                    {(['1', '3', '5'] as const).map((depth) => (
                      <section key={depth} className="depth-price-card">
                        <strong>{researchDepthLabel(Number(depth), depth, locale)}</strong>
                        <label className="field">
                          <span>{t.tokenMultiplier}</span>
                          <input value={adminPricing.depthMultipliers[depth] ?? '1'} onChange={(event) => updateDepthPrice('depthMultipliers', depth, event.target.value)} inputMode="decimal" />
                        </label>
                        <label className="field">
                          <span>{t.fixedCharge}</span>
                          <input value={adminPricing.fixedPricesByDepth[depth] ?? '0'} onChange={(event) => updateDepthPrice('fixedPricesByDepth', depth, event.target.value)} inputMode="decimal" />
                        </label>
                        <label className="field">
                          <span>{t.inputTokens}</span>
                          <input value={adminPricing.estimatedInputTokensByDepth[depth] ?? 0} onChange={(event) => updateDepthPrice('estimatedInputTokensByDepth', depth, event.target.value)} inputMode="numeric" />
                        </label>
                        <label className="field">
                          <span>{t.outputTokens}</span>
                          <input value={adminPricing.estimatedOutputTokensByDepth[depth] ?? 0} onChange={(event) => updateDepthPrice('estimatedOutputTokensByDepth', depth, event.target.value)} inputMode="numeric" />
                        </label>
                      </section>
                    ))}
                  </div>
                  <label className="field">
                    <span>{t.modelOverrides}</span>
                    <textarea
                      value={modelPriceDraft}
                      onChange={(event) => setModelPriceDraft(event.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <button className="secondary full" onClick={saveAdminPricing} disabled={isSaving}>
                    <Save size={16} />
                    {t.saveDefaults}
                  </button>
                </div>
              ) : (
                <span className="empty">-</span>
              )}
            </Panel>

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

            <Panel title={t.allApiKeys} icon={<KeyRound size={17} />}>
              <div className="secret-list">
                {metadata.secretFields.map((field) => (
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
              <button className="secondary full" onClick={saveSecrets} disabled={isSaving}>
                <Save size={16} />
                {t.saveSecrets}
              </button>
            </Panel>

            <Panel title={t.dataVendors} icon={<Database size={17} />}>
              {metadata.dataVendorCategories.map((category) => (
                <label key={category.key} className="field">
                  <span>{dataVendorLabels[locale][category.key] ?? category.label}</span>
                  <select value={config.dataVendors[category.key] ?? ''} onChange={(event) => updateVendor(category.key, event.target.value)}>
                    {category.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
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
                        <option value="">{t.useCategoryDefault} ({categoryVendor})</option>
                        {(category?.options ?? []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </Panel>
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
            <small>{publicPricing ? `${t.tokenPrice}: ${formatMoney(publicPricing.inputTokenPricePer1m, publicPricing.currency)}/${formatMoney(publicPricing.outputTokenPricePer1m, publicPricing.currency)} · ${t.fixedCharge}: ${formatMoney(publicPricing.fixedRunPrice, publicPricing.currency)}` : '-'}</small>
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
              <label className="field">
                <span>{t.stockMarket}</span>
                <select value={config.stockMarket} onChange={(event) => changeStockMarket(event.target.value)}>
                  {metadata.stockMarkets.map((market) => (
                    <option key={market.key} value={market.key}>
                      {stockMarketLabels[locale][market.key] ?? market.label}
                    </option>
                  ))}
                </select>
                <small className="field-hint">{t.effectiveTicker}: {effectiveTicker}</small>
              </label>
              <label className="field">
                <span>{t.analysisDate}</span>
                <input
                  type="date"
                  max={today()}
                  value={config.analysisDate}
                  onChange={(event) => updateConfig('analysisDate', event.target.value)}
                />
              </label>
              {isAdmin && (
                <label className="field">
                  <span>{t.provider}</span>
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
                </label>
              )}
            </div>

            <div className={isAdmin ? 'tool-row' : 'tool-row single-control'}>
              {isAdmin && (customNeedsManualModel ? (
                <>
                  <label className="field">
                    <span>{t.quickModel}</span>
                    <input
                      value={config.quickThinkLlm}
                      onChange={(event) => updateConfig('quickThinkLlm', event.target.value)}
                      placeholder={t.customModelId}
                    />
                  </label>
                  <label className="field">
                    <span>{t.deepModel}</span>
                    <input
                      value={config.deepThinkLlm}
                      onChange={(event) => updateConfig('deepThinkLlm', event.target.value)}
                      placeholder={t.customModelId}
                    />
                  </label>
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
                  <label className="field">
                    <span>{t.openaiReasoning}</span>
                    <select value={config.openaiReasoningEffort ?? ''} onChange={(event) => updateConfig('openaiReasoningEffort', event.target.value || null)}>
                      <option value="">{t.providerDefault}</option>
                      <option value="low">{t.low}</option>
                      <option value="medium">{t.medium}</option>
                      <option value="high">{t.high}</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>{t.geminiThinking}</span>
                    <select value={config.googleThinkingLevel ?? ''} onChange={(event) => updateConfig('googleThinkingLevel', event.target.value || null)}>
                      <option value="">{t.providerDefault}</option>
                      <option value="minimal">{t.minimal}</option>
                      <option value="high">{t.high}</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>{t.anthropicEffort}</span>
                    <select value={config.anthropicEffort ?? ''} onChange={(event) => updateConfig('anthropicEffort', event.target.value || null)}>
                      <option value="">{t.providerDefault}</option>
                      <option value="low">{t.low}</option>
                      <option value="medium">{t.medium}</option>
                      <option value="high">{t.high}</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>{t.parallelRuns}</span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={config.maxParallelRuns}
                      onChange={(event) => updateConfig('maxParallelRuns', clampNumber(event.target.value, 1, 8))}
                    />
                  </label>
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
              {Object.keys(agentStatus).length === 0 && <span className="empty">{t.timelineEmpty}</span>}
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

        </section>

        <aside className="right-rail">
          <Panel title={t.reportHistory} icon={<History size={17} />}>
            <div className="history-list">
              {history.map((item) => (
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
              {history.length === 0 && <span className="empty">{t.historyEmpty}</span>}
            </div>
          </Panel>

          <Panel title={t.orders} icon={<ReceiptText size={17} />}>
            <div className="order-list">
              {orders.slice(0, 8).map((order) => (
                <div key={order.id} className="order-row">
                  <span>
                    <strong>{order.type}</strong>
                    <small>{order.status} · {new Date(order.createdAt).toLocaleString()}</small>
                  </span>
                  <span>
                    <em>{formatMoney(order.actualAmount || order.amount || order.frozenAmount, order.currency)}</em>
                    <small>{order.runId ? order.runId.slice(0, 8) : order.externalOrderId ?? '-'}</small>
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

          <Panel title={t.reports} icon={<Server size={17} />}>
            {displayedReports && (
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
            )}
            <div className="tabs">
              <button className={reportTab === 'finalReport' ? 'active' : ''} onClick={() => setReportTab('finalReport')}>
                {t.final}
              </button>
              <button className={reportTab === 'backtestWatch' ? 'active' : ''} onClick={() => setReportTab('backtestWatch')}>
                {t.backtestWatch}
              </button>
              {reportEntries.map(([key]) => (
                <button key={key} className={reportTab === key ? 'active' : ''} onClick={() => setReportTab(key)}>
                  {reportLabels[locale][key] ?? cleanLabel(key)}
                </button>
              ))}
            </div>
            <article className="report-view">
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
                <pre>{reportTab === 'finalReport' ? displayedReports?.finalReport ?? t.noReport : stringifyReport(displayedReports?.reports?.[reportTab], t.noReport)}</pre>
              )}
            </article>
          </Panel>
        </aside>
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
        <label className="field">
          <span>{labels.username}</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label className="field">
          <span>{labels.password}</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'bootstrap' ? 'new-password' : 'current-password'} />
        </label>
        {mode === 'bootstrap' && (
          <>
            <label className="field">
              <span>{labels.displayName}</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label className="field">
              <span>{labels.initialBalance}</span>
              <input value={initialBalance} onChange={(event) => setInitialBalance(event.target.value)} inputMode="decimal" />
            </label>
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

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <span>{icon}</span>
        <h2>{title}</h2>
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

function formatMoney(value: string | number | null | undefined, currency = 'USD') {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return `0.000000 ${currency}`;
  return `${amount.toFixed(6)} ${currency}`;
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

function formatMarketTicker(ticker: string, profile?: { region?: string | null }) {
  const symbol = ticker.trim().replace(/\s+/g, '').toUpperCase();
  const region = profile?.region?.trim().replace(/^\.+/, '') ?? '';
  if (!symbol || !region || symbol.includes('.')) return symbol;
  return `${symbol}.${region}`;
}

function outputLanguageLocale(language: string): Locale {
  const normalized = language.trim().toLowerCase();
  return normalized.startsWith('chinese') || normalized === '中文' || normalized.startsWith('zh') ? 'zh' : 'en';
}

function buildSetupRecommendations(
  config: WebConfig,
  metadata: Metadata,
  secretStatus: SecretStatus,
  provider: Metadata['providers'][number] | undefined,
  locale: Locale,
) {
  const items: string[] = [];
  const toolVendors = config.toolVendors ?? {};
  const methodCategory = Object.fromEntries(metadata.customDataMethods.map((method) => [method.method, method.category]));
  const selectedVendors = [...Object.values(config.dataVendors), ...Object.values(toolVendors)];

  if (provider?.apiKeyField && !secretStatus[provider.apiKeyField]?.configured) {
    items.push(locale === 'zh' ? `当前模型供应商需要配置 ${provider.apiKeyField}。` : `Configure ${provider.apiKeyField} for the selected LLM provider.`);
  }

  if (selectedVendors.includes('alpha_vantage') && !secretStatus.ALPHA_VANTAGE_API_KEY?.configured) {
    items.push(locale === 'zh' ? '已选择 Alpha Vantage 数据源，需要配置 ALPHA_VANTAGE_API_KEY。' : 'Alpha Vantage is selected for data, so ALPHA_VANTAGE_API_KEY is required.');
  }

  const customCategories = new Set<string>();
  Object.entries(config.dataVendors).forEach(([category, vendor]) => {
    if (vendor === 'custom') customCategories.add(category);
  });
  Object.entries(toolVendors).forEach(([method, vendor]) => {
    if (vendor === 'custom' && methodCategory[method]) customCategories.add(methodCategory[method]);
  });

  if (customCategories.size > 0 && !secretStatus.CUSTOM_DATA_API_KEY?.configured) {
    items.push(locale === 'zh' ? '已启用 custom 数据接口，建议配置 CUSTOM_DATA_API_KEY 保护自定义数据服务。' : 'Custom data routes are enabled; configure CUSTOM_DATA_API_KEY to protect the custom data service.');
  }

  const missingCustomBase = [...customCategories].filter((category) => !config.customDataInterfaces[category]?.baseUrl);
  if (missingCustomBase.length > 0) {
    const names = missingCustomBase.map((category) => dataVendorLabels[locale][category] ?? category).join(', ');
    items.push(locale === 'zh' ? `这些 custom 数据分类还缺少 Base URL：${names}。` : `Custom data Base URL is missing for: ${names}.`);
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

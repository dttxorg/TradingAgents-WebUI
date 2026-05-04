import React, { useEffect, useMemo, useState } from 'react';
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
  Database,
  Gauge,
  KeyRound,
  Languages,
  Loader2,
  Play,
  Save,
  Server,
  Settings2,
  TerminalSquare,
} from 'lucide-react';
import { api } from './api';
import type { Metadata, ReportsPayload, RunEvent, RunInfo, SecretStatus, WebConfig } from './types';
import './styles.css';

type Locale = 'en' | 'zh';

const messages = {
  en: {
    loading: 'Loading TradingAgents console',
    eyebrow: 'TradingAgents Web Console',
    title: 'Multi-agent market research workspace',
    runAnalysis: 'Run analysis',
    connections: 'Settings / API keys',
    notConfigured: 'Not configured',
    replaceValue: 'Replace value',
    pasteKey: 'Paste key',
    saveSecrets: 'Save secrets',
    dataVendors: 'Data vendors',
    analysisSetup: 'Analysis setup',
    ticker: 'Ticker',
    analysisDate: 'Analysis date',
    provider: 'Provider',
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
    saveDefaults: 'Save defaults',
    agentTimeline: 'Agent timeline',
    timelineEmpty: 'Run an analysis to populate the agent timeline.',
    llmCalls: 'LLM calls',
    toolCalls: 'Tool calls',
    elapsed: 'Elapsed',
    runId: 'Run ID',
    eventStream: 'Event stream',
    eventsEmpty: 'Live graph events will appear here.',
    customInterfaces: 'Settings / Custom APIs',
    customOpenAiHint: 'OpenAI-compatible Base URL, model IDs, and CUSTOM_OPENAI_API_KEY.',
    customDataHint: 'Choose custom as a data vendor, then point that category at an HTTP service.',
    endpointPath: 'Endpoint path',
    baseUrlRequired: 'Base URL for selected custom data categories',
    reports: 'Reports',
    final: 'Final',
    noReport: 'No report yet.',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    minimal: 'Minimal',
    idle: 'idle',
    queued: 'queued',
    running: 'running',
    succeeded: 'succeeded',
    failed: 'failed',
  },
  zh: {
    loading: '正在加载 TradingAgents 控制台',
    eyebrow: 'TradingAgents Web 控制台',
    title: '多智能体金融市场研究工作台',
    runAnalysis: '开始分析',
    connections: '设置 / API 密钥',
    notConfigured: '未配置',
    replaceValue: '替换当前值',
    pasteKey: '粘贴密钥',
    saveSecrets: '保存密钥',
    dataVendors: '数据源',
    analysisSetup: '分析配置',
    ticker: '股票代码',
    analysisDate: '分析日期',
    provider: '模型供应商',
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
    saveDefaults: '保存默认配置',
    agentTimeline: '智能体时间线',
    timelineEmpty: '运行一次分析后，这里会显示智能体进度。',
    llmCalls: 'LLM 调用',
    toolCalls: '工具调用',
    elapsed: '耗时',
    runId: '运行 ID',
    eventStream: '事件流',
    eventsEmpty: '实时图执行事件会显示在这里。',
    customInterfaces: '设置 / 自定义接口',
    customOpenAiHint: 'OpenAI-compatible Base URL、模型 ID 和 CUSTOM_OPENAI_API_KEY。',
    customDataHint: '将数据源选择为 custom 后，把对应分类指向你的 HTTP 数据服务。',
    endpointPath: '接口路径',
    baseUrlRequired: '已选择 custom 的数据分类需要填写 Base URL',
    reports: '报告',
    final: '最终报告',
    noReport: '暂无报告。',
    low: '低',
    medium: '中',
    high: '高',
    minimal: '最小',
    idle: '空闲',
    queued: '排队中',
    running: '运行中',
    succeeded: '已完成',
    failed: '失败',
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
  providers: [],
  models: {},
  languages: [],
  dataVendorCategories: [],
  customDataMethods: [],
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
  const [metadata, setMetadata] = useState<Metadata>(emptyMetadata);
  const [config, setConfig] = useState<WebConfig | null>(null);
  const [secretStatus, setSecretStatus] = useState<SecretStatus>({});
  const [secretDraft, setSecretDraft] = useState<Record<string, string>>({});
  const [activeRun, setActiveRun] = useState<RunInfo | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [reports, setReports] = useState<ReportsPayload | null>(null);
  const [reportTab, setReportTab] = useState('finalReport');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [isRunning, setRunning] = useState(false);

  const t = messages[locale];

  useEffect(() => {
    Promise.all([api.metadata(), api.config(), api.secretStatus()])
      .then(([metadataValue, configValue, secretValue]) => {
        setMetadata({ ...emptyMetadata, ...metadataValue });
        setConfig(configValue);
        setSecretStatus(secretValue);
      })
      .catch((err) => setError(err.message));
  }, []);

  function changeLocale(value: Locale) {
    setLocale(value);
    window.localStorage.setItem('tradingagents-webui-locale', value);
  }

  const provider = useMemo(
    () => metadata.providers.find((item) => item.value === config?.llmProvider),
    [metadata.providers, config?.llmProvider],
  );

  const providerModels = config ? metadata.models[config.llmProvider] : undefined;
  const isCustomOpenAi = config?.llmProvider === 'custom_openai';

  function updateConfig<K extends keyof WebConfig>(key: K, value: WebConfig[K]) {
    setConfig((current) => (current ? { ...current, [key]: value } : current));
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

  async function saveSecrets() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveSecrets(secretDraft);
      setSecretStatus(saved);
      setSecretDraft({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function startRun() {
    if (!config) return;
    setRunning(true);
    setError(null);
    setEvents([]);
    setReports(null);
    try {
      await api.saveConfig(config);
      const run = await api.createRun(config);
      setActiveRun(run);
      attachEvents(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
    }
  }

  function attachEvents(runId: string) {
    const source = new EventSource(`/api/runs/${runId}/events`);
    const onEvent = (message: MessageEvent) => {
      const event = JSON.parse(message.data) as RunEvent;
      setEvents((current) => [...current, event].slice(-200));
      if (event.type === 'reports') {
        setReports(event.payload as unknown as ReportsPayload);
      }
      if (event.type === 'status') {
        api.run(runId).then((run) => {
          setActiveRun(run);
          if (run.status === 'succeeded' || run.status === 'failed') {
            setRunning(false);
            source.close();
            api.reports(runId).then(setReports).catch(() => undefined);
          }
        });
      }
    };
    ['status', 'progress', 'message', 'tool', 'llm', 'configuration', 'reports'].forEach((name) => {
      source.addEventListener(name, onEvent);
    });
    source.onerror = () => {
      source.close();
      setRunning(false);
    };
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
  const reportEntries = reports?.reports ? Object.entries(reports.reports) : [];

  return (
    <main className="app-shell" lang={locale === 'zh' ? 'zh-CN' : 'en'}>
      <header className="topbar">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>{t.title}</h1>
        </div>
        <div className="status-cluster">
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
          <button className="primary" onClick={startRun} disabled={isRunning}>
            {isRunning ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
            {t.runAnalysis}
          </button>
        </div>
      </header>

      {error && (
        <div className="alert">
          <CircleAlert size={18} />
          <span>{error}</span>
        </div>
      )}

      <section className="workspace-grid">
        <aside className="left-rail">
          <Panel title={t.connections} icon={<KeyRound size={17} />}>
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
          </Panel>
        </aside>

        <section className="main-column">
          <Panel title={t.analysisSetup} icon={<Settings2 size={17} />}>
            <div className="form-grid">
              <label className="field">
                <span>{t.ticker}</span>
                <input value={config.ticker} onChange={(event) => updateConfig('ticker', event.target.value)} placeholder="SPY, 0700.HK" />
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
              <label className="field">
                <span>{t.provider}</span>
                <select
                  value={config.llmProvider}
                  onChange={(event) => {
                    const nextProvider = event.target.value;
                    const nextProviderMeta = metadata.providers.find((item) => item.value === nextProvider);
                    const nextModels = metadata.models[nextProvider];
                    setConfig({
                      ...config,
                      llmProvider: nextProvider,
                      backendUrl: nextProviderMeta?.defaultBaseUrl ?? null,
                      quickThinkLlm: nextModels?.quick?.[0]?.value ?? config.quickThinkLlm,
                      deepThinkLlm: nextModels?.deep?.[0]?.value ?? config.deepThinkLlm,
                    });
                  }}
                >
                  {metadata.providers.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t.baseUrl}</span>
                <input
                  value={config.backendUrl ?? ''}
                  onChange={(event) => updateConfig('backendUrl', event.target.value || null)}
                  placeholder={provider?.defaultBaseUrl ?? t.providerDefault}
                />
              </label>
            </div>

            <div className="tool-row">
              {isCustomOpenAi ? (
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
                    options={providerModels?.quick ?? []}
                    onChange={(value) => updateConfig('quickThinkLlm', value)}
                  />
                  <Selector
                    icon={<Bot size={16} />}
                    label={t.deepModel}
                    value={config.deepThinkLlm}
                    options={providerModels?.deep ?? []}
                    onChange={(value) => updateConfig('deepThinkLlm', value)}
                  />
                </>
              )}
              <Selector
                icon={<Gauge size={16} />}
                label={t.depth}
                value={String(config.researchDepth)}
                options={metadata.researchDepths.map((item) => ({ label: researchDepthLabel(Number(item.value), item.label, locale), value: String(item.value) }))}
                onChange={(value) => updateConfig('researchDepth', Number(value) as 1 | 3 | 5)}
              />
            </div>

            <div className="section-title">
              <Languages size={16} />
              {t.outputLanguage}
            </div>
            <div className="chip-grid">
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
          </Panel>

          <Panel title={t.agentTimeline} icon={<Activity size={17} />}>
            <div className="agent-grid">
              {Object.entries(agentStatus).map(([agent, status]) => (
                <span key={agent} className={`agent ${status}`}>
                  <BadgeCheck size={15} />
                  {agentLabels[locale][agent] ?? agent}
                  <small>{statusLabel(status, locale)}</small>
                </span>
              ))}
              {Object.keys(agentStatus).length === 0 && <span className="empty">{t.timelineEmpty}</span>}
            </div>
            <div className="metrics-row">
              <Metric label={t.llmCalls} value={progress?.stats?.llm_calls ?? activeRun?.stats?.llm_calls ?? 0} />
              <Metric label={t.toolCalls} value={progress?.stats?.tool_calls ?? activeRun?.stats?.tool_calls ?? 0} />
              <Metric label={t.elapsed} value={`${progress?.elapsedSeconds ?? 0}s`} />
              <Metric label={t.runId} value={activeRun?.id.slice(0, 8) ?? '-'} />
            </div>
          </Panel>

          <Panel title={t.customInterfaces} icon={<Server size={17} />}>
            <p className="hint">{t.customOpenAiHint}</p>
            <p className="hint">{t.customDataHint}</p>
            <div className="custom-interface-list">
              {metadata.dataVendorCategories.map((category) => {
                const selectedCustom = config.dataVendors[category.key] === 'custom';
                const settings = config.customDataInterfaces[category.key] ?? { baseUrl: null, endpoints: {} };
                const methods = metadata.customDataMethods.filter((method) => method.category === category.key);
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
        </section>

        <aside className="right-rail">
          <Panel title={t.eventStream} icon={<TerminalSquare size={17} />}>
            <div className="event-list">
              {[...events].reverse().slice(0, 30).map((event) => (
                <div key={`${event.id}-${event.timestamp}`} className="event-row">
                  <span>{eventLabels[locale][event.type] ?? event.type}</span>
                  <p>{eventSummary(event, locale)}</p>
                </div>
              ))}
              {events.length === 0 && <span className="empty">{t.eventsEmpty}</span>}
            </div>
          </Panel>

          <Panel title={t.reports} icon={<Server size={17} />}>
            <div className="tabs">
              <button className={reportTab === 'finalReport' ? 'active' : ''} onClick={() => setReportTab('finalReport')}>
                {t.final}
              </button>
              {reportEntries.map(([key]) => (
                <button key={key} className={reportTab === key ? 'active' : ''} onClick={() => setReportTab(key)}>
                  {reportLabels[locale][key] ?? cleanLabel(key)}
                </button>
              ))}
            </div>
            <article className="report-view">
              <pre>{reportTab === 'finalReport' ? reports?.finalReport ?? t.noReport : stringifyReport(reports?.reports?.[reportTab], t.noReport)}</pre>
            </article>
          </Panel>
        </aside>
      </section>
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
  if (typeof payload.content === 'string') return payload.content.slice(0, 160);
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

createRoot(document.getElementById('root')!).render(<App />);

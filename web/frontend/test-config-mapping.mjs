import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./src/configMapping.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const mapping = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const methods = [
  { method: 'get_stock_data', category: 'core_stock_apis', label: 'Stock prices', defaultPath: '/stock' },
  { method: 'get_news', category: 'news_data', label: 'Ticker news', defaultPath: '/news' },
  { method: 'get_fundamentals', category: 'fundamental_data', label: 'Fundamentals', defaultPath: '/fundamentals' },
  { method: 'get_balance_sheet', category: 'fundamental_data', label: 'Balance sheet', defaultPath: '/balance-sheet' },
  { method: 'get_cashflow', category: 'fundamental_data', label: 'Cash flow', defaultPath: '/cashflow' },
  { method: 'get_income_statement', category: 'fundamental_data', label: 'Income statement', defaultPath: '/income-statement' },
];

function baseConfig(overrides = {}) {
  return {
    ticker: 'SPY',
    analysisDate: '2026-05-04',
    stockMarket: 'us',
    marketProfiles: {},
    outputLanguage: 'English',
    analysts: ['market'],
    researchDepth: 1,
    llmProvider: 'openai',
    backendUrl: null,
    quickThinkLlm: 'gpt-4o-mini',
    deepThinkLlm: 'gpt-4o',
    googleThinkingLevel: null,
    openaiReasoningEffort: null,
    anthropicEffort: null,
    deepseekThinkingMode: 'disabled',
    checkpointEnabled: true,
    maxRecurLimit: 100,
    maxParallelRuns: 1,
    dataVendors: {
      core_stock_apis: 'yfinance',
      technical_indicators: 'yfinance',
      fundamental_data: 'yfinance',
      news_data: 'yfinance',
    },
    toolVendors: {},
    llmRoutes: {},
    customDataInterfaces: {
      core_stock_apis: { baseUrl: null, endpoints: { get_stock_data: '/stock' } },
      fundamental_data: {
        baseUrl: null,
        endpoints: {
          get_fundamentals: '/fundamentals',
          get_balance_sheet: '/balance-sheet',
          get_cashflow: '/cashflow',
          get_income_statement: '/income-statement',
        },
      },
      news_data: { baseUrl: null, endpoints: { get_news: '/news' } },
    },
    ...overrides,
  };
}

test('configForBackend converts Longbridge preset vendors to custom', () => {
  const payload = mapping.configForBackend(
    baseConfig({
      dataVendors: {
        core_stock_apis: 'longbridge_proxy',
        technical_indicators: 'yfinance',
        fundamental_data: 'yfinance',
        news_data: 'yfinance',
      },
      toolVendors: { get_news: 'longbridge' },
    }),
    'https://proxy.example.com',
    methods,
  );

  assert.equal(payload.dataVendors.core_stock_apis, 'custom');
  assert.equal(payload.toolVendors.get_news, 'custom');
  assert.equal(payload.customDataInterfaces.core_stock_apis.baseUrl, 'https://proxy.example.com');
  assert.equal(payload.customDataInterfaces.core_stock_apis.endpoints.get_stock_data, '/stock');
  assert.equal(payload.customDataInterfaces.news_data.baseUrl, 'https://proxy.example.com');
});

test('hydrateLongbridgeProxyConfig does not auto-promote custom when proxy URL is empty', () => {
  const hydrated = mapping.hydrateLongbridgeProxyConfig(
    baseConfig({
      dataVendors: {
        core_stock_apis: 'custom',
        technical_indicators: 'yfinance',
        fundamental_data: 'yfinance',
        news_data: 'yfinance',
      },
      customDataInterfaces: {
        core_stock_apis: { baseUrl: 'https://proxy.example.com', endpoints: { get_stock_data: '/stock' } },
        news_data: { baseUrl: null, endpoints: { get_news: '/news' } },
      },
    }),
    '',
    methods,
  );

  assert.equal(hydrated.dataVendors.core_stock_apis, 'custom');
});

test('hydrateLongbridgeProxyConfig only shows Longbridge when custom base URL matches configured proxy', () => {
  const hydrated = mapping.hydrateLongbridgeProxyConfig(
    baseConfig({
      dataVendors: {
        core_stock_apis: 'custom',
        technical_indicators: 'yfinance',
        fundamental_data: 'yfinance',
        news_data: 'yfinance',
      },
      customDataInterfaces: {
        core_stock_apis: { baseUrl: 'https://proxy.example.com/', endpoints: { get_stock_data: '/stock' } },
        news_data: { baseUrl: null, endpoints: { get_news: '/news' } },
      },
    }),
    'https://proxy.example.com',
    methods,
  );

  assert.equal(hydrated.dataVendors.core_stock_apis, 'longbridge_proxy');
});

test('hydrateLongbridgeProxyConfig keeps ordinary custom APIs as custom when base URL differs', () => {
  const hydrated = mapping.hydrateLongbridgeProxyConfig(
    baseConfig({
      dataVendors: {
        core_stock_apis: 'custom',
        technical_indicators: 'yfinance',
        fundamental_data: 'yfinance',
        news_data: 'yfinance',
      },
      customDataInterfaces: {
        core_stock_apis: { baseUrl: 'https://data.example.com', endpoints: { get_stock_data: '/stock' } },
        news_data: { baseUrl: null, endpoints: { get_news: '/news' } },
      },
    }),
    'https://proxy.example.com',
    methods,
  );

  assert.equal(hydrated.dataVendors.core_stock_apis, 'custom');
});

test('configForBackend maps A-share fundamentals preset to custom without changing Longbridge categories', () => {
  const payload = mapping.configForBackend(
    baseConfig({
      dataVendors: {
        core_stock_apis: 'longbridge_proxy',
        technical_indicators: 'longbridge_proxy',
        fundamental_data: 'a_share_fundamentals',
        news_data: 'longbridge_proxy',
      },
    }),
    'https://longbridge.example.com',
    methods,
    'https://ashare.example.com',
  );

  assert.equal(payload.dataVendors.core_stock_apis, 'custom');
  assert.equal(payload.dataVendors.technical_indicators, 'custom');
  assert.equal(payload.dataVendors.news_data, 'custom');
  assert.equal(payload.dataVendors.fundamental_data, 'custom');
  assert.equal(payload.customDataInterfaces.core_stock_apis.baseUrl, 'https://longbridge.example.com');
  assert.equal(payload.customDataInterfaces.news_data.baseUrl, 'https://longbridge.example.com');
  assert.equal(payload.customDataInterfaces.fundamental_data.baseUrl, 'https://ashare.example.com');
  assert.equal(payload.customDataInterfaces.fundamental_data.endpoints.get_fundamentals, '/fundamentals');
  assert.equal(payload.customDataInterfaces.fundamental_data.endpoints.get_balance_sheet, '/balance-sheet');
  assert.equal(payload.customDataInterfaces.fundamental_data.endpoints.get_cashflow, '/cashflow');
  assert.equal(payload.customDataInterfaces.fundamental_data.endpoints.get_income_statement, '/income-statement');
});

test('configForBackend maps A-share fundamentals method overrides independently', () => {
  const payload = mapping.configForBackend(
    baseConfig({
      toolVendors: {
        get_fundamentals: 'a_share_fundamentals',
        get_balance_sheet: 'a_share_fundamentals',
        get_cashflow: 'a_share_fundamentals',
        get_income_statement: 'a_share_fundamentals',
      },
    }),
    '',
    methods,
    'https://ashare.example.com',
  );

  assert.equal(payload.dataVendors.fundamental_data, 'yfinance');
  assert.equal(payload.toolVendors.get_fundamentals, 'custom');
  assert.equal(payload.toolVendors.get_balance_sheet, 'custom');
  assert.equal(payload.toolVendors.get_cashflow, 'custom');
  assert.equal(payload.toolVendors.get_income_statement, 'custom');
  assert.equal(payload.customDataInterfaces.fundamental_data.baseUrl, 'https://ashare.example.com');
});

test('hydrateLongbridgeProxyConfig only shows A-share fundamentals for matching fundamental_data base URL', () => {
  const hydrated = mapping.hydrateLongbridgeProxyConfig(
    baseConfig({
      dataVendors: {
        core_stock_apis: 'custom',
        technical_indicators: 'yfinance',
        fundamental_data: 'custom',
        news_data: 'yfinance',
      },
      customDataInterfaces: {
        core_stock_apis: { baseUrl: 'https://ashare.example.com', endpoints: { get_stock_data: '/stock' } },
        fundamental_data: {
          baseUrl: 'https://ashare.example.com/',
          endpoints: {
            get_fundamentals: '/fundamentals',
            get_balance_sheet: '/balance-sheet',
            get_cashflow: '/cashflow',
            get_income_statement: '/income-statement',
          },
        },
        news_data: { baseUrl: null, endpoints: { get_news: '/news' } },
      },
    }),
    '',
    methods,
    'https://ashare.example.com',
  );

  assert.equal(hydrated.dataVendors.core_stock_apis, 'custom');
  assert.equal(hydrated.dataVendors.fundamental_data, 'a_share_fundamentals');
});

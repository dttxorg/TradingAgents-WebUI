import type { Metadata, WebConfig } from './types';

export const LONGBRIDGE_PROXY_VENDOR = 'longbridge_proxy';
export const ASHARE_FUNDAMENTALS_VENDOR = 'a_share_fundamentals';
export const ASHARE_FUNDAMENTALS_CATEGORY = 'fundamental_data';
export const ASHARE_FUNDAMENTALS_METHODS = new Set([
  'get_fundamentals',
  'get_balance_sheet',
  'get_cashflow',
  'get_income_statement',
]);
export const ASHARE_MARKETS = ['sh', 'sz'] as const;

export function isLongbridgeProxyVendor(vendor: string | null | undefined) {
  return vendor === LONGBRIDGE_PROXY_VENDOR || vendor === 'longbridge';
}

export function isAshareFundamentalsVendor(vendor: string | null | undefined) {
  return vendor === ASHARE_FUNDAMENTALS_VENDOR || vendor === 'ashare_fundamentals_proxy';
}

export function isPresetDataVendor(vendor: string | null | undefined) {
  return isLongbridgeProxyVendor(vendor) || isAshareFundamentalsVendor(vendor);
}

export function isCustomLikeDataVendor(vendor: string | null | undefined) {
  return vendor === 'custom' || isPresetDataVendor(vendor);
}

export function normalizeDisplayVendor(vendor: string) {
  if (isAshareFundamentalsVendor(vendor)) return ASHARE_FUNDAMENTALS_VENDOR;
  return isLongbridgeProxyVendor(vendor) ? LONGBRIDGE_PROXY_VENDOR : vendor;
}

export function normalizedBaseUrl(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\/+$/, '');
}

export function isAshareMarket(market: string | null | undefined) {
  return market === 'sh' || market === 'sz';
}

export function isLongbridgeProxyBaseUrl(value: string | null | undefined, proxyBaseUrl: string | null | undefined) {
  const normalizedValue = normalizedBaseUrl(value);
  const normalizedProxy = normalizedBaseUrl(proxyBaseUrl);
  return Boolean(normalizedValue && normalizedProxy && normalizedValue === normalizedProxy);
}

export function vendorOptions(options: string[], context?: { category?: string; method?: string; market?: string; allowAsharePreset?: boolean }) {
  const next = options.includes(LONGBRIDGE_PROXY_VENDOR) ? [...options] : [...options, LONGBRIDGE_PROXY_VENDOR];
  const isAshareFundamentalTarget =
    context?.category === ASHARE_FUNDAMENTALS_CATEGORY &&
    (!context.method || ASHARE_FUNDAMENTALS_METHODS.has(context.method)) &&
    (context.allowAsharePreset || isAshareMarket(context.market));
  if (isAshareFundamentalTarget && !next.includes(ASHARE_FUNDAMENTALS_VENDOR)) {
    next.push(ASHARE_FUNDAMENTALS_VENDOR);
  }
  return next;
}

export function methodCategoryMap(methods: Metadata['customDataMethods']) {
  return Object.fromEntries(methods.map((method) => [method.method, method.category]));
}

function defaultEndpointsForCategory(category: string, methods: Metadata['customDataMethods']) {
  return Object.fromEntries(
    methods
      .filter((method) => method.category === category)
      .map((method) => [method.method, method.defaultPath]),
  );
}

function defaultAshareFundamentalsInterface(baseUrl: string, methods: Metadata['customDataMethods']) {
  return {
    baseUrl: baseUrl.trim() || null,
    endpoints: defaultEndpointsForCategory(ASHARE_FUNDAMENTALS_CATEGORY, methods),
  };
}

function isEmptyRecord(value: Record<string, unknown> | undefined) {
  return !value || Object.keys(value).length === 0;
}

function pruneMarketDataOverrides(overrides: WebConfig['marketDataOverrides']) {
  return Object.fromEntries(
    Object.entries(overrides ?? {}).filter(([, override]) => (
      !isEmptyRecord(override.dataVendors) ||
      !isEmptyRecord(override.toolVendors) ||
      !isEmptyRecord(override.customDataInterfaces)
    )),
  );
}

function marketOverride(config: WebConfig, market: string) {
  return config.marketDataOverrides?.[market] ?? {
    dataVendors: {},
    toolVendors: {},
    customDataInterfaces: {},
  };
}

export function marketDataOverride(config: WebConfig, market: string) {
  return marketOverride(config, market);
}

function cleanMarketOverride(override: WebConfig['marketDataOverrides'][string]) {
  return {
    dataVendors: Object.fromEntries(Object.entries(override.dataVendors ?? {}).filter(([, vendor]) => Boolean(vendor))),
    toolVendors: Object.fromEntries(Object.entries(override.toolVendors ?? {}).filter(([, vendor]) => Boolean(vendor))),
    customDataInterfaces: Object.fromEntries(
      Object.entries(override.customDataInterfaces ?? {}).filter(([, settings]) => (
        Boolean(settings.baseUrl) || Object.keys(settings.endpoints ?? {}).length > 0
      )),
    ),
  };
}

export function setMarketOverride(config: WebConfig, market: string, override: WebConfig['marketDataOverrides'][string]) {
  const nextOverrides = {
    ...(config.marketDataOverrides ?? {}),
    [market]: cleanMarketOverride(override),
  };
  return { ...config, marketDataOverrides: pruneMarketDataOverrides(nextOverrides) };
}

function marketInterfaceWithDefaults(
  config: WebConfig,
  market: string,
  category: string,
  methods: Metadata['customDataMethods'],
) {
  const override = marketOverride(config, market);
  const current = override.customDataInterfaces?.[category] ?? { baseUrl: null, endpoints: {} };
  return {
    ...current,
    endpoints: {
      ...defaultEndpointsForCategory(category, methods),
      ...(current.endpoints ?? {}),
    },
  };
}

function categoryHasCustomLikeRoute(
  dataVendors: Record<string, string>,
  toolVendors: Record<string, string>,
  category: string,
  methods: Metadata['customDataMethods'],
) {
  return (
    isCustomLikeDataVendor(dataVendors[category]) ||
    methods.some((method) => method.category === category && isCustomLikeDataVendor(toolVendors[method.method]))
  );
}

export function updateMarketDataVendor(
  config: WebConfig,
  market: string,
  category: string,
  vendor: string,
  methods: Metadata['customDataMethods'],
) {
  const override = marketOverride(config, market);
  const dataVendors = { ...(override.dataVendors ?? {}) };
  const customDataInterfaces = { ...(override.customDataInterfaces ?? {}) };
  if (!vendor) {
    delete dataVendors[category];
  } else {
    dataVendors[category] = normalizeDisplayVendor(vendor);
    if (isCustomLikeDataVendor(vendor)) {
      customDataInterfaces[category] = marketInterfaceWithDefaults(config, market, category, methods);
    }
  }
  if (!categoryHasCustomLikeRoute(dataVendors, override.toolVendors ?? {}, category, methods)) {
    delete customDataInterfaces[category];
  }
  return setMarketOverride(config, market, {
    ...override,
    dataVendors,
    customDataInterfaces,
  });
}

export function updateMarketToolVendor(
  config: WebConfig,
  market: string,
  method: string,
  vendor: string,
  methods: Metadata['customDataMethods'],
) {
  const override = marketOverride(config, market);
  const toolVendors = { ...(override.toolVendors ?? {}) };
  const customDataInterfaces = { ...(override.customDataInterfaces ?? {}) };
  const category = methodCategoryMap(methods)[method];
  if (!vendor) {
    delete toolVendors[method];
  } else {
    toolVendors[method] = normalizeDisplayVendor(vendor);
    if (category && isCustomLikeDataVendor(vendor)) {
      customDataInterfaces[category] = marketInterfaceWithDefaults(config, market, category, methods);
    }
  }
  if (category && !categoryHasCustomLikeRoute(override.dataVendors ?? {}, toolVendors, category, methods)) {
    delete customDataInterfaces[category];
  }
  return setMarketOverride(config, market, {
    ...override,
    toolVendors,
    customDataInterfaces,
  });
}

export function updateMarketCustomDataBaseUrl(config: WebConfig, market: string, category: string, value: string) {
  const override = marketOverride(config, market);
  const current = override.customDataInterfaces?.[category] ?? { baseUrl: null, endpoints: {} };
  return setMarketOverride(config, market, {
    ...override,
    customDataInterfaces: {
      ...(override.customDataInterfaces ?? {}),
      [category]: { ...current, baseUrl: value || null },
    },
  });
}

export function updateMarketCustomDataEndpoint(config: WebConfig, market: string, category: string, method: string, value: string) {
  const override = marketOverride(config, market);
  const current = override.customDataInterfaces?.[category] ?? { baseUrl: null, endpoints: {} };
  return setMarketOverride(config, market, {
    ...override,
    customDataInterfaces: {
      ...(override.customDataInterfaces ?? {}),
      [category]: {
        ...current,
        endpoints: { ...(current.endpoints ?? {}), [method]: value },
      },
    },
  });
}

export function effectiveMarketDataVendors(config: WebConfig, market = config.stockMarket) {
  return {
    ...config.dataVendors,
    ...(config.marketDataOverrides?.[market]?.dataVendors ?? {}),
  };
}

export function effectiveMarketToolVendors(config: WebConfig, market = config.stockMarket) {
  return {
    ...(config.toolVendors ?? {}),
    ...(config.marketDataOverrides?.[market]?.toolVendors ?? {}),
  };
}

export function longbridgeProxyCategories(config: WebConfig, methods: Metadata['customDataMethods']) {
  const categories = new Set<string>();
  const methodCategory = methodCategoryMap(methods);
  Object.entries(config.dataVendors).forEach(([category, vendor]) => {
    if (isLongbridgeProxyVendor(vendor)) categories.add(category);
  });
  Object.entries(config.toolVendors ?? {}).forEach(([method, vendor]) => {
    const category = methodCategory[method];
    if (isLongbridgeProxyVendor(vendor) && category) categories.add(category);
  });
  Object.values(config.marketDataOverrides ?? {}).forEach((override) => {
    Object.entries(override.dataVendors ?? {}).forEach(([category, vendor]) => {
      if (isLongbridgeProxyVendor(vendor)) categories.add(category);
    });
    Object.entries(override.toolVendors ?? {}).forEach(([method, vendor]) => {
      const category = methodCategory[method];
      if (isLongbridgeProxyVendor(vendor) && category) categories.add(category);
    });
  });
  return categories;
}

export function ashareFundamentalsCategories(config: WebConfig, methods: Metadata['customDataMethods']) {
  const categories = new Set<string>();
  const methodCategory = methodCategoryMap(methods);
  Object.entries(config.dataVendors).forEach(([category, vendor]) => {
    if (category === ASHARE_FUNDAMENTALS_CATEGORY && isAshareFundamentalsVendor(vendor)) {
      categories.add(category);
    }
  });
  Object.entries(config.toolVendors ?? {}).forEach(([method, vendor]) => {
    const category = methodCategory[method];
    if (category === ASHARE_FUNDAMENTALS_CATEGORY && ASHARE_FUNDAMENTALS_METHODS.has(method) && isAshareFundamentalsVendor(vendor)) {
      categories.add(category);
    }
  });
  return categories;
}

export function ashareFundamentalsMarkets(config: WebConfig, methods: Metadata['customDataMethods']) {
  const markets = new Set<string>();
  const methodCategory = methodCategoryMap(methods);
  Object.entries(config.marketDataOverrides ?? {}).forEach(([market, override]) => {
    if (!isAshareMarket(market)) return;
    Object.entries(override.dataVendors ?? {}).forEach(([category, vendor]) => {
      if (category === ASHARE_FUNDAMENTALS_CATEGORY && isAshareFundamentalsVendor(vendor)) {
        markets.add(market);
      }
    });
    Object.entries(override.toolVendors ?? {}).forEach(([method, vendor]) => {
      const category = methodCategory[method];
      if (category === ASHARE_FUNDAMENTALS_CATEGORY && ASHARE_FUNDAMENTALS_METHODS.has(method) && isAshareFundamentalsVendor(vendor)) {
        markets.add(market);
      }
    });
  });
  return markets;
}

export function ashareFundamentalsBaseUrlFromConfig(config: WebConfig) {
  for (const market of ASHARE_MARKETS) {
    const override = config.marketDataOverrides?.[market];
    const baseUrl = override?.customDataInterfaces?.[ASHARE_FUNDAMENTALS_CATEGORY]?.baseUrl;
    const categoryVendor = override?.dataVendors?.[ASHARE_FUNDAMENTALS_CATEGORY];
    const methodUsesAshare = [...ASHARE_FUNDAMENTALS_METHODS].some((method) => (
      isAshareFundamentalsVendor(override?.toolVendors?.[method]) ||
      override?.toolVendors?.[method] === 'custom'
    ));
    if (baseUrl && (isAshareFundamentalsVendor(categoryVendor) || categoryVendor === 'custom' || methodUsesAshare)) {
      return baseUrl;
    }
  }
  return '';
}

export function syncLongbridgeProxyBaseUrl(config: WebConfig, baseUrl: string, methods: Metadata['customDataMethods']) {
  const categories = longbridgeProxyCategories(config, methods);
  const marketOverrides = config.marketDataOverrides ?? {};
  const methodCategory = methodCategoryMap(methods);
  if (categories.size === 0) return config;
  const nextInterfaces = { ...config.customDataInterfaces };
  Object.entries(config.dataVendors).forEach(([category, vendor]) => {
    if (!isLongbridgeProxyVendor(vendor)) return;
    const current = nextInterfaces[category] ?? { baseUrl: null, endpoints: {} };
    nextInterfaces[category] = {
      ...current,
      baseUrl: baseUrl.trim() || current.baseUrl || null,
      endpoints: { ...defaultEndpointsForCategory(category, methods), ...current.endpoints },
    };
  });
  Object.entries(config.toolVendors ?? {}).forEach(([method, vendor]) => {
    const category = methodCategory[method];
    if (!category || !isLongbridgeProxyVendor(vendor)) return;
    const current = nextInterfaces[category] ?? { baseUrl: null, endpoints: {} };
    nextInterfaces[category] = {
      ...current,
      baseUrl: baseUrl.trim() || current.baseUrl || null,
      endpoints: { ...defaultEndpointsForCategory(category, methods), ...current.endpoints },
    };
  });

  let nextConfig = { ...config, customDataInterfaces: nextInterfaces };
  Object.entries(marketOverrides).forEach(([market, override]) => {
    const marketCategories = new Set<string>();
    Object.entries(override.dataVendors ?? {}).forEach(([category, vendor]) => {
      if (isLongbridgeProxyVendor(vendor)) marketCategories.add(category);
    });
    Object.entries(override.toolVendors ?? {}).forEach(([method, vendor]) => {
      const category = methodCategory[method];
      if (category && isLongbridgeProxyVendor(vendor)) marketCategories.add(category);
    });
    if (marketCategories.size === 0) return;
    const customDataInterfaces = { ...(override.customDataInterfaces ?? {}) };
    marketCategories.forEach((category) => {
      const current = customDataInterfaces[category] ?? { baseUrl: null, endpoints: {} };
      customDataInterfaces[category] = {
        ...current,
        baseUrl: baseUrl.trim() || current.baseUrl || null,
        endpoints: {
          ...defaultEndpointsForCategory(category, methods),
          ...(current.endpoints ?? {}),
        },
      };
    });
    nextConfig = setMarketOverride(nextConfig, market, {
      ...override,
      customDataInterfaces,
    });
  });
  return nextConfig;
}

export function syncAshareFundamentalsBaseUrl(config: WebConfig, baseUrl: string, methods: Metadata['customDataMethods']) {
  const markets = ashareFundamentalsMarkets(config, methods);
  if (markets.size === 0) return config;
  return setAshareFundamentalsMarkets(config, [...markets], baseUrl, methods);
}

export function setAshareFundamentalsMarkets(
  config: WebConfig,
  markets: string[],
  baseUrl: string,
  methods: Metadata['customDataMethods'],
) {
  let nextConfig = config;
  const enabledMarkets = new Set(markets.filter(isAshareMarket));
  ASHARE_MARKETS.forEach((market) => {
    const current = marketOverride(nextConfig, market);
    const dataVendors = { ...(current.dataVendors ?? {}) };
    const toolVendors = { ...(current.toolVendors ?? {}) };
    const customDataInterfaces = { ...(current.customDataInterfaces ?? {}) };

    if (enabledMarkets.has(market)) {
      dataVendors[ASHARE_FUNDAMENTALS_CATEGORY] = ASHARE_FUNDAMENTALS_VENDOR;
      customDataInterfaces[ASHARE_FUNDAMENTALS_CATEGORY] = {
        ...defaultAshareFundamentalsInterface(baseUrl, methods),
        ...(customDataInterfaces[ASHARE_FUNDAMENTALS_CATEGORY] ?? {}),
        baseUrl: baseUrl.trim() || customDataInterfaces[ASHARE_FUNDAMENTALS_CATEGORY]?.baseUrl || null,
        endpoints: {
          ...defaultEndpointsForCategory(ASHARE_FUNDAMENTALS_CATEGORY, methods),
          ...(customDataInterfaces[ASHARE_FUNDAMENTALS_CATEGORY]?.endpoints ?? {}),
        },
      };
    } else {
      if (isAshareFundamentalsVendor(dataVendors[ASHARE_FUNDAMENTALS_CATEGORY])) {
        delete dataVendors[ASHARE_FUNDAMENTALS_CATEGORY];
      }
      ASHARE_FUNDAMENTALS_METHODS.forEach((method) => {
        if (isAshareFundamentalsVendor(toolVendors[method])) delete toolVendors[method];
      });
      const existing = customDataInterfaces[ASHARE_FUNDAMENTALS_CATEGORY];
      if (existing && normalizedBaseUrl(existing.baseUrl) === normalizedBaseUrl(baseUrl)) {
        delete customDataInterfaces[ASHARE_FUNDAMENTALS_CATEGORY];
      }
    }

    nextConfig = setMarketOverride(nextConfig, market, {
      dataVendors,
      toolVendors,
      customDataInterfaces,
    });
  });
  return nextConfig;
}

export function syncDataVendorPresetBaseUrls(
  config: WebConfig,
  baseUrls: { longbridgeProxyBaseUrl: string; ashareFundamentalsBaseUrl?: string },
  methods: Metadata['customDataMethods'],
) {
  const withLongbridge = syncLongbridgeProxyBaseUrl(config, baseUrls.longbridgeProxyBaseUrl, methods);
  return syncAshareFundamentalsBaseUrl(withLongbridge, baseUrls.ashareFundamentalsBaseUrl ?? '', methods);
}

export function hydrateLongbridgeProxyConfig(config: WebConfig, baseUrl: string, methods: Metadata['customDataMethods'], ashareFundamentalsBaseUrl = '') {
  return hydrateDataVendorPresetConfig(
    config,
    { longbridgeProxyBaseUrl: baseUrl, ashareFundamentalsBaseUrl },
    methods,
  );
}

export function hydrateDataVendorPresetConfig(
  config: WebConfig,
  baseUrls: { longbridgeProxyBaseUrl: string; ashareFundamentalsBaseUrl?: string },
  methods: Metadata['customDataMethods'],
) {
  const normalizedLongbridgeBase = normalizedBaseUrl(baseUrls.longbridgeProxyBaseUrl);
  const normalizedAshareBase = normalizedBaseUrl(baseUrls.ashareFundamentalsBaseUrl);
  const nextDataVendors = { ...config.dataVendors };
  const nextToolVendors = { ...(config.toolVendors ?? {}) };
  let nextMarketDataOverrides = { ...(config.marketDataOverrides ?? {}) };
  const methodCategories = methodCategoryMap(methods);
  let migrateGlobalAsharePreset = false;

  Object.entries(nextDataVendors).forEach(([category, vendor]) => {
    const categoryBase = normalizedBaseUrl(config.customDataInterfaces[category]?.baseUrl);
    if (
      category === ASHARE_FUNDAMENTALS_CATEGORY &&
      (isAshareFundamentalsVendor(vendor) || (vendor === 'custom' && normalizedAshareBase && categoryBase === normalizedAshareBase))
    ) {
      nextDataVendors[category] = 'yfinance';
      migrateGlobalAsharePreset = true;
    } else if (isLongbridgeProxyVendor(vendor) || (vendor === 'custom' && normalizedLongbridgeBase && categoryBase === normalizedLongbridgeBase)) {
      nextDataVendors[category] = LONGBRIDGE_PROXY_VENDOR;
    }
  });

  Object.entries(nextToolVendors).forEach(([method, vendor]) => {
    const category = methodCategories[method];
    const categoryBase = normalizedBaseUrl(category ? config.customDataInterfaces[category]?.baseUrl : null);
    if (
      category === ASHARE_FUNDAMENTALS_CATEGORY &&
      ASHARE_FUNDAMENTALS_METHODS.has(method) &&
      (isAshareFundamentalsVendor(vendor) || (vendor === 'custom' && normalizedAshareBase && categoryBase === normalizedAshareBase))
    ) {
      delete nextToolVendors[method];
      migrateGlobalAsharePreset = true;
    } else if (isLongbridgeProxyVendor(vendor) || (vendor === 'custom' && normalizedLongbridgeBase && categoryBase === normalizedLongbridgeBase)) {
      nextToolVendors[method] = LONGBRIDGE_PROXY_VENDOR;
    }
  });

  Object.entries(nextMarketDataOverrides).forEach(([market, override]) => {
    const marketDataVendors = { ...(override.dataVendors ?? {}) };
    const marketToolVendors = { ...(override.toolVendors ?? {}) };
    const marketInterfaces = { ...(override.customDataInterfaces ?? {}) };
    Object.entries(marketDataVendors).forEach(([category, vendor]) => {
      const categoryBase = normalizedBaseUrl(marketInterfaces[category]?.baseUrl);
      if (
        category === ASHARE_FUNDAMENTALS_CATEGORY &&
        (isAshareFundamentalsVendor(vendor) || (vendor === 'custom' && normalizedAshareBase && categoryBase === normalizedAshareBase))
      ) {
        marketDataVendors[category] = ASHARE_FUNDAMENTALS_VENDOR;
      } else if (isLongbridgeProxyVendor(vendor) || (vendor === 'custom' && normalizedLongbridgeBase && categoryBase === normalizedLongbridgeBase)) {
        marketDataVendors[category] = LONGBRIDGE_PROXY_VENDOR;
      }
    });
    Object.entries(marketToolVendors).forEach(([method, vendor]) => {
      const category = methodCategories[method];
      const categoryBase = normalizedBaseUrl(category ? marketInterfaces[category]?.baseUrl : null);
      if (
        category === ASHARE_FUNDAMENTALS_CATEGORY &&
        ASHARE_FUNDAMENTALS_METHODS.has(method) &&
        (isAshareFundamentalsVendor(vendor) || (vendor === 'custom' && normalizedAshareBase && categoryBase === normalizedAshareBase))
      ) {
        marketToolVendors[method] = ASHARE_FUNDAMENTALS_VENDOR;
      } else if (isLongbridgeProxyVendor(vendor) || (vendor === 'custom' && normalizedLongbridgeBase && categoryBase === normalizedLongbridgeBase)) {
        marketToolVendors[method] = LONGBRIDGE_PROXY_VENDOR;
      }
    });
    nextMarketDataOverrides[market] = {
      dataVendors: marketDataVendors,
      toolVendors: marketToolVendors,
      customDataInterfaces: marketInterfaces,
    };
  });

  let nextConfig = {
    ...config,
    dataVendors: nextDataVendors,
    toolVendors: nextToolVendors,
    marketDataOverrides: nextMarketDataOverrides,
  };

  if (migrateGlobalAsharePreset) {
    nextConfig = setAshareFundamentalsMarkets(nextConfig, [...ASHARE_MARKETS], baseUrls.ashareFundamentalsBaseUrl ?? '', methods);
  }

  return syncDataVendorPresetBaseUrls(
    nextConfig,
    baseUrls,
    methods,
  );
}

function normalizeUsMarketProfile(config: WebConfig): WebConfig {
  if (config.stockMarket !== 'us') return config;
  const current = config.marketProfiles?.us;
  return {
    ...config,
    marketProfiles: {
      ...(config.marketProfiles ?? {}),
      us: {
        ...(current ?? { weight: '1', marketProfile: '' }),
        region: '',
        appendRegionSuffix: false,
      },
    },
  };
}

function prepareAsharePresetForBackend(config: WebConfig, ashareFundamentalsBaseUrl: string, methods: Metadata['customDataMethods']) {
  const ashareMethodOverrides = [...ASHARE_FUNDAMENTALS_METHODS].filter((method) => (
    isAshareFundamentalsVendor((config.toolVendors ?? {})[method])
  ));
  const topLevelUsesAshare =
    isAshareFundamentalsVendor(config.dataVendors[ASHARE_FUNDAMENTALS_CATEGORY]) ||
    ashareMethodOverrides.length > 0;
  if (!topLevelUsesAshare) return config;

  const dataVendors = { ...config.dataVendors, [ASHARE_FUNDAMENTALS_CATEGORY]: 'yfinance' };
  const toolVendors = { ...(config.toolVendors ?? {}) };
  ASHARE_FUNDAMENTALS_METHODS.forEach((method) => {
    if (isAshareFundamentalsVendor(toolVendors[method])) delete toolVendors[method];
  });
  let nextConfig = setAshareFundamentalsMarkets(
    { ...config, dataVendors, toolVendors },
    [...ASHARE_MARKETS],
    ashareFundamentalsBaseUrl,
    methods,
  );
  if (ashareMethodOverrides.length > 0) {
    ASHARE_MARKETS.forEach((market) => {
      const current = marketOverride(nextConfig, market);
      const marketToolVendors = { ...(current.toolVendors ?? {}) };
      ashareMethodOverrides.forEach((method) => {
        marketToolVendors[method] = ASHARE_FUNDAMENTALS_VENDOR;
      });
      nextConfig = setMarketOverride(nextConfig, market, {
        ...current,
        toolVendors: marketToolVendors,
      });
    });
  }
  return nextConfig;
}

function normalizeBackendVendors(vendors: Record<string, string> | undefined) {
  return Object.fromEntries(
    Object.entries(vendors ?? {}).map(([key, vendor]) => [key, isPresetDataVendor(vendor) ? 'custom' : vendor]),
  );
}

export function configForBackend(config: WebConfig, baseUrl: string, methods: Metadata['customDataMethods'], ashareFundamentalsBaseUrl = '') {
  const prepared = syncDataVendorPresetBaseUrls(
    prepareAsharePresetForBackend(normalizeUsMarketProfile(config), ashareFundamentalsBaseUrl, methods),
    { longbridgeProxyBaseUrl: baseUrl, ashareFundamentalsBaseUrl },
    methods,
  );
  const dataVendors = normalizeBackendVendors(prepared.dataVendors);
  const toolVendors = normalizeBackendVendors(prepared.toolVendors);
  const marketDataOverrides = Object.fromEntries(
    Object.entries(prepared.marketDataOverrides ?? {}).map(([market, override]) => [
      market,
      {
        ...override,
        dataVendors: normalizeBackendVendors(override.dataVendors),
        toolVendors: normalizeBackendVendors(override.toolVendors),
      },
    ]),
  );

  return { ...prepared, dataVendors, toolVendors, marketDataOverrides };
}

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

export function isLongbridgeProxyBaseUrl(value: string | null | undefined, proxyBaseUrl: string | null | undefined) {
  const normalizedValue = normalizedBaseUrl(value);
  const normalizedProxy = normalizedBaseUrl(proxyBaseUrl);
  return Boolean(normalizedValue && normalizedProxy && normalizedValue === normalizedProxy);
}

export function vendorOptions(options: string[], context?: { category?: string; method?: string }) {
  const next = options.includes(LONGBRIDGE_PROXY_VENDOR) ? [...options] : [...options, LONGBRIDGE_PROXY_VENDOR];
  const isAshareFundamentalTarget =
    context?.category === ASHARE_FUNDAMENTALS_CATEGORY &&
    (!context.method || ASHARE_FUNDAMENTALS_METHODS.has(context.method));
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

export function syncLongbridgeProxyBaseUrl(config: WebConfig, baseUrl: string, methods: Metadata['customDataMethods']) {
  const categories = longbridgeProxyCategories(config, methods);
  if (categories.size === 0) return config;
  const nextInterfaces = { ...config.customDataInterfaces };
  categories.forEach((category) => {
    const current = nextInterfaces[category] ?? { baseUrl: null, endpoints: {} };
    nextInterfaces[category] = {
      ...current,
      baseUrl: baseUrl.trim() || null,
      endpoints: {
        ...defaultEndpointsForCategory(category, methods),
        ...current.endpoints,
      },
    };
  });
  return { ...config, customDataInterfaces: nextInterfaces };
}

export function syncAshareFundamentalsBaseUrl(config: WebConfig, baseUrl: string, methods: Metadata['customDataMethods']) {
  const categories = ashareFundamentalsCategories(config, methods);
  if (categories.size === 0) return config;
  const nextInterfaces = { ...config.customDataInterfaces };
  categories.forEach((category) => {
    const current = nextInterfaces[category] ?? { baseUrl: null, endpoints: {} };
    nextInterfaces[category] = {
      ...current,
      baseUrl: baseUrl.trim() || null,
      endpoints: {
        ...defaultEndpointsForCategory(category, methods),
        ...current.endpoints,
      },
    };
  });
  return { ...config, customDataInterfaces: nextInterfaces };
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
  const methodCategories = methodCategoryMap(methods);

  Object.entries(nextDataVendors).forEach(([category, vendor]) => {
    const categoryBase = normalizedBaseUrl(config.customDataInterfaces[category]?.baseUrl);
    if (
      category === ASHARE_FUNDAMENTALS_CATEGORY &&
      (isAshareFundamentalsVendor(vendor) || (vendor === 'custom' && normalizedAshareBase && categoryBase === normalizedAshareBase))
    ) {
      nextDataVendors[category] = ASHARE_FUNDAMENTALS_VENDOR;
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
      nextToolVendors[method] = ASHARE_FUNDAMENTALS_VENDOR;
    } else if (isLongbridgeProxyVendor(vendor) || (vendor === 'custom' && normalizedLongbridgeBase && categoryBase === normalizedLongbridgeBase)) {
      nextToolVendors[method] = LONGBRIDGE_PROXY_VENDOR;
    }
  });

  return syncDataVendorPresetBaseUrls(
    { ...config, dataVendors: nextDataVendors, toolVendors: nextToolVendors },
    baseUrls,
    methods,
  );
}

export function configForBackend(config: WebConfig, baseUrl: string, methods: Metadata['customDataMethods'], ashareFundamentalsBaseUrl = '') {
  const prepared = syncDataVendorPresetBaseUrls(
    config,
    { longbridgeProxyBaseUrl: baseUrl, ashareFundamentalsBaseUrl },
    methods,
  );
  const dataVendors = Object.fromEntries(
    Object.entries(prepared.dataVendors).map(([category, vendor]) => [category, isPresetDataVendor(vendor) ? 'custom' : vendor]),
  );
  const toolVendors = Object.fromEntries(
    Object.entries(prepared.toolVendors ?? {}).map(([method, vendor]) => [method, isPresetDataVendor(vendor) ? 'custom' : vendor]),
  );

  return { ...prepared, dataVendors, toolVendors };
}

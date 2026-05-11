import type { Metadata, WebConfig } from './types';

export const LONGBRIDGE_PROXY_VENDOR = 'longbridge_proxy';

export function isLongbridgeProxyVendor(vendor: string | null | undefined) {
  return vendor === LONGBRIDGE_PROXY_VENDOR || vendor === 'longbridge';
}

export function isCustomLikeDataVendor(vendor: string | null | undefined) {
  return vendor === 'custom' || isLongbridgeProxyVendor(vendor);
}

export function normalizeDisplayVendor(vendor: string) {
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

export function vendorOptions(options: string[]) {
  return options.includes(LONGBRIDGE_PROXY_VENDOR) ? options : [...options, LONGBRIDGE_PROXY_VENDOR];
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

export function hydrateLongbridgeProxyConfig(config: WebConfig, baseUrl: string, methods: Metadata['customDataMethods']) {
  const normalizedProxyBase = normalizedBaseUrl(baseUrl);
  const nextDataVendors = { ...config.dataVendors };
  const nextToolVendors = { ...(config.toolVendors ?? {}) };
  const methodCategories = methodCategoryMap(methods);

  Object.entries(nextDataVendors).forEach(([category, vendor]) => {
    const categoryBase = normalizedBaseUrl(config.customDataInterfaces[category]?.baseUrl);
    if (isLongbridgeProxyVendor(vendor) || (vendor === 'custom' && normalizedProxyBase && categoryBase === normalizedProxyBase)) {
      nextDataVendors[category] = LONGBRIDGE_PROXY_VENDOR;
    }
  });

  Object.entries(nextToolVendors).forEach(([method, vendor]) => {
    const category = methodCategories[method];
    const categoryBase = normalizedBaseUrl(category ? config.customDataInterfaces[category]?.baseUrl : null);
    if (isLongbridgeProxyVendor(vendor) || (vendor === 'custom' && normalizedProxyBase && categoryBase === normalizedProxyBase)) {
      nextToolVendors[method] = LONGBRIDGE_PROXY_VENDOR;
    }
  });

  return syncLongbridgeProxyBaseUrl(
    { ...config, dataVendors: nextDataVendors, toolVendors: nextToolVendors },
    baseUrl,
    methods,
  );
}

export function configForBackend(config: WebConfig, baseUrl: string, methods: Metadata['customDataMethods']) {
  const prepared = syncLongbridgeProxyBaseUrl(config, baseUrl, methods);
  const dataVendors = Object.fromEntries(
    Object.entries(prepared.dataVendors).map(([category, vendor]) => [category, isLongbridgeProxyVendor(vendor) ? 'custom' : vendor]),
  );
  const toolVendors = Object.fromEntries(
    Object.entries(prepared.toolVendors ?? {}).map(([method, vendor]) => [method, isLongbridgeProxyVendor(vendor) ? 'custom' : vendor]),
  );

  return { ...prepared, dataVendors, toolVendors };
}

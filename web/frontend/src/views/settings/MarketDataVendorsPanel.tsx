import type { ReactElement } from 'react';

export interface MarketDataVendorsPanelProps {
  state: any;
  handlers: any;
  helpers: any;
}

export function MarketDataVendorsPanel({ state, handlers, helpers }: MarketDataVendorsPanelProps): ReactElement {
  const Panel = helpers.Panel;
  const Field = helpers.Field;
  const SaveButton = helpers.SaveButton;
  const dataVendorOptionLabel = helpers.dataVendorOptionLabel;
  const marketGroupHasOverride = helpers.marketGroupHasOverride;
  const sharedMarketValue = helpers.sharedMarketValue;
  const marketGroupUsesCustomRoute = helpers.marketGroupUsesCustomRoute;
  const marketGroupCustomSettings = helpers.marketGroupCustomSettings;
  const marketDataOverride = helpers.marketDataOverride;
  const Database = helpers.Database;
  const KeyRound = helpers.KeyRound;

  const t = state.t;
  const locale = state.locale;
  const config = state.config;
  const metadata = state.metadata;
  const secretStatus = state.secretStatus;
  const secretDraft = state.secretDraft;
  const dataApiSecretFields = state.dataApiSecretFields;
  const marketDataSections = state.marketDataSections;
  const isSaving = state.isSaving;
  const dataVendorLabels = state.dataVendorLabels;
  const customMethodLabels = state.customMethodLabels;

  const setSecretDraft = handlers.setSecretDraft;
  const saveSecrets = handlers.saveSecrets;
  const updateMarketGroupVendor = handlers.updateMarketGroupVendor;
  const updateMarketGroupCustomBaseUrl = handlers.updateMarketGroupCustomBaseUrl;
  const updateMarketGroupMethodVendor = handlers.updateMarketGroupMethodVendor;
  const updateMarketGroupCustomEndpoint = handlers.updateMarketGroupCustomEndpoint;

  return (
    <Panel title={t.marketDataVendors} icon={<Database size={17} />}>
      <p className="hint">{t.marketDataHint}</p>
      {dataApiSecretFields.length > 0 && (
        <section className="data-secret-card">
          <div className="section-title">
            <KeyRound size={16} />
            {t.dataApiKeys}
          </div>
          <div className="data-secret-grid">
            {dataApiSecretFields.map((field: string) => (
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
                  onChange={(event) => setSecretDraft((current: any) => ({ ...current, [field]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <SaveButton onClick={saveSecrets} loading={isSaving}>
            {t.saveSecrets}
          </SaveButton>
        </section>
      )}
      <div className="market-data-list">
        {marketDataSections.map((section: any) => {
          const hasOverride = marketGroupHasOverride(section.markets);
          const sectionMarket = section.markets[0];
          return (
            <details key={section.key} className={hasOverride ? 'market-data-section active' : 'market-data-section'} open={section.markets.includes(config.stockMarket) || hasOverride}>
              <summary>
                <span>{section.label}</span>
                <small>{hasOverride ? t.marketOverrideConfigured : t.inheritDefault}</small>
              </summary>
              <div className="market-category-list">
                {metadata.dataVendorCategories.map((category: any) => {
                  const methods = metadata.customDataMethods.filter((method: any) => method.category === category.key);
                  const inherited = config.dataVendors[category.key] ?? '';
                  const value = sharedMarketValue(section.markets, (market: string) => marketDataOverride(config, market).dataVendors?.[category.key]);
                  const selectedCustom = marketGroupUsesCustomRoute(section.markets, category.key, methods);
                  const settings = marketGroupCustomSettings(section.markets, category.key);
                  return (
                    <section key={`${section.key}-${category.key}`} className={selectedCustom ? 'market-route-card active' : 'market-route-card'}>
                      <div className="market-route-head">
                        <Field label={dataVendorLabels[locale][category.key] ?? category.label}>
                          <select value={value} onChange={(event) => updateMarketGroupVendor(section.markets, category.key, event.target.value)}>
                            <option value="">{t.inheritDefault} ({dataVendorOptionLabel(inherited, locale)})</option>
                            {helpers.vendorOptions(category.options, { category: category.key, market: sectionMarket }).map((option: string) => (
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
                        {methods.map((method: any) => {
                          const inheritedOverride = sharedMarketValue(section.markets, (market: string) => marketDataOverride(config, market).dataVendors?.[method.category]);
                          const methodInherited = inheritedOverride || config.dataVendors[method.category] || '';
                          const methodValue = sharedMarketValue(section.markets, (market: string) => marketDataOverride(config, market).toolVendors?.[method.method]);
                          return (
                            <section key={`${section.key}-${method.method}`} className={selectedCustom ? 'market-method-row active' : 'market-method-row'}>
                              <label className="field method-vendor-row">
                                <span>
                                  {customMethodLabels[locale][method.method] ?? method.label}
                                  <small>{dataVendorLabels[locale][method.category] ?? category.label}</small>
                                </span>
                                <select value={methodValue} onChange={(event) => updateMarketGroupMethodVendor(section.markets, method.method, event.target.value)}>
                                  <option value="">{t.useCategoryDefault} ({dataVendorOptionLabel(methodInherited, locale)})</option>
                                  {helpers.vendorOptions(category.options, { category: method.category, method: method.method, market: sectionMarket }).map((option: string) => (
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
  );
}

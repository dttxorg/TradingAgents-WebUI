import type { ReactElement } from 'react';

export interface MarketPanelProps {
  state: any;
  handlers: any;
  helpers: any;
}

export function MarketPanel({ state, handlers, helpers }: MarketPanelProps): ReactElement {
  const Panel = helpers.Panel;
  const Field = helpers.Field;
  const SaveButton = helpers.SaveButton;
  const BarChart3 = helpers.BarChart3;

  const t = state.t;
  const locale = state.locale;
  const config = state.config;
  const metadata = state.metadata;
  const isSaving = state.isSaving;
  const stockMarketLabels = state.stockMarketLabels;

  const updateMarketProfile = handlers.updateMarketProfile;
  const saveConfig = handlers.saveConfig;

  return (
    <Panel title={t.marketSettings} icon={<BarChart3 size={17} />}>
      <p className="hint">
        {locale === 'zh'
          ? '用户可以只输入裸代码；每个市场可单独决定是否自动拼接 .region。无论是否拼后缀，market_profile prompt 都会注入到智能体上下文。'
          : 'Users can enter bare symbols; each market controls whether .region is appended. The market_profile prompt is injected either way.'}
      </p>
      <div className="market-profile-grid">
        {metadata.stockMarkets.map((market: any) => {
          const profile = config.marketProfiles?.[market.key] ?? { region: '', appendRegionSuffix: true, weight: '1', marketProfile: '' };
          // US is the default market; bare US tickers stay bare in
          // both the backend (web/backend/markets.py:format_market_ticker)
          // and the frontend (App.tsx:formatMarketTicker). Lock the
          // "Append suffix" toggle to off so an admin cannot create a
          // silent frontend/backend divergence (UI shows AAPL.us while
          // the agent still receives AAPL).
          const isUsMarket = market.key === 'us';
          const lockedToggleTitle = isUsMarket
            ? (locale === 'zh'
                ? '美股是默认市场，裸代码保持不变（后端永不追加 .us）'
                : 'US is the default market; bare US tickers stay bare (the backend never appends .us)')
            : '';
          return (
            <section key={market.key} className={config.stockMarket === market.key ? 'market-profile-card active' : 'market-profile-card'}>
              <div className="route-card-head">
                <div>
                  <strong>{stockMarketLabels[locale][market.key] ?? market.label}</strong>
                  <small>{market.description}</small>
                </div>
              </div>
              <label className="toggle-row compact-toggle" title={lockedToggleTitle}>
                <input
                  type="checkbox"
                  checked={isUsMarket ? false : (profile.appendRegionSuffix ?? true)}
                  disabled={isUsMarket}
                  onChange={(event) => updateMarketProfile(market.key, { appendRegionSuffix: event.target.checked })}
                />
                <span>
                  {t.appendRegionSuffix}
                  {isUsMarket && (
                    <em className="locked-suffix-note">
                      {locale === 'zh' ? ' （美股锁定关闭）' : ' (locked off for US)'}
                    </em>
                  )}
                </span>
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
        <SaveButton onClick={saveConfig} loading={isSaving}>
          {t.saveDefaults}
        </SaveButton>
      </div>
    </Panel>
  );
}

import type { ReactElement } from 'react';

export interface RoutesPanelProps {
  state: any;
  handlers: any;
  helpers: any;
}

export function RoutesPanel({ state, handlers, helpers }: RoutesPanelProps): ReactElement {
  const Panel = helpers.Panel;
  const Field = helpers.Field;
  const SaveButton = helpers.SaveButton;
  const routeModelOptions = helpers.routeModelOptions;
  const modelForRole = helpers.modelForRole;
  const routeLabel = helpers.routeLabel;
  const routeDescription = helpers.routeDescription;
  const Activity = helpers.Activity;

  const t = state.t;
  const locale = state.locale;
  const config = state.config;
  const metadata = state.metadata;
  const secretStatus = state.secretStatus;
  const secretDraft = state.secretDraft;
  const isSaving = state.isSaving;

  const setSecretDraft = handlers.setSecretDraft;
  const updateLlmRoute = handlers.updateLlmRoute;
  const saveSecrets = handlers.saveSecrets;
  const saveConfig = handlers.saveConfig;

  return (
    <Panel title={t.parallelRoutes} icon={<Activity size={17} />}>
      <p className="hint">{t.parallelRoutesHint}</p>
      <div className="route-grid">
        {metadata.llmRouteTargets.map((target: any) => {
          const route = config.llmRoutes?.[target.key] ?? { enabled: false, provider: null, backendUrl: null, modelId: null };
          const routeProvider = route.provider || config.llmProvider;
          const routeProviderMeta = metadata.providers.find((item: any) => item.value === routeProvider);
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
                    {metadata.providers.map((item: any) => (
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
                    {routeModels.map((item: any) => (
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
                    onChange={(event) => setSecretDraft((current: any) => ({ ...current, [target.apiKeyField]: event.target.value }))}
                  />
                </label>
              </div>
            </section>
          );
        })}
      </div>
      <div className="actions-row">
        <SaveButton onClick={saveSecrets} loading={isSaving}>
          {t.saveSecrets}
        </SaveButton>
        <SaveButton onClick={saveConfig} loading={isSaving}>
          {t.saveDefaults}
        </SaveButton>
      </div>
    </Panel>
  );
}

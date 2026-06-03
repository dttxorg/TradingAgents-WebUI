import type { ReactElement } from 'react';

export interface ModelPanelProps {
  state: any;
  handlers: any;
  helpers: any;
}

export function ModelPanel({ state, handlers, helpers }: ModelPanelProps): ReactElement {
  const Panel = helpers.Panel;
  const Field = helpers.Field;
  const Selector = helpers.Selector;
  const SaveButton = helpers.SaveButton;
  const Chip = helpers.Chip;
  const modelOptionsFor = helpers.modelOptionsFor;
  const deepseekThinkingOptions = helpers.deepseekThinkingOptions;
  const Loader2 = helpers.Loader2;
  const Settings2 = helpers.Settings2;
  const Brain = helpers.Brain;
  const Bot = helpers.Bot;
  const RefreshCw = helpers.RefreshCw;
  const Languages = helpers.Languages;

  const t = state.t;
  const locale = state.locale;
  const config = state.config;
  const metadata = state.metadata;
  const secretStatus = state.secretStatus;
  const secretDraft = state.secretDraft;
  const provider = state.provider;
  const discoveredModels = state.discoveredModels;
  const isFetchingModels = state.isFetchingModels;
  const showDeepSeekThinkingMode = state.showDeepSeekThinkingMode;
  const customLanguage = state.customLanguage;
  const isSaving = state.isSaving;

  const changeProvider = handlers.changeProvider;
  const updateConfig = handlers.updateConfig;
  const setSecretDraft = handlers.setSecretDraft;
  const fetchModelsForCurrentProvider = handlers.fetchModelsForCurrentProvider;
  const saveSecrets = handlers.saveSecrets;
  const saveConfig = handlers.saveConfig;

  return (
    <Panel title={t.connectionSettings} icon={<Settings2 size={17} />}>
      <div className="form-grid settings-form">
        <Field label={t.provider}>
          <select value={config.llmProvider} onChange={(event) => changeProvider(event.target.value)}>
            {metadata.providers.map((item: any) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.providerRegion}>
          <input value={provider?.region ?? '-'} readOnly />
        </Field>
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
            onChange={(event) => setSecretDraft((current: any) => ({ ...current, [provider.apiKeyField!]: event.target.value }))}
          />
        </label>
      )}

      <div className="tool-row settings-model-row">
        <Selector
          icon={<Brain size={16} />}
          label={t.quickModel}
          value={config.quickThinkLlm}
          options={modelOptionsFor('quick', config.quickThinkLlm)}
          onChange={(value: string) => updateConfig('quickThinkLlm', value)}
        />
        <Selector
          icon={<Bot size={16} />}
          label={t.deepModel}
          value={config.deepThinkLlm}
          options={modelOptionsFor('deep', config.deepThinkLlm)}
          onChange={(value: string) => updateConfig('deepThinkLlm', value)}
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
      {showDeepSeekThinkingMode && (
        <div className="settings-thinking-row">
          <Field label={t.deepseekThinkingMode}>
            <select
              value={config.deepseekThinkingMode ?? 'disabled'}
              onChange={(event) => updateConfig('deepseekThinkingMode', event.target.value as any)}
            >
              {deepseekThinkingOptions(metadata, locale).map((option: any) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <p className="inline-hint">{t.deepseekThinkingHint}</p>
        </div>
      )}

      <div className="section-title">
        <Languages size={16} />
        {t.outputLanguage}
      </div>
      <div className="chip-grid settings-language-grid">
        {metadata.languages.map((language: any) => (
          <Chip
            key={language.value}
            active={config.outputLanguage === language.value}
            onClick={() => updateConfig('outputLanguage', language.value)}
          >
            {language.label}
          </Chip>
        ))}
        <input
          className="chip-input"
          placeholder={t.customLanguage}
          value={customLanguage}
          onChange={(event) => updateConfig('outputLanguage', event.target.value)}
        />
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

import type { ReactElement } from 'react';

export interface BacktestPanelProps {
  state: any;
  handlers: any;
  helpers: any;
}

export function BacktestPanel({ state, handlers, helpers }: BacktestPanelProps): ReactElement {
  const Panel = helpers.Panel;
  const Field = helpers.Field;
  const SaveButton = helpers.SaveButton;
  const clampNumber = helpers.clampNumber;
  const History = helpers.History;

  const t = state.t;
  const locale = state.locale;
  const secretStatus = state.secretStatus;
  const secretDraft = state.secretDraft;
  const backtestConfig = state.backtestConfig;
  const isSaving = state.isSaving;

  const setSecretDraft = handlers.setSecretDraft;
  const updateBacktestConfig = handlers.updateBacktestConfig;
  const saveBacktestSettings = handlers.saveBacktestSettings;

  return (
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
            <Field label={t.intervalMinutes}>
              <input
                type="number"
                min={5}
                max={43200}
                value={backtestConfig.intervalMinutes}
                onChange={(event) => updateBacktestConfig('intervalMinutes', clampNumber(event.target.value, 5, 43200))}
              />
            </Field>
            <Field label={t.reviewWindowDays}>
              <input
                type="number"
                min={1}
                max={3650}
                value={backtestConfig.reviewWindowDays}
                onChange={(event) => updateBacktestConfig('reviewWindowDays', clampNumber(event.target.value, 1, 3650))}
              />
            </Field>
            <Field label={t.maxReportsPerCycle}>
              <input
                type="number"
                min={1}
                max={500}
                value={backtestConfig.maxReportsPerCycle}
                onChange={(event) => updateBacktestConfig('maxReportsPerCycle', clampNumber(event.target.value, 1, 500))}
              />
            </Field>
            <Field label={t.priceDataSource}>
              <select value={backtestConfig.priceDataSource} onChange={(event) => updateBacktestConfig('priceDataSource', event.target.value as any)}>
                <option value="yfinance">yfinance</option>
                <option value="custom">custom</option>
              </select>
            </Field>
          </div>

          <div className={backtestConfig.priceDataSource === 'custom' ? 'custom-interface active' : 'custom-interface'}>
            <div className="endpoint-grid">
              <Field label={t.customBacktestApi}>
                <input
                  value={backtestConfig.customBaseUrl ?? ''}
                  onChange={(event) => updateBacktestConfig('customBaseUrl', event.target.value || null)}
                  placeholder="https://prices.example.com/api"
                />
              </Field>
              <Field label={t.customBacktestEndpoint}>
                <input
                  value={backtestConfig.customEndpoint}
                  onChange={(event) => updateBacktestConfig('customEndpoint', event.target.value)}
                  placeholder="/backtest/prices"
                />
              </Field>
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
                onChange={(event) => setSecretDraft((current: any) => ({ ...current, BACKTEST_DATA_API_KEY: event.target.value }))}
              />
            </label>
          </div>
          <p className="hint">
            {locale === 'zh'
              ? 'custom 复盘行情接口应返回 bars/data 数组，每项包含 date、open、high、low、close。已完成的复盘记录不会再次执行；等待数据或失败的记录会从检查点续跑。'
              : 'A custom review price API should return a bars/data array with date, open, high, low, close. Completed review records are not rerun; waiting-data or failed records resume from checkpoints.'}
          </p>
          <SaveButton onClick={saveBacktestSettings} loading={isSaving} className="full">
            {t.saveBacktestSettings}
          </SaveButton>
        </div>
      ) : (
        <span className="empty">-</span>
      )}
    </Panel>
  );
}

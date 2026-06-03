import type { ReactElement } from 'react';

export interface BillingPanelProps {
  state: any;
  handlers: any;
  helpers: any;
}

export function BillingPanel({ state, handlers, helpers }: BillingPanelProps): ReactElement {
  const Panel = helpers.Panel;
  const Field = helpers.Field;
  const SaveButton = helpers.SaveButton;
  const researchDepthLabel = helpers.researchDepthLabel;
  const CreditCard = helpers.CreditCard;

  const t = state.t;
  const locale = state.locale;
  const adminPricing = state.adminPricing;
  const modelPriceDraft = state.modelPriceDraft;
  const isSaving = state.isSaving;

  const updateAdminPricing = handlers.updateAdminPricing;
  const updateDepthPrice = handlers.updateDepthPrice;
  const setModelPriceDraft = handlers.setModelPriceDraft;
  const saveAdminPricing = handlers.saveAdminPricing;

  return (
    <Panel title={t.adminBilling} icon={<CreditCard size={17} />}>
      {adminPricing ? (
        <div className="billing-form">
          <div className="form-grid billing-grid">
            <Field label={t.billingMode}>
              <select value={adminPricing.billingMode} onChange={(event) => updateAdminPricing('billingMode', event.target.value as any)}>
                <option value="token">token</option>
                <option value="per_run">per_run</option>
                <option value="hybrid">hybrid</option>
              </select>
            </Field>
            <Field label={t.tokenMultiplier}>
              <input value={adminPricing.tokenMultiplier} onChange={(event) => updateAdminPricing('tokenMultiplier', event.target.value)} inputMode="decimal" />
            </Field>
            <Field label={`${t.inputTokens} / 1M`}>
              <input value={adminPricing.inputTokenPricePer1m} onChange={(event) => updateAdminPricing('inputTokenPricePer1m', event.target.value)} inputMode="decimal" />
            </Field>
            <Field label={`${t.outputTokens} / 1M`}>
              <input value={adminPricing.outputTokenPricePer1m} onChange={(event) => updateAdminPricing('outputTokenPricePer1m', event.target.value)} inputMode="decimal" />
            </Field>
            <Field label={t.fixedCharge}>
              <input value={adminPricing.fixedRunPrice} onChange={(event) => updateAdminPricing('fixedRunPrice', event.target.value)} inputMode="decimal" />
            </Field>
            <Field label={t.preauth}>
              <input value={adminPricing.preauthMultiplier} onChange={(event) => updateAdminPricing('preauthMultiplier', event.target.value)} inputMode="decimal" />
            </Field>
          </div>
          <div className="depth-price-grid">
            {(['1', '3', '5'] as const).map((depth) => (
              <section key={depth} className="depth-price-card">
                <strong>{researchDepthLabel(Number(depth), depth, locale)}</strong>
                <Field label={t.tokenMultiplier}>
                  <input value={adminPricing.depthMultipliers[depth] ?? '1'} onChange={(event) => updateDepthPrice('depthMultipliers', depth, event.target.value)} inputMode="decimal" />
                </Field>
                <Field label={t.fixedCharge}>
                  <input value={adminPricing.fixedPricesByDepth[depth] ?? '0'} onChange={(event) => updateDepthPrice('fixedPricesByDepth', depth, event.target.value)} inputMode="decimal" />
                </Field>
                <Field label={t.inputTokens}>
                  <input value={adminPricing.estimatedInputTokensByDepth[depth] ?? 0} onChange={(event) => updateDepthPrice('estimatedInputTokensByDepth', depth, event.target.value)} inputMode="numeric" />
                </Field>
                <Field label={t.outputTokens}>
                  <input value={adminPricing.estimatedOutputTokensByDepth[depth] ?? 0} onChange={(event) => updateDepthPrice('estimatedOutputTokensByDepth', depth, event.target.value)} inputMode="numeric" />
                </Field>
              </section>
            ))}
          </div>
          <Field label={t.modelOverrides}>
            <textarea
              value={modelPriceDraft}
              onChange={(event) => setModelPriceDraft(event.target.value)}
              spellCheck={false}
            />
          </Field>
          <SaveButton onClick={saveAdminPricing} loading={isSaving} className="full">
            {t.saveDefaults}
          </SaveButton>
        </div>
      ) : (
        <span className="empty">-</span>
      )}
    </Panel>
  );
}

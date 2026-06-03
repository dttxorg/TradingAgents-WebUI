import type { ReactElement } from 'react';

export interface DataVendorsPanelProps {
  state: any;
  handlers: any;
  helpers: any;
}

export function DataVendorsPanel({ state, handlers, helpers }: DataVendorsPanelProps): ReactElement {
  const Panel = helpers.Panel;
  const Field = helpers.Field;
  const dataVendorOptionLabel = helpers.dataVendorOptionLabel;
  const Database = helpers.Database;
  const ListOrdered = helpers.ListOrdered;

  const t = state.t;
  const locale = state.locale;
  const config = state.config;
  const metadata = state.metadata;
  const dataVendorLabels = state.dataVendorLabels;
  const customMethodLabels = state.customMethodLabels;

  const updateVendor = handlers.updateVendor;
  const updateToolVendor = handlers.updateToolVendor;

  return (
    <Panel title={t.dataVendors} icon={<Database size={17} />}>
      {metadata.dataVendorCategories.map((category: any) => (
        <Field key={category.key} label={dataVendorLabels[locale][category.key] ?? category.label}>
          <select value={config.dataVendors[category.key] ?? ''} onChange={(event) => updateVendor(category.key, event.target.value)}>
            {category.options.filter((option: string) => option !== 'custom').map((option: string) => (
              <option key={option} value={option}>
                {dataVendorOptionLabel(option, locale)}
              </option>
            ))}
          </select>
        </Field>
      ))}
      <div className="section-title">
        <ListOrdered size={16} />
        {t.methodOverrides}
      </div>
      <div className="method-vendor-list">
        {metadata.customDataMethods.map((method: any) => {
          const category = metadata.dataVendorCategories.find((item: any) => item.key === method.category);
          const categoryVendor = config.dataVendors[method.category] ?? '';
          return (
            <label key={method.method} className="field method-vendor-row">
              <span>
                {customMethodLabels[locale][method.method] ?? method.label}
                <small>{dataVendorLabels[locale][method.category] ?? category?.label ?? method.category}</small>
              </span>
              <select value={(config.toolVendors ?? {})[method.method] ?? ''} onChange={(event) => updateToolVendor(method.method, event.target.value)}>
                <option value="">{t.useCategoryDefault} ({dataVendorOptionLabel(categoryVendor, locale)})</option>
                {(category?.options ?? []).filter((option: string) => option !== 'custom').map((option: string) => (
                  <option key={option} value={option}>
                    {dataVendorOptionLabel(option, locale)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </Panel>
  );
}

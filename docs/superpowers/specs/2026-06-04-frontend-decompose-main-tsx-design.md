# Frontend Refactor: Decompose `main.tsx` and Extract Shared Components

**Date:** 2026-06-04
**Status:** Draft
**Author:** Claude (with user)
**Scope:** Round 1 of 3 (out of 25 known UI issues, see `.claude/audit-bugs.md`)

---

## Purpose

The TradingAgents WebUI's React frontend is a single 3892-line file
(`web/frontend/src/main.tsx`) containing the entire `App` component,
its sub-views, and three smaller components. This is unmaintainable:
any UI change requires grep across the whole file, the React DevTools
profiler shows a full-tree re-render on every state change, and the
file is too large for editors to handle smoothly.

The first round of refactoring is **purely structural** — split
`main.tsx` into focused files and extract the most-duplicated UI
patterns into shared components. No business logic changes, no user-
visible behaviour changes (pixels should look identical), no new
features. This sets the foundation for rounds 2 and 3 (state
management, routing, error handling, a11y, etc.).

The audit catalogue at `.claude/audit-bugs.md` documents 25 known UI
issues. This spec addresses the first three Critical ones:

- **A1.** `main.tsx` is 3892 lines
- **A2.** `WebConfig` form has 30+ fields split across 6 independent
  "Save" buttons
- **A3.** Field/Button/Chip patterns are duplicated 40+ times

Issues A2 and A3 are partially addressed in this round; the rest
remain on the backlog for later rounds.

## Scope

### In scope

1. Move the `messages` i18n dictionary out of `main.tsx` into a
   dedicated module.
2. Extract the following shared components and use them in `main.tsx`:
   - `<Field label hint error children>` (replaces 40+ label/input pairs)
   - `<Button variant loading icon children>` (replaces 13 save buttons)
   - `<Chip active onClick children>` (replaces 7 segmented buttons)
   - `<SaveButton loading icon children>` (sugar over `<Button>`)
   - `<Modal open onClose title children>` (defines the API; the
     focus-trap and backdrop-click behaviour is left for a later
     round, but the component is ready to receive them)
3. Split `App`'s body into view-level files:
   - `views/AuthScreen.tsx` — the login/bootstrap form
   - `views/WorkspaceView.tsx` — the run setup, agent timeline, and
     report side-rails
   - `views/SettingsView.tsx` — the 7-tab settings container
   - `views/settings/{Model,Market,Data,Routes,Backtest,Billing,Users}Panel.tsx`
     — one file per settings tab

### Out of scope (later rounds)

- Introducing `react-router` (Round 3)
- Replacing `useState` with `useReducer` (Round 2)
- Adding a Context for locale/auth/config (Round 2)
- `<ConfirmDialog>` for dangerous actions (Round 4)
- `<Toast>` for error stack (Round 4)
- `<Tooltip>` for disabled buttons (Round 6)
- Empty-state CTAs (Round 7)
- Virtualised lists (Round 5)
- a11y focus traps, aria improvements (Round 7)
- Design tokens / CSS Modules / Tailwind migration (Round 6)
- Replacing the hand-rolled i18n with `react-i18next` (Round 6)
- Visual changes to any layout, colour, spacing, or text

The shared components introduced here (Modal, Field) are designed
with stub props (`disabledReason`, `onBackdropClick`) so that later
rounds can add behaviour without breaking the call sites.

## Design

### Directory layout

```
web/frontend/src/
├── main.tsx                  ~30  line: entry, renders <App/>
├── api.ts                    unchanged
├── configMapping.ts          unchanged
├── types.ts                  unchanged
├── styles.css                unchanged
├── i18n/
│   ├── messages.ts           ~240 lines: messages.en, messages.zh dictionaries
│   └── useLocale.ts          ~40  lines: locale state + localStorage persist
├── components/
│   ├── Field.tsx             ~30  lines
│   ├── Button.tsx            ~50  lines (handles variants + loading)
│   ├── Chip.tsx              ~25  lines
│   ├── SaveButton.tsx        ~20  lines
│   └── Modal.tsx             ~40  lines
├── hooks/                    (created empty in this round; populating is later)
├── views/
│   ├── App.tsx               ~300 lines: shell, topbar, view-switch
│   ├── AuthScreen.tsx        ~100 lines
│   ├── WorkspaceView.tsx     ~600 lines
│   ├── SettingsView.tsx      ~250 lines: tab container + aside
│   └── settings/
│       ├── ModelPanel.tsx
│       ├── MarketPanel.tsx
│       ├── DataPanel.tsx
│       ├── RoutesPanel.tsx
│       ├── BacktestPanel.tsx
│       ├── BillingPanel.tsx
│       └── UsersPanel.tsx
```

Files that turn out to be obviously wrong (e.g. one panel file is
40 lines, another is 400) can be re-split during implementation. The
target above is a starting point, not a hard contract.

### i18n extraction

The `messages` dictionary currently lives at the top of `main.tsx`
(~lines 1–575) with hand-typed entries. Extract to
`web/frontend/src/i18n/messages.ts`:

```typescript
// i18n/messages.ts
export const messages = {
  en: { /* ... */ },
  zh: { /* ... */ },
} as const;

export type Locale = 'en' | 'zh';
export type Messages = (typeof messages)['en'];
```

The `useLocale` hook in `i18n/useLocale.ts` owns the `locale` state,
the localStorage persistence, and the `document.documentElement.lang`
sync. Currently this is mixed into `App`'s useState/useEffect block.

The translation function moves to the hook:

```typescript
export function useLocale(): {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Messages;
};
```

Call sites that did `const t = messages[locale]` become
`const { t, locale, setLocale } = useLocale();`.

### Shared components

#### `<Field>`

Replaces `<label className="field"><span>{label}</span><input .../></label>`.
The current pattern is 40+ duplications; centralising the wrapper
means a CSS or className change happens in one place.

```typescript
interface FieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldProps): JSX.Element;
```

The component is the wrapper. It does **not** know about `<input>`,
`<select>`, or `<textarea>`. The caller supplies the actual control
as `children`. This keeps the API tiny and avoids prop explosion
when the control needs a long list of attributes.

The wrapper renders exactly the same DOM as the current pattern:
`<label className="field"><span>{label}</span>{children}{hint?…}{error?…}</label>`.

#### `<Button>`

Replaces the 13 `<button className="primary|secondary" onClick={...}
disabled={isSaving}><Save/>{label}</button>` patterns.

```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}
```

The component renders:

```html
<button className={variant} disabled={disabled || loading} type={type} onClick={onClick}>
  {loading ? <Loader2 className="spin"/> : icon}
  {children}
</button>
```

#### `<SaveButton>`

Sugar that fixes the common shape of the 13 save buttons:

```typescript
interface SaveButtonProps {
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export function SaveButton(props: SaveButtonProps): JSX.Element {
  return <Button variant="primary" icon={<Save/>} {...props}>{props.children}</Button>;
}
```

#### `<Chip>`

Replaces 7 instances of `<button className={cond?'chip active':'chip'} onClick={...}>`.

```typescript
interface ChipProps {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}
```

Renders `<button className={active ? 'chip active' : 'chip'} ...>`.

#### `<Modal>`

Replaces 2 existing inline modals (the report reader overlay and the
confirm-run dialog). The component takes the overlay behaviour but
**defers** focus-trap and backdrop-click to a later round (props
already declare them so the call site doesn't need to change later).

```typescript
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  // Reserved for later rounds:
  // closeOnBackdropClick?: boolean;
  // initialFocusRef?: React.RefObject<HTMLElement>;
}
```

### View files

`views/App.tsx` owns:

- The topbar (title, view switch, locale switch, account pill,
  Run/Stop buttons)
- The active-view switch (`<WorkspaceView/>` or `<SettingsView/>`)
- The global error/notice alerts (kept inline for now)
- The 5-second polling for `/api/runs`
- The bootstrap + me + loadWorkspaceData sequence

`views/AuthScreen.tsx` is the `AuthScreen` component verbatim from
the current `main.tsx`. It receives the same props it does today.

`views/WorkspaceView.tsx` is the workspace view, including the
analysis setup form, agent timeline, and the right rail (history,
orders, event stream). It receives the existing prop bag.

`views/SettingsView.tsx` is the settings tab container, including
the 7 tab buttons and the aside. The 7 panels each live in their own
file. The container decides which panel to render based on
`settingsSection` and `currentUser.role`.

`views/settings/*Panel.tsx` files are essentially the current inline
panel bodies, lifted out with no other change.

### State and props

**No state is moved between components in this round.** All 52
`useState` calls and 7 `useEffect` calls stay in the `App` shell.
The view components are pure functions of props, just with their
JSX extracted to a separate file. This is intentional: the goal is
to make the file structure navigable, not to redesign state
management. Reducer + Context migration is Round 2.

The view files will be largish (~250–600 lines each) because they
contain the entire JSX of one view. That's acceptable for now;
extracting sub-components within a view is a follow-up.

## Failure modes

1. **Missing import / wrong relative path during the split.** Caught
   by `tsc -b` in `npm run build`. Build runs after every commit.

2. **Behaviour drift when extracting the components.** The component
   bodies are copied from the existing JSX byte-for-byte. A
   field/button/chip in the new component produces the same DOM
   and same classes as the inline pattern it replaces. If a CSS
   class is renamed in a way that the old style still depended on,
   the visual will change. We will hand-test the main screens
   before each commit.

3. **Closure-stale state in the view files.** The view functions
   capture `currentUser`, `config`, `setError`, etc. from the `App`
   shell's render. None of this changes in this round. We do not
   introduce new closures or new state.

4. **i18n key type-safety regression.** Currently `messages` is
   `as const` typed in `main.tsx`. Moving it to a new file should
   preserve the type, but a typo in a key becomes a silent
   `undefined` at runtime. The fix is to add a strict
   `Messages` type and use `noUncheckedIndexedAccess` if it's not
   already on. (We will check `tsconfig.json` first.)

5. **Workspace view file ballooning.** If `WorkspaceView.tsx`
   exceeds ~700 lines, we will re-split it during the round. The
   right rail (history, orders, events) is a natural sub-component
   boundary. The split happens as an extra commit on top of the
   seven planned ones; it does not block the round from finishing.

## Done-criteria checklist

Before declaring the round done, the following must be true. They
are evaluated as a single pass at the end of the last commit.

- [ ] `npm run build` exits 0
- [ ] `pytest tests/` reports 47 passed (no backend change)
- [ ] `wc -l web/frontend/src/main.tsx` is 1500 or fewer
- [ ] `ls web/frontend/src/components/` lists 5 files
- [ ] `ls web/frontend/src/views/` lists 4 files
- [ ] `ls web/frontend/src/views/settings/` lists 7 files
- [ ] `ls web/frontend/src/i18n/` lists 2 files
- [ ] Manual smoke test walks all 6 paths listed in *Validation*
      without visual regression

## Validation

This round has no automated frontend tests. Validation is:

- `npm run build` (runs `tsc -b` then `vite build`) must succeed
  on every commit. `tsc` is the strict type checker and will flag
  missing references, wrong types, and any closure that captures
  something no longer in scope.
- The existing 47 Python tests (`pytest tests/`) must still pass
  unchanged. This refactor does not touch the backend.
- Manual visual smoke test before each commit: open the dev server,
  walk through the following paths, and confirm pixels match the
  pre-refactor screenshots.
  - `/` (auth or workspace, depending on whether a user is logged in)
  - Workspace view: change ticker, save config, kick off a run,
    see the SSE event stream light up
  - Settings view: visit each of the 7 tabs, toggle a field, save
  - Admin paths: open `/api/admin/users`, create a user, recharge
  - Open a report history entry, close the modal
  - Submit a run, cancel it, see the frozen balance refund
- After the round, the total line count of `main.tsx` must drop
  by at least 60%. Target: 3892 → ≤ 1500.

## Open questions for the user

1. Should the `<Modal>` component implement the backdrop-click and
   focus-trap in this round, or wait for the dedicated a11y round?
   **My recommendation: wait.** The component is plumbed and
   callers are unchanged; a later round can add behaviour without
   touching call sites.
2. Are the seven `*Panel.tsx` files the right granularity, or do
   some panels pair so closely that they belong in one file (e.g.
   Model + Routes, which are both LLM-provider-related)? **My
   recommendation: keep them separate.** Pairing now creates
   coupled state and makes them harder to refactor in isolation
   later.
3. Should `main.tsx` keep a re-export of the old structure so other
   tooling (CI scripts, the docker image, etc.) doesn't break, or
   can we delete the old top-level exports? **My recommendation:
   delete them.** The only consumer is `index.html`'s
   `<script type="module" src="/src/main.tsx">`, which keeps
   working because the entry still re-exports the same render
   function.

## Migration plan

The round is one PR. Within the PR, the commits are sequenced so
that each commit compiles and is independently testable:

1. **`refactor(i18n): extract messages dictionary to i18n/messages.ts`**
   Moves the dictionary, no call site changes. `npm run build`
   passes.
2. **`refactor(components): add <Field> and <Button> with no
   consumers`**
   Adds the two components, no call site changes. `npm run build`
   passes (no consumption = no breakage).
3. **`refactor: replace 5 most-duplicated label/input pairs with
   <Field>`**
   First real call site change. `npm run build` + manual smoke.
4. **`refactor: replace save buttons with <SaveButton>`**
   13 sites. `npm run build` + manual smoke.
5. **`refactor: replace chip buttons with <Chip>`**
   7 sites. `npm run build` + manual smoke.
6. **`refactor(views): split AuthScreen and WorkspaceView out of
   main.tsx`**
   2 new files, `main.tsx` re-exports them. `npm run build` +
   manual smoke.
7. **`refactor(views): split SettingsView and 7 panel files out
   of main.tsx`**
   8 new files, `main.tsx` re-exports. `npm run build` + manual
   smoke.

If any commit in the middle breaks the build or the visual, we
stop and re-plan the offending commit. We do not pile up broken
intermediate states.

## Why this design and not the alternatives

- **Big-bang refactor (one mega-commit).** Rejected because the
  5-day migration makes the diff un-reviewable and the blast
  radius of any mistake is the whole UI at once. The round is
  long enough as-is; one commit per phase keeps the change rate
  reviewable.
- **Only split the file, no component extraction.** Tempting
  because it's the smallest possible move, but it doesn't fix
  A3 (duplication). A future round would then have to re-touch
  the new files to extract components. Better to do both now
  while the surface area is small.
- **Add `react-router` in this round.** Out of scope. Routing
  requires URL → state plumbing in `App`, which is bigger than
  just splitting. Round 3.
- **Replace `useState` with `useReducer` in this round.** Out of
  scope. The 52 useState calls are stable for splitting; reducer
  rewrite is Round 2.
- **Migrate to CSS Modules or Tailwind in this round.** Out of
  scope. The CSS stays untouched; the components inherit the
  existing className pattern. Design tokens are Round 6.

## Audit cross-references

| Audit ID | Issue | Resolved by |
|----------|-------|-------------|
| A1 | 3892-line main.tsx | This round (commits 6 + 7) |
| A3 | 40+ duplicated label/input pairs | This round (commit 3) |
| A3 | 13 duplicated save buttons | This round (commit 4) |
| A3 | 7 duplicated chip buttons | This round (commit 5) |
| A2 | 6 independent "Save" buttons in settings | Not in this round; needs single-form-single-save design first. Round 2. |
| A6 | state-based routing | Round 3 |
| H1 | refresh drops state | Round 3 |
| H2 | dangerous ops without confirm | Round 4 |
| H3 | single alert overwritten by next error | Round 4 |
| H4 | topbar 7 elements | Round 5 |
| H5 | no virtualised lists | Round 5 |
| H6 | settings 7 tabs visible to sub-account | Round 3 |
| H7 | no focus trap, no backdrop click | Round 7 |
| H8 | 401 not auto-signed-out | Round 4 |
| H9 | no localStorage backup | Round 3 |
| A4 | useEffect cleanup | Round 2 |
| A5 | error handling scattered | Round 4 |
| A7 | hand-rolled i18n | Round 6 |
| B1 | responsive design | Round 5 |
| B2 | no design tokens | Round 6 |
| B3 | topbar crowded | Round 5 |
| B4 | no virtualised lists | Round 5 |
| B5 | SSE re-render storm | Round 5 |
| B6 | modal a11y | Round 7 |
| C1 | loading state inconsistent | Round 4 |
| C2 | single alert error | Round 4 |
| C3 | empty state no CTA | Round 7 |
| C4 | dangerous ops no confirm | Round 4 |
| C5 | no focus ring | Round 7 |
| C6 | disabled no tooltip | Round 6 |
| C7 | form UX, no reset | Round 4 |
| C8 | batch no progress bar | Round 4 |
| D1 | flat nav | Round 3 |
| D2 | views mixed | This round (commit 7) |
| D3 | 30+ fields in one form | Round 2 |
| D4 | role visibility | Round 3 |

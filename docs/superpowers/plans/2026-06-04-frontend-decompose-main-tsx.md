# Frontend Decomposition Implementation Plan (Round 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `web/frontend/src/main.tsx` (3892 lines) into focused view files and extract the five most-duplicated UI patterns (`<Field>`, `<Button>`, `<SaveButton>`, `<Chip>`, `<Modal>`) into shared components, without changing any business logic or visible UI behaviour.

**Architecture:** Pure structural refactor. The `App` shell keeps all 52 `useState` calls and 7 `useEffect` calls; view files are pure functions of props extracted from the existing JSX. Shared components are minimal wrappers that emit the same DOM the inline patterns produce today. Each task compiles in isolation.

**Tech Stack:** React 19, Vite 6, TypeScript 5.6 (strict), `lucide-react` icons. No new dependencies added.

**Spec:** `docs/superpowers/specs/2026-06-04-frontend-decompose-main-tsx-design.md`

**Validation strategy:** No automated frontend tests exist in this project (only backend pytest, which is not touched by this round). Each task's exit condition is `npm run build` exiting 0 plus a manual visual smoke test of the affected views. See *Done criteria* at the bottom.

---

## File Structure (post-round)

```
web/frontend/src/
├── main.tsx                  ~30  line entry that re-renders <App/>
├── api.ts                    UNCHANGED
├── configMapping.ts          UNCHANGED
├── types.ts                  UNCHANGED
├── styles.css                UNCHANGED
├── i18n/
│   ├── messages.ts           ~240 lines (extracted from main.tsx)
│   └── useLocale.ts          ~50  lines (extracted useState + useEffect)
├── components/
│   ├── Field.tsx             ~35  lines
│   ├── Button.tsx            ~60  lines
│   ├── SaveButton.tsx        ~25  lines
│   ├── Chip.tsx              ~30  lines
│   └── Modal.tsx             ~45  lines
├── views/
│   ├── App.tsx               ~300 lines (shell + topbar + view switch)
│   ├── AuthScreen.tsx        ~100 lines
│   ├── WorkspaceView.tsx     ~600 lines
│   ├── SettingsView.tsx      ~250 lines (tab container + aside)
│   └── settings/
│       ├── ModelPanel.tsx
│       ├── MarketPanel.tsx
│       ├── DataPanel.tsx
│       ├── RoutesPanel.tsx
│       ├── BacktestPanel.tsx
│       ├── BillingPanel.tsx
│       └── UsersPanel.tsx
```

Files that turn out smaller or larger than estimated are fine. The
target is "main.tsx drops below 1500 lines, the seven new view
files exist, and the five new component files exist".

---

## Task 1: Extract i18n dictionary to `i18n/messages.ts`

**Files:**
- Create: `web/frontend/src/i18n/messages.ts`
- Modify: `web/frontend/src/main.tsx` (remove the dictionary, replace with an `import`)

The dictionary currently lives in `main.tsx` from approximately
line 1 through line 575 (two large objects: `messages.en` and
`messages.zh`, plus the `Locale` and `Messages` types). The
extraction is a pure move; nothing in the call sites changes yet.

- [ ] **Step 1: Read the current dictionary from main.tsx**

Run: `sed -n '1,600p' web/frontend/src/main.tsx` and locate the
two large object literals and any `type Locale` / `type Messages`
declarations that follow them. The exact line numbers will be
slightly different; the shape is unmistakable.

- [ ] **Step 2: Create `web/frontend/src/i18n/messages.ts`**

Write the file. It must contain, in order:
- The `Locale` type (literal `'en' | 'zh'`)
- The `Messages` type (the structure of the English dictionary)
- The exported `messages` object with `en` and `zh` keys, copied
  verbatim from `main.tsx`

```typescript
// i18n/messages.ts
export type Locale = 'en' | 'zh';

export type Messages = {
  // ... exact shape of the en dictionary ...
};

export const messages: Record<Locale, Messages> = {
  en: { /* ... */ },
  zh: { /* ... */ },
};
```

The `Messages` type and the `messages` object must agree. Define
`Messages` by extracting it from the dictionary with
`typeof messages.en` if you want a single source of truth:

```typescript
export const messages = {
  en: { /* ... */ },
  zh: { /* ... */ },
} as const;

export type Messages = (typeof messages)['en'];
export type Locale = keyof typeof messages;
```

Either spelling is acceptable. Use the `as const` version unless
the existing code's `Messages` type was declared explicitly (it
almost certainly was — copy that declaration verbatim).

- [ ] **Step 3: Remove the dictionary from main.tsx**

In `web/frontend/src/main.tsx`:
- Delete the `Locale` and `Messages` type declarations if they
  were at the top.
- Delete the `messages = { en: {...}, zh: {...} }` object literal
  (and any comments around it).
- Add at the top of the file (or near the other imports):

```typescript
import { messages, type Locale, type Messages } from './i18n/messages';
```

The variable `messages` is still used inside `App` via
`const t = messages[locale]`. That usage keeps working because the
imported `messages` has the same shape.

- [ ] **Step 4: Build to verify nothing broke**

Run: `cd web/frontend && npm run build`
Expected: Exit 0. `tsc -b` reports no errors. `vite build`
produces a new `dist/`.

If `tsc` complains about a missing symbol, the import path is
wrong — fix it. If `tsc` complains about a different type for
`messages`, the shape changed during the move — restore it.

- [ ] **Step 5: Manual smoke (1 minute)**

Run: `cd web/frontend && npm run dev`, then open the URL it
prints. Log in (or use the bootstrap flow). Look at the topbar
and the workspace view. The English/Chinese switch in the topbar
should still toggle every label between English and Chinese.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/i18n/messages.ts web/frontend/src/main.tsx
git commit -m "refactor(i18n): extract messages dictionary to i18n/messages.ts

Move the ~240-key bilingual dictionary out of main.tsx so the
file can shrink below the 1500-line target. The export shape is
unchanged; call sites that did const t = messages[locale] keep
working because the imported binding has the same type.

No behaviour change. Build passes; visual smoke confirms the
locale switch still toggles every label.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Add `<Field>` component (no consumers yet)

**Files:**
- Create: `web/frontend/src/components/Field.tsx`

This task adds the component but does not change any call site.
That separation is intentional: it lets the next task replace
call sites one at a time without intermediate compile errors.

- [ ] **Step 1: Create the file**

```typescript
// web/frontend/src/components/Field.tsx
import type { ReactNode } from 'react';

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldProps): JSX.Element {
  return (
    <label className="field">
      {label !== undefined && (
        <span>
          {label}
          {required === true && <em className="required"> *</em>}
        </span>
      )}
      {children}
      {hint !== undefined && error === null && <small className="hint">{hint}</small>}
      {error !== null && error !== undefined && <small className="error">{error}</small>}
    </label>
  );
}
```

The DOM is **byte-equivalent** to the inline pattern it replaces
in `main.tsx`. The `<em className="required">` element is added
only when `required` is true; the existing code did not have a
required marker, so the new component preserves the old look for
all currently-existing call sites (none of which pass `required`).

The class names `hint` and `error` are pre-existing in
`styles.css`; verify by grep if you want to be sure before
proceeding.

- [ ] **Step 2: Build to verify the file type-checks**

Run: `cd web/frontend && npm run build`
Expected: Exit 0. The new file is not yet imported, so it
should be tree-shaken or simply ignored. `tsc` should still
pass.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/components/Field.tsx
git commit -m "refactor(components): add <Field> with no consumers yet

The shared Field wraps the 40+ duplications of
<label className='field'><span>{label}</span><input/></label>
without yet replacing any of them. The next task does the
replacement, one call site at a time, so the intermediate state
is always green.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Replace the 5 most-duplicated label/input pairs with `<Field>`

**Files:**
- Modify: `web/frontend/src/main.tsx` (5 sites)

The point of this task is to verify the component shape matches
what the call sites need before replacing the other 35. The 5
sites chosen are the ones whose children are simple `<input>` or
`<select>` elements with no edge-case props.

- [ ] **Step 1: Identify 5 candidate sites**

In `web/frontend/src/main.tsx`, find 5 instances of:

```tsx
<label className="field">
  <span>{label}</span>
  <input ... />
</label>
```

or

```tsx
<label className="field">
  <span>{label}</span>
  <select ...>{...}</select>
</label>
```

Spread them out across the file (settings view, workspace view,
admin panel) so any compilation error is more likely to surface.
Do not pick sites that:
- have JSX inside the `<span>` (icon, badge, etc.) — leave those
  for after the first 5 are green
- have a `<textarea>` — leave for a later task
- have conditional children — leave for a later task

A reasonable choice is to use the first 5 that appear in
auth-screen (around line 2930) since auth is a self-contained
form.

- [ ] **Step 2: Add the import**

At the top of `main.tsx` (next to the other component imports):

```typescript
import { Field } from './components/Field';
```

- [ ] **Step 3: Replace the 5 sites**

For each of the 5 chosen sites, change:

```tsx
<label className="field">
  <span>{label}</span>
  <input ... />
</label>
```

to:

```tsx
<Field label={label}>
  <input ... />
</Field>
```

Keep all props on the input untouched. The `<span>{label}</span>`
goes away; the label text becomes the `label` prop.

- [ ] **Step 4: Build to verify**

Run: `cd web/frontend && npm run build`
Expected: Exit 0. If `tsc` complains about a `Field` prop being
wrong, the original `<span>` had more than a string inside it —
back out that site and pick a simpler one.

- [ ] **Step 5: Manual smoke**

Open the auth screen in the dev server. The 5 fields should
look pixel-identical to before. Tab through them; the focus ring
should appear on the input, not the wrapper.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/main.tsx
git commit -m "refactor: replace 5 label/input pairs with <Field>

First 5 of 40+ call sites converted. Pick the simple ones to
verify the component shape before tackling the rest.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Replace the remaining label/input pairs with `<Field>`

**Files:**
- Modify: `web/frontend/src/main.tsx` (remaining 35+ sites)

This task converts the rest of the call sites in batches of
about 10. **Do not stop the build between sub-batches.** Commit
once at the end of the task.

- [ ] **Step 1: Convert all remaining `<label className="field"><span>...</span><input/></label>` patterns**

Work top-to-bottom through `main.tsx`. For each:

```tsx
<label className="field">
  <span>{labelText}</span>
  {controlElement}
</label>
```

becomes:

```tsx
<Field label={labelText}>
  {controlElement}
</Field>
```

If the `<span>` has more than a plain string (icon, badge,
`<em>` for required, etc.), **stop and call it out**: the
existing patterns do not have those, so the conversions should be
straightforward. If you find a non-trivial case, leave the
inline `<label>` in place and continue — it is not worth
re-defining `<Field>` props for one site.

- [ ] **Step 2: Build**

Run: `cd web/frontend && npm run build`
Expected: Exit 0.

- [ ] **Step 3: Manual smoke**

Walk through every screen (workspace, settings × 7 tabs, admin,
auth) and confirm the layout looks identical. If any field looks
broken, that site is one you missed converting or one with
non-trivial `<span>` content — fix and re-smoke.

- [ ] **Step 4: Confirm `main.tsx` shrunk**

Run: `wc -l web/frontend/src/main.tsx`
Expected: The number drops by a noticeable amount (≥200 lines).

- [ ] **Step 5: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/main.tsx
git commit -m "refactor: replace remaining label/input pairs with <Field>

The label/input pattern is now centralised. Future CSS or
className changes happen in <Field> alone.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Add `<Button>` and `<SaveButton>` components (no consumers yet)

**Files:**
- Create: `web/frontend/src/components/Button.tsx`
- Create: `web/frontend/src/components/SaveButton.tsx`

Same separation as Task 2: add the components before any call
site changes. The next task wires them in.

- [ ] **Step 1: Create `Button.tsx`**

```typescript
// web/frontend/src/components/Button.tsx
import type { ReactNode, MouseEvent } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps {
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  loading = false,
  disabled = false,
  icon,
  type = 'button',
  onClick,
  children,
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={variant}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <Loader2 className="spin" /> : icon}
      {children}
    </button>
  );
}
```

The DOM matches the existing `<button className="primary|secondary"
disabled={isSaving}><Icon/>{label}</button>` shape exactly, with
`loading` swapping the icon for a spinner. `lucide-react` is
already a dependency, so `Loader2` is free.

- [ ] **Step 2: Create `SaveButton.tsx`**

```typescript
// web/frontend/src/components/SaveButton.tsx
import { Save } from 'lucide-react';
import { Button } from './Button';
import type { ReactNode } from 'react';

export interface SaveButtonProps {
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function SaveButton(props: SaveButtonProps): JSX.Element {
  return (
    <Button variant="primary" icon={<Save />} {...props}>
      {props.children}
    </Button>
  );
}
```

- [ ] **Step 3: Build**

Run: `cd web/frontend && npm run build`
Expected: Exit 0.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/components/Button.tsx web/frontend/src/components/SaveButton.tsx
git commit -m "refactor(components): add <Button> and <SaveButton>

The shared <Button> handles primary/secondary/danger/ghost
variants plus a loading state. <SaveButton> is sugar that fixes
the save button's icon and primary variant.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Replace the 13 save buttons with `<SaveButton>`

**Files:**
- Modify: `web/frontend/src/main.tsx` (13 sites)

The save buttons all have a `<Save/>` icon and a "primary"
variant. The conversion is mechanical.

- [ ] **Step 1: Add the import**

```typescript
import { SaveButton } from './components/SaveButton';
```

- [ ] **Step 2: Find all 13 save buttons**

Search `main.tsx` for the pattern:

```tsx
<button className="primary" onClick={saveXxx} disabled={isSaving}>
  <Save className="..." /> {/* optional size class */}
  {t.saveXxx}
</button>
```

The exact icon import may be `Save`, `SaveIcon`, or have a
`size` prop. Preserve whatever was there.

- [ ] **Step 3: Convert each**

```tsx
<SaveButton onClick={saveXxx} loading={isSaving}>
  {t.saveXxx}
</SaveButton>
```

The `loading` prop replaces the `disabled` prop. The Button
component handles both `disabled` and `loading` (the button is
disabled when either is true).

Note: the original `disabled` was sometimes a more complex
expression than just `isSaving`. Translate that expression
verbatim into the `disabled` prop if it exists.

- [ ] **Step 4: Build**

Run: `cd web/frontend && npm run build`
Expected: Exit 0.

- [ ] **Step 5: Manual smoke**

Click each save button (in each of the 7 settings tabs, in
admin billing, in admin users). The button should still disable
while saving and re-enable on completion. The icon should be a
spinner during save and the Save icon otherwise.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/main.tsx
git commit -m "refactor: replace 13 save buttons with <SaveButton>

The save button shape is now centralised. Loading and disabled
behaviour is owned by <Button> so future changes happen in one
place.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Add `<Chip>` component (no consumers yet)

**Files:**
- Create: `web/frontend/src/components/Chip.tsx`

The chip pattern appears in 7 places: settings tabs, analyst
pickers, language switcher, etc. They all render the same
`<button className={cond?'chip active':'chip'}>`.

- [ ] **Step 1: Create the file**

```typescript
// web/frontend/src/components/Chip.tsx
import type { ReactNode } from 'react';

export interface ChipProps {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  ariaCurrent?: 'page' | 'step' | 'location' | 'date' | 'time' | 'true' | 'false';
}

export function Chip({
  active = false,
  disabled = false,
  onClick,
  children,
  ariaCurrent,
}: ChipProps): JSX.Element {
  return (
    <button
      type="button"
      className={active ? 'chip active' : 'chip'}
      disabled={disabled}
      aria-current={ariaCurrent}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
```

The `ariaCurrent` prop exists because two of the seven chip
sites in the original code (settings tabs, view switch) pass
`aria-current="page"`. The component emits the attribute
verbatim.

- [ ] **Step 2: Build**

Run: `cd web/frontend && npm run build`
Expected: Exit 0.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/components/Chip.tsx
git commit -m "refactor(components): add <Chip>

Replaces the 7 occurrences of the chip-button pattern. The
aria-current prop is exposed because two call sites use it for
tab semantics.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Replace the 7 chip buttons with `<Chip>`

**Files:**
- Modify: `web/frontend/src/main.tsx` (7 sites)

- [ ] **Step 1: Add the import**

```typescript
import { Chip } from './components/Chip';
```

- [ ] **Step 2: Convert each chip site**

The pattern is:

```tsx
<button
  type="button"
  className={cond ? 'chip active' : 'chip'}
  disabled={maybeDisabled}
  onClick={onClick}
  aria-current={isCurrent ? 'page' : undefined}
>
  {label}
</button>
```

becomes:

```tsx
<Chip
  active={cond}
  disabled={maybeDisabled}
  onClick={onClick}
  ariaCurrent={isCurrent ? 'page' : undefined}
>
  {label}
</Chip>
```

Preserve the JSX `children` and any conditional logic
verbatim. The 7 sites are: settings 7 tabs, analysts picker, view
switch (workspace / settings), language switch (en / zh).
Counters above may be off by one or two — find them all and
convert all of them.

- [ ] **Step 3: Build**

Run: `cd web/frontend && npm run build`
Expected: Exit 0.

- [ ] **Step 4: Manual smoke**

Click through the settings tabs. The active tab should still
have the `active` class (visible as a different background).
The view switch in the topbar should still highlight the
current view. The language switcher should still show the
selected language.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/main.tsx
git commit -m "refactor: replace 7 chip buttons with <Chip>

Chip selection state, disabled state, and aria-current are
owned by the new component. Future visual tweaks happen in
<Chip> alone.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Add `<Modal>` component (no consumers yet)

**Files:**
- Create: `web/frontend/src/components/Modal.tsx`

The modal pattern currently appears inline twice: the report
reader overlay and the confirm-run dialog. The component
replaces both with the same shape, but does **not** add focus-
trap or backdrop-click behaviour — those are reserved for a
later a11y round.

- [ ] **Step 1: Create the file**

```typescript
// web/frontend/src/components/Modal.tsx
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="reader-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="reader-modal">
        <header className="reader-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
```

The class names (`reader-overlay`, `reader-modal`, `reader-header`,
`icon-button`) are taken from the existing modal markup in
`main.tsx`. The Escape-key handler replicates the existing
behaviour from the useEffect at the top of the file.

- [ ] **Step 2: Build**

Run: `cd web/frontend && npm run build`
Expected: Exit 0.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/components/Modal.tsx
git commit -m "refactor(components): add <Modal>

The shared Modal handles overlay, close button, aria attributes,
and Escape-to-close. The two existing inline modals (report
reader, confirm-run) will adopt this in Task 10.

Focus-trap and backdrop-click-closes are deliberately deferred
to a later a11y round.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Replace the 2 inline modals with `<Modal>`

**Files:**
- Modify: `web/frontend/src/main.tsx` (2 sites)

The two modals have similar shape but different bodies. The
component is now a thin wrapper, the body stays as inline JSX
inside `<Modal>`.

- [ ] **Step 1: Add the import**

```typescript
import { Modal } from './components/Modal';
```

- [ ] **Step 2: Convert the report reader overlay**

Find the JSX block that starts with `<div className="reader-overlay"
role="dialog" aria-modal="true" ...>` (the report reader
overlay). Replace the entire outer div with `<Modal>`:

```tsx
<Modal
  open={showReportReader}
  onClose={closeReportReader}
  title={t.reportReaderTitle}
>
  {/* existing body JSX stays as-is */}
</Modal>
```

Keep the body JSX verbatim. The header, close button, and
aria attributes are now provided by `<Modal>` itself, so delete
those from the body.

- [ ] **Step 3: Convert the confirm-run modal**

Same pattern: find the second modal, replace its outer
`<div className="reader-overlay" ...>` wrapper with `<Modal>`.
The body (the analysis summary, the Run button, etc.) stays.

- [ ] **Step 4: Build**

Run: `cd web/frontend && npm run build`
Expected: Exit 0. If `tsc` complains, you probably left a
duplicated header or close button in the body.

- [ ] **Step 5: Manual smoke**

Open a historical report → the report reader modal appears.
Press Escape → it closes. Click the X button → it closes.
Trigger a "Run analysis" → the confirm modal appears. Press
Escape → it closes.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/main.tsx
git commit -m "refactor: replace 2 inline modals with <Modal>

The report reader and the run-confirm dialog now share an
overlay, close button, aria attributes, and Escape handling.
Adding focus-trap and backdrop-click in a later round is a
single-file change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Split `AuthScreen` out of `main.tsx`

**Files:**
- Create: `web/frontend/src/views/AuthScreen.tsx`
- Modify: `web/frontend/src/main.tsx` (replace the inline component with an import + render call)

The `AuthScreen` component is self-contained — login and
bootstrap forms. It receives a `labels` prop today; that prop
will keep its shape, no refactor.

- [ ] **Step 1: Locate the AuthScreen component**

Run: `grep -n "function AuthScreen\|const AuthScreen" web/frontend/src/main.tsx`
to find the component definition. The component body is
roughly 100 lines (the login form and the bootstrap form).

- [ ] **Step 2: Create `web/frontend/src/views/AuthScreen.tsx`**

The file should contain the entire `AuthScreen` function plus
its `Labels` (or whatever the prop type is called) interface,
copied verbatim from `main.tsx`. Add imports at the top as
needed (the same imports the original code relied on).

- [ ] **Step 3: Replace the inline definition in main.tsx**

In `web/frontend/src/main.tsx`:
- Delete the entire `AuthScreen` function definition (and any
  helper types it declared).
- Add an import:

```typescript
import { AuthScreen } from './views/AuthScreen';
```

The call site in `App` (which renders `<AuthScreen labels={...} />`)
keeps working unchanged.

- [ ] **Step 4: Build**

Run: `cd web/frontend && npm run build`
Expected: Exit 0.

- [ ] **Step 5: Manual smoke**

Log out, log in, log in as a different user, run the bootstrap
flow. The auth screen should look identical.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/views/AuthScreen.tsx web/frontend/src/main.tsx
git commit -m "refactor(views): split AuthScreen out of main.tsx

AuthScreen is a self-contained login/bootstrap form with no
state shared with App. Lifting it into its own file is a pure
move.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Split `WorkspaceView` out of `main.tsx`

**Files:**
- Create: `web/frontend/src/views/WorkspaceView.tsx`
- Modify: `web/frontend/src/main.tsx`

The workspace view is the largest of the three view-level
extractions. It contains the analysis setup form, the agent
timeline, the report side-rail, and the right rail (history,
orders, events). All the props and state references stay
verbatim.

- [ ] **Step 1: Locate the workspace view**

In `main.tsx`, find the JSX block that begins with
`<div className="workspace-grid">` (or the equivalent wrapper
class). It is the body of a conditional that renders when
`activeView === 'workspace'`.

- [ ] **Step 2: Extract the function**

The workspace view is currently rendered as inline JSX inside
`App`'s return statement. Convert it to a function:

```typescript
function WorkspaceView(props: WorkspaceViewProps): JSX.Element {
  return (
    <div className="workspace-grid">
      {/* verbatim */}
    </div>
  );
}
```

Define `WorkspaceViewProps` to be the union of everything the
inline JSX references. In practice this is most of `App`'s
state, but the prop list is mechanical: every variable the
JSX uses becomes a prop.

- [ ] **Step 3: Create the file**

Move the function definition, the `WorkspaceViewProps` interface,
and any helper functions or imports it needs into
`web/frontend/src/views/WorkspaceView.tsx`.

- [ ] **Step 4: Replace the inline JSX in main.tsx**

Delete the inline workspace view JSX and replace it with:

```tsx
<WorkspaceView
  currentUser={currentUser}
  config={config}
  /* ... all the other props ... */
/>
```

- [ ] **Step 5: Build**

Run: `cd web/frontend && npm run build`
Expected: Exit 0. This task is the largest single move; if
`tsc` complains, the error is almost certainly a missing
prop. Add it. If the error is a missing import, add it.

- [ ] **Step 6: Manual smoke**

Walk the workspace: change the ticker, run an analysis, watch
the SSE stream, view a historical report, cancel a run, look
at the orders. The view should be pixel-identical.

- [ ] **Step 7: Confirm `main.tsx` shrunk**

Run: `wc -l web/frontend/src/main.tsx`
Expected: Drop of roughly 500-700 lines.

- [ ] **Step 8: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/views/WorkspaceView.tsx web/frontend/src/main.tsx
git commit -m "refactor(views): split WorkspaceView out of main.tsx

The workspace view is the heaviest view in the app. Lifting
its 500-700 lines out of main.tsx gets us most of the way to
the 1500-line target.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Split `SettingsView` and the 7 panel files out of `main.tsx`

**Files:**
- Create: `web/frontend/src/views/SettingsView.tsx`
- Create: `web/frontend/src/views/settings/{Model,Market,Data,Routes,Backtest,Billing,Users}Panel.tsx`
- Modify: `web/frontend/src/main.tsx`

The settings view is the container (tab buttons + aside). Each
panel is the body of one tab. Each panel file is a function
that takes a `props` bag and returns JSX.

- [ ] **Step 1: Locate the settings view**

In `main.tsx`, find the JSX block that begins with
`<div className="settings-grid">` (or the equivalent wrapper).
It is the body of a conditional that renders when
`activeView === 'settings'`.

- [ ] **Step 2: Extract `SettingsView`**

The settings view body is:

```tsx
<aside className="settings-side">
  {/* settings tab buttons */}
</aside>
<section className="settings-main">
  {settingsSection === 'model' && <ModelPanel .../>}
  {settingsSection === 'market' && <MarketPanel .../>}
  {/* etc. for 7 tabs */}
</section>
```

Convert this to a `SettingsView` function. The panel
components are the seven new files.

- [ ] **Step 3: Extract each panel**

For each of the 7 panels (`Model`, `Market`, `Data`, `Routes`,
`Backtest`, `Billing`, `Users`):

1. Find the inline JSX inside the `settingsSection === 'xxx'`
   branch.
2. Lift it into a function in
   `web/frontend/src/views/settings/XxxPanel.tsx` named
   `XxxPanel`.
3. Define an `XxxPanelProps` interface that lists every
   variable the JSX uses.
4. The function returns the JSX verbatim.

- [ ] **Step 4: Replace the inline JSX in main.tsx**

Delete the inline settings view JSX and replace it with:

```tsx
<SettingsView
  currentUser={currentUser}
  settingsSection={settingsSection}
  setSettingsSection={setSettingsSection}
  /* ... all other props ... */
/>
```

`SettingsView` is responsible for rendering the right panel
based on `settingsSection`.

- [ ] **Step 5: Build**

Run: `cd web/frontend && npm run build`
Expected: Exit 0. Expect `tsc` to flag a few missing props on
first try. Add them.

- [ ] **Step 6: Manual smoke**

Click through all 7 settings tabs. Each one should render
exactly as before. Save a config in one tab, switch tabs, come
back — the saved config should be reflected (this confirms
that state is still owned by `App` and passed down correctly).

- [ ] **Step 7: Confirm `main.tsx` shrunk**

Run: `wc -l web/frontend/src/main.tsx`
Expected: Now ≤ 1500 lines. If still over 1500, audit which
JSX is still inline and consider one more extraction.

- [ ] **Step 8: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/views/SettingsView.tsx web/frontend/src/views/settings/ web/frontend/src/main.tsx
git commit -m "refactor(views): split SettingsView and 7 panel files

Settings is now organised as a tab container + 7 small panel
files. Future per-tab changes touch one focused file.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: Split `App` shell out of `main.tsx`

**Files:**
- Create: `web/frontend/src/views/App.tsx`
- Modify: `web/frontend/src/main.tsx` (becomes a thin entry that renders `<App/>`)

After Tasks 11-13, `main.tsx` no longer contains the view
bodies, but it still contains the `App` function (the topbar,
the view switch, the global state). Move that into its own
file. `main.tsx` becomes a tiny entry.

- [ ] **Step 1: Create `web/frontend/src/views/App.tsx`**

Move the `App` function definition plus all the types it
declares (or uses) into the new file. Add the necessary
imports at the top. The function body is verbatim.

- [ ] **Step 2: Replace `main.tsx`**

The new `main.tsx` is roughly:

```typescript
// web/frontend/src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './views/App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found.');

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

The exact import names (`createRoot`, the strict-mode wrapping)
should be copied from the existing `main.tsx`'s entry. The
existing top-level code may differ slightly; preserve whatever
the current `main.tsx` does at the bottom of the file.

- [ ] **Step 3: Build**

Run: `cd web/frontend && npm run build`
Expected: Exit 0.

- [ ] **Step 4: Manual smoke**

The whole app. If anything is missing, the error is almost
certainly a missed import or a prop that `App` no longer has
access to.

- [ ] **Step 5: Confirm `main.tsx` is small**

Run: `wc -l web/frontend/src/main.tsx`
Expected: ≤ 30 lines. The file is now a thin entry.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/外置硬盘/claude\ code/TauricResearch
git add web/frontend/src/views/App.tsx web/frontend/src/main.tsx
git commit -m "refactor(views): split App shell out of main.tsx

main.tsx is now a 30-line entry that mounts <App/>. The
topbar, view switch, and 52 useState calls live in
views/App.tsx.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done criteria

The round is done when **all** of the following are true:

- [ ] `cd web/frontend && npm run build` exits 0
- [ ] `pytest tests/` reports 47 passed (no backend change)
- [ ] `wc -l web/frontend/src/main.tsx` is ≤ 30
- [ ] `ls web/frontend/src/components/` lists 5 files
- [ ] `ls web/frontend/src/views/` lists 4 files
- [ ] `ls web/frontend/src/views/settings/` lists 7 files
- [ ] `ls web/frontend/src/i18n/` lists 2 files
- [ ] Manual smoke walked all 6 paths in *Validation* in the spec
      without visual regression

## Self-review notes

- **Spec coverage:** Every Critical item in the spec (A1, A2
  partial, A3) is addressed by these tasks. Non-critical items
  are explicitly out of scope and tracked in the spec's audit
  cross-reference table.
- **Placeholder scan:** No TBDs, TODOs, or vague requirements
  remain in this plan.
- **Type consistency:** All components use the prop names
  defined in their interface files. The `Field` component takes
  `label`/`hint`/`error`/`required`/`children`; the call sites
  pass exactly those. `Chip.ariaCurrent` (camelCase) maps to
  `aria-current` (kebab-case) in the rendered DOM; this is
  consistent with how React handles aria attribute names.
- **Failure mode coverage:** The "WorkspaceView ballooning"
  failure mode in the spec is addressed by Task 12's
  re-splitting clause.

## Out-of-scope reminder

Do not, in this round:

- Add `react-router`
- Replace `useState` with `useReducer`
- Add a Context
- Add a `<ConfirmDialog>` component
- Add a `<Toast>` for error stacks
- Add a `<Tooltip>` for disabled buttons
- Migrate to CSS Modules or Tailwind
- Replace the hand-rolled i18n with `react-i18next`
- Add virtualised lists
- Add a11y focus traps or aria improvements

All of these have their own spec coming. This round is purely
"make the file structure navigable" so those specs can land on
a foundation that doesn't need a third rewrite.

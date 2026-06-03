// web/frontend/src/views/AuthScreen.tsx
// Self-contained login / bootstrap form. Extracted from main.tsx
// in Round 1. The component owns its own useState for the form
// fields; all the strings it displays come from the `labels` prop
// so the locale switch keeps working without further plumbing.

import { useState, type ReactElement } from 'react';
import { CircleAlert, Loader2, LogIn, UserPlus, X } from 'lucide-react';
import { api } from '../api';
import type { Locale } from '../i18n/messages';
import type { User } from '../types';
import { Field } from '../components/Field';

export interface AuthScreenProps {
  mode: 'login' | 'bootstrap';
  locale: Locale;
  labels: Record<string, string>;
  onLocaleChange: (locale: Locale) => void;
  onAuthenticated: (user: User) => Promise<void>;
}

export function AuthScreen({
  mode,
  locale,
  labels,
  onLocaleChange,
  onAuthenticated,
}: AuthScreenProps): ReactElement {
  const [username, setUsername] = useState(mode === 'bootstrap' ? 'admin' : '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [initialBalance, setInitialBalance] = useState('100.00');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      setError(labels.usernameTooShort);
      setLoading(false);
      return;
    }
    if (password.length < 8) {
      setError(labels.passwordTooShort);
      setLoading(false);
      return;
    }
    if (mode === 'bootstrap' && (!initialBalance.trim() || Number.isNaN(Number(initialBalance)))) {
      setError(labels.invalidInitialBalance);
      setLoading(false);
      return;
    }
    try {
      const session =
        mode === 'bootstrap'
          ? await api.bootstrap({ username: trimmedUsername, password, displayName: displayName || null, initialBalance })
          : await api.login(trimmedUsername, password);
      await onAuthenticated(session.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell" lang={locale === 'zh' ? 'zh-CN' : 'en'}>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-card-head">
          <div>
            <p className="eyebrow">{labels.eyebrow}</p>
            <h1>{mode === 'bootstrap' ? labels.bootstrapTitle : labels.loginTitle}</h1>
          </div>
          <div className="locale-switch" aria-label="Interface language">
            <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => onLocaleChange('en')}>
              EN
            </button>
            <button type="button" className={locale === 'zh' ? 'active' : ''} onClick={() => onLocaleChange('zh')}>
              中文
            </button>
          </div>
        </div>
        {error && (
          <div className="alert compact">
            <CircleAlert size={18} />
            <span>{error}</span>
          </div>
        )}
        <Field label={labels.username}>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </Field>
        <Field label={labels.password}>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'bootstrap' ? 'new-password' : 'current-password'} />
        </Field>
        {mode === 'bootstrap' && (
          <>
            <Field label={labels.displayName}>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </Field>
            <Field label={labels.initialBalance}>
              <input value={initialBalance} onChange={(event) => setInitialBalance(event.target.value)} inputMode="decimal" />
            </Field>
          </>
        )}
        <button className="primary full" type="submit" disabled={loading}>
          {loading ? <Loader2 className="spin" size={17} /> : mode === 'bootstrap' ? <UserPlus size={17} /> : <LogIn size={17} />}
          {mode === 'bootstrap' ? labels.createAdmin : labels.signIn}
        </button>
      </form>
    </main>
  );
}

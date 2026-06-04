// web/frontend/src/main.tsx
// Round 1 task T14: bootstrap entry only. The shell App component
// lives in ./views/App.tsx; the per-view components (AuthScreen,
// WorkspaceView, SettingsView) are imported transitively through
// App.
//
// The <ErrorBoundary> here is the last line of defense: any
// render-time exception thrown anywhere inside <App /> (including
// the post-login workspace tree) is caught and surfaced to the user
// with a reload button, plus a fire-and-forget POST to the
// /api/diagnostics/client-error endpoint so the server log carries
// the full stack.
//
// The window-level error / unhandledrejection listeners cover the
// cases that the boundary cannot: event handlers, async callbacks,
// and promise rejections. They are not render-time errors so they
// do not unmount the tree, but they would otherwise be invisible
// to operators.

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './views/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { messages } from './i18n/messages';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found in index.html');
}

// Use the English dictionary directly to label the ErrorBoundary
// fallback. We do not import the App's detectLocale() helper because
// the boundary is the very first thing that mounts; it must work
// even if localStorage / navigator throw. Falling back to 'en' is
// safe — the only fields the boundary renders are the three keys
// below, and they exist in the English dictionary.
const t = messages.en;

createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary
      labels={{
        errorBoundaryTitle: t.errorBoundaryTitle,
        errorBoundaryMessage: t.errorBoundaryMessage,
        errorBoundaryReload: t.errorBoundaryReload,
      }}
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// Last-resort listeners for non-render errors. Do not throw out of
// these handlers under any circumstances; an infinite report loop
// would be worse than a missed report.
function reportWindowError(payload: {
  message: string;
  stack: string;
  componentStack: string;
}): void {
  try {
    void fetch('/api/diagnostics/client-error', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        url: window.location.href,
        userAgent: navigator.userAgent ?? '',
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => undefined);
  } catch {
    // ignore
  }
}

window.addEventListener('error', (event) => {
  reportWindowError({
    message: String(event.message ?? 'unknown'),
    stack: String(event.error?.stack ?? ''),
    componentStack: '',
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const error = reason instanceof Error ? reason : new Error(String(reason));
  reportWindowError({
    message: `unhandledrejection: ${error.message}`,
    stack: String(error.stack ?? ''),
    componentStack: '',
  });
});

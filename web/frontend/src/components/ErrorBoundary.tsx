// web/frontend/src/components/ErrorBoundary.tsx
// Top-level error boundary. Catches any render-time exception thrown
// inside <App /> and shows a friendly fallback page instead of a
// silently-unmounted React tree (which manifests to the user as a
// blank gray background — see the post-login white-screen bug that
// motivated this component).
//
// The boundary also fires a best-effort POST to
// /api/diagnostics/client-error so the server log captures the full
// stack + component stack on every crash. We never throw out of the
// boundary itself, even if the network call fails.
//
// This is the only safe place to catch render-time React errors:
// componentDidCatch / getDerivedStateFromError are not exposed as
// hooks, so a class component is required. Wrap <App /> in main.tsx.

import { Component, type ReactElement, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface ErrorBoundaryLabels {
  errorBoundaryTitle: string;
  errorBoundaryMessage: string;
  errorBoundaryReload: string;
}

interface Props {
  children: ReactNode;
  labels: ErrorBoundaryLabels;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

function reportToServer(error: Error, componentStack: string | null): void {
  try {
    void fetch('/api/diagnostics/client-error', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: String(error.message ?? ''),
        stack: String(error.stack ?? ''),
        componentStack: String(componentStack ?? ''),
        url: window.location.href,
        userAgent: navigator.userAgent ?? '',
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => undefined);
  } catch {
    // Best-effort reporting only.
  }
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    const componentStack = info.componentStack ?? null;
    this.setState({ componentStack });
    reportToServer(error, componentStack);
  }

  override render(): ReactElement {
    if (this.state.error) {
      return (
        <main className="error-shell" role="alert">
          <AlertTriangle size={48} aria-hidden="true" />
          <h1>{this.props.labels.errorBoundaryTitle}</h1>
          <p>{this.props.labels.errorBoundaryMessage}</p>
          <pre className="error-detail">{this.state.error.message}</pre>
          <button
            type="button"
            className="primary"
            onClick={() => {
              window.location.reload();
            }}
          >
            <RefreshCw size={16} aria-hidden="true" /> {this.props.labels.errorBoundaryReload}
          </button>
        </main>
      );
    }
    return <>{this.props.children}</>;
  }
}

export default ErrorBoundary;

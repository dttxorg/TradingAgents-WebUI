// web/frontend/src/main.tsx
// Round 1 task T14: bootstrap entry only. The shell App component
// lives in ./views/App.tsx; the per-view components (AuthScreen,
// WorkspaceView, SettingsView) are imported transitively through
// App.

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './views/App';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

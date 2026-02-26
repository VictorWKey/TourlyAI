/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.ts` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';
import './i18n'; // Initialize i18n before React
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './renderer/App';
import { initSentryRenderer, SentryErrorBoundary } from './renderer/lib/sentry';

// Initialize Sentry error reporting in renderer
initSentryRenderer();

// NOTE: Global dragover/drop prevention is handled in the preload script
// (capture phase) so that webUtils.getPathForFile() can extract real file
// paths before any renderer handler fires.

console.log(
  '👋 TourlyAI - Desktop App Initializing...',
);

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    // Wrap App in Sentry ErrorBoundary for React render crash reporting
    root.render(
      React.createElement(
        SentryErrorBoundary,
        { fallback: React.createElement('div', { style: { padding: '2rem', textAlign: 'center' } },
          React.createElement('h1', null, 'Something went wrong'),
          React.createElement('p', null, 'The application encountered an unexpected error. Please restart the app.'),
          React.createElement('button', { onClick: () => window.location.reload(), style: { marginTop: '1rem', padding: '0.5rem 1rem' } }, 'Reload')
        )},
        React.createElement(App)
      )
    );
    console.log('✅ React App mounted successfully');
  } else {
    console.error('❌ Root container not found');
  }
});

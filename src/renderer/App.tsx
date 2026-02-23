/**
 * App - Main Application Entry Point
 * ===================================
 * Root component that handles:
 * - First-run setup wizard detection and display
 * - Main application routing with sidebar navigation
 * - Global state initialization
 */

import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';

// Setup wizard
import { SetupWizard } from './components/setup';

// Layout
import { Sidebar } from './components/layout';

// Pages
import { Home, Data, Pipeline, Visualizations, Metrics, Resumenes, InsightsEstrategicos, Reviews, Reports, Settings } from './pages';

// UI Components
import { Toaster } from './components/ui';

// Stores
import { useSettingsStore } from './stores/settingsStore';

// Hooks
import { useTheme } from './hooks/useTheme';

// Logo assets
import logoPrimaryHorizontal from './assets/logos/logo-primary-horizontal.png';
import logoWhiteHorizontal from './assets/logos/logo-white-horizontal.png';

// Main app layout with sidebar
function AppLayout() {
  const { loadSettings, setLLMConfig, setOutputDir } = useSettingsStore();

  // Initialize theme system (applies dark class to <html>)
  useTheme();

  // Load settings on mount
  useEffect(() => {
    const initSettings = async () => {
      try {
        const settings = await window.electronAPI.settings.getAll();
        if (settings) {
          loadSettings(settings);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    initSettings();
  }, [loadSettings]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/data" element={<Data />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/visualizations" element={<Visualizations />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/resumenes" element={<Resumenes />} />
          <Route path="/insights" element={<InsightsEstrategicos />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);
  const { t } = useTranslation('components');

  useEffect(() => {
    // Load language from electron-store BEFORE checking first-run status.
    // This prevents a flash of the wrong language (i18n defaults to 'es',
    // but the user may have selected 'en' during a previous setup).
    const initApp = async () => {
      try {
        // Load language first so the UI renders in the correct language immediately
        const storedLang = await window.electronAPI.settings.get('app.language');
        if (storedLang && typeof storedLang === 'string' && storedLang !== i18n.language) {
          await i18n.changeLanguage(storedLang);
        }
      } catch (err) {
        console.warn('Failed to load stored language, using default:', err);
      }

      try {
        const firstRun = await window.electronAPI.setup.isFirstRun();
        
        if (firstRun) {
          // On first run, validate setup state against actual system state
          // This catches cases where the user closed the window mid-installation
          try {
            await window.electronAPI.setup.validateState();
          } catch {
            // validateState may not exist on older builds, ignore
          }
        }
        
        setIsFirstRun(firstRun);
        if (!firstRun) {
          setSetupComplete(true);
        }
      } catch (error) {
        console.error('Failed to check first run status:', error);
        setIsFirstRun(false);
        setSetupComplete(true);
      }
    };

    initApp();
  }, []);

  // Loading state while checking first-run status
  if (isFirstRun === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 dark:bg-slate-950">
        <div className="text-center">
          <img
            src={logoPrimaryHorizontal}
            alt="TourlyAI"
            className="w-32 h-auto object-contain mx-auto mb-4 dark:hidden"
          />
          <img
            src={logoWhiteHorizontal}
            alt="TourlyAI"
            className="w-32 h-auto object-contain mx-auto mb-4 hidden dark:block"
          />
          <Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto mb-2" aria-hidden="true" />
          <p className="text-slate-600 dark:text-slate-400 text-sm" role="status" aria-live="polite">{t('loading')}</p>
        </div>
      </div>
    );
  }

  // Show setup wizard on first run
  if (isFirstRun && !setupComplete) {
    return <SetupWizard onComplete={() => setSetupComplete(true)} />;
  }

  // Normal app with routing
  return (
    <HashRouter>
      <AppLayout />
      <Toaster />
    </HashRouter>
  );
}

export default App;

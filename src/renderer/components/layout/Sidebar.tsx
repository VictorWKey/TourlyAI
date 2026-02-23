/**
 * Sidebar Component
 * ==================
 * Main navigation sidebar with LLM status indicator.
 * Supports collapsible mode: shows only logo icon + nav icons when minimized.
 */

import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home,
  Database,
  PlayCircle,
  BarChart2,
  Lightbulb,
  FileText,
  FileBarChart,
  TrendingUp,
  Settings,
  Cpu,
  Key,
  Ban,
  MessageSquareText,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useOllamaStatus } from '../../hooks/useOllama';
import { useSettingsStore } from '../../stores/settingsStore';
import { ThemeToggle } from '../settings/ThemeSelector';
import logoWhite from '../../assets/logos/logo-white.png';

interface NavItem {
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
}

const navItems: NavItem[] = [
  { path: '/', icon: Home, labelKey: 'nav.home' },
  { path: '/data', icon: Database, labelKey: 'nav.data' },
  { path: '/pipeline', icon: PlayCircle, labelKey: 'nav.pipeline' },
  { path: '/visualizations', icon: BarChart2, labelKey: 'nav.dashboard' },
  { path: '/metrics', icon: Lightbulb, labelKey: 'nav.metrics' },
  { path: '/resumenes', icon: FileText, labelKey: 'nav.summaries' },
  { path: '/insights', icon: TrendingUp, labelKey: 'nav.insights' },
  { path: '/reviews', icon: MessageSquareText, labelKey: 'nav.reviews' },
  { path: '/reports', icon: FileBarChart, labelKey: 'nav.reports' },
  { path: '/settings', icon: Settings, labelKey: 'nav.settings' },
  { path: '/help', icon: HelpCircle, labelKey: 'nav.help' },
];

export function Sidebar() {
  const { isRunning, isLoading } = useOllamaStatus();
  const { llm } = useSettingsStore();
  const { t } = useTranslation('common');
  const [collapsed, setCollapsed] = useState(false);

  // Determine what to display for local model
  const getLocalModelDisplay = () => {
    if (llm.mode !== 'local') return null;
    if (!isRunning || !llm.localModel) {
      return t('components:sidebar.ollamaNoModel');
    }
    return `${t('components:sidebar.ollamaNoModel').split(':')[0]}: ${llm.localModel}`;
  };

  // Icon for current LLM mode
  const LlmModeIcon =
    llm.mode === 'local' ? Cpu : llm.mode === 'api' ? Key : Ban;
  const llmModeIconClass =
    llm.mode === 'local'
      ? 'text-blue-400'
      : llm.mode === 'api'
      ? 'text-green-400'
      : 'text-amber-400';

  return (
    <aside
      className={cn(
        'bg-slate-900 dark:bg-slate-950 text-white flex flex-col h-full transition-all duration-300 overflow-hidden',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo + collapse toggle */}
      <div className="h-20 px-2 flex items-center border-b border-slate-800 shrink-0">
        {collapsed ? (
          /* Collapsed: logo icon centered + toggle button below */
          <div className="flex flex-col items-center w-full gap-1">
            <img
              src={logoWhite}
              alt="TourlyAI"
              className="w-9 h-9 object-contain"
            />
            <button
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Expanded: logo + text + collapse button */
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={logoWhite}
                alt="TourlyAI"
                className="w-9 h-9 object-contain shrink-0"
              />
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight truncate">
                  {t('common:app.name')}
                </h1>
                <p className="text-xs text-slate-400 truncate">
                  {t('common:app.subtitle')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav
        className={cn(
          'flex-1 py-4 space-y-1 overflow-y-auto',
          collapsed ? 'px-2' : 'px-4'
        )}
        aria-label={t('common:app.name')}
      >
        {navItems.map(({ path, icon: Icon, labelKey }) => (
          <NavLink
            key={path}
            to={path}
            title={collapsed ? t(labelKey) : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-lg transition-colors',
                collapsed
                  ? 'justify-center p-2'
                  : 'gap-3 px-3 py-2',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              )
            }
          >
            <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="truncate">{t(labelKey)}</span>}
          </NavLink>
        ))}
      </nav>

      {/* LLM Mode Indicator */}
      <div
        className={cn(
          'border-t border-slate-800',
          collapsed ? 'px-2 py-3 flex justify-center' : 'px-4 py-3'
        )}
      >
        {collapsed ? (
          <LlmModeIcon
            className={cn('w-5 h-5', llmModeIconClass)}
            aria-hidden="true"
            title={t('components:sidebar.llmMode')}
          />
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <LlmModeIcon
                className={cn('w-4 h-4', llmModeIconClass)}
                aria-hidden="true"
              />
              <span className="text-xs text-slate-400">
                {t('components:sidebar.llmMode')}
              </span>
            </div>
            <div
              className={cn(
                'px-2 py-1 rounded text-xs font-medium text-center',
                llm.mode === 'local'
                  ? 'bg-blue-900/40 text-blue-300'
                  : llm.mode === 'api'
                  ? 'bg-green-900/40 text-green-300'
                  : 'bg-amber-900/40 text-amber-300'
              )}
            >
              {llm.mode === 'local'
                ? getLocalModelDisplay()
                : llm.mode === 'api'
                ? `OpenAI: ${llm.apiModel}`
                : t('components:sidebar.noLlm')}
            </div>
          </>
        )}
      </div>

      {/* LLM Status - Ollama (local mode only) */}
      {llm.mode === 'local' && !collapsed && (
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300">
              {t('components:sidebar.ollamaStatus')}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {isLoading ? (
              <>
                <div
                  className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"
                  aria-hidden="true"
                />
                <span className="text-xs text-slate-400" role="status">
                  {t('components:sidebar.checking')}
                </span>
              </>
            ) : (
              <>
                <div
                  className={cn(
                    'w-2 h-2 rounded-full',
                    isRunning ? 'bg-green-500' : 'bg-red-500'
                  )}
                  aria-hidden="true"
                />
                <span className="text-xs text-slate-400">
                  {isRunning
                    ? `${llm.localModel || t('components:sidebar.ollamaStatus')}`
                    : t('components:sidebar.ollamaOffline')}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* No LLM Status */}
      {llm.mode === 'none' && !collapsed && (
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-slate-300">
              {t('components:sidebar.noLlm')}
            </span>
          </div>
          <div className="mt-2">
            <span className="text-xs text-amber-400">
              {t('components:sidebar.limitedFunc')}
            </span>
          </div>
        </div>
      )}

      {/* API Status */}
      {llm.mode === 'api' && !collapsed && (
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300">
              {t('components:sidebar.apiStatus')}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
            <span className="text-xs text-slate-400">
              {llm.apiKey
                ? t('components:sidebar.apiKeyConfigured')
                : t('components:sidebar.apiKeyNotConfigured')}
            </span>
          </div>
        </div>
      )}

      {/* Theme Toggle */}
      <div className={cn('pb-1', collapsed ? 'px-1' : 'px-4')}>
        <ThemeToggle className="w-full justify-center" />
      </div>

      {/* Version — hidden when collapsed */}
      {!collapsed && (
        <div className="px-4 pb-4">
          <p className="text-xs text-slate-500 text-center">v1.0.0</p>
        </div>
      )}
    </aside>
  );
}

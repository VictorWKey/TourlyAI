/**
 * Reports Page
 * =============
 * Generate customizable PDF reports from analysis data.
 * Features:
 * - Two tabs: "Create Report" and "My Reports" (browse generated reports)
 * - Template presets (executive, detailed, visual, custom)
 * - Per-section toggle with descriptions
 * - Visualization category filter
 * - Summary category filter
 * - Report settings (title, date, page numbers)
 * - Custom file name with duplicate validation
 * - PDF generation with progress feedback
 * - Floating toast notification for success/error
 * - Optimized for adult / older users (larger text, clear controls)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText,
  Download,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  BarChart3,
  Briefcase,
  Image,
  SlidersHorizontal,
  Loader2,
  FolderOpen,
  ExternalLink,
  BookOpen,
  Target,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  Clock,
  MessageSquare,
  Star,
  Calendar,
  Hash,
  AlertTriangle,
  Eye,
  X,
  FileSearch,
  RefreshCcw,
  Trash2,
} from 'lucide-react';
import { PageLayout } from '../components/layout';
import { Button } from '../components/ui';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePipelineStore } from '../stores/pipelineStore';
import {
  type ReportConfig,
  type ReportTemplate,
  type VisualizationCategory,
  TEMPLATE_PRESETS,
} from '../lib/reportTypes';
import { generatePdfReport } from '../lib/reportGenerator';

/* ──────────────── Template Card ──────────────── */

interface TemplateCardProps {
  id: ReportTemplate;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}

function TemplateCard({ icon: Icon, title, description, selected, onSelect }: TemplateCardProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative flex flex-col items-start p-5 rounded-xl border-2 transition-all text-left cursor-pointer',
        'hover:shadow-md',
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-sm'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500'
      )}
    >
      {selected && (
        <div className="absolute top-3 right-3">
          <CheckCircle2 className="w-5 h-5 text-blue-500" />
        </div>
      )}
      <div className={cn(
        'p-2.5 rounded-lg mb-3',
        selected ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-slate-100 dark:bg-slate-700'
      )}>
        <Icon className={cn('w-6 h-6', selected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400')} />
      </div>
      <h3 className={cn(
        'text-base font-semibold mb-1',
        selected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-white'
      )}>
        {title}
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
    </button>
  );
}

/* ──────────────── Section Toggle ──────────────── */

interface SectionToggleProps {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

function SectionToggle({ icon: Icon, title, description, enabled, onToggle, disabled, children }: SectionToggleProps) {
  return (
    <div className={cn(
      'rounded-xl border transition-all',
      enabled
        ? 'border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800'
        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
    )}>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          'w-full flex items-center gap-3 p-4 text-left transition-colors cursor-pointer',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {/* Checkbox */}
        <div className={cn(
          'w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
          enabled
            ? 'bg-blue-500 border-blue-500'
            : 'border-slate-300 dark:border-slate-500'
        )}>
          {enabled && (
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {/* Icon */}
        <div className={cn(
          'p-2 rounded-lg',
          enabled ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-slate-100 dark:bg-slate-700'
        )}>
          <Icon className={cn('w-5 h-5', enabled ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500')} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <span className={cn(
            'text-base font-medium block',
            enabled ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'
          )}>
            {title}
          </span>
          <span className="text-sm text-slate-400 dark:text-slate-500 block">{description}</span>
        </div>
      </button>

      {/* Sub-options */}
      {enabled && children && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-700/50">
          {children}
        </div>
      )}
    </div>
  );
}

/* ──────────────── Small checkbox for sub-options ──────────────── */

function SubOption({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex items-center gap-2.5 py-1.5 cursor-pointer group" onClick={onToggle}>
      <div className={cn(
        'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
        checked
          ? 'bg-blue-500 border-blue-500'
          : 'border-slate-300 dark:border-slate-500 group-hover:border-blue-400'
      )}>
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
    </label>
  );
}

/* ──────────────── Floating Toast Notification ──────────────── */

interface ToastProps {
  type: 'success' | 'error';
  title: string;
  message: string;
  filePath?: string;
  onOpenFile?: () => void;
  onOpenFolder?: () => void;
  onDismiss: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function FloatingToast({ type, title, message, filePath, onOpenFile, onOpenFolder, onDismiss, t }: ToastProps) {
  useEffect(() => {
    if (type === 'error') {
      const timer = setTimeout(onDismiss, 10000);
      return () => clearTimeout(timer);
    }
  }, [type, onDismiss]);

  const isSuccess = type === 'success';

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md w-full shadow-2xl" style={{animation: 'slideUp 0.3s ease-out'}}>
      <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div className={cn(
        'relative rounded-xl border-2 p-5',
        isSuccess
          ? 'bg-green-50 dark:bg-green-950/90 border-green-300 dark:border-green-700'
          : 'bg-red-50 dark:bg-red-950/90 border-red-300 dark:border-red-700'
      )}>
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          {isSuccess ? (
            <CheckCircle2 className="w-7 h-7 text-green-500 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-7 h-7 text-red-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              'text-base font-semibold',
              isSuccess ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
            )}>
              {title}
            </h3>
            <p className={cn(
              'text-sm mt-1',
              isSuccess ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}>
              {message}
            </p>
            {filePath && (
              <p className="text-xs text-green-500/80 dark:text-green-500 mt-1.5 font-mono break-all">
                {filePath}
              </p>
            )}
            {isSuccess && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={onOpenFile}>
                  <ExternalLink className="w-4 h-4 mr-1.5" />
                  {t('reports:success.openFile')}
                </Button>
                <Button size="sm" variant="outline" onClick={onOpenFolder}>
                  <FolderOpen className="w-4 h-4 mr-1.5" />
                  {t('reports:success.openFolder')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── Confirm Delete Dialog ──────────────── */

function ConfirmDeleteDialog({
  reportName,
  onConfirm,
  onCancel,
  isDeleting,
  t,
}: {
  reportName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!isDeleting ? onCancel : undefined}
      />
      {/* Dialog */}
      <div className="relative z-10 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-6 w-full max-w-md mx-4">
        {/* Close button */}
        {!isDeleting && (
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}

        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-4 mx-auto">
          <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
        </div>

        {/* Title */}
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white text-center mb-2">
          {t('reports:myReports.deleteDialog.title')}
        </h2>

        {/* Message */}
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-1">
          {t('reports:myReports.deleteDialog.message')}
        </p>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 text-center mb-6 break-all">
          &ldquo;{reportName}&rdquo;
        </p>

        {/* Buttons */}
        <div className="flex gap-3 justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1"
          >
            {t('reports:myReports.deleteDialog.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white border-0"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-1.5" />
            )}
            {isDeleting
              ? t('reports:myReports.deleteDialog.deleting')
              : t('reports:myReports.deleteDialog.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── Report file info ──────────────── */

interface ReportFileInfo {
  name: string;
  path: string;
  size: number;
  createdAt: Date;
}

/* ──────────────── My Reports Tab ──────────────── */

function MyReportsTab({ outputDir, t }: { outputDir: string; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const [reports, setReports] = useState<ReportFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportToDelete, setReportToDelete] = useState<ReportFileInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      if (!outputDir) {
        setReports([]);
        return;
      }

      const result = await window.electronAPI.files.listDir(outputDir);
      if (!result?.success || !result.items || !Array.isArray(result.items)) {
        setReports([]);
        return;
      }

      const pdfFiles: ReportFileInfo[] = [];
      for (const entry of result.items) {
        const name = entry.name;
        if (name && name.toLowerCase().endsWith('.pdf')) {
          const fullPath = `${outputDir}/${name}`;
          try {
            const statResult = await window.electronAPI.files.stat(fullPath);
            pdfFiles.push({
              name,
              path: fullPath,
              size: statResult?.stats?.size || 0,
              createdAt: new Date(statResult?.stats?.modified || Date.now()),
            });
          } catch {
            pdfFiles.push({
              name,
              path: fullPath,
              size: 0,
              createdAt: new Date(),
            });
          }
        }
      }

      // Sort by creation date (newest first)
      pdfFiles.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setReports(pdfFiles);
    } catch (err) {
      console.error('[Reports] Failed to load reports:', err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [outputDir]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleOpenFile = useCallback(async (path: string) => {
    await window.electronAPI.files.openPath(path);
  }, []);

  const handleDeleteRequest = useCallback((report: ReportFileInfo) => {
    setReportToDelete(report);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!reportToDelete) return;
    setIsDeleting(true);
    try {
      const result = await window.electronAPI.files.deleteFile(reportToDelete.path);
      if (result.success) {
        setReports((prev) => prev.filter((r) => r.path !== reportToDelete.path));
        setReportToDelete(null);
      }
    } catch (err) {
      console.error('[Reports] Failed to delete report:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [reportToDelete]);

  const handleDeleteCancel = useCallback(() => {
    if (!isDeleting) setReportToDelete(null);
  }, [isDeleting]);

  const handleOpenFolder = useCallback(async () => {
    if (outputDir) {
      await window.electronAPI.files.openPath(outputDir);
    }
  }, [outputDir]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex flex-col items-center justify-center h-64">
        <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-4" />
        <p className="text-base text-slate-500 dark:text-slate-400">{t('reports:myReports.loading')}</p>
      </div>
    );
  }

  if (!outputDir) {
    return (
      <div className="max-w-5xl mx-auto flex flex-col items-center justify-center h-64 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <FolderOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
        <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
          {t('reports:myReports.noDirectory')}
        </h3>
        <p className="text-base text-slate-500 dark:text-slate-400 text-center max-w-md">
          {t('reports:myReports.noDirectoryDesc')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header with refresh and open folder */}
      <div className="flex items-center justify-between">
        <p className="text-base text-slate-600 dark:text-slate-400">
          {t('reports:myReports.count', { count: reports.length })}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={loadReports}>
            <RefreshCcw className="w-4 h-4 mr-1.5" />
            {t('reports:myReports.refresh')}
          </Button>
          <Button size="sm" variant="outline" onClick={handleOpenFolder}>
            <FolderOpen className="w-4 h-4 mr-1.5" />
            {t('reports:myReports.openDirectory')}
          </Button>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <FileSearch className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
            {t('reports:myReports.empty')}
          </h3>
          <p className="text-base text-slate-500 dark:text-slate-400 text-center max-w-md">
            {t('reports:myReports.emptyDesc')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <div
              key={report.path}
              className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all group"
            >
              {/* Icon */}
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 shrink-0">
                <FileText className="w-6 h-6 text-red-500 dark:text-red-400" />
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-slate-900 dark:text-white truncate">
                  {report.name}
                </p>
                <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
                  <span>{formatDate(report.createdAt)}</span>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span>{formatFileSize(report.size)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" onClick={() => handleOpenFile(report.path)}>
                  <ExternalLink className="w-4 h-4 mr-1.5" />
                  {t('reports:myReports.open')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteRequest(report)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm delete dialog */}
      {reportToDelete && (
        <ConfirmDeleteDialog
          reportName={reportToDelete.name}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
          isDeleting={isDeleting}
          t={t}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN REPORTS PAGE
   ══════════════════════════════════════════════ */

type ReportsTab = 'create' | 'history';

export function Reports() {
  const { t } = useTranslation('reports');
  const { dataset, outputPath } = useDataStore();
  const { outputDir, language } = useSettingsStore();
  const { lastTimingRecord } = usePipelineStore();

  // Fetch default output dir as fallback
  const [fallbackDir, setFallbackDir] = useState('');
  useEffect(() => {
    if (!outputDir) {
      window.electronAPI.app.getPythonDataDir().then((dir: string) => {
        // getPythonDataDir returns .../data, strip /data suffix for the parent output dir
        const parentDir = dir.replace(/[\\/]data$/, '');
        setFallbackDir(parentDir);
      }).catch(() => { /* ignore */ });
    }
  }, [outputDir]);

  // Active tab
  const [activeTab, setActiveTab] = useState<ReportsTab>('create');

  // Report configuration state
  const [config, setConfig] = useState<ReportConfig>(() => ({
    template: 'executive',
    title: '',
    includeDate: true,
    includeDatasetInfo: true,
    includePageNumbers: true,
    sections: { ...TEMPLATE_PRESETS.executive.sections },
    visualizationCategories: { ...TEMPLATE_PRESETS.executive.visualizationCategories },
    summaryOptions: { ...TEMPLATE_PRESETS.executive.summaryOptions },
  }));

  // Custom file name
  const [customFileName, setCustomFileName] = useState('');
  const [fileNameError, setFileNameError] = useState<string | null>(null);

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; path?: string; message?: string } | null>(null);
  const [sectionsExpanded, setSectionsExpanded] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(true);

  // Available categories from data (for summary filter)
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  // Check for analysis data availability
  const [hasInsightsData, setHasInsightsData] = useState(false);

  useEffect(() => {
    const checkData = async () => {
      try {
        const pythonDataDir = await window.electronAPI.app.getPythonDataDir();
        const result = await window.electronAPI.files.readFile(
          `${pythonDataDir}/visualizaciones/insights_textuales.json`
        );
        if (result.success && result.content) {
          setHasInsightsData(true);
          // Extract category names for the summary filter
          const data = JSON.parse(result.content);
          if (data?.resumenes?.estructurado?.por_categoria) {
            setAvailableCategories(Object.keys(data.resumenes.estructurado.por_categoria));
          }
        } else {
          setHasInsightsData(false);
        }
      } catch {
        setHasInsightsData(false);
      }
    };
    checkData();
  }, []);

  /* ── Template selection ── */
  const handleTemplateChange = useCallback((template: ReportTemplate) => {
    if (template === 'custom') {
      setConfig(prev => ({
        ...prev,
        template: 'custom',
      }));
    } else {
      const preset = TEMPLATE_PRESETS[template];
      setConfig(prev => ({
        ...prev,
        template,
        sections: { ...preset.sections },
        visualizationCategories: { ...preset.visualizationCategories },
        summaryOptions: { ...preset.summaryOptions },
        includeDate: preset.includeDate,
        includeDatasetInfo: preset.includeDatasetInfo,
        includePageNumbers: preset.includePageNumbers,
      }));
    }
  }, []);

  /* ── Section toggle ── */
  const toggleSection = useCallback((key: keyof ReportConfig['sections']) => {
    setConfig(prev => ({
      ...prev,
      template: 'custom',
      sections: { ...prev.sections, [key]: !prev.sections[key] },
    }));
  }, []);

  /* ── Visualization category toggle ── */
  const toggleVisCat = useCallback((cat: VisualizationCategory) => {
    setConfig(prev => ({
      ...prev,
      template: 'custom',
      visualizationCategories: { ...prev.visualizationCategories, [cat]: !prev.visualizationCategories[cat] },
    }));
  }, []);

  /* ── Summary option toggles ── */
  const toggleSummaryGlobal = useCallback(() => {
    setConfig(prev => ({
      ...prev,
      template: 'custom',
      summaryOptions: { ...prev.summaryOptions, global: !prev.summaryOptions.global },
    }));
  }, []);

  const toggleSummaryCategories = useCallback(() => {
    setConfig(prev => ({
      ...prev,
      template: 'custom',
      summaryOptions: { ...prev.summaryOptions, categories: !prev.summaryOptions.categories },
    }));
  }, []);

  const toggleSelectedCategory = useCallback((cat: string) => {
    setConfig(prev => {
      const selected = prev.summaryOptions.selectedCategories.includes(cat)
        ? prev.summaryOptions.selectedCategories.filter(c => c !== cat)
        : [...prev.summaryOptions.selectedCategories, cat];
      return {
        ...prev,
        template: 'custom',
        summaryOptions: { ...prev.summaryOptions, selectedCategories: selected },
      };
    });
  }, []);

  /* ── Reset to default ── */
  const handleReset = useCallback(() => {
    const preset = TEMPLATE_PRESETS.executive;
    setConfig({
      template: 'executive',
      title: '',
      includeDate: true,
      includeDatasetInfo: true,
      includePageNumbers: true,
      sections: { ...preset.sections },
      visualizationCategories: { ...preset.visualizationCategories },
      summaryOptions: { ...preset.summaryOptions },
    });
    setCustomFileName('');
    setFileNameError(null);
    setToast(null);
  }, []);

  /* ── Count selected sections ── */
  const selectedSectionCount = useMemo(() => {
    return Object.values(config.sections).filter(Boolean).length;
  }, [config.sections]);

  const totalSectionCount = Object.keys(config.sections).length;

  /* ── Determine output directory ── */
  const resolvedOutputDir = useMemo(() => {
    if (outputPath) {
      return outputPath.replace(/[/\\][^/\\]+$/, '');
    }
    if (outputDir) return outputDir;
    return fallbackDir;
  }, [outputPath, outputDir, fallbackDir]);

  /* ── Validate file name ── */
  const validateFileName = useCallback(async (name: string): Promise<boolean> => {
    if (!name.trim()) {
      setFileNameError(null);
      return true;
    }

    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(name)) {
      setFileNameError(t('reports:fileName.invalidChars'));
      return false;
    }

    const targetDir = resolvedOutputDir;
    if (targetDir) {
      const fullPath = `${targetDir}/${name.trim()}.pdf`;
      try {
        const exists = await window.electronAPI.files.exists(fullPath);
        if (exists) {
          setFileNameError(t('reports:fileName.duplicate'));
          return false;
        }
      } catch {
        // If we can't check, allow it
      }
    }

    setFileNameError(null);
    return true;
  }, [resolvedOutputDir, t]);

  const handleFileNameChange = useCallback((value: string) => {
    setCustomFileName(value);
    validateFileName(value);
  }, [validateFileName]);

  /* ── Generate report ── */
  const handleGenerate = useCallback(async () => {
    const isValid = await validateFileName(customFileName);
    if (!isValid) return;

    setIsGenerating(true);
    setToast(null);

    try {
      let targetDir = resolvedOutputDir;
      if (!targetDir) {
        try {
          targetDir = await window.electronAPI.app.getPythonDataDir();
        } catch {
          // ignore
        }
      }
      if (!targetDir) {
        setIsGenerating(false);
        setToast({ type: 'error', message: t('reports:errors.noOutputDir') });
        return;
      }

      const filePath = await generatePdfReport({
        config,
        t,
        datasetName: dataset?.name || 'Unknown',
        outputDir: targetDir,
        timingRecords: lastTimingRecord
          ? Object.entries(lastTimingRecord.phases).map(([phaseNum, p]) => ({
              phase: Number(phaseNum),
              name: p.phaseName,
              duration: p.duration,
              status: p.status,
              startTime: p.startedAt,
              endTime: p.completedAt,
            }))
          : [],
        customFileName: customFileName.trim() || undefined,
      });
      setToast({ type: 'success', path: filePath });
    } catch (err) {
      console.error('[Reports] Generation failed:', err);
      setToast({
        type: 'error',
        message: err instanceof Error ? err.message : t('reports:errors.generationFailed'),
      });
    } finally {
      setIsGenerating(false);
    }
  }, [config, t, dataset, resolvedOutputDir, lastTimingRecord, customFileName, validateFileName]);

  /* ── Open generated file ── */
  const handleOpenFile = useCallback(async () => {
    if (toast?.path) {
      await window.electronAPI.files.openPath(toast.path);
    }
  }, [toast]);

  const handleOpenFolder = useCallback(async () => {
    if (toast?.path) {
      const folderPath = toast.path.replace(/[/\\][^/\\]+$/, '');
      await window.electronAPI.files.openPath(folderPath);
    }
  }, [toast]);

  /* ── Section definition for the form ── */
  const sectionDefs: {
    key: keyof ReportConfig['sections'];
    icon: React.ComponentType<{ className?: string }>;
    titleKey: string;
    descKey: string;
  }[] = [
    { key: 'coverPage', icon: BookOpen, titleKey: 'sections.coverPage', descKey: 'sections.coverPageDesc' },
    { key: 'tableOfContents', icon: FileText, titleKey: 'sections.tableOfContents', descKey: 'sections.tableOfContentsDesc' },
    { key: 'kpis', icon: Target, titleKey: 'sections.kpis', descKey: 'sections.kpisDesc' },
    { key: 'sentimentAnalysis', icon: MessageSquare, titleKey: 'sections.sentimentAnalysis', descKey: 'sections.sentimentAnalysisDesc' },
    { key: 'subjectivityAnalysis', icon: Eye, titleKey: 'sections.subjectivityAnalysis', descKey: 'sections.subjectivityAnalysisDesc' },
    { key: 'ratingDistribution', icon: Star, titleKey: 'sections.ratingDistribution', descKey: 'sections.ratingDistributionDesc' },
    { key: 'categoryAnalysis', icon: Hash, titleKey: 'sections.categoryAnalysis', descKey: 'sections.categoryAnalysisDesc' },
    { key: 'topicAnalysis', icon: TrendingUp, titleKey: 'sections.topicAnalysis', descKey: 'sections.topicAnalysisDesc' },
    { key: 'temporalAnalysis', icon: Calendar, titleKey: 'sections.temporalAnalysis', descKey: 'sections.temporalAnalysisDesc' },
    { key: 'strengths', icon: ThumbsUp, titleKey: 'sections.strengths', descKey: 'sections.strengthsDesc' },
    { key: 'opportunities', icon: ThumbsDown, titleKey: 'sections.opportunities', descKey: 'sections.opportunitiesDesc' },
    { key: 'visualizations', icon: BarChart3, titleKey: 'sections.visualizations', descKey: 'sections.visualizationsDesc' },
    { key: 'summaries', icon: FileText, titleKey: 'sections.summaries', descKey: 'sections.summariesDesc' },
    { key: 'strategicInsights', icon: Briefcase, titleKey: 'sections.strategicInsights', descKey: 'sections.strategicInsightsDesc' },
    { key: 'pipelineTiming', icon: Clock, titleKey: 'sections.pipelineTiming', descKey: 'sections.pipelineTimingDesc' },
    { key: 'datasetValidation', icon: CheckCircle2, titleKey: 'sections.datasetValidation', descKey: 'sections.datasetValidationDesc' },
    { key: 'generationReport', icon: BarChart3, titleKey: 'sections.generationReport', descKey: 'sections.generationReportDesc' },
  ];

  const visCats: { key: VisualizationCategory; labelKey: string }[] = [
    { key: 'sentimientos', labelKey: 'visualizationCategories.sentimientos' },
    { key: 'subjetividad', labelKey: 'visualizationCategories.subjetividad' },
    { key: 'categorias', labelKey: 'visualizationCategories.categorias' },
    { key: 'topicos', labelKey: 'visualizationCategories.topicos' },
    { key: 'temporal', labelKey: 'visualizationCategories.temporal' },
    { key: 'texto', labelKey: 'visualizationCategories.texto' },
    { key: 'combinados', labelKey: 'visualizationCategories.combinados' },
  ];

  const translateCatName = (cat: string): string => {
    const key = `common:dataLabels.categories.${cat.replace(/^["']|["']$/g, '')}`;
    const translated = t(key);
    return translated !== key ? translated : cat.replace(/^["']|["']$/g, '');
  };

  /* ══════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════ */

  return (
    <PageLayout
      title={t('title')}
      description={t('description')}
      headerActions={
        activeTab === 'create' ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {t('actions.reset')}
            </Button>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={!hasInsightsData || isGenerating || selectedSectionCount === 0 || !!fileNameError}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {isGenerating ? t('actions.generating') : t('actions.generate')}
            </Button>
          </div>
        ) : undefined
      }
    >
      {/* ── Tab Navigation ── */}
      <div className="max-w-5xl mx-auto mb-6">
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1.5 gap-1">
          <button
            onClick={() => setActiveTab('create')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg text-base font-medium transition-all cursor-pointer',
              activeTab === 'create'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50'
            )}
          >
            <Download className="w-5 h-5" />
            {t('tabs.create')}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg text-base font-medium transition-all cursor-pointer',
              activeTab === 'history'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50'
            )}
          >
            <FileSearch className="w-5 h-5" />
            {t('tabs.history')}
          </button>
        </div>
      </div>

      {/* ── Tab Content ── */}
      {activeTab === 'history' ? (
        <MyReportsTab outputDir={resolvedOutputDir} t={t} />
      ) : (
        <>
          {/* No data warning */}
          {!hasInsightsData ? (
            <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 max-w-5xl mx-auto">
              <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
              <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('errors.noData')}
              </h3>
              <p className="text-base text-slate-500 dark:text-slate-400 text-center max-w-md">
                {t('errors.noDataDesc')}
              </p>
            </div>
          ) : (
            <div className="space-y-6 max-w-5xl mx-auto pb-8">

              {/* ── 1. TEMPLATE SELECTION ── */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                  {t('templates.title')}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
                  {t('templates.description')}
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <TemplateCard
                    id="executive"
                    icon={Briefcase}
                    title={t('templates.executive')}
                    description={t('templates.executiveDesc')}
                    selected={config.template === 'executive'}
                    onSelect={() => handleTemplateChange('executive')}
                  />
                  <TemplateCard
                    id="detailed"
                    icon={FileText}
                    title={t('templates.detailed')}
                    description={t('templates.detailedDesc')}
                    selected={config.template === 'detailed'}
                    onSelect={() => handleTemplateChange('detailed')}
                  />
                  <TemplateCard
                    id="visual"
                    icon={Image}
                    title={t('templates.visualOnly')}
                    description={t('templates.visualOnlyDesc')}
                    selected={config.template === 'visual'}
                    onSelect={() => handleTemplateChange('visual')}
                  />
                  <TemplateCard
                    id="custom"
                    icon={SlidersHorizontal}
                    title={t('templates.custom')}
                    description={t('templates.customDesc')}
                    selected={config.template === 'custom'}
                    onSelect={() => handleTemplateChange('custom')}
                  />
                </div>
              </div>

              {/* ── 2. SECTION SELECTION ── */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-6 text-left cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                  onClick={() => setSectionsExpanded(!sectionsExpanded)}
                >
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      {t('sections.title')}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('sections.description')} — {selectedSectionCount}/{totalSectionCount}
                    </p>
                  </div>
                  {sectionsExpanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </button>

                {sectionsExpanded && (
                  <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sectionDefs.map((sec) => (
                      <SectionToggle
                        key={sec.key}
                        id={sec.key}
                        icon={sec.icon}
                        title={t(sec.titleKey)}
                        description={t(sec.descKey)}
                        enabled={config.sections[sec.key]}
                        onToggle={() => toggleSection(sec.key)}
                      >
                        {/* Visualization sub-options */}
                        {sec.key === 'visualizations' && config.sections.visualizations && (
                          <div className="mt-2 space-y-0.5">
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
                              {t('visualizationCategories.title')}
                            </p>
                            {visCats.map(vc => (
                              <SubOption
                                key={vc.key}
                                label={t(vc.labelKey)}
                                checked={config.visualizationCategories[vc.key]}
                                onToggle={() => toggleVisCat(vc.key)}
                              />
                            ))}
                          </div>
                        )}

                        {/* Summary sub-options */}
                        {sec.key === 'summaries' && config.sections.summaries && (
                          <div className="mt-2 space-y-0.5">
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
                              {t('summaryOptions.title')}
                            </p>
                            <SubOption
                              label={t('summaryOptions.global')}
                              checked={config.summaryOptions.global}
                              onToggle={toggleSummaryGlobal}
                            />
                            <SubOption
                              label={t('summaryOptions.categories')}
                              checked={config.summaryOptions.categories}
                              onToggle={toggleSummaryCategories}
                            />
                            {config.summaryOptions.categories && availableCategories.length > 0 && (
                              <div className="ml-6 mt-1 space-y-0.5">
                                <p className="text-sm text-slate-400 dark:text-slate-500 mb-1">
                                  {config.summaryOptions.selectedCategories.length === 0
                                    ? t('summaryOptions.allCategories')
                                    : t('summaryOptions.selectCategories')}
                                </p>
                                {availableCategories.map(cat => (
                                  <SubOption
                                    key={cat}
                                    label={translateCatName(cat)}
                                    checked={
                                      config.summaryOptions.selectedCategories.length === 0 ||
                                      config.summaryOptions.selectedCategories.includes(cat)
                                    }
                                    onToggle={() => toggleSelectedCategory(cat)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </SectionToggle>
                    ))}
                  </div>
                )}
              </div>

              {/* ── 3. REPORT SETTINGS ── */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-6 text-left cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                  onClick={() => setSettingsExpanded(!settingsExpanded)}
                >
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      {t('reportSettings.title')}
                    </h2>
                  </div>
                  {settingsExpanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </button>

                {settingsExpanded && (
                  <div className="px-6 pb-6 space-y-6">
                    {/* Report title */}
                    <div>
                      <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                        {t('reportSettings.reportTitle')}
                      </label>
                      <input
                        type="text"
                        value={config.title}
                        onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
                        placeholder={t('reportSettings.reportTitlePlaceholder')}
                        className="w-full px-4 py-3 text-base rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    {/* Custom file name */}
                    <div>
                      <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                        {t('reports:fileName.label')}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={customFileName}
                          onChange={(e) => handleFileNameChange(e.target.value)}
                          placeholder={t('reports:fileName.placeholder')}
                          className={cn(
                            'w-full px-4 py-3 pr-14 text-base rounded-lg border bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:border-transparent',
                            fileNameError
                              ? 'border-red-300 dark:border-red-600 focus:ring-red-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500'
                          )}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500 pointer-events-none select-none">
                          .pdf
                        </span>
                      </div>
                      {fileNameError ? (
                        <p className="text-sm text-red-500 dark:text-red-400 mt-1.5 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          {fileNameError}
                        </p>
                      ) : (
                        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1.5">
                          {t('reports:fileName.hint')}
                        </p>
                      )}
                    </div>

                    {/* Toggle options */}
                    <div className="space-y-2">
                      <SubOption
                        label={t('reportSettings.includeDate')}
                        checked={config.includeDate}
                        onToggle={() => setConfig(prev => ({ ...prev, includeDate: !prev.includeDate }))}
                      />
                      <SubOption
                        label={t('reportSettings.includeDatasetInfo')}
                        checked={config.includeDatasetInfo}
                        onToggle={() => setConfig(prev => ({ ...prev, includeDatasetInfo: !prev.includeDatasetInfo }))}
                      />
                      <SubOption
                        label={t('reportSettings.pageNumbers')}
                        checked={config.includePageNumbers}
                        onToggle={() => setConfig(prev => ({ ...prev, includePageNumbers: !prev.includePageNumbers }))}
                      />
                    </div>

                    {/* Language info */}
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <span>{t('reportSettings.language')}:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {t('reportSettings.languageAuto', { lang: language === 'es' ? 'Español' : 'English' })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Floating Toast Notification ── */}
      {toast && (
        <FloatingToast
          type={toast.type}
          title={toast.type === 'success' ? t('reports:success.title') : t('reports:errors.generationFailed')}
          message={toast.type === 'success' ? t('reports:success.message') : (toast.message || '')}
          filePath={toast.path}
          onOpenFile={handleOpenFile}
          onOpenFolder={handleOpenFolder}
          onDismiss={() => setToast(null)}
          t={t}
        />
      )}
    </PageLayout>
  );
}

export default Reports;

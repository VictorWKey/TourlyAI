/**
 * Pipeline Page
 * ==============
 * Pipeline configuration and execution
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Square,
  Check,
  Loader2,
  AlertCircle,
  ChevronRight,
  Wrench,
  BarChart2,
  Smile,
  Brain,
  Folder,
  TreePine,
  FileText,
  BarChart3,
  Lightbulb,
  AlertTriangle,
  Ban,
  Timer,
  Settings2,
} from 'lucide-react';
import { PageLayout } from '../components/layout';
import { Button, Progress, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui';
import { DependencyModal } from '../components/pipeline/DependencyModal';
import { cn } from '../lib/utils';
import { usePipeline } from '../hooks/usePipeline';
import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useOllama } from '../hooks/useOllama';
import { useToast } from '../hooks/useToast';
import type { PhaseValidation } from '@/shared/types';

/** Format duration in milliseconds to a human-readable string */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Live elapsed timer that updates every second */
function LiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startMs = new Date(startedAt).getTime();
    const tick = () => setElapsed(Date.now() - startMs);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-mono">
      <Timer className="w-3 h-3" />
      {formatDuration(elapsed)}
    </span>
  );
}

const phaseDescriptions: Record<number, string> = {
  1: 'Limpieza y normalización del texto',
  2: 'Genera estadísticas descriptivas básicas de los datos',
  3: 'Clasifica las opiniones como positivas, negativas o neutras',
  4: 'Identifica si las opiniones son subjetivas o mixtas',
  5: 'Agrupa las reseñas en categorías turísticas',
  6: 'Descubre los temas y sub-temas principales usando IA',
  7: 'Genera resúmenes estructurados usando IA',
  8: 'Genera recomendaciones estratégicas basadas en datos usando IA',
  9: 'Genera visualizaciones y exporta métricas del análisis',
};

const phaseIcons: Record<number, React.ComponentType<{ className?: string }>> = {
  1: Wrench,
  2: BarChart2,
  3: Smile,
  4: Brain,
  5: Folder,
  6: TreePine,
  7: FileText,
  8: Lightbulb,
  9: BarChart3,
};

interface PhaseCardProps {
  phase: number;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelling';
  progress: number;
  message?: string;
  error?: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onRun: () => void;
  onConfigure?: () => void;
  isRunning: boolean;
  hasDataset: boolean;
  isCancelling: boolean;
  warnings?: string[];
  isDisabledByMode?: boolean;
  disabledReason?: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  isLast?: boolean;
}

function PhaseCard({
  phase,
  name,
  description,
  icon,
  status,
  progress,
  message,
  error,
  enabled,
  onToggle,
  onRun,
  onConfigure,
  isRunning,
  hasDataset,
  isCancelling,
  warnings,
  isDisabledByMode,
  disabledReason,
  startedAt,
  completedAt,
  duration,
  isLast,
}: PhaseCardProps) {
  const { t } = useTranslation('pipeline');

  const getStepBubble = () => {
    if (isDisabledByMode) {
      return (
        <div className="w-9 h-9 rounded-full flex items-center justify-center border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 shrink-0">
          <Ban className="w-3.5 h-3.5 text-slate-400" />
        </div>
      );
    }
    switch (status) {
      case 'completed':
        return (
          <div className="w-9 h-9 rounded-full flex items-center justify-center border-2 border-green-500 bg-green-500 text-white shrink-0 shadow-md shadow-green-200 dark:shadow-green-900/30">
            <Check className="w-4 h-4" strokeWidth={3} />
          </div>
        );
      case 'running':
        return (
          <div className="w-9 h-9 rounded-full flex items-center justify-center border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 shrink-0 shadow-md shadow-blue-200 dark:shadow-blue-900/40">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        );
      case 'failed':
        return (
          <div className="w-9 h-9 rounded-full flex items-center justify-center border-2 border-red-500 bg-red-500 text-white shrink-0 shadow-md shadow-red-200 dark:shadow-red-900/30">
            <AlertCircle className="w-4 h-4" />
          </div>
        );
      case 'cancelling':
        return (
          <div className="w-9 h-9 rounded-full flex items-center justify-center border-2 border-orange-400 bg-orange-50 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 shrink-0">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        );
      default:
        return (
          <div className="w-9 h-9 rounded-full flex items-center justify-center border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
            <span className="text-xs font-bold">{phase}</span>
          </div>
        );
    }
  };

  const getCardStyle = () => {
    if (isDisabledByMode) return 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 opacity-60';
    switch (status) {
      case 'completed':
        return 'border-l-[3px] border-l-green-500 border border-green-200 dark:border-green-900/50 bg-green-50/40 dark:bg-green-900/5';
      case 'running':
        return 'border-l-[3px] border-l-blue-500 border border-blue-200 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-950/20 shadow-sm shadow-blue-100 dark:shadow-blue-900/20';
      case 'failed':
        return 'border-l-[3px] border-l-red-500 border border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-900/5';
      case 'cancelling':
        return 'border-l-[3px] border-l-orange-400 border border-orange-200 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-900/5';
      default:
        return 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800';
    }
  };

  const getIconStyle = () => {
    if (isDisabledByMode) return 'bg-slate-100 dark:bg-slate-700/50 text-slate-400';
    switch (status) {
      case 'completed':  return 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400';
      case 'running':    return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
      case 'failed':     return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
      case 'cancelling': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
      default:           return 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400';
    }
  };

  const getStatusBadge = () => {
    if (isDisabledByMode) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          <Ban className="w-2.5 h-2.5" />
          {t('notAvailable')}
        </span>
      );
    }
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
            <Check className="w-2.5 h-2.5" />
            Completado
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Ejecutando
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-2.5 h-2.5" />
            Error
          </span>
        );
      case 'cancelling':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            Cancelando
          </span>
        );
      default:
        return null;
    }
  };

  const isOpaque = !enabled && !isDisabledByMode;

  return (
    <div className="flex gap-3">
      {/* Step indicator column */}
      <div className="flex flex-col items-center shrink-0">
        {getStepBubble()}
        {!isLast && (
          <div className={cn(
            'w-0.5 flex-1 min-h-5 mt-1.5',
            status === 'completed'
              ? 'bg-green-300 dark:bg-green-700/60'
              : status === 'running'
              ? 'bg-blue-300 dark:bg-blue-700/60'
              : 'bg-slate-200 dark:bg-slate-700'
          )} />
        )}
      </div>

      {/* Card */}
      <div
        className={cn(
          'flex-1 rounded-xl p-4 transition-all mb-2',
          getCardStyle(),
          isOpaque && 'opacity-50'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          {hasDataset && (
            <label className="flex items-center cursor-pointer shrink-0 pt-1">
              <input
                type="checkbox"
                checked={enabled && !isDisabledByMode}
                onChange={(e) => onToggle(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
                disabled={isRunning || isDisabledByMode}
              />
            </label>
          )}

          {/* Phase icon badge */}
          <div className={cn('shrink-0 p-2 rounded-lg', getIconStyle())}>
            {React.createElement(icon, { className: 'w-5 h-5' })}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={cn(
                'font-semibold text-sm',
                isDisabledByMode ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'
              )}>
                {name}
              </h3>
              {getStatusBadge()}
              {!isDisabledByMode && status === 'running' && startedAt && (
                <LiveTimer startedAt={startedAt} />
              )}
              {!isDisabledByMode && (status === 'completed' || status === 'failed') && duration !== undefined && duration > 0 && (
                <span className={cn(
                  'inline-flex items-center gap-1 text-xs font-mono',
                  status === 'completed' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                )}>
                  <Timer className="w-3 h-3" />
                  {formatDuration(duration)}
                </span>
              )}
              {!isDisabledByMode && warnings && warnings.length > 0 && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="cursor-help">
                        <AlertTriangle className="w-4 h-4 text-amber-500 hover:text-amber-600 transition-colors" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-sm">
                      <div className="space-y-1.5">
                        {warnings.map((w, i) => (
                          <p key={i} className="text-xs leading-relaxed">{w}</p>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              {description}
            </p>
            {isDisabledByMode && disabledReason && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">{disabledReason}</p>
            )}
            {status === 'running' && (
              <div className="mt-3">
                <Progress value={progress} className="h-1.5" />
                {message && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{message}</p>}
              </div>
            )}
            {status === 'cancelling' && (
              <p className="text-sm text-orange-600 dark:text-orange-400 mt-2">
                {message || t('cancelling')}
              </p>
            )}
            {error && status !== 'cancelling' && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">Error: {error}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onConfigure && !isDisabledByMode && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onConfigure}
                      disabled={isRunning || isCancelling}
                      className={cn(
                        'p-2 rounded-lg border border-slate-200 dark:border-slate-700 transition-all',
                        'hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500',
                        (isRunning || isCancelling) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                      )}
                    >
                      <Settings2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p className="text-xs">{t('configureTooltip')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {hasDataset && !isDisabledByMode && (
              <Button
                size="sm"
                onClick={onRun}
                disabled={!enabled || isRunning || isCancelling}
                variant={status === 'completed' ? 'outline' : 'default'}
                className={cn(
                  'transition-all shrink-0 text-xs h-8',
                  !enabled || isRunning || isCancelling ? 'opacity-50 cursor-not-allowed' : ''
                )}
              >
                <Play className="w-3 h-3 mr-1" />
                {status === 'completed' ? 'Re-ejecutar' : 'Ejecutar'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Pipeline() {
  const {
    isRunning,
    currentPhase,
    phases,
    config,
    overallProgress,
    completedCount,
    pipelineStartedAt,
    pipelineDuration,
    runPhase,
    runAll,
    stop,
    setPhaseEnabled,
    reset,
  } = usePipeline();

  const { dataset } = useDataStore();
  const { llm, setLLMConfig } = useSettingsStore();
  const { models, isRunning: ollamaRunning } = useOllama();
  const { success, warning } = useToast();
  const { t } = useTranslation('pipeline');
  const [isStopping, setIsStopping] = useState(false);

  // Compute whether Ollama is needed but unavailable
  const isLocalMode = llm.mode === 'local';
  const isOllamaOffline = isLocalMode && !ollamaRunning;
  const hasNoModels = isLocalMode && ollamaRunning && (!models || models.length === 0);

  // Normalize model names for comparison: Ollama may return 'model:tag' or 'model:latest'
  const normalizeModelName = (name: string): string => name.replace(/:latest$/, '');
  const selectedModelMissing = isLocalMode && ollamaRunning && models && models.length > 0
    && (!llm.localModel || !models.find(m => normalizeModelName(m.name) === normalizeModelName(llm.localModel)));

  // Auto-recovery: If the configured model is not installed but other models
  // ARE available, automatically switch to the first available model.
  // This prevents phases 6/7/8 from being permanently blocked due to a
  // setup-time vs runtime model mismatch (e.g. wizard installed mistral:7b
  // but config still says llama3.2:3b).
  useEffect(() => {
    if (
      isLocalMode &&
      ollamaRunning &&
      models &&
      models.length > 0 &&
      selectedModelMissing
    ) {
      const firstAvailable = models[0].name;
      console.warn(
        `[Pipeline] Configured model "${llm.localModel}" not found among installed models. ` +
        `Auto-switching to "${firstAvailable}".`
      );
      // Update both the Zustand store and the persisted electron-store
      setLLMConfig({ localModel: firstAvailable });
      window.electronAPI.settings.set('llm.localModel', firstAvailable).catch((err: unknown) => {
        console.error('[Pipeline] Failed to persist auto-corrected model:', err);
      });
    }
  }, [isLocalMode, ollamaRunning, models, selectedModelMissing, llm.localModel, setLLMConfig]);

  const isLocalLLMUnavailable = isOllamaOffline || hasNoModels || !!selectedModelMissing;

  const isNoLLMMode = llm.mode === 'none';

  // Compute warnings and disabled state for each phase
  const getPhaseWarnings = (phaseNum: number): string[] => {
    const warnings: string[] = [];
    
    if (phaseNum === 6) {
      if (llm.mode !== 'none' && !isLocalLLMUnavailable) {
        warnings.push(t('phaseWarnings.phase6Slow'));
      }
    }
    
    if (phaseNum === 7) {
      if (llm.mode !== 'none' && !isLocalLLMUnavailable) {
        warnings.push(t('phaseWarnings.phase7Slow'));
      }
    }

    if (phaseNum === 9 && (isNoLLMMode || isLocalLLMUnavailable)) {
      warnings.push(t('phaseWarnings.noLlmPhase9'));
    }
    
    return warnings;
  };

  const isPhaseDisabledByMode = (phaseNum: number): boolean => {
    if (phaseNum !== 6 && phaseNum !== 7 && phaseNum !== 8) return false;
    if (isNoLLMMode) return true;
    if (isLocalLLMUnavailable) return true;
    return false;
  };

  const getDisabledReason = (phaseNum: number): string | undefined => {
    if (phaseNum !== 6 && phaseNum !== 7 && phaseNum !== 8) return undefined;
    if (isNoLLMMode) return t('disabledReason.noLlm');
    if (isOllamaOffline) return t('disabledReason.ollamaOffline');
    if (hasNoModels) return t('disabledReason.noModels');
    if (selectedModelMissing) return t('disabledReason.modelMissing', { model: llm.localModel });
    return undefined;
  };
  const [validationModal, setValidationModal] = useState<{
    open: boolean;
    validation: PhaseValidation | null;
    phase: number;
  }>({
    open: false,
    validation: null,
    phase: 0,
  });

  const handleRunAll = async () => {
    if (!dataset) {
      warning(t('toast.datasetRequiredTitle'), t('toast.datasetRequiredDesc'));
      return;
    }
    await runAll();
  };

  const handleRunPhase = async (phase: number) => {
    if (!dataset) {
      warning(t('toast.datasetRequiredTitle'), t('toast.datasetRequiredDesc'));
      return;
    }
    
    const result = await runPhase(phase);
    
    // Check if validation failed
    if (!result.success && result.validation && !result.validation.canRun) {
      setValidationModal({
        open: true,
        validation: result.validation,
        phase,
      });
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      const result = await stop();
      if (result.rolledBack) {
        success(
          t('toast.stoppedTitle'),
          t('toast.stoppedRolledBack')
        );
      } else {
        success(t('toast.stoppedTitle'), t('toast.stoppedDesc'));
      }
    } finally {
      setIsStopping(false);
    }
  };

  const phaseList = Object.values(phases)
    .filter((phase) => phase.phase >= 1 && phase.phase <= 9)
    .sort((a, b) => a.phase - b.phase);

  const effectiveCompleted = phaseList.filter(p => p.status === 'completed').length;

  return (
    <PageLayout
      title={t('title')}
      description={t('description')}
      headerActions={
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Button variant="destructive" onClick={handleStop} disabled={isStopping}>
              {isStopping ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Square className="w-4 h-4 mr-2" />
              )}
              {isStopping ? t('actions.stopping') : t('actions.stop')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={reset} disabled={completedCount === 0}>
                {t('actions.reset')}
              </Button>
              <Button onClick={handleRunAll} disabled={!dataset || Object.values(phases).some((p) => p.status === 'cancelling')}>
                <Play className="w-4 h-4 mr-2" />
                {t('actions.runAll')}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Overview progress card ── */}
        {dataset && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Progreso del análisis
                </span>
              </div>
              <div className="flex items-center gap-3">
                {isRunning && pipelineStartedAt && (
                  <LiveTimer startedAt={pipelineStartedAt} />
                )}
                {!isRunning && pipelineDuration !== null && pipelineDuration > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 dark:text-slate-400">
                    <Timer className="w-3 h-3" />
                    {formatDuration(pipelineDuration)}
                  </span>
                )}
                <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  {effectiveCompleted}<span className="font-normal text-slate-400 dark:text-slate-500">/9</span>
                </span>
              </div>
            </div>
            <Progress value={(effectiveCompleted / 9) * 100} className="h-2" />
            <div className="flex justify-between mt-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {effectiveCompleted === 0
                  ? 'Sin iniciar'
                  : isRunning
                  ? 'En progreso...'
                  : `${effectiveCompleted} fase${effectiveCompleted !== 1 ? 's' : ''} completada${effectiveCompleted !== 1 ? 's' : ''}`}
              </span>
              {effectiveCompleted === 9 && (
                <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                  ¡Análisis completo!
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Warning banners ── */}
        {isNoLLMMode && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
            <Ban className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t('warnings.noLlmTitle')}</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{t('warnings.noLlmDesc')}</p>
            </div>
          </div>
        )}
        {isLocalMode && isOllamaOffline && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-300">{t('warnings.ollamaOfflineTitle')}</p>
              <p className="text-xs text-red-700 dark:text-red-400 mt-1">{t('warnings.ollamaOfflineDesc')}</p>
            </div>
          </div>
        )}
        {isLocalMode && !isOllamaOffline && hasNoModels && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-orange-800 dark:text-orange-300">{t('warnings.noModelsTitle')}</p>
              <p className="text-xs text-orange-700 dark:text-orange-400 mt-1">{t('warnings.noModelsDesc')}</p>
            </div>
          </div>
        )}
        {isLocalMode && !isOllamaOffline && !hasNoModels && selectedModelMissing && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-orange-800 dark:text-orange-300">{t('warnings.modelMissingTitle')}</p>
              <p className="text-xs text-orange-700 dark:text-orange-400 mt-1">{t('warnings.modelMissingDesc', { model: llm.localModel })}</p>
            </div>
          </div>
        )}
        {!dataset && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            <p className="text-sm text-yellow-700 dark:text-yellow-300">{t('warnings.noDataset')}</p>
          </div>
        )}

        {/* ── Phase stepper ── */}
        <div>
          {phaseList.map((phase, idx) => {
            const phaseKey = `phase_${String(phase.phase).padStart(2, '0')}` as keyof typeof config.phases;
            const isCancellingAny = Object.values(phases).some((p) => p.status === 'cancelling');
            const disabledByMode = isPhaseDisabledByMode(phase.phase);
            const isLastPhase = idx === phaseList.length - 1;

            return (
              <PhaseCard
                key={phase.phase}
                  phase={phase.phase}
                  name={t(`common:phases.${phase.phase}.name`)}
                  description={t(`common:phases.${phase.phase}.description`, phaseDescriptions[phase.phase])}
                  icon={phaseIcons[phase.phase]}
                  status={phase.status}
                  progress={phase.progress}
                  message={phase.message}
                  error={phase.error}
                  enabled={disabledByMode ? false : config.phases[phaseKey]}
                  onToggle={(enabled) => { if (!disabledByMode) setPhaseEnabled(phase.phase, enabled); }}
                  onRun={() => handleRunPhase(phase.phase)}
                  isRunning={isRunning}
                  hasDataset={!!dataset}
                  isCancelling={isCancellingAny}
                  warnings={getPhaseWarnings(phase.phase)}
                  isDisabledByMode={disabledByMode}
                  disabledReason={getDisabledReason(phase.phase)}
                  startedAt={phase.startedAt}
                  completedAt={phase.completedAt}
                  duration={phase.duration}
                  isLast={isLastPhase}
                />
            );
          })}
        </div>

        {/* ── Completion summary ── */}
        {completedCount === 9 && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center shrink-0 shadow-md shadow-green-200 dark:shadow-green-900/30">
              <Check className="w-5 h-5 text-white" strokeWidth={3} />
            </div>
            <div>
              <p className="font-semibold text-green-900 dark:text-green-100">{t('completed.title')}</p>
              <p className="text-sm text-green-700 dark:text-green-300">{t('completed.description')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Dependency Validation Modal */}
      {validationModal.validation && (
        <DependencyModal
          open={validationModal.open}
          onClose={() => setValidationModal({ open: false, validation: null, phase: 0 })}
          validation={validationModal.validation}
          currentPhase={validationModal.phase}
        />
      )}
    </PageLayout>
  );
}

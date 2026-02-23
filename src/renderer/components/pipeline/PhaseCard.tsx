/**
 * PhaseCard Component
 * ====================
 * Individual phase card for the pipeline view
 */

import React from 'react';
import { Play, Check, X, Loader2, SkipForward, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { cn } from '../../lib/utils';
import type { PipelineProgress } from '../../../shared/types';

export interface PhaseCardProps {
  phase: PipelineProgress;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  onRun: () => void;
  disabled?: boolean;
  hasDataset?: boolean;
}

const statusIcons = {
  pending: Clock,
  running: Loader2,
  completed: Check,
  failed: X,
  cancelling: Loader2,
};

const statusColors = {
  pending: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
  running: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  completed: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  failed: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  cancelling: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
};

const iconColors = {
  pending: 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
  running: 'bg-blue-500 text-white',
  completed: 'bg-green-500 text-white',
  failed: 'bg-red-500 text-white',
  cancelling: 'bg-amber-500 text-white',
};

export function PhaseCard({
  phase,
  description,
  icon: Icon,
  enabled = true,
  onToggle,
  onRun,
  disabled = false,
  hasDataset = true,
}: PhaseCardProps) {
  const { t } = useTranslation('components');
  const StatusIcon = statusIcons[phase.status];
  const isDisabled = disabled || phase.status === 'running' || !hasDataset;

  return (
    <div
      className={cn(
        'border-2 rounded-xl p-4 transition-all',
        statusColors[phase.status],
        !enabled && 'opacity-50'
      )}
    >
      <div className="flex items-start gap-4">
        {/* Enable/Disable Checkbox */}
        {onToggle && hasDataset && (
          <label className="flex items-center cursor-pointer flex-shrink-0 pt-1">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600"
              disabled={disabled}
              aria-label={t('phaseCard.togglePhase', { phase: phase.phase })}
            />
          </label>
        )}

        {/* Phase Icon or Number */}
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
            iconColors[phase.status]
          )}
        >
          {phase.status === 'running' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : phase.status === 'completed' ? (
            <Check className="w-5 h-5" />
          ) : phase.status === 'failed' ? (
            <X className="w-5 h-5" />
          ) : Icon ? (
            <Icon className="w-5 h-5" />
          ) : (
            <span className="text-sm font-medium">{phase.phase}</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-slate-900 dark:text-white">
              {t('phaseCard.label', { phase: phase.phase, name: t(`common:phases.${phase.phase}.name`) })}
            </h3>
            {phase.status !== 'pending' && (
              <>
                <StatusIcon
                  className={cn(
                    'w-4 h-4',
                    phase.status === 'running' && 'animate-spin text-blue-600',
                    phase.status === 'completed' && 'text-green-600',
                    phase.status === 'failed' && 'text-red-600'
                  )}
                  aria-hidden="true"
                />
                <span className="sr-only">{t(`phaseCard.status.${phase.status}`)}</span>
              </>
            )}
          </div>

          {description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {description}
            </p>
          )}

          {/* Progress bar when running */}
          {phase.status === 'running' && (
            <div className="mt-3">
              <div className="relative h-6 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex items-center" role="progressbar" aria-valuenow={phase.progress} aria-valuemin={0} aria-valuemax={100} aria-label={t('phaseCard.progress', { phase: phase.phase, progress: phase.progress })}>
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full flex items-center justify-end pr-2 transition-all duration-300 shadow-sm"
                  style={{ width: `${phase.progress}%` }}
                >
                  {phase.progress > 8 && (
                    <span className="text-xs font-semibold text-white drop-shadow-md">
                      {phase.progress}%
                    </span>
                  )}
                </div>
                {phase.progress <= 8 && (
                  <span className="absolute left-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    {phase.progress}%
                  </span>
                )}
              </div>
              {phase.message && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {phase.message}
                </p>
              )}
            </div>
          )}

          {/* Error message */}
          {phase.error && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-2">
              {phase.error.includes('OPENAI_QUOTA_EXHAUSTED')
                ? t('phaseCard.quotaError')
                : `Error: ${phase.error}`
              }
            </p>
          )}
        </div>

        {/* Run Button */}
        {hasDataset && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRun}
            disabled={isDisabled || !enabled}
            className="flex-shrink-0"
          >
            <Play className="w-4 h-4 mr-1" />
            {t('phaseCard.run')}
          </Button>
        )}
      </div>
    </div>
  );
}

import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { SetupStep } from '../types';
import { getStepIndex } from '../types';

export function StepIndicator({ currentStep, llmChoice }: { currentStep: SetupStep; llmChoice: 'ollama' | 'openai' | null }) {
  const { t } = useTranslation('setup');
  const steps = [
    { key: 'welcome', label: t('steps.start') },
    { key: 'python-setup', label: t('steps.python') },
    { key: 'hardware-select', label: t('steps.hardware') },
    { key: 'llm-choice', label: t('steps.ai') },
    { key: 'model-select', label: t('steps.model') },
    { key: 'llm-setup', label: t('steps.config') },
    { key: 'models', label: t('steps.downloads') },
    { key: 'output-dir', label: t('steps.output') },
    { key: 'complete', label: t('steps.ready') },
  ];

  const currentIndex = steps.findIndex(s => s.key === currentStep);

  return (
    <div className="space-y-3">
      {/* Step progress bar */}
      <div className="flex items-center gap-1.5" role="list" aria-label={t('steps.progressLabel')}>
        {steps.map((step, index) => (
          <React.Fragment key={step.key}>
            <motion.div
              className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 cursor-default",
                index < currentIndex
                  ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200 dark:shadow-emerald-900/30"
                  : index === currentIndex
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md ring-2 ring-slate-900/10 dark:ring-white/20"
                    : "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
              )}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.03, duration: 0.25 }}
              role="listitem"
              aria-label={`${step.label}: ${index < currentIndex ? t('steps.completed') : index === currentIndex ? t('steps.current') : t('steps.pending')}`}
              aria-current={index === currentIndex ? 'step' : undefined}
            >
              {index < currentIndex ? (
                <Check className="w-4 h-4" aria-hidden="true" />
              ) : (
                <span aria-hidden="true">{index + 1}</span>
              )}
            </motion.div>
            {index < steps.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 rounded-full transition-colors duration-300",
                index < currentIndex 
                  ? "bg-emerald-400 dark:bg-emerald-500" 
                  : "bg-slate-200 dark:bg-slate-700"
              )} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Current step label */}
      <div className="text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('steps.progress', { current: currentIndex + 1, total: steps.length })} <span className="font-semibold text-slate-900 dark:text-white">{steps[currentIndex].label}</span>
        </p>
      </div>
    </div>
  );
}

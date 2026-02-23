import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  CheckCircle2, Loader2, Download, ArrowLeft,
  X, ChevronRight
} from 'lucide-react';
import { Button } from '../../ui/button';
import { cn } from '../../../lib/utils';
import type { OllamaDownloadProgress } from '../../../../shared/types';

export function OllamaSetupStep({
  progress,
  onStart,
  modelName,
  onBack,
}: {
  progress: OllamaDownloadProgress;
  onStart: () => void;
  modelName: string;
  onBack: () => void;
}) {
  const { t } = useTranslation('setup');
  const [started, setStarted] = useState(false);

  const handleStart = () => {
    setStarted(true);
    onStart();
  };

  const isComplete = progress.stage === 'complete';
  const isError = progress.stage === 'error';
  const isIdle = progress.stage === 'idle' || (!started);

  const stripPercentage = (message: string): string => {
    return message.replace(/\s*\d+(\.\d+)?%\s*$/, '').trim();
  };

  const getCleanStatus = () => {
    if (progress.stage === 'downloading') return stripPercentage(progress.message || t('ollamaSetup.downloadingOllama'));
    if (progress.stage === 'installing') return stripPercentage(progress.message || t('ollamaSetup.installingOllama'));
    if (progress.stage === 'starting') return stripPercentage(progress.message || t('ollamaSetup.startingOllama'));
    if (progress.stage === 'pulling-model') return stripPercentage(progress.message || t('ollamaSetup.downloadingModel', { model: modelName }));
    if (progress.stage === 'complete') return t('ollamaSetup.completed');
    if (progress.stage === 'error') return 'Error';
    return stripPercentage(progress.message || t('ollamaSetup.preparing'));
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      key="ollama-setup"
    >
      <div className="text-center mb-4 sm:mb-6">
        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-sky-100 to-blue-100 dark:from-sky-900/30 dark:to-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-5">
          <Download className="w-7 h-7 sm:w-8 sm:h-8 text-sky-600 dark:text-sky-400" />
        </div>
        <h2 className="text-xl sm:text-2xl font-semibold mb-2 text-slate-900 dark:text-white">
          {t('ollamaSetup.title')}
        </h2>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-md mx-auto px-4">
          {t('ollamaSetup.selectedModel')} <span className="font-medium text-slate-700 dark:text-slate-300">{modelName}</span>
        </p>
      </div>

      {isIdle ? (
        <div className="space-y-6">
          <div className="text-center py-4 sm:py-6">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-sky-100 to-blue-100 dark:from-sky-900/30 dark:to-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <Download className="w-7 h-7 sm:w-8 sm:h-8 text-sky-600 dark:text-sky-400" />
            </div>
            <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mb-4 sm:mb-6 max-w-sm mx-auto px-4">
              {t('ollamaSetup.description')}
            </p>
            <div className="flex items-center justify-center gap-4 text-xs text-slate-400 dark:text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-blue-400" />
                <span>Software</span>
              </div>
              <ChevronRight className="w-4 h-4" />
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span>{t('ollamaSetup.model')}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={onBack} className="text-slate-500 dark:text-slate-400">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('nav.back')}
            </Button>
            <Button onClick={handleStart}>
              <Download className="w-4 h-4 mr-2" />
              {t('ollamaSetup.startInstall')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="py-6">
          <div className="text-center mb-6">
            {isComplete ? (
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
            ) : isError ? (
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto">
                <X className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
            ) : (
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 text-slate-600 dark:text-slate-400 animate-spin" />
              </div>
            )}
          </div>
          
          <div className="max-w-md mx-auto">
            {isComplete ? (
              <motion.div 
                className="text-center space-y-4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                  {getCleanStatus()}
                </h3>
                <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  {t('ollamaSetup.successMessage')}
                </p>
              </motion.div>
            ) : (
              <>
                {progress.currentPhase && (
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <div className={cn(
                      'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all',
                      progress.currentPhase === 'software' 
                        ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 scale-105' 
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                    )}>
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        progress.currentPhase === 'software' ? 'bg-blue-500' : 'bg-green-500'
                      )} />
                      {t('ollamaSetup.software')}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                    <div className={cn(
                      'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all',
                      progress.currentPhase === 'model' 
                        ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 scale-105' 
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                    )}>
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        progress.currentPhase === 'model' ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                      )} />
                      {t('ollamaSetup.model')}
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{getCleanStatus()}</span>
                  <span className="text-sm font-bold text-blue-600">
                    {Math.round(progress.unifiedProgress ?? progress.progress)}%
                  </span>
                </div>
                
                {!isError && (
                  <div className="relative h-6 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress.unifiedProgress ?? progress.progress)} aria-valuemin={0} aria-valuemax={100} aria-label={getCleanStatus()}>
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full shadow-sm transition-all duration-300 ease-out",
                        progress.currentPhase === 'model'
                          ? "bg-gradient-to-r from-blue-400 via-green-400 to-green-500"
                          : "bg-gradient-to-r from-blue-400 to-blue-500"
                      )}
                      style={{ width: `${Math.min(100, progress.unifiedProgress ?? progress.progress)}%` }}
                    />
                    {progress.currentPhase && (
                      <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/50 dark:bg-slate-600/50" />
                    )}
                  </div>
                )}
              </>
            )}
            
            {progress.error && (
              <p className="mt-3 text-sm text-red-500 text-center">{progress.error}</p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

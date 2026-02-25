import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '../../ui/button';
import logoPrimaryHorizontal from '../../../assets/logos/logo-primary-horizontal.png';
import logoWhiteHorizontal from '../../../assets/logos/logo-white-horizontal.png';

export function CompleteStep({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation('setup');
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinish = async () => {
    setIsFinishing(true);
    setError(null);
    try {
      await onFinish();
    } catch (err) {
      console.error('[CompleteStep] Error finishing setup:', err);
      setError(err instanceof Error ? err.message : String(err));
      setIsFinishing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="text-center py-4 sm:py-8"
      key="complete"
    >
      {/* Logo */}
      <div className="mx-auto mb-6">
        <img
          src={logoPrimaryHorizontal}
          alt="TourlyAI"
          className="w-full max-w-[280px] h-auto object-contain mx-auto dark:hidden"
        />
        <img
          src={logoWhiteHorizontal}
          alt="TourlyAI"
          className="w-full max-w-[280px] h-auto object-contain mx-auto hidden dark:block"
        />
      </div>

      {/* Success badge with animated ring */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
        className="relative mx-auto w-28 h-28 mb-6"
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-200 to-green-200 dark:from-emerald-900/40 dark:to-green-900/40 animate-pulse" />
        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-emerald-100 to-green-50 dark:from-emerald-900/30 dark:to-green-900/20 flex items-center justify-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-600 dark:text-emerald-400" />
        </div>
      </motion.div>

      {/* Title with sparkles */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
          {t('complete.title')}
        </h2>
        <p className="text-base sm:text-lg text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto px-4 leading-relaxed">
          {t('complete.description')}
        </p>
      </motion.div>

      {/* CTA button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Button 
          size="lg" 
          onClick={handleFinish} 
          disabled={isFinishing}
          className="px-8 sm:px-10 py-3 text-base font-medium shadow-lg hover:shadow-xl transition-shadow"
        >
          {isFinishing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {t('complete.starting')}
            </>
          ) : (
            <>
              {t('complete.startAnalyzing')}
              <ArrowRight className="w-5 h-5 ml-2" />
            </>
          )}
        </Button>

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300 max-w-md mx-auto flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowRight, AlertCircle, Palette, Globe } from 'lucide-react';
import { Button } from '../../ui/button';
import { ThemeSelector } from '../../settings/ThemeSelector';
import { LanguageSelector } from '../../settings/LanguageSelector';
import logoPrimaryHorizontal from '../../../assets/logos/logo-primary-horizontal.png';
import logoWhiteHorizontal from '../../../assets/logos/logo-white-horizontal.png';

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation('setup');
  return (
    <motion.div
      className="py-4 sm:py-6"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      key="welcome"
    >
      <motion.div 
        className="mx-auto mb-4 sm:mb-6 text-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <img
          src={logoPrimaryHorizontal}
          alt="TourlyAI"
          className="w-full max-w-xs h-auto object-contain mx-auto dark:hidden"
        />
        <img
          src={logoWhiteHorizontal}
          alt="TourlyAI"
          className="w-full max-w-xs h-auto object-contain mx-auto hidden dark:block"
        />
      </motion.div>

      <motion.div
        className="text-center mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">{t('welcome.title')}</h1>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-lg mx-auto leading-relaxed px-4">
          {t('welcome.description')}
        </p>
      </motion.div>

      <motion.div
        className="space-y-4 max-w-lg mx-auto"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {/* Theme Selection */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            <h3 className="font-medium text-sm text-slate-900 dark:text-white">
              {t('welcome.themeTitle')}
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            {t('welcome.themeDescription')}
          </p>
          <ThemeSelector />
        </div>

        {/* Language Selection */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            <h3 className="font-medium text-sm text-slate-900 dark:text-white">
              {t('welcome.languageTitle')}
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            {t('welcome.languageDescription')}
          </p>
          <LanguageSelector />
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {t('welcome.changeLater')}
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="flex justify-end mt-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Button size="lg" onClick={onNext} className="px-8 sm:px-10 py-3 text-base font-medium shadow-lg hover:shadow-xl transition-shadow">
          {t('welcome.start')}
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </motion.div>
    </motion.div>
  );
}

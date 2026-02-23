import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Cloud, Loader2, ArrowLeft, ArrowRight, Settings } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';

export function OpenAISetupStep({
  apiKey,
  onKeyChange,
  error,
  isValidating,
  onSubmit,
  modelName,
  onBack,
}: {
  apiKey: string;
  onKeyChange: (key: string) => void;
  error: string;
  isValidating: boolean;
  onSubmit: () => void;
  modelName: string;
  onBack: () => void;
}) {
  const { t } = useTranslation('setup');
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      key="openai-setup"
    >
      <div className="text-center mb-4 sm:mb-6">
        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-900/30 dark:to-emerald-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-5">
          <Cloud className="w-7 h-7 sm:w-8 sm:h-8 text-teal-600 dark:text-teal-400" />
        </div>
        <h2 className="text-xl sm:text-2xl font-semibold mb-2 text-slate-900 dark:text-white">
          {t('openaiSetup.title')}
        </h2>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-md mx-auto px-4">
          {t('ollamaSetup.selectedModel')} <span className="font-medium text-slate-700 dark:text-slate-300">{modelName}</span>
        </p>
        <div className="flex items-center justify-center gap-1.5 mt-2 text-xs text-slate-400 dark:text-slate-500">
          <Settings className="w-3 h-3" />
          <span>{t('ollamaSetup.changeModelLater')}</span>
        </div>
      </div>

      <div className="space-y-4 max-w-md mx-auto">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            API Key
          </label>
          <Input
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => onKeyChange(e.target.value)}
            className={error ? 'border-red-300 focus:border-red-500' : ''}
          />
          {error && <p className="text-red-500 text-sm mt-1.5">{error}</p>}
        </div>

        <p className="text-sm text-slate-400 dark:text-slate-500">
          {t('openaiSetup.apiKeyHint')}{' '}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-600 dark:text-slate-400 underline hover:text-slate-800 dark:hover:text-slate-200"
          >
            platform.openai.com
          </a>
        </p>
      </div>

      <div className="flex justify-between mt-6">
        <Button variant="ghost" onClick={onBack} className="text-slate-500 dark:text-slate-400">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('nav.back')}
        </Button>
        <Button
          onClick={onSubmit}
          disabled={!apiKey || isValidating}
        >
          {isValidating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('openaiSetup.validating')}
            </>
          ) : (
            <>
              {t('nav.next')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}

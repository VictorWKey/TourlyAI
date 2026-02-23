/**
 * SetupWizard - First-run setup wizard component
 * ===============================================
 * Multi-step wizard for initial app configuration including:
 * - System requirements check
 * - LLM provider selection (Ollama vs OpenAI)
 * - Ollama model selection with hardware recommendations
 * - OpenAI model selection with recommendations
 * - Ollama installation and model download
 * - OpenAI API key validation
 * - ML models download
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import type { OllamaDownloadProgress } from '../../../shared/types';

import { STEP_ORDER, getStepIndex, getRecommendedOllamaModel } from './types';
import type { SetupStep, HardwareConfig, SetupWizardProps } from './types';
import {
  StepIndicator,
  WelcomeStep,
  PythonSetupStep,
  LLMChoiceStep,
  OllamaSetupStep,
  OpenAISetupStep,
  OutputDirStep,
  CompleteStep,
} from './steps';

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { t } = useTranslation('setup');
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [llmChoice, setLlmChoice] = useState<'ollama' | 'openai' | null>(null);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>('llama3.1:8b');
  const [selectedOpenAIModel, setSelectedOpenAIModel] = useState<string>('gpt-5-nano');
  const [hardwareConfig, setHardwareConfig] = useState<HardwareConfig>({
    cpu: 'mid',
    ram: 8,
    gpu: 'none',
  });
  const [ollamaProgress, setOllamaProgress] = useState<OllamaDownloadProgress>({
    stage: 'idle',
    progress: 0,
    message: '',
  });
  const [openaiKey, setOpenaiKey] = useState('');
  const [keyError, setKeyError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [outputDir, setOutputDir] = useState<string>('');
  const [defaultOutputDir, setDefaultOutputDir] = useState<string>('');

  // Fetch default output dir on mount so outputDir is never empty
  useEffect(() => {
    window.electronAPI.app.getPythonDataDir().then((dir: string) => {
      const parentDir = dir.replace(/[\\/]data$/, '');
      setDefaultOutputDir(parentDir);
    }).catch(() => { /* ignore */ });

    // Silent background hardware detection for LLM recommendations
    window.electronAPI.setup.detectHardware().then((result: { cpu: { tier: 'low' | 'mid' | 'high' }; ram: { totalGB: number }; gpu: { type: 'none' | 'integrated' | 'dedicated'; vramGB?: number } }) => {
      setHardwareConfig({
        cpu: result.cpu.tier,
        ram: result.ram.totalGB,
        gpu: result.gpu.type,
        vram: result.gpu.vramGB || 0,
      });
    }).catch(() => { /* use defaults */ });
  }, []);

  // Listen for progress updates
  useEffect(() => {
    const handleOllamaProgress = (_: unknown, data: OllamaDownloadProgress) => {
      setOllamaProgress(data);
      if (data.stage === 'complete') {
        setTimeout(() => setCurrentStep('output-dir'), 1000);
      }
    };

    window.electronAPI.setup.onOllamaProgress(handleOllamaProgress);

    return () => {
      window.electronAPI.setup.offOllamaProgress();
    };
  }, []);

  // Navigation handlers
  const goBack = useCallback(() => {
    const currentIndex = getStepIndex(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEP_ORDER[currentIndex - 1]);
    }
  }, [currentStep]);

  const handleLLMChoice = useCallback(async (choice: 'ollama' | 'openai') => {
    setLlmChoice(choice);
    await window.electronAPI.setup.setLLMProvider(choice);
    // Auto-select the best model for the detected hardware (user can change in Settings later)
    if (choice === 'ollama') {
      setSelectedOllamaModel(getRecommendedOllamaModel(hardwareConfig));
    } else {
      setSelectedOpenAIModel('gpt-5-nano');
    }
    // Skip model selection — go directly to setup
    setCurrentStep('llm-setup');
  }, []);

  // Unified Ollama installation: software + model in one seamless process
  // Installation is NOT complete until a model is successfully installed
  const handleOllamaSetup = useCallback(async () => {
    const modelToUse = selectedOllamaModel;
    
    // Check if already fully ready (installed + running + has this model)
    const readyStatus = await window.electronAPI.setup.checkOllamaFullyReady();
    
    if (readyStatus.ready) {
      // Check if the specific model is available
      const hasModel = await window.electronAPI.setup.hasOllamaModel(modelToUse);
      if (hasModel) {
        // IMPORTANT: Always persist the selected model to config, even when
        // Ollama already has it. Without this, the config retains the default
        // 'llama3.2:3b' and the app tries to use a model that was never installed.
        await window.electronAPI.settings.set('llm.localModel', modelToUse);
        await window.electronAPI.settings.set('llm.mode', 'local');
        setOllamaProgress({ 
          stage: 'complete', 
          progress: 100, 
          message: t('ollamaSetup.allReady'),
          unifiedProgress: 100,
          currentPhase: 'model'
        });
        // Silently copy bundled models to userData
        window.electronAPI.setup.checkModels().catch(() => {});
        setTimeout(() => setCurrentStep('output-dir'), 500);
        return;
      }
      // Model not found, just pull it (already installed)
      setOllamaProgress({ 
        stage: 'pulling-model', 
        progress: 0, 
        message: t('ollamaSetup.downloadingModelProgress', { model: modelToUse }),
        unifiedProgress: 50,
        currentPhase: 'model'
      });
      await window.electronAPI.setup.pullOllamaModel(modelToUse);
    } else {
      // Use unified installation - software + model in one step
      // Progress callback will show unified progress bar
      setOllamaProgress({ 
        stage: 'downloading', 
        progress: 0, 
        message: t('ollamaSetup.startingUnified'),
        unifiedProgress: 0,
        currentPhase: 'software'
      });
      
      const success = await window.electronAPI.setup.installOllamaWithModel(modelToUse);
      
      if (!success) {
        setOllamaProgress({ 
          stage: 'error', 
          progress: 0, 
          message: t('ollamaSetup.installFailed'),
          error: t('ollamaSetup.installIncomplete'),
          unifiedProgress: 0,
          currentPhase: 'software'
        });
        return;
      }
    }
    
    // Always ensure the selected model is saved to config after successful setup
    await window.electronAPI.settings.set('llm.localModel', modelToUse);
    await window.electronAPI.settings.set('llm.mode', 'local');
  }, [selectedOllamaModel]);

  const handleOpenAISetup = useCallback(async () => {
    setIsValidating(true);
    setKeyError('');

    try {
      const result = await window.electronAPI.setup.validateOpenAIKey(openaiKey);
      
      if (result.valid) {
        const modelToUse = selectedOpenAIModel;
        await window.electronAPI.settings.set('llm.apiKey', openaiKey);
        await window.electronAPI.settings.set('llm.apiModel', modelToUse);
        // Ensure LLM mode is set to 'api' so the app uses OpenAI
        await window.electronAPI.settings.set('llm.mode', 'api');
        await window.electronAPI.settings.set('llm.apiProvider', 'openai');
        setCurrentStep('output-dir');
      } else {
        // Use errorCode for specific, user-friendly messages
        if (result.errorCode === 'no_credits') {
          setKeyError(t('openaiSetup.noCredits'));
        } else {
          setKeyError(result.error || 'Invalid API key');
        }
      }
    } catch (error) {
      setKeyError('Failed to validate API key');
    } finally {
      setIsValidating(false);
    }
  }, [openaiKey, selectedOpenAIModel]);

  const handleOutputDirSelect = useCallback(async () => {
    const dir = await window.electronAPI.files.selectDirectory();
    if (dir) {
      setOutputDir(dir);
    }
  }, []);

  const handleOutputDirNext = useCallback(async () => {
    // Save the output directory: use selected dir, or fall back to default
    const dirToSave = outputDir || defaultOutputDir;
    if (dirToSave) {
      await window.electronAPI.settings.set('app.outputDir', dirToSave);
    }
    setCurrentStep('complete');
  }, [outputDir, defaultOutputDir]);

  const handleComplete = useCallback(async () => {
    await window.electronAPI.setup.complete();
    onComplete();
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <motion.div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/80 w-full max-w-3xl max-h-[90vh] flex flex-col"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Progress indicator */}
        <div className="px-4 sm:px-8 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <StepIndicator currentStep={currentStep} llmChoice={llmChoice} />
        </div>

        {/* Content with scroll */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6">
          <AnimatePresence mode="wait">
            {/* Step 1: Welcome */}
            {currentStep === 'welcome' && (
              <WelcomeStep onNext={() => setCurrentStep('python-setup')} />
            )}

            {/* Step 2: Python Setup */}
            {currentStep === 'python-setup' && (
              <PythonSetupStep 
                onNext={() => setCurrentStep('llm-choice')}
                onBack={goBack}
              />
            )}

            {/* Step 3: LLM Choice */}
            {currentStep === 'llm-choice' && (
              <LLMChoiceStep 
                onSelect={handleLLMChoice} 
                hardwareConfig={hardwareConfig}
                onBack={goBack}
              />
            )}

            {/* Step 4: LLM Setup */}
            {currentStep === 'llm-setup' && (
              llmChoice === 'ollama' ? (
                <OllamaSetupStep
                  progress={ollamaProgress}
                  onStart={handleOllamaSetup}
                  modelName={selectedOllamaModel}
                  onBack={goBack}
                />
              ) : (
                <OpenAISetupStep
                  apiKey={openaiKey}
                  onKeyChange={setOpenaiKey}
                  error={keyError}
                  isValidating={isValidating}
                  onSubmit={handleOpenAISetup}
                  modelName={selectedOpenAIModel}
                  onBack={goBack}
                />
              )
            )}

            {/* Step 5: Output Directory */}
            {currentStep === 'output-dir' && (
              <OutputDirStep
                outputDir={outputDir}
                onSelectDir={handleOutputDirSelect}
                onNext={handleOutputDirNext}
                onBack={goBack}
              />
            )}

            {/* Step 7: Complete */}
            {currentStep === 'complete' && (
              <CompleteStep onFinish={handleComplete} />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

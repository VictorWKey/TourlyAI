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
import type { OllamaDownloadProgress, ModelDownloadProgress } from '../../../shared/types';

import { STEP_ORDER, getStepIndex } from './types';
import type { SetupStep, HardwareConfig, SetupWizardProps } from './types';
import {
  StepIndicator,
  WelcomeStep,
  PythonSetupStep,
  HardwareSelectStep,
  LLMChoiceStep,
  OllamaModelSelectStep,
  OpenAIModelSelectStep,
  OllamaSetupStep,
  OpenAISetupStep,
  ModelDownloadStep,
  OutputDirStep,
  CompleteStep,
} from './steps';

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { t } = useTranslation('setup');
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [llmChoice, setLlmChoice] = useState<'ollama' | 'openai' | null>(null);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>('llama3.1:8b');
  const [customOllamaModel, setCustomOllamaModel] = useState<string>('');
  const [useCustomOllamaModel, setUseCustomOllamaModel] = useState(false);
  const [selectedOpenAIModel, setSelectedOpenAIModel] = useState<string>('gpt-5-mini');
  const [customOpenAIModel, setCustomOpenAIModel] = useState<string>('');
  const [useCustomOpenAIModel, setUseCustomOpenAIModel] = useState(false);
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
  const [modelProgress, setModelProgress] = useState<Record<string, number>>({});
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
  }, []);

  // Listen for progress updates
  useEffect(() => {
    const handleOllamaProgress = (_: unknown, data: OllamaDownloadProgress) => {
      setOllamaProgress(data);
      if (data.stage === 'complete') {
        setTimeout(() => setCurrentStep('models'), 1000);
      }
    };

    const handleModelProgress = (_: unknown, data: ModelDownloadProgress) => {
      setModelProgress((prev) => ({ ...prev, [data.model]: data.progress }));
    };

    window.electronAPI.setup.onOllamaProgress(handleOllamaProgress);
    window.electronAPI.setup.onModelProgress(handleModelProgress);

    return () => {
      window.electronAPI.setup.offOllamaProgress();
      window.electronAPI.setup.offModelProgress();
    };
  }, []);

  // Navigation handlers
  const goBack = useCallback(() => {
    const currentIndex = getStepIndex(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEP_ORDER[currentIndex - 1]);
    }
  }, [currentStep]);

  const handleHardwareSelect = useCallback((config: HardwareConfig) => {
    setHardwareConfig(config);
    
    // Pre-select the recommended Ollama model based on detected hardware
    const totalRam = config.ram;
    const hasGPU = config.gpu === 'dedicated';
    const vram = config.vram || 0;
    
    if (totalRam >= 32 || (hasGPU && vram >= 12)) {
      setSelectedOllamaModel('deepseek-r1:14b');
    } else if (totalRam >= 24 || (hasGPU && vram >= 10)) {
      setSelectedOllamaModel('deepseek-r1:8b');
    } else if (totalRam >= 16 || (hasGPU && vram >= 8)) {
      setSelectedOllamaModel('llama3.1:8b');
    } else if (totalRam >= 12 || (hasGPU && vram >= 6)) {
      setSelectedOllamaModel('mistral:7b');
    } else {
      setSelectedOllamaModel('mistral:7b');
    }
    
    setCurrentStep('llm-choice');
  }, []);

  const handleLLMChoice = useCallback(async (choice: 'ollama' | 'openai') => {
    setLlmChoice(choice);
    await window.electronAPI.setup.setLLMProvider(choice);
    setCurrentStep('model-select');
  }, []);

  const handleModelSelect = useCallback(() => {
    setCurrentStep('llm-setup');
  }, []);

  // Unified Ollama installation: software + model in one seamless process
  // Installation is NOT complete until a model is successfully installed
  const handleOllamaSetup = useCallback(async () => {
    const modelToUse = useCustomOllamaModel ? customOllamaModel : selectedOllamaModel;
    
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
        setTimeout(() => setCurrentStep('models'), 500);
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
  }, [selectedOllamaModel, customOllamaModel, useCustomOllamaModel]);

  const handleOpenAISetup = useCallback(async () => {
    setIsValidating(true);
    setKeyError('');

    try {
      const result = await window.electronAPI.setup.validateOpenAIKey(openaiKey);
      
      if (result.valid) {
        const modelToUse = useCustomOpenAIModel ? customOpenAIModel : selectedOpenAIModel;
        await window.electronAPI.settings.set('llm.apiKey', openaiKey);
        await window.electronAPI.settings.set('llm.apiModel', modelToUse);
        // Ensure LLM mode is set to 'api' so the app uses OpenAI
        await window.electronAPI.settings.set('llm.mode', 'api');
        await window.electronAPI.settings.set('llm.apiProvider', 'openai');
        setCurrentStep('models');
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
  }, [openaiKey, selectedOpenAIModel, customOpenAIModel, useCustomOpenAIModel]);

  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleModelDownload = useCallback(async () => {
    setIsLoading(true);
    setDownloadError(null);
    try {
      const result = await window.electronAPI.setup.downloadModels();
      if (result.success) {
        setCurrentStep('output-dir');
      } else {
        const errorDetail = result.error ? `: ${result.error}` : '';
        setDownloadError(`${t('modelDownload.downloadFailed')}${errorDetail}`);
      }
    } catch (error) {
      console.error('Model download failed:', error);
      const msg = error instanceof Error ? error.message : String(error);
      setDownloadError(`${t('modelDownload.unexpectedError')} ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
                onNext={() => setCurrentStep('hardware-select')}
                onBack={goBack}
              />
            )}

            {/* Step 3: Hardware Selection */}
            {currentStep === 'hardware-select' && (
              <HardwareSelectStep
                config={hardwareConfig}
                onSelect={handleHardwareSelect}
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

            {/* Step 4: Model Selection */}
            {currentStep === 'model-select' && (
              llmChoice === 'ollama' ? (
                <OllamaModelSelectStep
                  selectedModel={selectedOllamaModel}
                  onSelectModel={setSelectedOllamaModel}
                  customModel={customOllamaModel}
                  onCustomModelChange={setCustomOllamaModel}
                  useCustom={useCustomOllamaModel}
                  onUseCustomChange={setUseCustomOllamaModel}
                  hardwareConfig={hardwareConfig}
                  onNext={handleModelSelect}
                  onBack={goBack}
                />
              ) : (
                <OpenAIModelSelectStep
                  selectedModel={selectedOpenAIModel}
                  onSelectModel={setSelectedOpenAIModel}
                  customModel={customOpenAIModel}
                  onCustomModelChange={setCustomOpenAIModel}
                  useCustom={useCustomOpenAIModel}
                  onUseCustomChange={setUseCustomOpenAIModel}
                  onNext={handleModelSelect}
                  onBack={goBack}
                />
              )
            )}

            {/* Step 5: LLM Setup */}
            {currentStep === 'llm-setup' && (
              llmChoice === 'ollama' ? (
                <OllamaSetupStep
                  progress={ollamaProgress}
                  onStart={handleOllamaSetup}
                  modelName={useCustomOllamaModel ? customOllamaModel : selectedOllamaModel}
                  onBack={goBack}
                />
              ) : (
                <OpenAISetupStep
                  apiKey={openaiKey}
                  onKeyChange={setOpenaiKey}
                  error={keyError}
                  isValidating={isValidating}
                  onSubmit={handleOpenAISetup}
                  modelName={useCustomOpenAIModel ? customOpenAIModel : selectedOpenAIModel}
                  onBack={goBack}
                />
              )
            )}

            {/* Step 6: Model Downloads */}
            {currentStep === 'models' && (
              <ModelDownloadStep
                progress={modelProgress}
                onStart={handleModelDownload}
                isLoading={isLoading}
                onBack={goBack}
                onNext={() => setCurrentStep('output-dir')}
                error={downloadError}
              />
            )}

            {/* Step 7: Output Directory */}
            {currentStep === 'output-dir' && (
              <OutputDirStep
                outputDir={outputDir}
                onSelectDir={handleOutputDirSelect}
                onNext={handleOutputDirNext}
                onBack={goBack}
              />
            )}

            {/* Step 8: Complete */}
            {currentStep === 'complete' && (
              <CompleteStep onFinish={handleComplete} />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

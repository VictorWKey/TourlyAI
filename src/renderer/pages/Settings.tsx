/**
 * Settings Page
 * ==============
 * Comprehensive application configuration with all setup options
 * Allows users to modify any configuration that was set during initial setup
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings as SettingsIcon,
  Cpu,
  Key,
  Folder,
  AlertCircle,
  RefreshCw,
  Download,
  Trash2,
  Play,
  Square,
  HardDrive,
  Zap,
  ChevronDown,
  ChevronRight,
  Server,
  Package,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  X,
  Ban,
  Loader2,
  ShieldAlert,
  FileText,
} from 'lucide-react';
import { PageLayout } from '../components/layout';
import { Button, Input } from '../components/ui';
import { ThemeSelector } from '../components/settings/ThemeSelector';
import { LanguageSelector } from '../components/settings/LanguageSelector';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useOllama } from '../hooks/useOllama';
import { useDataStore } from '../stores/dataStore';
import { usePipelineStore } from '../stores/pipelineStore';
// Phase7ConfigDialog removed - Phase 7 now only generates structured summaries
import type {
  ModelsStatus,
  ModelInfo,
  OllamaDownloadProgress,
  ModelDownloadProgress,
  PythonSetupStatus,
  HardwareDetectionResult,
  LLMMode,
} from '../../shared/types';

type SettingsTab = 'llm' | 'ollama' | 'models' | 'advanced';

// Helper function to strip percentage from message (e.g., "Downloading... 82%" -> "Downloading...")
const stripPercentageFromMessage = (message: string): string => {
  return message.replace(/\s*\d+(\.\d+)?%\s*$/, '').trim();
};

// Recommended Ollama models with descriptions
const RECOMMENDED_MODELS = [
  { name: 'llama3.1:8b', recommended: true },
  { name: 'deepseek-r1:14b', recommended: false },
  { name: 'deepseek-r1:8b', recommended: false },
  { name: 'mistral:7b', recommended: false },
  { name: 'llama3.2:3b', recommended: false },
  { name: 'llama3.2:1b', recommended: false },
  { name: 'gemma2:2b', recommended: false },
  { name: 'phi3:mini', recommended: false },
  { name: 'neural-chat:7b', recommended: false },
];

export function Settings() {
  const { t } = useTranslation('settings');
  const [activeTab, setActiveTab] = useState<SettingsTab>('llm');
  const { llm, setLLMConfig, outputDir, setOutputDir } = useSettingsStore();
  const {
    isRunning: ollamaRunning,
    models,
    currentModel,
    isLoading: ollamaLoading,
    error: ollamaError,
    checkStatus,
    deleteModel,
    selectModel,
  } = useOllama();

  // State
  const [apiKey, setApiKey] = useState(llm.apiKey || '');
  const [newModelName, setNewModelName] = useState('');
  const [isPullingModel, setIsPullingModel] = useState(false);
  const [showModelSelectionDialog, setShowModelSelectionDialog] = useState(false);
  const [selectedModelForInstall, setSelectedModelForInstall] = useState<string>('llama3.1:8b');
  const [pullProgress, setPullProgress] = useState<OllamaDownloadProgress | null>(null);
  
  // API Key validation dialog state
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [pendingApiKey, setPendingApiKey] = useState('');
  const [isValidatingApiKey, setIsValidatingApiKey] = useState(false);
  const [apiKeyValidationError, setApiKeyValidationError] = useState<string | null>(null);
  
  // No LLM confirmation dialog state
  const [showNoLLMDialog, setShowNoLLMDialog] = useState(false);
  
  // Ollama installation state
  const [ollamaStatus, setOllamaStatus] = useState<{
    installed: boolean;
    running: boolean;
    version: string | null;
  } | null>(null);
  const [isInstallingOllama, setIsInstallingOllama] = useState(false);
  const [isUninstallingOllama, setIsUninstallingOllama] = useState(false);
  
  // HuggingFace models state
  const [modelsStatus, setModelsStatus] = useState<ModelsStatus | null>(null);
  const [requiredModels, setRequiredModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isDownloadingModels, setIsDownloadingModels] = useState(false);
  const [modelDownloadProgress, setModelDownloadProgress] = useState<ModelDownloadProgress | null>(null);
  
  // Python state
  const [pythonStatus, setPythonStatus] = useState<PythonSetupStatus | null>(null);
  const [isSettingUpPython, setIsSettingUpPython] = useState(false);
  const [pythonSetupProgress, setPythonSetupProgress] = useState<string>('');
  
  // Hardware state
  const [hardware, setHardware] = useState<HardwareDetectionResult | null>(null);
  const [isDetectingHardware, setIsDetectingHardware] = useState(false);
  
  // Dialog state
  type DialogType = 'confirm' | 'alert';
  type DialogVariant = 'danger' | 'warning' | 'info';
  interface DialogConfig {
    isOpen: boolean;
    type: DialogType;
    variant: DialogVariant;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  }
  const [dialog, setDialog] = useState<DialogConfig>({
    isOpen: false,
    type: 'confirm',
    variant: 'info',
    title: '',
    message: '',
  });

  const showDialog = (config: Omit<DialogConfig, 'isOpen'>) => {
    setDialog({ ...config, isOpen: true });
  };

  const closeDialog = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  };

  const handleDialogConfirm = () => {
    if (dialog.onConfirm) {
      dialog.onConfirm();
    }
    closeDialog();
  };

  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    ollamaInstall: false,
    recommendedModels: true,
    customModel: false,
  });

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.electronAPI.settings.getAll();
        if (settings) {
          setLLMConfig(settings.llm);
          setOutputDir(settings.app.outputDir);
          if (settings.llm.apiKey) {
            setApiKey(settings.llm.apiKey);
          }
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, [setLLMConfig, setOutputDir]);

  // Check Ollama installation status
  const checkOllamaInstallation = useCallback(async () => {
    try {
      const status = await window.electronAPI.setup.checkOllama();
      setOllamaStatus(status);
    } catch (error) {
      console.error('Failed to check Ollama status:', error);
    }
  }, []);

  // Check HuggingFace models status (with retry on failure)
  const checkHuggingFaceModels = useCallback(async (retryCount = 0) => {
    setIsLoadingModels(true);
    try {
      const [status, models] = await Promise.all([
        window.electronAPI.setup.checkModels(),
        window.electronAPI.setup.getRequiredModels(),
      ]);
      setModelsStatus(status);
      setRequiredModels(models);
      setIsLoadingModels(false);
    } catch (error) {
      console.error('Failed to check models status:', error);
      // Retry up to 2 times with increasing delay (bridge may be restarting)
      if (retryCount < 2) {
        const delay = (retryCount + 1) * 2000;
        console.log(`[Settings] Retrying model check in ${delay}ms (attempt ${retryCount + 2}/3)...`);
        setTimeout(() => checkHuggingFaceModels(retryCount + 1), delay);
        // Keep isLoadingModels=true during retry
      } else {
        setIsLoadingModels(false);
      }
    }
  }, []);

  // Check Python status
  const checkPythonStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.setup.checkPython();
      setPythonStatus(status);
    } catch (error) {
      console.error('Failed to check Python status:', error);
    }
  }, []);

  // Detect hardware
  const detectHardware = useCallback(async () => {
    setIsDetectingHardware(true);
    try {
      const hw = await window.electronAPI.setup.detectHardware();
      setHardware(hw);
    } catch (error) {
      console.error('Failed to detect hardware:', error);
    } finally {
      setIsDetectingHardware(false);
    }
  }, []);

  // Load instant initial values from setup state (electron-store, no Python needed)
  useEffect(() => {
    const loadInitialModelsState = async () => {
      try {
        const [setupState, models] = await Promise.all([
          window.electronAPI.setup.getState(),
          window.electronAPI.setup.getRequiredModels(),
        ]);
        // Use setup state as immediate initial values
        if (setupState?.modelsDownloaded) {
          setModelsStatus(setupState.modelsDownloaded as ModelsStatus);
        }
        if (models?.length) {
          setRequiredModels(models);
        }
      } catch (error) {
        console.error('Failed to load initial models state:', error);
      }
    };
    loadInitialModelsState();
  }, []);

  // Load status on mount and tab change
  useEffect(() => {
    checkOllamaInstallation();
    checkHuggingFaceModels();
    checkPythonStatus();
    detectHardware();
  }, [checkOllamaInstallation, checkHuggingFaceModels, checkPythonStatus, detectHardware]);

  // Listen for progress events
  useEffect(() => {
    window.electronAPI.setup.onOllamaProgress((_, data) => {
      const progress = data as OllamaDownloadProgress;
      setPullProgress(progress);
    });

    window.electronAPI.setup.onModelProgress((_, data) => {
      setModelDownloadProgress(data as ModelDownloadProgress);
    });

    return () => {
      window.electronAPI.setup.offOllamaProgress();
      window.electronAPI.setup.offModelProgress();
    };
  }, []);

  // Track whether initial settings have been loaded to skip auto-save on mount
  const settingsLoadedRef = useRef(false);
  const isInitialMountRef = useRef(true);

  // Mark settings as loaded after the loadSettings effect completes
  useEffect(() => {
    // Skip the very first render cycle to let loadSettings populate state
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      // Wait for loadSettings + debounce to settle before enabling auto-save
      const timer = setTimeout(() => {
        settingsLoadedRef.current = true;
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Auto-save settings whenever they change (but NOT on initial mount)
  useEffect(() => {
    // Skip auto-save until initial settings have been loaded
    if (!settingsLoadedRef.current) {
      return;
    }

    const saveSettings = async () => {
      try {
        await window.electronAPI.settings.set('llm', {
          ...llm,
          apiKey: apiKey || undefined,
        });
        await window.electronAPI.settings.set('app', {
          language: 'es',
          outputDir,
        });
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    };

    // Debounce the save to avoid too many rapid saves
    const timer = setTimeout(saveSettings, 500);
    return () => clearTimeout(timer);
  }, [llm, apiKey, outputDir]);

  const handleSelectOutputDir = async () => {
    const dir = await window.electronAPI.files.selectDirectory();
    if (dir) {
      setOutputDir(dir);
      // Clear stale chartsPath so Visualizations re-derives it from the new output directory
      useDataStore.getState().setOutputPaths({ charts: '' });
    }
  };

  // Handle LLM mode change with validation
  const handleModeChange = (newMode: LLMMode) => {
    if (newMode === llm.mode) return;
    
    if (newMode === 'api') {
      // Show API key dialog for validation
      setPendingApiKey(apiKey || '');
      setApiKeyValidationError(null);
      setShowApiKeyDialog(true);
    } else if (newMode === 'none') {
      // Show confirmation dialog for No LLM mode
      setShowNoLLMDialog(true);
    } else {
      // Switching to local - re-enable LLM phases if coming from 'none'
      if (llm.mode === 'none') {
        usePipelineStore.getState().setPhaseEnabled(6, true);
        usePipelineStore.getState().setPhaseEnabled(7, true);
        usePipelineStore.getState().setPhaseEnabled(8, true);
      }
      setLLMConfig({ mode: newMode });
    }
  };

  // Validate and apply API key
  const handleApiKeyValidation = async () => {
    if (!pendingApiKey.trim()) {
      setApiKeyValidationError(t('apiValidation.invalidInput'));
      return;
    }
    
    setIsValidatingApiKey(true);
    setApiKeyValidationError(null);
    
    try {
      const result = await window.electronAPI.setup.validateOpenAIKey(pendingApiKey.trim());
      if (result.valid) {
        // Key is valid - switch to API mode
        setApiKey(pendingApiKey.trim());
        // Re-enable LLM phases if coming from 'none' mode
        if (llm.mode === 'none') {
          usePipelineStore.getState().setPhaseEnabled(6, true);
          usePipelineStore.getState().setPhaseEnabled(7, true);
          usePipelineStore.getState().setPhaseEnabled(8, true);
        }
        setLLMConfig({ mode: 'api', apiKey: pendingApiKey.trim() });
        setShowApiKeyDialog(false);
      } else {
        // Use errorCode for specific, user-friendly messages
        if (result.errorCode === 'no_credits') {
          setApiKeyValidationError(t('apiValidation.noCredits'));
        } else {
          setApiKeyValidationError(result.error || t('apiValidation.invalidKey'));
        }
      }
    } catch (error) {
      setApiKeyValidationError(t('apiValidation.connectionError'));
    } finally {
      setIsValidatingApiKey(false);
    }
  };

  // Confirm No LLM mode
  const handleConfirmNoLLM = () => {
    setLLMConfig({ mode: 'none' });
    // Disable phases 6, 7, and 8 since they require LLM
    usePipelineStore.getState().setPhaseEnabled(6, false);
    usePipelineStore.getState().setPhaseEnabled(7, false);
    usePipelineStore.getState().setPhaseEnabled(8, false);
    setShowNoLLMDialog(false);
  };

  // Unified Ollama installation (software + model in one step)
  // Installation is NOT complete until a model is installed
  const executeInstallOllama = async () => {
    setIsInstallingOllama(true);
    setPullProgress({ stage: 'downloading', progress: 0, message: 'Starting unified installation...', unifiedProgress: 0, currentPhase: 'software' });
    try {
      // Use the unified installation that includes model download
      const success = await window.electronAPI.setup.installOllamaWithModel(selectedModelForInstall);
      if (success) {
        await checkOllamaInstallation();
        await checkStatus();
      }
    } catch (error) {
      console.error('Failed to install Ollama with model:', error);
    } finally {
      setIsInstallingOllama(false);
      setPullProgress(null);
    }
  };

  const handleInstallOllama = () => {
    setShowModelSelectionDialog(true);
  };

  const confirmInstallWithModel = () => {
    setShowModelSelectionDialog(false);
    executeInstallOllama();
  };

  // Ollama uninstallation
  const executeUninstallOllama = async () => {
    setIsUninstallingOllama(true);
    try {
      const result = await window.electronAPI.setup.uninstallOllama();
      if (result.success) {
        await checkOllamaInstallation();
        await checkStatus();
      } else {
        showDialog({
          type: 'alert',
          variant: 'danger',
          title: t('dialogs.uninstallError'),
          message: t('dialogs.uninstallErrorMsg', { error: result.error }),
          confirmText: t('dialogs.understood'),
        });
      }
    } catch (error) {
      console.error('Failed to uninstall Ollama:', error);
    } finally {
      setIsUninstallingOllama(false);
    }
  };

  const handleUninstallOllama = () => {
    showDialog({
      type: 'confirm',
      variant: 'danger',
      title: t('dialogs.uninstallOllama'),
      message: t('dialogs.uninstallConfirm'),
      confirmText: t('dialogs.yesUninstall'),
      cancelText: t('dialogs.cancel'),
      onConfirm: executeUninstallOllama,
    });
  };

  // Start/Stop Ollama service
  const handleStartOllama = async () => {
    try {
      const result = await window.electronAPI.setup.startOllama();
      if (result.success) {
        await checkOllamaInstallation();
        await checkStatus();
      } else {
        showDialog({
          type: 'alert',
          variant: 'danger',
          title: t('dialogs.startError'),
          message: t('dialogs.startErrorMsg', { error: result.error }),
          confirmText: t('dialogs.understood'),
        });
      }
    } catch (error) {
      console.error('Failed to start Ollama:', error);
    }
  };

  const handleStopOllama = async () => {
    try {
      const result = await window.electronAPI.setup.stopOllama();
      if (result.success) {
        await checkOllamaInstallation();
        await checkStatus();
      } else {
        showDialog({
          type: 'alert',
          variant: 'danger',
          title: t('dialogs.stopError'),
          message: t('dialogs.stopErrorMsg', { error: result.error }),
          confirmText: t('dialogs.understood'),
        });
      }
    } catch (error) {
      console.error('Failed to stop Ollama:', error);
    }
  };

  // Pull Ollama model
  const handlePullModel = async (modelName?: string) => {
    const name = modelName || newModelName.trim();
    if (!name) return;
    
    setIsPullingModel(true);
    setPullProgress({ stage: 'pulling-model', progress: 0, message: 'Starting download...' });
    
    try {
      const result = await window.electronAPI.setup.pullOllamaModel(name);
      if (result.success) {
        await checkStatus();
        setNewModelName('');
      }
    } catch (error) {
      console.error('Failed to pull model:', error);
    } finally {
      setIsPullingModel(false);
      setPullProgress(null);
    }
  };

  // Delete model with protection - cannot delete the last model
  const handleDeleteModel = async (name: string) => {
    // First check if this model can be deleted (not the last one)
    try {
      const canDeleteResult = await window.electronAPI.setup.canDeleteOllamaModel(name);
      
      if (!canDeleteResult.canDelete) {
        showDialog({
          type: 'alert',
          variant: 'warning',
          title: t('dialogs.cannotDelete'),
          message: canDeleteResult.reason || t('dialogs.cannotDeleteMsg'),
          confirmText: t('dialogs.understood'),
        });
        return;
      }
      
      // Can delete - show confirmation
      showDialog({
        type: 'confirm',
        variant: 'warning',
        title: t('dialogs.deleteModel'),
        message: t('dialogs.deleteModelConfirm', { name }),
        confirmText: t('dialogs.delete'),
        cancelText: t('dialogs.cancel'),
        onConfirm: async () => {
          const result = await deleteModel(name);
          // Check if deletion failed because it was the last model
          if (!result) {
            const modelCount = await window.electronAPI.ollama.getModelCount();
            if (modelCount <= 1) {
              showDialog({
                type: 'alert',
                variant: 'warning',
                title: t('dialogs.deleteFailed'),
                message: t('dialogs.cannotDeleteMsg'),
                confirmText: t('dialogs.understood'),
              });
            }
          }
        },
      });
    } catch (error) {
      console.error('Failed to check if model can be deleted:', error);
    }
  };

  // HuggingFace models download
  const handleDownloadAllModels = async () => {
    setIsDownloadingModels(true);
    try {
      const result = await window.electronAPI.setup.downloadModels();
      if (!result.success) {
        console.error('Model download failed:', result.error, result.details);
      }
      await checkHuggingFaceModels();
    } catch (error) {
      console.error('Failed to download models:', error);
    } finally {
      setIsDownloadingModels(false);
      setModelDownloadProgress(null);
    }
  };

  // Python setup
  const handleSetupPython = async () => {
    setIsSettingUpPython(true);
    setPythonSetupProgress('Setting up Python environment...');
    
    window.electronAPI.setup.onPythonProgress((_, data) => {
      const progress = data as { message: string };
      setPythonSetupProgress(progress.message);
    });
    
    try {
      await window.electronAPI.setup.setupPython();
      await checkPythonStatus();
    } catch (error) {
      console.error('Failed to setup Python:', error);
    } finally {
      setIsSettingUpPython(false);
      setPythonSetupProgress('');
      window.electronAPI.setup.offPythonProgress();
    }
  };



  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Count installed HuggingFace models
  const installedModelsCount = modelsStatus 
    ? Object.values(modelsStatus).filter(Boolean).length 
    : 0;
  const totalModelsCount = requiredModels.length;

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'llm', label: t('tabs.llm'), icon: <Cpu className="w-4 h-4" /> },
    { id: 'ollama', label: t('tabs.ollama'), icon: <Server className="w-4 h-4" /> },
    { id: 'models', label: t('tabs.mlModels'), icon: <Package className="w-4 h-4" /> },
    { id: 'advanced', label: t('tabs.advanced'), icon: <SettingsIcon className="w-4 h-4" /> },
  ];

  return (
    <PageLayout
      title={t('title')}
      description={t('description')}
    >
      <div className="max-w-5xl mx-auto">
        {/* Current LLM Status */}
        <div className="mb-6 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                {t('currentLlm.title')}
              </p>
              <div className="flex items-center gap-2">
                {llm.mode === 'local' ? (
                  <>
                    <Cpu className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-lg font-semibold text-slate-900 dark:text-white">
                      {t('currentLlm.ollamaLocal', { model: llm.localModel })}
                    </span>
                    <span className={cn(
                      'ml-2 px-2 py-0.5 rounded-full text-xs font-medium',
                      ollamaRunning 
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    )}>
                      {ollamaRunning ? t('currentLlm.connected') : t('currentLlm.disconnected')}
                    </span>
                  </>
                ) : llm.mode === 'api' ? (
                  <>
                    <Key className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span className="text-lg font-semibold text-slate-900 dark:text-white">
                      {t('currentLlm.openaiApi', { model: llm.apiModel })}
                    </span>
                  </>
                ) : (
                  <>
                    <Ban className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    <span className="text-lg font-semibold text-slate-900 dark:text-white">
                      {t('currentLlm.noLlm')}
                    </span>
                    <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      {t('currentLlm.limitedFunc')}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div
              className={cn(
                'px-3 py-1 rounded-full text-sm font-medium',
                llm.mode === 'local'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : llm.mode === 'api'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              )}
            >
              {llm.mode === 'local' ? t('currentLlm.local') : llm.mode === 'api' ? t('currentLlm.api') : t('currentLlm.noLlm')}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap cursor-pointer',
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* LLM Settings */}
        {activeTab === 'llm' && (
          <div className="space-y-6">
            {/* Mode Selection */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="font-medium text-slate-900 dark:text-white mb-4">
                {t('llmMode.title')}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div
                  onClick={() => handleModeChange('local')}
                  className={cn(
                    'p-4 rounded-lg border-2 text-left transition-colors cursor-pointer',
                    llm.mode === 'local'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-slate-900 dark:text-white">
                      {t('llmMode.local')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('llmMode.localDesc')}
                  </p>
                  {!ollamaStatus?.installed && llm.mode === 'local' && (
                    <>
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInstallOllama();
                          }}
                          size="sm"
                          className="w-full"
                          disabled={isInstallingOllama}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          {isInstallingOllama ? t('llmMode.installing') : t('llmMode.installOllama')}
                        </Button>
                      </div>
                      
                      {isInstallingOllama && pullProgress && (
                        <div 
                          className="mt-3"
                          style={{ transform: 'translateZ(0)', willChange: 'auto' }}
                        >
                          <div className="space-y-2" style={{ transform: 'translateZ(0)' }}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-blue-800 dark:text-blue-300">
                                {pullProgress.message || t('llmMode.installing')}
                              </span>
                              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                                {Math.round(pullProgress.progress)}%
                              </span>
                            </div>
                            <div className="relative h-4 bg-blue-100 dark:bg-blue-950/50 rounded-full overflow-hidden">
                              <div
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 to-blue-500 dark:from-blue-500 dark:to-blue-600 rounded-full shadow-sm transition-all duration-300 ease-out"
                                style={{ width: `${Math.min(100, pullProgress.progress)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <button
                  onClick={() => handleModeChange('api')}
                  className={cn(
                    'p-4 rounded-lg border-2 text-left transition-colors cursor-pointer',
                    llm.mode === 'api'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-slate-900 dark:text-white">
                      {t('llmMode.apiOpenai')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('llmMode.apiDesc')}
                  </p>
                </button>

                <button
                  onClick={() => handleModeChange('none')}
                  className={cn(
                    'p-4 rounded-lg border-2 text-left transition-colors cursor-pointer',
                    llm.mode === 'none'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Ban className="w-5 h-5 text-amber-600" />
                    <span className="font-medium text-slate-900 dark:text-white">
                      {t('currentLlm.noLlm')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('llmMode.noLlm')}
                  </p>
                </button>
              </div>

              {/* No LLM active warning */}
              {llm.mode === 'none' && (
                <div className="mt-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        {t('noLlmWarning.title')}
                      </p>
                      <ul className="text-sm text-amber-700 dark:text-amber-400 mt-1 list-disc list-inside space-y-1">
                        <li>{t('noLlmWarning.phase6')}</li>
                        <li>{t('noLlmWarning.phase7')}</li>
                        <li>{t('noLlmWarning.phase8')}</li>
                        <li>{t('noLlmWarning.phase9')}</li>
                      </ul>
                      <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
                        {t('noLlmWarning.basicOk')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Local Model Selection */}
            {llm.mode === 'local' && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="font-medium text-slate-900 dark:text-white mb-4">
                  {t('localModel.title')}
                </h3>
                <div className="space-y-3">
                  {models && models.length > 0 ? (
                    <>
                      <select
                        value={llm.localModel}
                        onChange={(e) => setLLMConfig({ localModel: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      >
                        {models.map((model) => (
                          <option key={model.name} value={model.name}>
                            {model.name} {currentModel === model.name ? t('localModel.current') : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {models.length} {t('localModel.modelsInstalled')}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        {t('localModel.customHint')}
                      </p>
                      <Input
                        value={llm.localModel}
                        onChange={(e) => setLLMConfig({ localModel: e.target.value })}
                        placeholder={t('localModel.customPlaceholder')}
                        className="mt-1"
                      />
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                        {t('localModel.libraryHint')}{' '}
                        <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700">
                          ollama.com/library
                        </a>
                      </p>
                      
                      {/* Model quality info */}
                      <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-blue-700 dark:text-blue-400">
                            {t('localModel.qualityInfo')}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                      <p className="text-sm text-yellow-800 dark:text-yellow-300 mb-2">
                        {t('localModel.noModelsTitle')}
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-400">
                        {t('localModel.noModelsDesc')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* API Configuration */}
            {llm.mode === 'api' && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="font-medium text-slate-900 dark:text-white mb-4">
                  {t('apiConfig.title')}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('apiConfig.apiKey')}
                    </label>
                    <Input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('apiConfig.model')}
                    </label>
                    <select
                      value={llm.apiModel}
                      onChange={(e) => setLLMConfig({ apiModel: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      <option value="gpt-4o-mini">{t('apiConfig.gpt4oMini')}</option>
                      <option value="gpt-4o">{t('apiConfig.gpt4o')}</option>
                      <option value="gpt-4-turbo">GPT-4 Turbo</option>
                      <option value="gpt-5">{t('apiConfig.gpt5')}</option>
                      <option value="gpt-5-mini">{t('apiConfig.gpt5Mini')}</option>
                      <option value="gpt-5-nano">{t('apiConfig.gpt5Nano')}</option>
                    </select>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      {t('apiConfig.customHint')}
                    </p>
                    <Input
                      value={llm.apiModel}
                      onChange={(e) => setLLMConfig({ apiModel: e.target.value })}
                      placeholder={t('apiConfig.customPlaceholder')}
                      className="mt-1"
                    />
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                      {t('apiConfig.docsHint')}{' '}
                      <a href="https://platform.openai.com/docs/models" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700">
                        platform.openai.com/docs/models
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Temperature - Only show when LLM is configured */}
            {llm.mode !== 'none' && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="font-medium text-slate-900 dark:text-white mb-4">
                {t('temperature.title')}
              </h3>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={llm.temperature}
                  onChange={(e) => setLLMConfig({ temperature: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 w-12">
                  {llm.temperature}
                </span>
              </div>
              <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  <strong>{t('temperature.whatIs')}</strong> {t('temperature.description')}
                </p>
                <ul className="text-sm text-slate-500 dark:text-slate-400 mt-2 space-y-1">
                  <li><strong>{t('temperature.low')}</strong> {t('temperature.lowDesc')}</li>
                  <li><strong>{t('temperature.medium')}</strong> {t('temperature.mediumDesc')}</li>
                  <li><strong>{t('temperature.high')}</strong> {t('temperature.highDesc')}</li>
                </ul>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                  {t('temperature.recommendation')}
                </p>
              </div>
            </div>
            )}
          </div>
        )}

        {/* Ollama Management */}
        {activeTab === 'ollama' && (
          <div className="space-y-6">
            {/* Installation Status */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-slate-900 dark:text-white">
                  {t('ollamaStatus.title')}
                </h3>
                <Button variant="outline" size="sm" onClick={async () => { await checkOllamaInstallation(); await checkStatus(); }}>
                  <RefreshCw className={cn('w-4 h-4 mr-2', ollamaLoading && 'animate-spin')} />
                  {t('ollamaStatus.refresh')}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <div className="flex items-center gap-2 mb-1">
                    {ollamaStatus?.installed ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('ollamaStatus.installation')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {ollamaStatus?.installed 
                      ? `${t('ollamaStatus.installed')} ${ollamaStatus.version ? `(${ollamaStatus.version})` : ''}`
                      : t('ollamaStatus.notInstalled')}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn(
                      'w-3 h-3 rounded-full',
                      ollamaStatus?.running ? 'bg-green-500' : 'bg-red-500'
                    )} />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('ollamaStatus.service')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {ollamaStatus?.running ? t('ollamaStatus.running') : t('ollamaStatus.stopped')}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {!ollamaStatus?.installed ? (
                  <Button
                    onClick={handleInstallOllama}
                    disabled={isInstallingOllama}
                  >
                    {isInstallingOllama ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        {t('ollamaStatus.installingOllama')}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        {t('ollamaStatus.installOllama')}
                      </>
                    )}
                  </Button>
                ) : (
                  <>
                    {ollamaStatus?.running ? (
                      <Button variant="outline" onClick={handleStopOllama}>
                        <Square className="w-4 h-4 mr-2" />
                        {t('ollamaStatus.stopService')}
                      </Button>
                    ) : (
                      <Button onClick={handleStartOllama}>
                        <Play className="w-4 h-4 mr-2" />
                        {t('ollamaStatus.startService')}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="!border-red-300 dark:!border-red-600 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:!border-red-400 dark:hover:!border-red-500"
                      onClick={handleUninstallOllama}
                      disabled={isUninstallingOllama}
                    >
                      {isUninstallingOllama ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          {t('ollamaStatus.uninstalling')}
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t('ollamaStatus.uninstallOllama')}
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>

              {isInstallingOllama && pullProgress && pullProgress.stage !== 'complete' && (
                <div 
                  className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                  style={{ transform: 'translateZ(0)', willChange: 'auto' }}
                >
                  <div className="space-y-3" style={{ transform: 'translateZ(0)' }}>
                    {/* Phase indicator for unified installation */}
                    {pullProgress.currentPhase && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className={cn(
                          'px-2 py-0.5 rounded-full font-medium',
                          pullProgress.currentPhase === 'software' 
                            ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                            : 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
                        )}>
                          {pullProgress.currentPhase === 'software' ? t('ollamaStatus.phase1') : t('ollamaStatus.phase2')}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {pullProgress.currentPhase === 'software' 
                            ? t('ollamaStatus.installingProgress') 
                            : t('ollamaStatus.downloadingModel', { model: selectedModelForInstall })}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                        {stripPercentageFromMessage(pullProgress.message || t('ollamaStatus.installingProgress'))}
                      </span>
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                        {Math.round(pullProgress.unifiedProgress ?? pullProgress.progress)}%
                      </span>
                    </div>
                    {/* Unified progress bar */}
                    <div className="relative h-6 bg-blue-100 dark:bg-blue-950/50 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 rounded-full shadow-sm transition-all duration-300 ease-out",
                          pullProgress.currentPhase === 'model'
                            ? "bg-gradient-to-r from-green-400 to-emerald-500 dark:from-green-500 dark:to-emerald-600"
                            : "bg-gradient-to-r from-blue-400 to-blue-500 dark:from-blue-500 dark:to-blue-600"
                        )}
                        style={{ width: `${Math.min(100, pullProgress.unifiedProgress ?? pullProgress.progress)}%` }}
                      />
                      {/* Show phase separator at 50% */}
                      {pullProgress.currentPhase && (
                        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300 dark:bg-slate-600" />
                      )}
                    </div>
                    {pullProgress.stage === 'error' && pullProgress.error && (
                      <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                        Error: {pullProgress.error}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {ollamaError && (
                <div className="mt-3 flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{ollamaError}</span>
                </div>
              )}
            </div>

            {/* Models List - Only show if Ollama is installed */}
            {ollamaStatus?.installed && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="font-medium text-slate-900 dark:text-white mb-4">
                  {t('ollamaModels.title', { count: models.length })}
                </h3>
                {models.length > 0 ? (
                  <div className="space-y-2 mb-6">
                    {models.map((model) => (
                      <div
                        key={model.name}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg',
                          llm.localModel === model.name
                            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                            : 'bg-slate-50 dark:bg-slate-700/50'
                        )}
                      >
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">
                            {model.name}
                            {llm.localModel === model.name && (
                              <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">{t('ollamaModels.active')}</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {(model.size / 1e9).toFixed(1)} GB
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {llm.localModel !== model.name && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setLLMConfig({ localModel: model.name });
                                selectModel(model.name);
                              }}
                            >
                              {t('ollamaModels.use')}
                            </Button>
                          )}
                          {/* Disable delete button if this is the last model */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteModel(model.name)}
                            disabled={models.length <= 1}
                            title={models.length <= 1 ? t('ollamaModels.cannotDeleteLast') : t('ollamaModels.deleteModel')}
                            className={cn(
                              models.length <= 1 && 'opacity-50 cursor-not-allowed'
                            )}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {/* Warning when only one model is installed */}
                    {models.length === 1 && (
                      <div className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-sm">
                            {t('ollamaModels.lastModelHint')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400 text-center py-4 mb-6">
                    {t('ollamaModels.noModels')}
                  </p>
                )}

                {/* Recommended Models */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <button
                    className="flex items-center justify-between w-full text-left"
                    onClick={() => toggleSection('recommendedModels')}
                  >
                    <h4 className="font-medium text-slate-900 dark:text-white">
                      {t('ollamaModels.downloadRecommended')}
                    </h4>
                    {expandedSections.recommendedModels ? (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    )}
                  </button>
                  
                  {expandedSections.recommendedModels && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {RECOMMENDED_MODELS.map((model) => {
                        const isInstalled = models.some(m => m.name === model.name);
                        return (
                          <button
                            key={model.name}
                            disabled={isPullingModel || isInstalled}
                            onClick={() => handlePullModel(model.name)}
                            className={cn(
                              'p-3 rounded-lg border text-left transition-colors',
                              isInstalled
                                ? 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800'
                                : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600',
                              isPullingModel && 'opacity-50 cursor-not-allowed'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm text-slate-900 dark:text-white">
                                {model.name}
                              </span>
                              {isInstalled && (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              )}
                              {model.recommended && !isInstalled && (
                                <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded">
                                  {t('ollamaModels.recommended')}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              {t(`recommendedModels.${model.name}`)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Custom Model */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
                  <button
                    className="flex items-center justify-between w-full text-left"
                    onClick={() => toggleSection('customModel')}
                  >
                    <h4 className="font-medium text-slate-900 dark:text-white">
                      {t('ollamaModels.downloadCustom')}
                    </h4>
                    {expandedSections.customModel ? (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    )}
                  </button>
                  
                  {expandedSections.customModel && (
                    <div className="mt-4">
                      <div className="p-3 mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                          <div className="text-sm text-amber-800 dark:text-amber-200">
                            <p className="font-medium mb-1">{t('ollamaModels.customWarnings.intro')}</p>
                            <ul className="text-xs space-y-1 text-amber-700 dark:text-amber-300">
                              <li>• {t('ollamaModels.customWarnings.noGpu')}</li>
                              <li>• {t('ollamaModels.customWarnings.withGpu')}</li>
                              <li>• {t('ollamaModels.customWarnings.example')}</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                      <Input
                        value={newModelName}
                        onChange={(e) => setNewModelName(e.target.value)}
                        placeholder={t('ollamaModels.customPlaceholder')}
                        className="flex-1"
                      />
                      <Button 
                        onClick={() => handlePullModel()} 
                        disabled={isPullingModel || !newModelName.trim()}
                      >
                        {isPullingModel ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </Button>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                        {t('localModel.libraryHint')}{' '}
                        <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700">
                          ollama.com/library
                        </a>
                      </p>
                    </div>
                  )}
                </div>

                {/* Pull Progress */}
                {pullProgress && pullProgress.stage !== 'complete' && pullProgress.stage !== 'idle' && (
                  <div 
                    className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                    style={{ transform: 'translateZ(0)', willChange: 'auto' }}
                  >
                    <div className="space-y-3" style={{ transform: 'translateZ(0)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                          {stripPercentageFromMessage(pullProgress.message)}
                        </span>
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                          {Math.round(pullProgress.progress)}%
                        </span>
                      </div>
                      <div className="relative h-6 bg-blue-100 dark:bg-blue-950/50 rounded-full overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 to-blue-500 dark:from-blue-500 dark:to-blue-600 rounded-full shadow-sm transition-all duration-300 ease-out"
                          style={{ width: `${Math.min(100, pullProgress.progress)}%` }}
                        />
                      </div>
                      {pullProgress.stage === 'error' && pullProgress.error && (
                        <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                          Error: {pullProgress.error}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ML Models (HuggingFace) */}
        {activeTab === 'models' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-medium text-slate-900 dark:text-white">
                    {t('mlModels.title')}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('mlModels.description')}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => checkHuggingFaceModels()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {t('mlModels.verify')}
                </Button>
              </div>

              {/* Status Summary */}
              <div className={cn(
                'p-4 rounded-lg mb-6',
                installedModelsCount === totalModelsCount && totalModelsCount > 0
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : isLoadingModels || modelsStatus === null
                    ? 'bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700'
                    : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
              )}>
                <div className="flex items-center gap-2">
                  {installedModelsCount === totalModelsCount && totalModelsCount > 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  ) : isLoadingModels || modelsStatus === null ? (
                    <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                  )}
                  <span className={cn(
                    'font-medium',
                    installedModelsCount === totalModelsCount && totalModelsCount > 0
                      ? 'text-green-700 dark:text-green-300'
                      : isLoadingModels || modelsStatus === null
                        ? 'text-slate-500 dark:text-slate-400'
                        : 'text-yellow-700 dark:text-yellow-300'
                  )}>
                    {isLoadingModels || modelsStatus === null
                      ? t('mlModels.verifying')
                      : t('mlModels.status', { installed: installedModelsCount, total: totalModelsCount })
                    }
                  </span>
                </div>
              </div>

              {/* Models List */}
              <div className="space-y-3">
                {requiredModels.map((model) => {
                  const key = model.name.includes('sentiment') ? 'sentiment'
                    : model.name.includes('paraphrase') ? 'embeddings'
                    : model.name.includes('subjectivity') ? 'subjectivity'
                    : 'categories';
                  const isInstalled = modelsStatus?.[key as keyof ModelsStatus] ?? false;
                  const isChecking = isLoadingModels || modelsStatus === null;

                  return (
                    <div
                      key={model.name}
                      className={cn(
                        'flex items-center justify-between p-4 rounded-lg',
                        isInstalled
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                          : 'bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {isChecking ? (
                          <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
                        ) : isInstalled ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <XCircle className="w-5 h-5 text-slate-400" />
                        )}
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">
                            {model.displayName}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {model.name}
                          </p>
                        </div>
                      </div>
                      <span className={cn(
                        'text-xs font-medium px-2 py-1 rounded',
                        isInstalled
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                          : 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                      )}>
                        {isChecking ? t('mlModels.checkingStatus') : isInstalled ? t('mlModels.downloaded') : t('mlModels.notDownloaded')}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Download Button */}
              {installedModelsCount < totalModelsCount && (
                <div className="mt-6">
                  <Button
                    onClick={handleDownloadAllModels}
                    disabled={isDownloadingModels}
                    className="w-full"
                  >
                    {isDownloadingModels ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        {t('mlModels.downloading')}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        {t('mlModels.downloadMissing')}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Download Progress */}
              {modelDownloadProgress && (
                <div
                  className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                  style={{ transform: 'translateZ(0)', willChange: 'auto' }}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                        {modelDownloadProgress.message || t('mlModels.downloadingModel', { model: modelDownloadProgress.model })}
                      </span>
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                        {Math.round(modelDownloadProgress.progress)}%
                      </span>
                    </div>
                    <div className="relative h-6 bg-blue-100 dark:bg-blue-950/50 rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 to-blue-500 dark:from-blue-500 dark:to-blue-600 rounded-full shadow-sm transition-all duration-300 ease-out"
                        style={{ width: `${Math.min(100, modelDownloadProgress.progress)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-4">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-medium mb-1">{t('mlModels.aboutTitle')}</p>
                  <p>
                    {t('mlModels.aboutDesc')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}



        {/* Advanced Settings */}
        {activeTab === 'advanced' && (
          <div className="space-y-6">
            {/* Hardware Info */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-slate-900 dark:text-white">
                  {t('hardware.title')}
                </h3>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={detectHardware}
                  disabled={isDetectingHardware}
                >
                  <RefreshCw className={cn('w-4 h-4 mr-2', isDetectingHardware && 'animate-spin')} />
                  {t('hardware.detect')}
                </Button>
              </div>

              {hardware && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    {/* CPU */}
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Cpu className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          CPU
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={hardware.cpu.name}>
                        {hardware.cpu.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {hardware.cpu.cores} cores / {hardware.cpu.threads} threads
                      </p>
                    </div>

                    {/* RAM */}
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <HardDrive className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          RAM
                        </span>
                      </div>
                      <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                        {hardware.ram.totalGB.toFixed(1)} GB
                      </p>
                      <p className="text-xs text-slate-400">
                        {hardware.ram.availableGB.toFixed(1)} GB {t('hardware.available')}
                      </p>
                    </div>

                    {/* GPU */}
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          GPU
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={hardware.gpu.name}>
                        {hardware.gpu.name || t('hardware.noGpu')}
                      </p>
                      {hardware.gpu.vramGB && (
                        <p className="text-xs text-slate-400">
                          {hardware.gpu.vramGB.toFixed(1)} GB VRAM
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Recommendation */}
                  <div className={cn(
                    'p-4 rounded-lg',
                    hardware.recommendation.canRunLocalLLM
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                  )}>
                    <p className={cn(
                      'text-sm font-medium mb-1',
                      hardware.recommendation.canRunLocalLLM
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-yellow-700 dark:text-yellow-300'
                    )}>
                      {hardware.recommendation.recommendedProvider === 'ollama' ? t('hardware.recommendLocal') : t('hardware.recommendApi')}
                    </p>
                    <p className={cn(
                      'text-xs',
                      hardware.recommendation.canRunLocalLLM
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-yellow-600 dark:text-yellow-400'
                    )}>
                      {hardware.recommendation.reasoning}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Output Directory */}
            <OutputDirectorySection outputDir={outputDir} setOutputDir={setOutputDir} onSelectDir={handleSelectOutputDir} />

            {/* Theme / Appearance */}
            <ThemeSettingsSection />

            {/* Language */}
            <LanguageSettingsSection />



          </div>
        )}
      </div>

      {/* Custom Dialog */}
      <AnimatePresence>
        {dialog.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={dialog.type === 'alert' ? handleDialogConfirm : closeDialog}
            />
            
            {/* Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
              className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-700"
            >
              {/* Header */}
              <div className={cn(
                "px-6 py-4 flex items-center gap-3 border-b",
                dialog.variant === 'danger' && "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800",
                dialog.variant === 'warning' && "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800",
                dialog.variant === 'info' && "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800",
              )}>
                <div className={cn(
                  "p-2 rounded-full",
                  dialog.variant === 'danger' && "bg-red-100 dark:bg-red-800/40",
                  dialog.variant === 'warning' && "bg-amber-100 dark:bg-amber-800/40",
                  dialog.variant === 'info' && "bg-blue-100 dark:bg-blue-800/40",
                )}>
                  {dialog.variant === 'danger' && <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />}
                  {dialog.variant === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
                  {dialog.variant === 'info' && <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                </div>
                <h3 className={cn(
                  "font-semibold text-lg flex-1",
                  dialog.variant === 'danger' && "text-red-900 dark:text-red-200",
                  dialog.variant === 'warning' && "text-amber-900 dark:text-amber-200",
                  dialog.variant === 'info' && "text-blue-900 dark:text-blue-200",
                )}>
                  {dialog.title}
                </h3>
                <button
                  onClick={dialog.type === 'alert' ? handleDialogConfirm : closeDialog}
                  className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              {/* Content */}
              <div className="px-6 py-5">
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {dialog.message}
                </p>
              </div>

              {/* Actions */}
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                {dialog.type === 'confirm' && (
                  <Button
                    variant="outline"
                    onClick={closeDialog}
                    className="px-4"
                  >
                    {dialog.cancelText || t('dialogs.cancel')}
                  </Button>
                )}
                <Button
                  variant={dialog.variant === 'danger' ? 'destructive' : 'default'}
                  onClick={handleDialogConfirm}
                  className={cn(
                    "px-4",
                    dialog.variant === 'warning' && "bg-amber-600 hover:bg-amber-700 text-white",
                  )}
                >
                  {dialog.confirmText || t('dialogs.accept')}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Model Selection Dialog for Ollama Installation */}
      <AnimatePresence>
        {showModelSelectionDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowModelSelectionDialog(false)}
            />
            
            {/* Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
              className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-700"
            >
              {/* Header */}
              <div className="px-6 py-4 flex items-center gap-3 border-b bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800">
                <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-800/40">
                  <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold text-lg flex-1 text-blue-900 dark:text-blue-200">
                  {t('dialogs.selectModelTitle')}
                </h3>
                <button
                  onClick={() => setShowModelSelectionDialog(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              {/* Content */}
              <div className="px-6 py-5">
                <p className="text-slate-700 dark:text-slate-300 mb-4 leading-relaxed">
                  {t('dialogs.selectModelDesc')}
                </p>
                
                {/* Model Selection Grid */}
                <div className="space-y-2">
                  {RECOMMENDED_MODELS.filter(m => m.recommended || m.name === 'llama3.1:8b' || m.name === 'deepseek-r1:14b' || m.name === 'deepseek-r1:8b' || m.name === 'mistral:7b').map((model) => (
                    <button
                      key={model.name}
                      onClick={() => setSelectedModelForInstall(model.name)}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-lg border-2 transition-all",
                        selectedModelForInstall === model.name
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {model.name}
                            </span>
                            {model.recommended && (
                              <span className="text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full font-medium">
                                {t('ollamaModels.recommended')}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                            {t(`recommendedModels.${model.name}`)}
                          </p>
                        </div>
                        <div className={cn(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center ml-3 flex-shrink-0",
                          selectedModelForInstall === model.name
                            ? "border-blue-500 bg-blue-500"
                            : "border-slate-300 dark:border-slate-700"
                        )}>
                          {selectedModelForInstall === model.name && (
                            <CheckCircle2 className="w-3 h-3 text-white" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex gap-2">
                  <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    {t('dialogs.selectModelNote')}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowModelSelectionDialog(false)}
                  className="px-4"
                >
                  {t('dialogs.cancel')}
                </Button>
                <Button
                  variant="default"
                  onClick={confirmInstallWithModel}
                  disabled={!selectedModelForInstall}
                  className="px-4"
                >
                  {t('dialogs.install')}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* API Key Validation Dialog */}
      <AnimatePresence>
        {showApiKeyDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center"
            onClick={() => setShowApiKeyDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="shrink-0 w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Key className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {t('dialogs.apiKeyTitle')}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      {t('dialogs.apiKeyDesc')}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowApiKeyDialog(false)}
                    className="shrink-0 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('dialogs.apiKeyLabel')}
                    </label>
                    <Input
                      type="password"
                      value={pendingApiKey}
                      onChange={(e) => {
                        setPendingApiKey(e.target.value);
                        setApiKeyValidationError(null);
                      }}
                      placeholder="sk-..."
                      className={cn(
                        apiKeyValidationError && 'border-red-500 focus:ring-red-500'
                      )}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleApiKeyValidation();
                      }}
                    />
                    {apiKeyValidationError && (
                      <div className="flex items-start gap-2 mt-2">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {apiKeyValidationError}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('dialogs.apiKeyHint')}{' '}
                      <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700">
                        platform.openai.com/api-keys
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowApiKeyDialog(false)}
                  disabled={isValidatingApiKey}
                >
                  {t('dialogs.cancel')}
                </Button>
                <Button
                  onClick={handleApiKeyValidation}
                  disabled={isValidatingApiKey || !pendingApiKey.trim()}
                >
                  {isValidatingApiKey ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('dialogs.validating')}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      {t('dialogs.validateActivate')}
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No LLM Confirmation Dialog */}
      <AnimatePresence>
        {showNoLLMDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center"
            onClick={() => setShowNoLLMDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="shrink-0 w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {t('dialogs.noLlmTitle')}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      {t('dialogs.noLlmConfirm')}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowNoLLMDialog(false)}
                    className="shrink-0 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                      {t('dialogs.noLlmLimitations')}
                    </p>
                    <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-2">
                      <li className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                        <span>{t('dialogs.noLlmPhase6')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                        <span>{t('dialogs.noLlmPhase7')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                        <span>{t('dialogs.noLlmPhase8')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                        <span>{t('dialogs.noLlmPhase9')}</span>
                      </li>
                    </ul>
                  </div>

                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <p className="text-sm text-green-800 dark:text-green-300">
                      {t('dialogs.noLlmStillWorks')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowNoLLMDialog(false)}
                >
                  {t('dialogs.cancel')}
                </Button>
                <Button
                  variant="default"
                  onClick={handleConfirmNoLLM}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Ban className="w-4 h-4 mr-2" />
                  {t('dialogs.continueNoLlm')}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
}

/**
 * OutputDirectorySection - Extracted component that shows the default path
 * when no custom directory is selected.
 */
/**
 * ThemeSettingsSection - Appearance / Theme preference
 */
function ThemeSettingsSection() {
  const { t } = useTranslation('settings');
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center gap-2 mb-2">
        <SettingsIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
        <h3 className="font-medium text-slate-900 dark:text-white">
          {t('appearance.title')}
        </h3>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        {t('appearance.description')}
      </p>
      <ThemeSelector />
    </div>
  );
}

/**
 * LanguageSettingsSection - Language preference
 */
function LanguageSettingsSection() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <LanguageSelector showLabel />
    </div>
  );
}

function OutputDirectorySection({
  outputDir,
  setOutputDir,
  onSelectDir,
}: {
  outputDir: string;
  setOutputDir: (dir: string) => void;
  onSelectDir: () => void;
}) {
  const { t } = useTranslation('settings');
  const [defaultDir, setDefaultDir] = useState<string>('');

  useEffect(() => {
    window.electronAPI.app.getPythonDataDir().then((dir: string) => {
      setDefaultDir(dir);
    }).catch(() => { /* ignored */ });
  }, []);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h3 className="font-medium text-slate-900 dark:text-white mb-4">
        {t('outputDir.title')}
      </h3>
      <div className="flex gap-2">
        <Input
          value={outputDir}
          onChange={(e) => setOutputDir(e.target.value)}
          placeholder={t('outputDir.placeholder')}
          className="flex-1"
          readOnly
        />
        <Button variant="outline" onClick={onSelectDir}>
          <Folder className="w-4 h-4 mr-2" />
          {t('outputDir.select')}
        </Button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
        {t('outputDir.description')}
      </p>
      {outputDir ? (
        <div className="mt-3 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('outputDir.savedIn')} <span className="font-mono text-slate-700 dark:text-slate-300">{outputDir}/data/</span>
          </p>
        </div>
      ) : defaultDir ? (
        <div className="mt-3 p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-600 dark:text-slate-300">{t('outputDir.defaultFolder')}</span>
          </p>
          <p className="text-xs font-mono text-slate-600 dark:text-slate-300 break-all mt-0.5">{defaultDir}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Phase7SettingsSection removed - Phase 7 now only generates structured summaries.
 * Strategic insights have moved to Phase 8.
 */
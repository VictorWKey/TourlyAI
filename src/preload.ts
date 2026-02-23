// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';
import type { PipelineProgress } from './shared/types';

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Pipeline operations
  pipeline: {
    runPhase: (phase: number, config?: object) =>
      ipcRenderer.invoke('pipeline:run-phase', phase, config),
    runAll: (config?: object) =>
      ipcRenderer.invoke('pipeline:run-all', config),
    stop: () => ipcRenderer.invoke('pipeline:stop'),
    getStatus: () => ipcRenderer.invoke('pipeline:get-status'),
    validateDataset: (path: string) =>
      ipcRenderer.invoke('pipeline:validate-dataset', path),
    validatePhase: (phase: number, datasetPath?: string) =>
      ipcRenderer.invoke('pipeline:validate-phase', phase, datasetPath),
    applyColumnMapping: (sourcePath: string, mapping: Record<string, string | null>) =>
      ipcRenderer.invoke('pipeline:apply-column-mapping', sourcePath, mapping),
    getRequiredColumns: () =>
      ipcRenderer.invoke('pipeline:get-required-columns'),
    getLLMInfo: () => ipcRenderer.invoke('pipeline:get-llm-info'),
    onProgress: (callback: (event: unknown, data: PipelineProgress) => void) => {
      ipcRenderer.on('pipeline:progress', callback);
    },
    offProgress: () => {
      ipcRenderer.removeAllListeners('pipeline:progress');
    },
  },

  // File operations
  files: {
    selectFile: (filters?: object) =>
      ipcRenderer.invoke('files:select', filters),
    selectDirectory: () => ipcRenderer.invoke('files:select-directory'),
    readFile: (path: string) => ipcRenderer.invoke('files:read', path),
    writeFile: (path: string, content: string) =>
      ipcRenderer.invoke('files:write', path, content),
    writeBinary: (path: string, base64Content: string) =>
      ipcRenderer.invoke('files:write-binary', path, base64Content),
    writeArrayBuffer: (path: string, data: Uint8Array) =>
      ipcRenderer.invoke('files:write-array-buffer', path, Array.from(data)),
    openPath: (path: string) => ipcRenderer.invoke('files:open-path', path),
    exists: (path: string) => ipcRenderer.invoke('files:exists', path),
    stat: (path: string) => ipcRenderer.invoke('files:stat', path),
    listImages: (dirPath: string) => ipcRenderer.invoke('files:list-images', dirPath),
    listDir: (dirPath: string) => ipcRenderer.invoke('files:list-dir', dirPath),
    readImageBase64: (filePath: string) => ipcRenderer.invoke('files:read-image-base64', filePath),
    cleanDatasetData: (dataDir: string) => ipcRenderer.invoke('files:clean-dataset-data', dataDir),
    backupDatasetData: (dataDir: string) => ipcRenderer.invoke('files:backup-dataset-data', dataDir),
  },

  // Settings
  settings: {
    get: <T>(key: string) => ipcRenderer.invoke('settings:get', key) as Promise<T>,
    set: <T>(key: string, value: T) =>
      ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:get-all'),
  },

  // Ollama
  ollama: {
    checkStatus: () => ipcRenderer.invoke('ollama:check-status'),
    listModels: () => ipcRenderer.invoke('ollama:list-models'),
    pullModel: (name: string) => ipcRenderer.invoke('ollama:pull-model', name),
    deleteModel: (name: string) => ipcRenderer.invoke('ollama:delete-model', name),
    getModelCount: () => ipcRenderer.invoke('ollama:get-model-count'),
    onPullProgress: (callback: (event: unknown, data: unknown) => void) => {
      ipcRenderer.on('ollama:pull-progress', callback);
    },
    offPullProgress: () => {
      ipcRenderer.removeAllListeners('ollama:pull-progress');
    },
  },

  // Setup wizard
  setup: {
    isFirstRun: () => ipcRenderer.invoke('setup:is-first-run'),
    getState: () => ipcRenderer.invoke('setup:get-state'),
    systemCheck: () => ipcRenderer.invoke('setup:system-check'),
    setLLMProvider: (provider: 'ollama' | 'openai') =>
      ipcRenderer.invoke('setup:set-llm-provider', provider),
    
    // Python setup
    checkPython: () => ipcRenderer.invoke('setup:check-python'),
    setupPython: () => ipcRenderer.invoke('setup:setup-python'),
    getPythonPaths: () => ipcRenderer.invoke('setup:get-python-paths'),
    onPythonProgress: (callback: (event: unknown, data: unknown) => void) => {
      ipcRenderer.on('setup:python-progress', callback);
    },
    offPythonProgress: () => {
      ipcRenderer.removeAllListeners('setup:python-progress');
    },
    
    // Ollama setup
    checkOllama: () => ipcRenderer.invoke('setup:check-ollama'),
    installOllama: () => ipcRenderer.invoke('setup:install-ollama'),
    // Unified installation: software + model in one step (recommended)
    installOllamaWithModel: (model: string) => 
      ipcRenderer.invoke('setup:install-ollama-with-model', model),
    // Check if Ollama is fully ready (installed + running + has models)
    checkOllamaFullyReady: () => ipcRenderer.invoke('setup:check-ollama-fully-ready'),
    startOllama: () => ipcRenderer.invoke('setup:start-ollama'),
    pullOllamaModel: (model: string) =>
      ipcRenderer.invoke('setup:pull-ollama-model', model),
    hasOllamaModel: (model: string) =>
      ipcRenderer.invoke('setup:has-ollama-model', model),
    listOllamaModels: () => ipcRenderer.invoke('setup:list-ollama-models'),
    // Check if a model can be deleted (prevents deleting last model)
    canDeleteOllamaModel: (model: string) =>
      ipcRenderer.invoke('setup:can-delete-ollama-model', model),
    getOllamaModelCount: () => ipcRenderer.invoke('setup:get-ollama-model-count'),
    
    // Enhanced hardware detection
    detectHardware: () => ipcRenderer.invoke('setup:detect-hardware'),
    saveHardwareOverrides: (overrides: {
      cpuTier?: 'low' | 'mid' | 'high';
      ramGB?: number;
      gpuType?: 'none' | 'integrated' | 'dedicated';
      vramGB?: number;
    }) => ipcRenderer.invoke('setup:save-hardware-overrides', overrides),
    clearHardwareOverrides: () => ipcRenderer.invoke('setup:clear-hardware-overrides'),
    
    validateOpenAIKey: (key: string) =>
      ipcRenderer.invoke('setup:validate-openai-key', key),
    checkModels: () => ipcRenderer.invoke('setup:check-models'),
    downloadModels: () => ipcRenderer.invoke('setup:download-models'),
    downloadSpecificModel: (modelKey: string) =>
      ipcRenderer.invoke('setup:download-specific-model', modelKey),
    preloadModels: () => ipcRenderer.invoke('setup:preload-models'),
    getDownloadSize: () => ipcRenderer.invoke('setup:get-download-size'),
    getRequiredModels: () => ipcRenderer.invoke('setup:get-required-models'),
    complete: () => ipcRenderer.invoke('setup:complete'),
    reset: () => ipcRenderer.invoke('setup:reset'),
    cleanPython: () => ipcRenderer.invoke('setup:clean-python'),
    // Validate setup state against actual system state (resets stale flags)
    validateState: () => ipcRenderer.invoke('setup:validate-state'),
    // Ollama management
    uninstallOllama: () => ipcRenderer.invoke('setup:uninstall-ollama'),
    stopOllama: () => ipcRenderer.invoke('setup:stop-ollama'),
    onOllamaProgress: (callback: (event: unknown, data: unknown) => void) => {
      ipcRenderer.on('setup:ollama-progress', callback);
    },
    offOllamaProgress: () => {
      ipcRenderer.removeAllListeners('setup:ollama-progress');
    },
    onOllamaUninstallProgress: (callback: (event: unknown, data: { message: string }) => void) => {
      ipcRenderer.on('setup:ollama-uninstall-progress', callback);
    },
    offOllamaUninstallProgress: () => {
      ipcRenderer.removeAllListeners('setup:ollama-uninstall-progress');
    },
    onModelProgress: (callback: (event: unknown, data: unknown) => void) => {
      ipcRenderer.on('setup:model-progress', callback);
    },
    offModelProgress: () => {
      ipcRenderer.removeAllListeners('setup:model-progress');
    },
  },

  // App info
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => process.platform,
    getPythonDataDir: () => ipcRenderer.invoke('app:get-python-data-dir'),
  },

  // Persistent store (electron-store backed, survives restarts)
  store: {
    getItem: (key: string) => ipcRenderer.invoke('store:get-item', key),
    setItem: (key: string, value: string) => ipcRenderer.invoke('store:set-item', key, value),
    removeItem: (key: string) => ipcRenderer.invoke('store:remove-item', key),
  },

  // Theme management
  theme: {
    getNative: () => ipcRenderer.invoke('theme:get-native') as Promise<'light' | 'dark'>,
    setNative: (theme: 'light' | 'dark' | 'system') =>
      ipcRenderer.invoke('theme:set-native', theme) as Promise<'light' | 'dark'>,
    onChanged: (callback: (event: unknown, resolved: 'light' | 'dark') => void) => {
      ipcRenderer.on('theme:changed', callback);
    },
    offChanged: () => {
      ipcRenderer.removeAllListeners('theme:changed');
    },
  },

  // Auto-updater
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
    getStatus: () => ipcRenderer.invoke('updater:get-status'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
    onStatus: (callback: (event: unknown, data: unknown) => void) => {
      ipcRenderer.on('updater:status', callback);
    },
    offStatus: () => {
      ipcRenderer.removeAllListeners('updater:status');
    },
    onDownloadProgress: (callback: (event: unknown, data: unknown) => void) => {
      ipcRenderer.on('updater:download-progress', callback);
    },
    offDownloadProgress: () => {
      ipcRenderer.removeAllListeners('updater:download-progress');
    },
  },
});
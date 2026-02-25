// ============================================
// Electron Store Configuration
// ============================================

import Store from 'electron-store';
import type { AppSettings, LLMConfig, PipelineConfig } from '../../shared/types';

// Store schema type
interface StoreSchema {
  llm: LLMConfig;
  pipeline: PipelineConfig;
  app: AppSettings['app'];
  recentFiles: string[];
  /** Per-category dashboard grid layouts (image positions & sizes) */
  gridLayouts: Record<string, unknown>;
  /** Renderer Zustand persist state (survives app restarts reliably) */
  rendererState: Record<string, string>;
}

// Default LLM configuration
// localModel is intentionally empty — the actual model is set by the setup
// wizard (or the user in Settings).  A hardcoded default used to cause a
// mismatch where the app tried to use a model that was never installed.
const defaultLLMConfig: LLMConfig = {
  mode: 'local',
  localModel: '',
  apiProvider: 'openai',
  apiKey: '',
  apiModel: 'gpt-4o-mini',
  temperature: 0,
};

// Default pipeline configuration
const defaultPipelineConfig: PipelineConfig = {
  phases: {
    phase01: { enabled: true },
    phase02: { enabled: true },
    phase03: { enabled: true },
    phase04: { enabled: true },
    phase05: { enabled: true },
    phase06: { enabled: true },
    phase07: { enabled: true },
    phase08: { enabled: true },
  },
};

// Default app settings
// IMPORTANT: language defaults to 'es' to match i18n initialization and all
// fallback values. The user selects their preferred language in the setup wizard.
const defaultAppSettings: AppSettings = {
  llm: defaultLLMConfig,
  app: {
    theme: 'system',
    language: 'es',
    outputDir: '',
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let store: any = null;

/**
 * Initialize the electron-store
 */
export async function initializeStore(): Promise<void> {
  if (store) {
    return;
  }

  store = new Store<StoreSchema>({
    name: 'tourlyai-config',
    defaults: {
      llm: defaultLLMConfig,
      pipeline: defaultPipelineConfig,
      app: defaultAppSettings.app,
      recentFiles: [],
      gridLayouts: {},
      rendererState: {},
    },
    // Encrypt sensitive data like API keys
    encryptionKey: 'tourlyai-2024',
    clearInvalidConfig: true,
  });

  console.log('[Store] Initialized');
}

/**
 * Get the store instance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getStore(): any {
  if (!store) {
    throw new Error('Store not initialized. Call initializeStore() first.');
  }
  return store;
}

/**
 * Get LLM configuration
 */
export function getLLMConfig(): LLMConfig {
  return getStore().get('llm', defaultLLMConfig) as LLMConfig;
}

/**
 * Set LLM configuration
 */
export function setLLMConfig(config: Partial<LLMConfig>): void {
  const current = getLLMConfig();
  getStore().set('llm', { ...current, ...config });
}

/**
 * Get pipeline configuration
 */
export function getPipelineConfig(): PipelineConfig {
  return getStore().get('pipeline', defaultPipelineConfig) as PipelineConfig;
}

/**
 * Set pipeline configuration
 */
export function setPipelineConfig(config: Partial<PipelineConfig>): void {
  const current = getPipelineConfig();
  getStore().set('pipeline', { ...current, ...config });
}

/**
 * Get recent files list
 */
export function getRecentFiles(): string[] {
  return getStore().get('recentFiles', []) as string[];
}

/**
 * Add a file to recent files
 */
export function addRecentFile(filePath: string, maxRecent = 10): void {
  const recentFiles = getRecentFiles().filter(f => f !== filePath);
  recentFiles.unshift(filePath);
  getStore().set('recentFiles', recentFiles.slice(0, maxRecent));
}

/**
 * Clear recent files
 */
export function clearRecentFiles(): void {
  getStore().set('recentFiles', []);
}

/**
 * Get output directory
 */
export function getOutputDir(): string {
  return getStore().get('app.outputDir', '') as string;
}

/**
 * Get the user's selected language
 */
export function getLanguage(): string {
  return getStore().get('app.language', 'es') as string;
}

/**
 * Set output directory
 */
export function setOutputDir(dir: string): void {
  getStore().set('app.outputDir', dir);
}

/**
 * Issue #8: Get configured proxy URL (e.g. "http://proxy.corp.com:8080")
 * Returns empty string if no proxy is configured.
 */
export function getProxyUrl(): string {
  return getStore().get('app.proxyUrl', '') as string;
}

/**
 * Issue #8: Set proxy URL for network requests
 */
export function setProxyUrl(url: string): void {
  getStore().set('app.proxyUrl', url);
}

/**
 * Get persisted renderer state by key (for Zustand persist)
 */
export function getRendererState(key: string): string | null {
  return getStore().get(`rendererState.${key}`, null) as string | null;
}

/**
 * Set persisted renderer state by key (for Zustand persist)
 */
export function setRendererState(key: string, value: string): void {
  getStore().set(`rendererState.${key}`, value);
}

/**
 * Remove persisted renderer state by key (for Zustand persist)
 */
export function removeRendererState(key: string): void {
  getStore().delete(`rendererState.${key}` as keyof StoreSchema);
}

export { defaultLLMConfig, defaultPipelineConfig, defaultAppSettings };

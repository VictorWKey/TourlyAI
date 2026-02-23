/**
 * Setup IPC Handlers
 * ===================
 * IPC handlers for the setup wizard and first-run configuration.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { setupManager, type SetupState } from '../setup/SetupManager';
import { ollamaInstaller } from '../setup/OllamaInstaller';
import { modelDownloader } from '../setup/ModelDownloader';
import { pythonSetup } from '../setup/PythonSetup';
import { getStore, defaultLLMConfig } from '../utils/store';
import { getPythonBridge } from '../python/bridge';

/**
 * Register all setup-related IPC handlers
 */
export function registerSetupHandlers(): void {
  // Check if this is the first run
  ipcMain.handle('setup:is-first-run', () => {
    return setupManager.isFirstRun();
  });

  // Get current setup state
  ipcMain.handle('setup:get-state', () => {
    return setupManager.getSetupState();
  });

  // Run system requirements check
  ipcMain.handle('setup:system-check', async () => {
    return setupManager.runSystemCheck();
  });

  // ============================================
  // Python Environment Setup Handlers
  // ============================================

  // Check Python setup status
  ipcMain.handle('setup:check-python', async () => {
    return pythonSetup.checkStatus();
  });

  // Setup Python environment (venv + dependencies)
  ipcMain.handle('setup:setup-python', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    const success = await pythonSetup.setup((progress) => {
      window?.webContents.send('setup:python-progress', progress);
    });

    // IMPORTANT: Only mark pythonReady as true when setup actually completes successfully
    if (success) {
      setupManager.updateSetupState({ pythonReady: true });
      console.log('[Setup] Python environment setup completed successfully, pythonReady: true');
      
      // CRITICAL: Restart the Python bridge NOW so it uses the venv Python.
      // Without this, the bridge singleton (created at app startup with system Python)
      // would be used for model downloads, which fail because transformers etc.
      // are only installed in the venv, not in system Python.
      try {
        const bridge = getPythonBridge();
        await bridge.restart();
        console.log('[Setup] Python bridge restarted to use venv Python after setup');
      } catch (bridgeError) {
        console.error('[Setup] Failed to restart Python bridge after setup:', bridgeError);
      }
    } else {
      // Ensure pythonReady is false if setup failed
      setupManager.updateSetupState({ pythonReady: false });
      console.log('[Setup] Python environment setup failed, pythonReady: false');
    }

    return success;
  });

  // Get Python paths
  ipcMain.handle('setup:get-python-paths', () => {
    return {
      pythonDir: pythonSetup.getPythonDir(),
      venvDir: pythonSetup.getVenvDir(),
      pythonPath: pythonSetup.getPythonPath(),
    };
  });

  // Set LLM provider choice (ollama or openai)
  ipcMain.handle('setup:set-llm-provider', (_, provider: 'ollama' | 'openai') => {
    setupManager.updateSetupState({ llmProvider: provider });
    
    // Also update the app settings
    const store = getStore();
    store.set('llm.mode', provider === 'ollama' ? 'local' : 'api');
    
    return { success: true };
  });

  // Check if Ollama is installed
  ipcMain.handle('setup:check-ollama', async () => {
    const installed = await ollamaInstaller.isInstalled();
    const running = await ollamaInstaller.isRunning();
    const version = installed ? await ollamaInstaller.getVersion() : null;
    
    return { installed, running, version };
  });

  // Install Ollama
  ipcMain.handle('setup:install-ollama', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    return ollamaInstaller.install((progress) => {
      window?.webContents.send('setup:ollama-progress', progress);
    });
  });

  // Unified Ollama installation: Install software + model in one go
  // This is the recommended way to install Ollama - installation is NOT complete until a model is ready
  ipcMain.handle('setup:install-ollama-with-model', async (event, modelName: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    const success = await ollamaInstaller.installWithModel(modelName, (progress) => {
      window?.webContents.send('setup:ollama-progress', progress);
    });

    if (success) {
      // Both flags must be true for a complete installation
      setupManager.updateSetupState({ 
        ollamaInstalled: true, 
        ollamaModelReady: true 
      });
      
      // Save the model name to settings
      const store = getStore();
      store.set('llm.localModel', modelName);
    }
    
    return { success };
  });

  // Check if Ollama is fully ready (installed AND has at least one model)
  ipcMain.handle('setup:check-ollama-fully-ready', async () => {
    return ollamaInstaller.isFullyReady();
  });

  // Start Ollama service
  ipcMain.handle('setup:start-ollama', async () => {
    try {
      await ollamaInstaller.startService();
      setupManager.updateSetupState({ ollamaInstalled: true });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Pull Ollama model
  ipcMain.handle('setup:pull-ollama-model', async (event, modelName: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    const success = await ollamaInstaller.pullModel(modelName, (progress) => {
      window?.webContents.send('setup:ollama-progress', progress);
    });

    if (success) {
      setupManager.updateSetupState({ ollamaModelReady: true });
      
      // Always update the configured model to the one just pulled.
      // The previous guard (!currentModel) was broken because the electron-store
      // default ('llama3.2:3b') always provided a truthy value, preventing the
      // user's actually-installed model from being saved.
      const store = getStore();
      store.set('llm.localModel', modelName);
    }
    
    return { success };
  });

  // Check if a model can be deleted (prevent deleting last model)
  ipcMain.handle('setup:can-delete-ollama-model', async (_, modelName: string) => {
    return ollamaInstaller.canDeleteModel(modelName);
  });

  // Get Ollama model count
  ipcMain.handle('setup:get-ollama-model-count', async () => {
    return ollamaInstaller.getModelCount();
  });

  // Check if a specific Ollama model is available
  ipcMain.handle('setup:has-ollama-model', async (_, modelName: string) => {
    return ollamaInstaller.hasModel(modelName);
  });

  // List installed Ollama models
  ipcMain.handle('setup:list-ollama-models', async () => {
    return ollamaInstaller.listModels();
  });

  // ============================================
  // Enhanced Hardware Detection Handlers
  // ============================================

  // Detect hardware with detailed information
  ipcMain.handle('setup:detect-hardware', async () => {
    return setupManager.detectHardware();
  });

  // Save manual hardware overrides
  ipcMain.handle('setup:save-hardware-overrides', (_, overrides: {
    cpuTier?: 'low' | 'mid' | 'high';
    ramGB?: number;
    gpuType?: 'none' | 'integrated' | 'dedicated';
    vramGB?: number;
  }) => {
    setupManager.saveHardwareOverrides(overrides);
    return { success: true };
  });

  // Clear hardware overrides (use auto-detection)
  ipcMain.handle('setup:clear-hardware-overrides', () => {
    setupManager.clearHardwareOverrides();
    return { success: true };
  });

  // Validate OpenAI API key
  ipcMain.handle('setup:validate-openai-key', async (_, apiKey: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      // Step 1: Check if the key is valid (authentication)
      const authResponse = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });

      if (!authResponse.ok) {
        clearTimeout(timeoutId);
        return { valid: false, error: 'Clave API inválida', errorCode: 'invalid_key' };
      }

      // Step 2: Check if the key has billing/credits with a minimal API call
      // The /v1/models endpoint succeeds even with no credits, so we must
      // make a real inference call to detect billing issues.
      try {
        const billingController = new AbortController();
        const billingTimeoutId = setTimeout(() => billingController.abort(), 15000);

        const billingResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
          }),
          signal: billingController.signal,
        });

        clearTimeout(billingTimeoutId);

        if (!billingResponse.ok) {
          const errorBody = await billingResponse.json().catch(() => ({}));
          const errorCode = (errorBody as { error?: { code?: string } })?.error?.code || '';
          const errorType = (errorBody as { error?: { type?: string } })?.error?.type || '';

          if (
            billingResponse.status === 429 &&
            (errorCode === 'insufficient_quota' || errorType === 'insufficient_quota')
          ) {
            return { valid: false, error: 'insufficient_quota', errorCode: 'no_credits' };
          }

          if (billingResponse.status === 429) {
            // Rate limited but not quota — key is fine, just temporarily throttled
            // Treat as valid since the key works
          } else {
            // Other errors (e.g., 403, 500) — still mark key as valid since auth passed
            console.warn(`[Setup] OpenAI billing check returned ${billingResponse.status}:`, errorBody);
          }
        }
      } catch (billingError) {
        // If the billing check itself fails (network, timeout), don't block the user.
        // The key passed auth — we'll let them proceed and handle quota errors at runtime.
        console.warn('[Setup] OpenAI billing check failed, proceeding with valid key:', billingError);
      }

      clearTimeout(timeoutId);

      // Key is valid and has credits (or billing check was inconclusive)
      setupManager.updateSetupState({ openaiKeyConfigured: true });
      
      // Save the API key to settings
      const store = getStore();
      store.set('llm.apiKey', apiKey);
      store.set('llm.apiProvider', 'openai');
      
      return { valid: true, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { valid: false, error: message, errorCode: 'connection_error' };
    }
  });

  // Check models download status
  ipcMain.handle('setup:check-models', async () => {
    return modelDownloader.checkModelsStatus();
  });

  // Download all required models
  ipcMain.handle('setup:download-models', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    const result = await modelDownloader.downloadAllModels((progress) => {
      window?.webContents.send('setup:model-progress', progress);
      
      // Update setup state when models complete
      if (progress.status === 'complete') {
        const validKeys = ['sentiment', 'embeddings', 'subjectivity', 'categories'];
        if (validKeys.includes(progress.model)) {
          const updates: Record<string, boolean> = { [progress.model]: true };
          setupManager.updateModelsDownloaded(updates as Partial<SetupState['modelsDownloaded']>);
        }
      }
    });

    return result;
  });

  // Get total download size for models
  ipcMain.handle('setup:get-download-size', async () => {
    const sizeMB = await modelDownloader.getTotalDownloadSize();
    const sizeFormatted = modelDownloader.getEstimatedTotalSize();
    return { size_mb: sizeMB, formatted: sizeFormatted };
  });

  // Get list of required models
  ipcMain.handle('setup:get-required-models', () => {
    return modelDownloader.getRequiredModels();
  });

  // Mark setup as complete
  ipcMain.handle('setup:complete', async () => {
    setupManager.markSetupComplete();
    
    // Log the final LLM configuration that will be used
    const store = getStore();
    const llmConfig = store.get('llm');
    console.log('[Setup] Setup complete. Final LLM config:', JSON.stringify(llmConfig, null, 2));
    
    // Restart Python bridge to ensure it uses the correct venv Python path
    // and the latest LLM settings (model name, mode, etc.)
    try {
      const bridge = getPythonBridge();
      await bridge.restart();
      console.log('[Setup] Python bridge restarted with updated configuration');
    } catch (error) {
      console.error('[Setup] Failed to restart Python bridge:', error);
    }
    
    // Auto-start Ollama if the user chose local LLM
    if (llmConfig?.mode === 'local') {
      try {
        const installed = await ollamaInstaller.isInstalled();
        if (installed && !(await ollamaInstaller.isRunning())) {
          await ollamaInstaller.startService();
          console.log('[Setup] Ollama service started after setup completion');
        }
      } catch (err) {
        console.warn('[Setup] Failed to auto-start Ollama after setup:', err);
      }
    }
    
    return { success: true };
  });

  // Reset setup state (for testing)
  ipcMain.handle('setup:reset', () => {
    setupManager.resetSetupState();
    // Also reset LLM config to defaults
    const store = getStore();
    store.set('llm', defaultLLMConfig);
    console.log('[Setup] Reset complete. LLM config reset to defaults:', defaultLLMConfig);
    return { success: true };
  });

  // Clean Python environment and reinstall
  ipcMain.handle('setup:clean-python', async () => {
    return pythonSetup.cleanEnvironment();
  });

  // Uninstall Ollama completely
  ipcMain.handle('setup:uninstall-ollama', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    
    return ollamaInstaller.uninstall((message) => {
      window?.webContents.send('setup:ollama-uninstall-progress', { message });
    });
  });

  // Stop Ollama service
  ipcMain.handle('setup:stop-ollama', async () => {
    try {
      await ollamaInstaller.stopService();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Download a specific model (not all)
  ipcMain.handle('setup:download-specific-model', async (event, modelKey: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    return modelDownloader.downloadModel(modelKey, (progress) => {
      window?.webContents.send('setup:model-progress', progress);
    });
  });

  // Preload downloaded models into memory for faster pipeline execution
  ipcMain.handle('setup:preload-models', async () => {
    try {
      const bridge = getPythonBridge();
      const result = await bridge.execute({ action: 'preload_models' }, 300000); // 5 min timeout
      return { success: result.success || false, details: result.details };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Setup] Failed to preload models:', message);
      return { success: false, error: message };
    }
  });

  // Validate setup state against actual system state
  // Called on wizard open to reset flags that no longer match reality
  // (e.g., user closed window mid-installation, deleted files externally)
  ipcMain.handle('setup:validate-state', async () => {
    try {
      await setupManager.validateSetupState();
      return { success: true, state: setupManager.getSetupState() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Setup] State validation failed:', message);
      return { success: false, error: message };
    }
  });

  console.log('[IPC] Setup handlers registered');
}

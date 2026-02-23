/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import { app, BrowserWindow, Menu, nativeTheme, ipcMain } from 'electron';
import path from 'node:path';
// Initialize Sentry BEFORE anything else — captures crashes from the very start
import { initSentryMain } from './main/utils/sentry';
initSentryMain();
// Initialize production logger — captures all console.log/error to file
import log from './main/utils/logger';
import { registerIpcHandlers } from './main/ipc';
import { initializeStore, getLLMConfig, setLLMConfig, getStore } from './main/utils/store';
import { getPythonBridge, stopPythonBridge } from './main/python/bridge';
import { ollamaInstaller } from './main/setup/OllamaInstaller';
import { pythonSetup } from './main/setup/PythonSetup';
import { initAutoUpdater } from './main/utils/autoUpdater';
import { handleSquirrelEvents } from './main/setup/UninstallHandler';

log.info(`App starting — v${app.getVersion()}, packaged=${app.isPackaged}`);

// ── Isolate dev from production data ──
// In dev mode, append '-dev' to the app name so that userData, electron-store
// files, Local Storage, and Session Storage go to a separate directory.
// Dev:  %APPDATA%/tourlyai-desktop-dev/
// Prod: %APPDATA%/tourlyai-desktop/
if (!app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')}-dev`);
  log.info(`Dev mode — userData isolated to: ${app.getPath('userData')}`);
}

// Apply saved theme preference from settings (defaults to 'system')
// Will be updated dynamically via IPC when user changes theme in the UI.
function applyThemeFromStore(): void {
  try {
    const store = getStore();
    const theme = store.get('app.theme', 'system') as string;
    nativeTheme.themeSource = theme as 'light' | 'dark' | 'system';
  } catch {
    nativeTheme.themeSource = 'system';
  }
}

// Register theme IPC handlers (called after store is initialized)
function registerThemeHandlers(): void {
  // Get the current resolved theme (always 'light' or 'dark')
  ipcMain.handle('theme:get-native', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  // Set the native theme source ('light', 'dark', or 'system')
  ipcMain.handle('theme:set-native', (_, theme: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = theme;
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  // Notify renderer when OS theme changes (relevant when preference is 'system')
  nativeTheme.on('updated', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(
        'theme:changed',
        nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
      );
    }
  });
}

// ── Squirrel lifecycle events (Windows installer) ──
// Detect Squirrel events synchronously so we can skip normal initialization.
// During install/update/uninstall, the app should NOT create windows or start services.
const isSquirrelEvent = process.platform === 'win32' &&
  process.argv.some(arg => arg.startsWith('--squirrel-'));

// Handle Squirrel events asynchronously (shows cleanup dialog on uninstall, etc.)
handleSquirrelEvents().then((shouldQuit) => {
  if (shouldQuit) {
    app.quit();
  }
});

let mainWindow: BrowserWindow | null = null;

const createWindow = (): void => {
  // Create the browser window with improved settings.
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true, // Hide the menu bar (File, Edit, View, etc.)
    show: false, // Show when ready to prevent visual flash
  });

  // Remove the menu bar completely
  Menu.setApplicationMenu(null);

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the app
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

/**
 * Initialize Python bridge (lazy initialization)
 * The bridge will start on first use, but we warm it up here
 * ONLY if the Python venv is already set up (not on first run)
 */
async function initializePythonBridge(): Promise<void> {
  try {
    // CRITICAL: Don't eagerly start the bridge if the venv doesn't exist yet.
    // On first run, the setup wizard will create the venv, install deps, and
    // then restart the bridge. Starting it now with system Python would cause
    // the bridge singleton to use the wrong Python, making model downloads fail
    // with "No module named 'transformers'" because transformers is only in the venv.
    if (!pythonSetup.isSetupComplete()) {
      console.log('[Main] Python setup not complete yet, deferring bridge initialization');
      
      // Still create the singleton and register event listeners,
      // but DON'T start the process yet
      const bridge = getPythonBridge();
      
      bridge.on('error', (error: string) => {
        if (error.toLowerCase().includes('error') || 
            error.toLowerCase().includes('exception') ||
            error.toLowerCase().includes('traceback') ||
            error.toLowerCase().includes('failed')) {
          console.error('[Main] Python Error:', error);
        }
      });

      bridge.on('info', (message: string) => {
        console.log('[Main]', message);
      });

      bridge.on('close', (code: number) => {
        console.log('[Main] Python bridge closed with code:', code);
      });
      
      return; // Don't start or preload — setup wizard will handle it
    }
    
    const bridge = getPythonBridge();
    
    // Listen for bridge events
    bridge.on('error', (error: string) => {
      // Only log actual errors (contains error keywords)
      if (error.toLowerCase().includes('error') || 
          error.toLowerCase().includes('exception') ||
          error.toLowerCase().includes('traceback') ||
          error.toLowerCase().includes('failed')) {
        console.error('[Main] Python Error:', error);
      }
    });

    bridge.on('info', (message: string) => {
      console.log('[Main]', message);
    });

    bridge.on('close', (code: number) => {
      console.log('[Main] Python bridge closed with code:', code);
    });

    // Start the bridge in background (don't block app startup)
    // NOTE: ML model preloading was removed to prevent blocking user interactions
    // (dataset loading, validation, etc.). The Python bridge is single-process,
    // so preloading models would occupy it for 30-120s, making other commands
    // unresponsive. Models are loaded on-demand by each pipeline phase instead.
    bridge.start().then(() => {
      console.log('[Main] Python bridge started successfully');
    }).catch((error) => {
      console.error('[Main] Failed to start Python bridge:', error);
    });
  } catch (error) {
    console.error('[Main] Error initializing Python bridge:', error);
  }
}

/**
 * Auto-start Ollama service if configured for local LLM mode
 * Checks if Ollama is installed but not running, and starts it automatically
 */
async function autoStartOllama(): Promise<void> {
  try {
    const llmConfig = getLLMConfig();
    if (llmConfig.mode !== 'local') {
      return; // Only auto-start when using local LLM mode
    }

    const installed = await ollamaInstaller.isInstalled();
    if (!installed) {
      console.log('[Main] Ollama not installed, skipping auto-start');
      return;
    }

    const running = await ollamaInstaller.isRunning();
    if (running) {
      console.log('[Main] Ollama already running');
    } else {
      console.log('[Main] Auto-starting Ollama service...');
      await ollamaInstaller.startService();
      // Issue #15: Track that we started Ollama so we can stop it on quit
      pythonSetup.setOllamaStartedByUs(true);
      console.log('[Main] Ollama service started successfully (will stop on quit)');
    }

    // Validate that the configured model actually exists in Ollama.
    // This prevents the app from trying to use a model the user never installed
    // (e.g., the hardcoded default 'llama3.2:3b' when only 'llama3.1' is available).
    await validateConfiguredModel();
  } catch (error) {
    console.warn('[Main] Failed to auto-start Ollama:', error instanceof Error ? error.message : error);
  }
}

/**
 * Validate that the configured Ollama model is actually installed.
 * If the configured model does not exist, auto-correct to the first installed model.
 */
async function validateConfiguredModel(): Promise<void> {
  try {
    const llmConfig = getLLMConfig();
    const configuredModel = llmConfig.localModel;

    if (!configuredModel) {
      // No model configured — pick the first installed model
      const models = await ollamaInstaller.listModels();
      if (models.length > 0) {
        const firstModel = models[0].name;
        console.log(`[Main] No Ollama model configured, auto-selecting: ${firstModel}`);
        setLLMConfig({ localModel: firstModel });
      }
      return;
    }

    // Check if the configured model is actually installed
    const hasModel = await ollamaInstaller.hasModel(configuredModel);
    if (!hasModel) {
      const models = await ollamaInstaller.listModels();
      if (models.length > 0) {
        const firstModel = models[0].name;
        console.warn(
          `[Main] Configured model '${configuredModel}' not found in Ollama. ` +
          `Auto-correcting to installed model: '${firstModel}'`
        );
        setLLMConfig({ localModel: firstModel });
      } else {
        console.warn(`[Main] Configured model '${configuredModel}' not found and no models installed`);
      }
    } else {
      console.log(`[Main] Configured Ollama model '${configuredModel}' is available`);
    }
  } catch (error) {
    console.warn('[Main] Failed to validate configured model:', error);
  }
}

// Initialize app when ready
app.on('ready', async () => {
  // During Squirrel events (install/update/uninstall), skip normal initialization.
  // The handleSquirrelEvents() handler above will manage the lifecycle and quit.
  if (isSquirrelEvent) return;

  await initializeStore();
  registerIpcHandlers();
  registerThemeHandlers();
  applyThemeFromStore();
  createWindow();
  
  // Initialize auto-updater (checks for updates in production)
  initAutoUpdater(mainWindow);
  
  // Initialize Python bridge after window is created
  initializePythonBridge();

  // Auto-start Ollama if LLM mode is 'local' and Ollama is installed but not running
  autoStartOllama();
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create a window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Clean up Python bridge and Ollama before quitting
app.on('before-quit', async () => {
  console.log('[Main] Stopping Python bridge before quit...');
  stopPythonBridge();

  // Issue #15: Stop Ollama service if we started it
  // Don't stop it if it was already running when we launched — the user may
  // be using it for other purposes.
  if (pythonSetup.getOllamaStartedByUs()) {
    console.log('[Main] Stopping Ollama service (started by us)...');
    try {
      await ollamaInstaller.stopService();
      console.log('[Main] Ollama service stopped');
    } catch (error) {
      console.warn('[Main] Failed to stop Ollama:', error);
    }
  }
});

// Export mainWindow for IPC handlers that need to send events
export { mainWindow };

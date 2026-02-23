/**
 * UninstallHandler - Manages cleanup during app uninstall (Cross-Platform)
 * =========================================================================
 * Handles cleanup of external resources created by this app:
 * 
 * Windows (Squirrel):
 *   When the user uninstalls via "Add/Remove Programs", Squirrel 
 *   launches the app with --squirrel-uninstall. This handler:
 *   1. Detects all external resources created by this app
 *   2. Removes everything automatically (Ollama, models, app data, env vars)
 *   3. Then lets Squirrel finish removing the app files
 * 
 * macOS / Linux:
 *   Exposes a cleanupExternalResources() function that can be called
 *   from the app's settings/about page for manual cleanup.
 * 
 * External resources by platform:
 *   Windows: %APPDATA%\tourlyai-desktop, %LOCALAPPDATA%\Programs\Ollama, %USERPROFILE%\.ollama
 *   macOS:   ~/Library/Application Support/tourlyai-desktop, /Applications/Ollama.app, ~/.ollama
 *   Linux:   ~/.config/tourlyai-desktop, /usr/local/bin/ollama, ~/.ollama
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Resources to remove during uninstall (all detected items are always included) */
export interface UninstallChoices {
  removeOllama: boolean;
  removeAppData: boolean;
  removeOllamaModels: boolean;
}

/**
 * Known paths for external resources created by this app (cross-platform)
 */
function getExternalPaths() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  
  if (process.platform === 'win32') {
    return {
      appData: path.join(
        process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
        'tourlyai-desktop'
      ),
      ollamaInstall: path.join(
        process.env.LOCALAPPDATA || '',
        'Programs',
        'Ollama'
      ),
      ollamaModels: path.join(homeDir, '.ollama'),
    };
  } else if (process.platform === 'darwin') {
    return {
      appData: path.join(homeDir, 'Library', 'Application Support', 'tourlyai-desktop'),
      ollamaInstall: '/Applications/Ollama.app',
      ollamaModels: path.join(homeDir, '.ollama'),
    };
  } else {
    // Linux
    return {
      appData: path.join(process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'), 'tourlyai-desktop'),
      ollamaInstall: '/usr/local/bin/ollama',
      ollamaModels: path.join(homeDir, '.ollama'),
    };
  }
}

/**
 * Detect which external resources exist on this system
 */
function detectInstalledResources(): { ollamaInstalled: boolean; appDataExists: boolean; ollamaModelsExist: boolean } {
  const paths = getExternalPaths();
  return {
    ollamaInstalled: fs.existsSync(paths.ollamaInstall),
    appDataExists: fs.existsSync(paths.appData),
    ollamaModelsExist: fs.existsSync(paths.ollamaModels),
  };
}

/**
 * Build removal choices based on what is actually installed.
 * Always removes everything that is detected — no prompts.
 */
function buildUninstallChoices(): UninstallChoices {
  const resources = detectInstalledResources();
  return {
    removeOllama: resources.ollamaInstalled,
    removeAppData: resources.appDataExists,
    removeOllamaModels: resources.ollamaModelsExist,
  };
}

/**
 * Execute the actual cleanup based on user choices (cross-platform)
 */
async function executeCleanup(choices: UninstallChoices): Promise<void> {
  const paths = getExternalPaths();
  const isWindows = process.platform === 'win32';

  // 1. Stop Ollama processes (needed before removing files)
  if (choices.removeOllama || choices.removeOllamaModels) {
    try {
      if (isWindows) {
        await execAsync('taskkill /F /IM ollama.exe /T 2>nul');
      } else {
        await execAsync('pkill -f "ollama" 2>/dev/null || true');
      }
    } catch {
      // Process may not be running — that's fine
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  // 2. Remove app settings & data
  if (choices.removeAppData && fs.existsSync(paths.appData)) {
    try {
      fs.rmSync(paths.appData, { recursive: true, force: true });
    } catch {
      // Best-effort with platform-specific fallback
      try {
        if (isWindows) {
          await execAsync(
            `powershell -Command "Remove-Item -Path '${paths.appData}' -Recurse -Force -ErrorAction SilentlyContinue"`
          );
        } else {
          await execAsync(`rm -rf "${paths.appData}"`);
        }
      } catch {
        // Ignore — OS will clean up later
      }
    }
  }

  // 3. Remove Ollama installation
  if (choices.removeOllama && fs.existsSync(paths.ollamaInstall)) {
    try {
      fs.rmSync(paths.ollamaInstall, { recursive: true, force: true });
    } catch {
      try {
        if (isWindows) {
          await execAsync(
            `powershell -Command "Remove-Item -Path '${paths.ollamaInstall}' -Recurse -Force -ErrorAction SilentlyContinue"`
          );
        } else {
          await execAsync(`rm -rf "${paths.ollamaInstall}"`);
        }
      } catch {
        // Ignore
      }
    }

    // Linux: also remove systemd service
    if (process.platform === 'linux') {
      try {
        await execAsync('sudo systemctl stop ollama 2>/dev/null; sudo systemctl disable ollama 2>/dev/null; sudo rm -f /etc/systemd/system/ollama.service');
      } catch {
        // Best effort
      }
    }
  }

  // 4. Remove Ollama models & config
  if (choices.removeOllamaModels && fs.existsSync(paths.ollamaModels)) {
    try {
      fs.rmSync(paths.ollamaModels, { recursive: true, force: true });
    } catch {
      try {
        if (isWindows) {
          await execAsync(
            `powershell -Command "Remove-Item -Path '${paths.ollamaModels}' -Recurse -Force -ErrorAction SilentlyContinue"`
          );
        } else {
          await execAsync(`rm -rf "${paths.ollamaModels}"`);
        }
      } catch {
        // Ignore
      }
    }
  }

  // 5. Clean environment variables (Windows only — macOS/Linux don't persist env this way)
  if (choices.removeOllama && isWindows) {
    try {
      await execAsync(
        `powershell -Command "[System.Environment]::SetEnvironmentVariable('OLLAMA_MODELS', $null, 'User')"`
      );
      await execAsync(
        `powershell -Command "[System.Environment]::SetEnvironmentVariable('OLLAMA_HOST', $null, 'User')"`
      );

      // Clean PATH: remove Ollama entries
      const { stdout: currentPath } = await execAsync(
        `powershell -Command "[System.Environment]::GetEnvironmentVariable('Path','User')"`
      );
      const pathParts = currentPath.trim().split(';');
      const cleanedPath = pathParts
        .filter(p => !p.toLowerCase().includes('ollama'))
        .join(';');

      if (cleanedPath !== currentPath.trim()) {
        await execAsync(
          `powershell -Command "[System.Environment]::SetEnvironmentVariable('Path', '${cleanedPath.replace(/'/g, "''")}', 'User')"`
        );
      }
    } catch {
      // Best-effort — env cleanup is not critical
    }
  }
}

/**
 * Manually remove desktop/start-menu shortcuts via Squirrel's Update.exe.
 * This replaces what electron-squirrel-startup would do, but without the
 * immediate app.quit() side-effect that kills our cleanup dialogs.
 */
async function removeShortcuts(): Promise<void> {
  try {
    const appFolder = path.resolve(process.execPath, '..');
    const rootFolder = path.resolve(appFolder, '..');
    const updateExe = path.resolve(rootFolder, 'Update.exe');
    const exeName = path.basename(process.execPath);

    await execAsync(`"${updateExe}" --removeShortcut="${exeName}"`);
  } catch {
    // Best-effort — shortcut removal is not critical
  }
}

/**
 * Handle Squirrel lifecycle events (Windows only).
 * 
 * Returns true if the app should quit immediately (a Squirrel event was handled),
 * false if the app should continue starting normally.
 * 
 * IMPORTANT: This replaces `electron-squirrel-startup`. Call it early in main.ts
 * before creating any windows.
 * 
 * CRITICAL: We must NOT import electron-squirrel-startup for the --squirrel-uninstall
 * case because that module calls app.quit() immediately upon detecting any --squirrel-*
 * argument, which kills our cleanup dialogs before the user can interact with them.
 * Instead we handle shortcut removal manually via Update.exe for the uninstall case.
 */
export async function handleSquirrelEvents(): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false;
  }

  const squirrelArg = process.argv.find(arg => arg.startsWith('--squirrel-'));
  if (!squirrelArg) {
    return false;
  }

  // ── Handle uninstall BEFORE importing electron-squirrel-startup ──
  if (squirrelArg === '--squirrel-uninstall') {
    try {
      if (!app.isReady()) {
        await app.whenReady();
      }

      await removeShortcuts();

      const choices = buildUninstallChoices();
      await executeCleanup(choices);
    } catch (error) {
      console.error('[Uninstall] Cleanup error:', error);
    }

    return true;
  }

  // ── For install/updated/obsolete: use electron-squirrel-startup ──
  const SquirrelStartup = await import('electron-squirrel-startup');
  return SquirrelStartup.default;
}

/**
 * Clean up external resources (callable from any platform).
 * This is used for macOS/Linux where there's no Squirrel uninstall event,
 * or from a "Clean up data" button in the app's settings.
 */
export async function cleanupExternalResources(): Promise<UninstallChoices | null> {
  if (!app.isReady()) {
    await app.whenReady();
  }

  const choices = buildUninstallChoices();

  // Nothing detected — nothing to remove
  if (!choices.removeOllama && !choices.removeAppData && !choices.removeOllamaModels) {
    return null;
  }

  await executeCleanup(choices);
  return choices;
}

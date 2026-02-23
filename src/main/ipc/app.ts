// ============================================
// App IPC Handlers
// ============================================

import { ipcMain, app } from 'electron';
import path from 'path';
import { getOutputDir } from '../utils/store';
import { pythonSetup } from '../setup/PythonSetup';
import { checkForUpdates, quitAndInstall, getUpdateStatus } from '../utils/autoUpdater';

export function registerAppHandlers(): void {
  // Get app version
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  // Get app name
  ipcMain.handle('app:get-name', () => {
    return app.getName();
  });

  // Get app path
  ipcMain.handle('app:get-path', (_, name: string) => {
    try {
      return app.getPath(name as Parameters<typeof app.getPath>[0]);
    } catch (error) {
      return null;
    }
  });

  // Get Python data directory (where visualizations are saved)
  // Issue #3: Default output goes to userData/python-env/data/ to survive updates
  ipcMain.handle('app:get-python-data-dir', () => {
    // If a custom output directory is configured, use its data/ subfolder
    const outputDir = getOutputDir();
    if (outputDir) {
      return path.join(outputDir, 'data');
    }

    // Use the persistent data dir from PythonSetup (userData/python-env/data/)
    // This ensures output data survives Squirrel auto-updates.
    return pythonSetup.getDataDir();
  });

  // Get system info
  ipcMain.handle('app:get-system-info', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
    };
  });

  // --- Auto-updater IPC handlers ---
  ipcMain.handle('updater:check', async () => {
    const result = await checkForUpdates();
    return result ? { version: result.updateInfo.version } : null;
  });

  ipcMain.handle('updater:get-status', () => {
    return getUpdateStatus();
  });

  ipcMain.handle('updater:quit-and-install', () => {
    quitAndInstall();
  });

  console.log('[IPC] App handlers registered');
}

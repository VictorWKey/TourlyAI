/**
 * OllamaInstaller - Cross-platform Ollama auto-installer
 * =======================================================
 * Handles automatic installation of Ollama on Windows, macOS, and Linux.
 * Includes progress tracking and model pulling functionality.
 */

import { spawn, exec } from 'child_process';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { promisify } from 'util';
import { getProxyUrl } from '../utils/store';

const execAsync = promisify(exec);

type Platform = 'darwin' | 'win32' | 'linux';

export interface OllamaDownloadProgress {
  stage: 'idle' | 'downloading' | 'installing' | 'starting' | 'pulling-model' | 'complete' | 'error';
  progress: number;
  message: string;
  error?: string;
  // Unified installation tracking - installation is NOT complete until a model is ready
  unifiedProgress?: number; // Overall progress 0-100 across all phases
  currentPhase?: 'software' | 'model'; // Which phase we're in
}

/**
 * OllamaInstaller class for cross-platform Ollama installation
 */
export class OllamaInstaller {
  // Download URLs only needed for macOS now (Windows uses winget, Linux uses install script)
  private downloadUrls: Record<Platform, string> = {
    darwin: 'https://ollama.com/download/Ollama-darwin.zip',
    win32: '', // Uses winget
    linux: '', // Uses install script
  };

  /**
   * Get the expected Ollama executable path on Windows
   */
  private getWindowsOllamaPath(): string {
    return path.join(
      process.env.LOCALAPPDATA || '',
      'Programs',
      'Ollama',
      'ollama.exe'
    );
  }

  /**
   * Check if Ollama is installed (Windows native only, not WSL)
   */
  async isInstalled(): Promise<boolean> {
    if (process.platform === 'win32') {
      // On Windows, check the standard installation location directly
      const ollamaPath = this.getWindowsOllamaPath();
      if (fs.existsSync(ollamaPath)) {
        return true;
      }
      
      // Fallback: check PATH but verify it's a Windows path
      return new Promise((resolve) => {
        exec('where ollama', (error, stdout) => {
          if (error) {
            resolve(false);
            return;
          }
          // Verify it's a Windows executable, not WSL
          const isWindowsPath = stdout.trim().toLowerCase().includes('\\') && 
                               !stdout.toLowerCase().includes('wsl');
          resolve(isWindowsPath);
        });
      });
    } else {
      // On Unix systems, use standard check
      return new Promise((resolve) => {
        exec('ollama --version', (error) => {
          resolve(!error);
        });
      });
    }
  }

  /**
   * Check if Ollama service is running
   */
  async isRunning(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch('http://localhost:11434/api/tags', {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get installed Ollama version
   */
  async getVersion(): Promise<string | null> {
    try {
      if (process.platform === 'win32') {
        const ollamaPath = this.getWindowsOllamaPath();
        if (!fs.existsSync(ollamaPath)) {
          return null;
        }
        const { stdout } = await execAsync(`"${ollamaPath}" --version`);
        return stdout.trim();
      } else {
        const { stdout } = await execAsync('ollama --version');
        return stdout.trim();
      }
    } catch {
      return null;
    }
  }

  /**
   * Install Ollama on the current platform
   */
  async install(onProgress: (p: OllamaDownloadProgress) => void): Promise<boolean> {
    const platform = process.platform as Platform;

    // Check if already installed
    if (await this.isInstalled()) {
      onProgress({ stage: 'complete', progress: 100, message: 'Ollama already installed' });
      return true;
    }

    try {
      if (platform === 'linux') {
        await this.installLinux(onProgress);
        // Start Ollama service for Linux
        onProgress({ stage: 'starting', progress: 90, message: 'Starting Ollama service...' });
        await this.startService();
      } else if (platform === 'darwin') {
        await this.installMacOS(onProgress);
        // Start Ollama service for macOS
        onProgress({ stage: 'starting', progress: 90, message: 'Starting Ollama service...' });
        await this.startService();
      } else if (platform === 'win32') {
        // Windows installation includes starting the service
        await this.installWindows(onProgress);
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      onProgress({ stage: 'complete', progress: 100, message: 'Ollama installed successfully' });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onProgress({
        stage: 'error',
        progress: 0,
        message: 'Installation failed',
        error: errorMessage,
      });
      return false;
    }
  }

  /**
   * Install Ollama on Linux using the official install script
   */
  private async installLinux(onProgress: (p: OllamaDownloadProgress) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      onProgress({ stage: 'installing', progress: 10, message: 'Running Ollama install script...' });

      const install = spawn('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'], {
        stdio: 'pipe',
      });

      let progressValue = 10;

      install.stdout?.on('data', (data: Buffer) => {
        progressValue = Math.min(progressValue + 5, 75);
        onProgress({ 
          stage: 'installing', 
          progress: progressValue, 
          message: data.toString().trim() || 'Installing Ollama...' 
        });
      });

      install.stderr?.on('data', (data: Buffer) => {
        // Some output goes to stderr but isn't an error
        const text = data.toString().trim();
        if (text && !text.includes('error')) {
          onProgress({ stage: 'installing', progress: progressValue, message: text });
        }
      });

      install.on('close', (code) => {
        if (code === 0) {
          onProgress({ stage: 'installing', progress: 80, message: 'Installation complete' });
          resolve();
        } else {
          reject(new Error(`Install script failed with code ${code}`));
        }
      });

      install.on('error', reject);
    });
  }

  /**
   * Install Ollama on macOS
   */
  private async installMacOS(onProgress: (p: OllamaDownloadProgress) => void): Promise<void> {
    const tempDir = app.getPath('temp');
    const zipPath = path.join(tempDir, 'Ollama-darwin.zip');

    // Download
    onProgress({ stage: 'downloading', progress: 0, message: 'Downloading Ollama...' });
    await this.downloadFile(this.downloadUrls.darwin, zipPath, (percent) => {
      onProgress({
        stage: 'downloading',
        progress: Math.round(percent * 0.6),
        message: `Downloading... ${Math.round(percent)}%`,
      });
    });

    // Extract
    onProgress({ stage: 'installing', progress: 60, message: 'Extracting...' });
    await execAsync(`unzip -o "${zipPath}" -d /Applications`);

    // Clear Gatekeeper quarantine flag so the app can launch without being blocked
    try {
      await execAsync('xattr -cr /Applications/Ollama.app');
    } catch {
      // xattr may fail if already cleared or not quarantined — that's fine
      console.log('[OllamaInstaller] xattr -cr skipped (not quarantined or already cleared)');
    }

    // Cleanup
    try {
      fs.unlinkSync(zipPath);
    } catch {
      // Ignore cleanup errors
    }

    onProgress({ stage: 'installing', progress: 80, message: 'Ollama installed' });
  }

  /**
   * Install Ollama on Windows by downloading and extracting the zip file
   * No installer, no GUI windows, just clean background installation
   * Uses PowerShell's Invoke-WebRequest for reliable downloading
   */
  private async installWindows(onProgress: (p: OllamaDownloadProgress) => void): Promise<void> {
    const ollamaExePath = this.getWindowsOllamaPath();
    const installDir = path.dirname(ollamaExePath);

    // Check if already installed
    if (fs.existsSync(ollamaExePath)) {
      onProgress({ stage: 'installing', progress: 85, message: 'Ollama already installed!' });
      
      // Just ensure service is running
      if (!(await this.isRunning())) {
        onProgress({ stage: 'starting', progress: 90, message: 'Starting Ollama service...' });
        await this.startServiceWindows(ollamaExePath);
      }
      return;
    }

    onProgress({ stage: 'downloading', progress: 0, message: 'Downloading Ollama...' });
    
    try {
      // Create installation directory
      if (!fs.existsSync(installDir)) {
        fs.mkdirSync(installDir, { recursive: true });
      }

      const zipPath = path.join(installDir, 'ollama.zip');
      // Issue #5: Support ARM64 Windows (e.g. Snapdragon laptops)
      const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
      const downloadUrl = `https://ollama.com/download/ollama-windows-${arch}.zip`;

      // Download using PowerShell's Invoke-WebRequest (more reliable than Node https)
      onProgress({ stage: 'downloading', progress: 5, message: 'Downloading Ollama...' });
      
      // Use PowerShell to download - this handles redirects properly
      // Issue #8: If proxy is configured, pass it to Invoke-WebRequest
      const proxyUrl = getProxyUrl();
      const proxyArg = proxyUrl ? ` -Proxy '${proxyUrl.replace(/'/g, "''")}'` : '';
      // Escape single quotes in paths (e.g., usernames like O'Brien)
      const escapedZipPath = zipPath.replace(/'/g, "''");
      // Need semicolons to separate statements in single-line PowerShell
      const downloadCommand = `powershell -Command "$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '${downloadUrl}' -OutFile '${escapedZipPath}'${proxyArg}; $ProgressPreference = 'Continue'"`;
      
      console.log('[OllamaInstaller] Downloading from:', downloadUrl);
      console.log('[OllamaInstaller] Saving to:', zipPath);
      
      await execAsync(downloadCommand);
      
      // Verify download succeeded
      if (!fs.existsSync(zipPath)) {
        throw new Error('Download failed - zip file not created');
      }
      
      const stats = fs.statSync(zipPath);
      console.log('[OllamaInstaller] Downloaded file size:', stats.size, 'bytes');
      
      if (stats.size < 1000000) {  // Less than 1MB is suspicious
        throw new Error(`Download appears incomplete - file size is only ${stats.size} bytes`);
      }

      onProgress({ stage: 'downloading', progress: 55, message: 'Download complete!' });

      // Extract the zip file using PowerShell
      onProgress({ stage: 'installing', progress: 60, message: 'Extracting Ollama...' });
      console.log('[OllamaInstaller] Extracting to:', installDir);
      
      await execAsync(
        `powershell -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${installDir.replace(/'/g, "''")}' -Force"`,
        { timeout: 60000 }
      );

      // Delete the zip file
      try {
        fs.unlinkSync(zipPath);
      } catch {
        // Ignore cleanup errors
      }

      onProgress({ stage: 'installing', progress: 70, message: 'Configuring PATH...' });

      // Add to PATH environment variable
      try {
        const { stdout: userPath } = await execAsync(
          'powershell -Command "[System.Environment]::GetEnvironmentVariable(\'Path\',\'User\')"'
        );
        
        const currentPath = userPath.trim();
        if (!currentPath.includes(installDir)) {
          // Escape single quotes in both currentPath and installDir to prevent
          // PowerShell injection from PATH entries containing special characters
          // (e.g., user directories with apostrophes like C:\Users\O'Brien\...)
          const escapedPath = `${currentPath};${installDir}`.replace(/'/g, "''");
          await execAsync(
            `powershell -Command "[System.Environment]::SetEnvironmentVariable('Path', '${escapedPath}', 'User')"`
          );
          console.log('[OllamaInstaller] Added to PATH:', installDir);
        }

        // Update PATH for current process
        if (!process.env.PATH?.includes(installDir)) {
          process.env.PATH = `${process.env.PATH};${installDir}`;
        }
      } catch (error) {
        console.warn('[OllamaInstaller] Failed to update PATH:', error);
        // Continue anyway, we'll use full path
      }

      // Verify installation
      onProgress({ stage: 'installing', progress: 80, message: 'Verifying installation...' });
      
      // List files in install directory for debugging
      const files = fs.readdirSync(installDir);
      console.log('[OllamaInstaller] Files in install dir:', files);
      
      if (!fs.existsSync(ollamaExePath)) {
        throw new Error(`Ollama executable not found at ${ollamaExePath}. Found files: ${files.join(', ')}`);
      }

      onProgress({ stage: 'installing', progress: 85, message: 'Ollama installed successfully!' });

      // Start the service in background (hidden)
      onProgress({ stage: 'starting', progress: 90, message: 'Starting Ollama service...' });
      await this.startServiceWindows(ollamaExePath);

      onProgress({ stage: 'starting', progress: 98, message: 'Ollama service started!' });
      console.log('[OllamaInstaller] Windows installation complete!');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[OllamaInstaller] Windows installation failed:', errorMessage);
      throw new Error(`Windows installation failed: ${errorMessage}`);
    }
  }

  /**
   * Start Ollama service on Windows using the specific executable path
   */
  private async startServiceWindows(ollamaExePath: string): Promise<void> {
    // Check if already running
    if (await this.isRunning()) return;
    
    // Start Ollama with full path
    const ollama = spawn(ollamaExePath, ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    ollama.unref();
    
    // Wait for service to be ready (max 30 seconds)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await this.isRunning()) return;
    }
    
    throw new Error('Ollama service failed to start after 30 seconds');
  }

  /**
   * Pull (download) an Ollama model with progress tracking
   * Uses the CLI for more reliable progress reporting
   */
  async pullModel(
    modelName: string,
    onProgress: (p: OllamaDownloadProgress) => void
  ): Promise<boolean> {
    try {
      // First check if Ollama is installed
      const isInstalled = await this.isInstalled();
      if (!isInstalled) {
        throw new Error('Ollama is not installed. Please install Ollama first using the setup wizard.');
      }
      
      // Then ensure Ollama is running
      if (!(await this.isRunning())) {
        onProgress({ stage: 'starting', progress: 0, message: 'Starting Ollama service...' });
        await this.startService();
        // Wait a bit for service to be fully ready
        await new Promise((r) => setTimeout(r, 2000));
      }

      onProgress({ stage: 'pulling-model', progress: 0, message: `Starting download of ${modelName}...` });

      // Use CLI for pulling - more reliable progress
      return new Promise((resolve) => {
        const ollamaPath = process.platform === 'win32' 
          ? this.getWindowsOllamaPath() 
          : 'ollama';
        
        const pullProcess = spawn(ollamaPath, ['pull', modelName], {
          stdio: 'pipe',
          shell: process.platform === 'win32',
        });
        
        let lastProgress = 0;
        let outputBuffer = '';
        
        const parseProgress = (data: string) => {
          outputBuffer += data;
          const lines = outputBuffer.split('\n');
          outputBuffer = lines.pop() || '';
          
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            // Parse progress from ollama pull output
            // Format: "pulling manifest", "pulling sha256:xxx... 45%", "verifying sha256", "success"
            const percentMatch = trimmedLine.match(/(\d+)%/);
            if (percentMatch) {
              const percent = parseInt(percentMatch[1], 10);
              lastProgress = percent;
              onProgress({
                stage: 'pulling-model',
                progress: percent,
                message: `Downloading ${modelName}... ${percent}%`,
              });
            } else if (trimmedLine.toLowerCase().includes('pulling manifest')) {
              onProgress({
                stage: 'pulling-model',
                progress: 1,
                message: `Fetching ${modelName} manifest...`,
              });
            } else if (trimmedLine.toLowerCase().includes('pulling')) {
              onProgress({
                stage: 'pulling-model',
                progress: lastProgress || 5,
                message: `Downloading ${modelName}...`,
              });
            } else if (trimmedLine.toLowerCase().includes('verifying')) {
              onProgress({
                stage: 'pulling-model',
                progress: 95,
                message: `Verifying ${modelName}...`,
              });
            } else if (trimmedLine.toLowerCase().includes('writing')) {
              onProgress({
                stage: 'pulling-model',
                progress: 98,
                message: `Writing ${modelName} to disk...`,
              });
            } else if (trimmedLine.toLowerCase().includes('success')) {
              onProgress({
                stage: 'complete',
                progress: 100,
                message: `${modelName} ready!`,
              });
            }
          }
        };
        
        pullProcess.stdout?.on('data', (data: Buffer) => {
          parseProgress(data.toString());
        });
        
        pullProcess.stderr?.on('data', (data: Buffer) => {
          // Ollama outputs progress to stderr
          parseProgress(data.toString());
        });
        
        pullProcess.on('close', (code) => {
          if (code === 0) {
            onProgress({ stage: 'complete', progress: 100, message: `${modelName} ready!` });
            resolve(true);
          } else {
            onProgress({
              stage: 'error',
              progress: 0,
              message: 'Failed to download model',
              error: `Process exited with code ${code}`,
            });
            resolve(false);
          }
        });
        
        pullProcess.on('error', (error) => {
          onProgress({
            stage: 'error',
            progress: 0,
            message: 'Failed to download model',
            error: error.message,
          });
          resolve(false);
        });
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onProgress({
        stage: 'error',
        progress: 0,
        message: 'Failed to download model',
        error: errorMessage,
      });
      return false;
    }
  }

  /**
   * Check if a specific model is available
   */
  async hasModel(modelName: string): Promise<boolean> {
    try {
      if (!(await this.isRunning())) {
        return false;
      }

      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) return false;

      const data = await response.json();
      const models = data.models || [];
      return models.some((m: { name: string }) => 
        m.name === modelName || m.name.startsWith(modelName + ':')
      );
    } catch {
      return false;
    }
  }

  /**
   * List all installed Ollama models
   */
  async listModels(): Promise<Array<{ name: string; size: number; modified: string }>> {
    try {
      if (!(await this.isRunning())) {
        return [];
      }

      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) return [];

      const data = await response.json();
      return data.models || [];
    } catch {
      return [];
    }
  }

  /**
   * Get the count of installed models
   * Used to prevent deleting the last model
   */
  async getModelCount(): Promise<number> {
    const models = await this.listModels();
    return models.length;
  }

  /**
   * Check if a model can be deleted (not the last one)
   * Returns { canDelete: boolean, reason?: string }
   */
  async canDeleteModel(modelName: string): Promise<{ canDelete: boolean; reason?: string }> {
    const models = await this.listModels();
    const modelCount = models.length;
    
    if (modelCount <= 1) {
      return {
        canDelete: false,
        reason: 'No se puede eliminar el último modelo. Ollama requiere al menos un modelo instalado para funcionar correctamente.',
      };
    }
    
    // Check if the model exists
    const modelExists = models.some(m => m.name === modelName);
    if (!modelExists) {
      return {
        canDelete: false,
        reason: `El modelo "${modelName}" no está instalado.`,
      };
    }
    
    return { canDelete: true };
  }

  /**
   * Unified installation: Install Ollama AND a required model in one go
   * Installation is NOT considered complete until the first model is ready
   * Shows a single unified progress bar covering both phases
   */
  async installWithModel(
    modelName: string,
    onProgress: (p: OllamaDownloadProgress) => void
  ): Promise<boolean> {
    try {
      // Phase 1: Software installation (0-50% of unified progress)
      const softwareProgressWeight = 0.5;
      
      const isAlreadyInstalled = await this.isInstalled();
      
      if (!isAlreadyInstalled) {
        // Need to install Ollama first
        const installSuccess = await this.install((p) => {
          // Map software installation progress to 0-50% of unified progress
          const unifiedProgress = p.progress * softwareProgressWeight;
          onProgress({
            ...p,
            unifiedProgress,
            currentPhase: 'software',
          });
        });
        
        if (!installSuccess) {
          onProgress({
            stage: 'error',
            progress: 0,
            message: 'Ollama installation failed',
            error: 'Failed to install Ollama software',
            unifiedProgress: 0,
            currentPhase: 'software',
          });
          return false;
        }
      } else {
        // Already installed, report 50% progress
        onProgress({
          stage: 'installing',
          progress: 100,
          message: 'Ollama ya está instalado',
          unifiedProgress: 50,
          currentPhase: 'software',
        });
        
        // Make sure service is running
        if (!(await this.isRunning())) {
          onProgress({
            stage: 'starting',
            progress: 100,
            message: 'Iniciando servicio Ollama...',
            unifiedProgress: 50,
            currentPhase: 'software',
          });
          await this.startService();
        }
      }
      
      // Phase 2: Model installation (50-100% of unified progress)
      const modelProgressWeight = 0.5;
      const modelProgressOffset = 50;
      
      // Check if model is already installed
      const hasModelAlready = await this.hasModel(modelName);
      
      if (hasModelAlready) {
        onProgress({
          stage: 'complete',
          progress: 100,
          message: `${modelName} ya está disponible`,
          unifiedProgress: 100,
          currentPhase: 'model',
        });
        return true;
      }
      
      // Pull the model
      const modelSuccess = await this.pullModel(modelName, (p) => {
        // Map model pull progress to 50-100% of unified progress
        const unifiedProgress = modelProgressOffset + (p.progress * modelProgressWeight);
        onProgress({
          ...p,
          unifiedProgress: p.stage === 'complete' ? 100 : unifiedProgress,
          currentPhase: 'model',
        });
      });
      
      if (!modelSuccess) {
        onProgress({
          stage: 'error',
          progress: 0,
          message: 'Model installation failed',
          error: `Failed to download model ${modelName}`,
          unifiedProgress: 50,
          currentPhase: 'model',
        });
        return false;
      }
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onProgress({
        stage: 'error',
        progress: 0,
        message: 'Installation failed',
        error: errorMessage,
        unifiedProgress: 0,
        currentPhase: 'software',
      });
      return false;
    }
  }

  /**
   * Check if Ollama is fully ready (installed AND has at least one model)
   * This is the TRUE completeness check for Ollama setup
   */
  async isFullyReady(): Promise<{ ready: boolean; installed: boolean; running: boolean; hasModels: boolean; modelCount: number }> {
    const installed = await this.isInstalled();
    const running = installed ? await this.isRunning() : false;
    const models = running ? await this.listModels() : [];
    const hasModels = models.length > 0;
    
    return {
      ready: installed && running && hasModels,
      installed,
      running,
      hasModels,
      modelCount: models.length,
    };
  }

  /**
   * Start the Ollama service (Windows native only)
   */
  async startService(): Promise<void> {
    // Check if already running
    if (await this.isRunning()) return;

    if (process.platform === 'win32') {
      // On Windows, use the direct path to the executable
      const ollamaPath = this.getWindowsOllamaPath();
      
      if (!fs.existsSync(ollamaPath)) {
        throw new Error(
          'Ollama is not installed on Windows. ' +
          'Expected location: ' + ollamaPath + '. ' +
          'Please run the setup wizard to install Ollama.'
        );
      }
      
      // Start Ollama with full path to avoid any PATH/WSL conflicts
      const ollama = spawn(ollamaPath, ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      ollama.unref();
    } else {
      // On Unix, start normally
      const ollama = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      ollama.unref();
    }

    // Wait for it to be ready (max 30 seconds)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await this.isRunning()) return;
    }

    throw new Error('Ollama service failed to start after 30 seconds. Please check if another Ollama instance is running.');
  }

  /**
   * Stop the Ollama service
   */
  async stopService(): Promise<void> {
    try {
      if (process.platform === 'win32') {
        // On Windows, kill ollama.exe process
        await execAsync('taskkill /F /IM ollama.exe').catch(() => { /* ignored */ });
      } else {
        // On Unix, use pkill
        await execAsync('pkill -f "ollama serve"').catch(() => { /* ignored */ });
      }
    } catch {
      // Process might not exist, that's OK
    }
  }

  /**
   * Uninstall Ollama completely from the system (cross-platform)
   * Removes the Ollama executable, models, configuration, and PATH entries
   */
  async uninstall(onProgress?: (message: string) => void): Promise<{ success: boolean; error?: string }> {
    try {
      onProgress?.('Stopping Ollama processes...');
      
      // Stop any running Ollama processes
      await this.stopService();
      // Give processes time to fully stop
      await new Promise(r => setTimeout(r, 2000));

      if (process.platform === 'win32') {
        return this.uninstallWindows(onProgress);
      } else if (process.platform === 'darwin') {
        return this.uninstallMacOS(onProgress);
      } else {
        return this.uninstallLinux(onProgress);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[OllamaInstaller] Uninstall failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Uninstall Ollama on Windows
   */
  private async uninstallWindows(onProgress?: (message: string) => void): Promise<{ success: boolean; error?: string }> {
    try {
      onProgress?.('Removing Ollama installation...');

      // Remove the installation directory
      const installDir = path.join(
        process.env.LOCALAPPDATA || '',
        'Programs',
        'Ollama'
      );
      
      if (fs.existsSync(installDir)) {
        await execAsync(`powershell -Command "Remove-Item -Path '${installDir.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue"`);
      }

      onProgress?.('Removing Ollama models and configuration...');

      // Remove models and configuration from user profile
      const ollamaHome = path.join(process.env.USERPROFILE || '', '.ollama');
      if (fs.existsSync(ollamaHome)) {
        await execAsync(`powershell -Command "Remove-Item -Path '${ollamaHome.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue"`);
      }

      onProgress?.('Cleaning environment variables...');

      // Clean environment variables
      await execAsync(`powershell -Command "[System.Environment]::SetEnvironmentVariable('OLLAMA_MODELS', $null, 'User')"`);
      await execAsync(`powershell -Command "[System.Environment]::SetEnvironmentVariable('OLLAMA_HOST', $null, 'User')"`);

      // Clean PATH
      try {
        const { stdout: currentPath } = await execAsync(
          `powershell -Command "[System.Environment]::GetEnvironmentVariable('Path','User')"`
        );
        
        // Filter out any Ollama-related paths
        const pathParts = currentPath.trim().split(';');
        const cleanedPath = pathParts
          .filter(p => !p.toLowerCase().includes('ollama'))
          .join(';');
        
        if (cleanedPath !== currentPath.trim()) {
          await execAsync(
            `powershell -Command "[System.Environment]::SetEnvironmentVariable('Path', '${cleanedPath.replace(/'/g, "''")}', 'User')"`
          );
        }
      } catch (pathError) {
        console.warn('[OllamaInstaller] Failed to clean PATH:', pathError);
      }

      // Update current process PATH
      if (process.env.PATH) {
        process.env.PATH = process.env.PATH
          .split(';')
          .filter(p => !p.toLowerCase().includes('ollama'))
          .join(';');
      }

      onProgress?.('Ollama uninstalled successfully!');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Uninstall Ollama on macOS
   */
  private async uninstallMacOS(onProgress?: (message: string) => void): Promise<{ success: boolean; error?: string }> {
    try {
      onProgress?.('Removing Ollama.app...');
      
      // Remove the .app bundle
      const appPath = '/Applications/Ollama.app';
      if (fs.existsSync(appPath)) {
        fs.rmSync(appPath, { recursive: true, force: true });
      }

      onProgress?.('Removing Ollama models and configuration...');
      
      // Remove models and configuration
      const homeDir = process.env.HOME || '';
      const ollamaHome = path.join(homeDir, '.ollama');
      if (fs.existsSync(ollamaHome)) {
        fs.rmSync(ollamaHome, { recursive: true, force: true });
      }

      // Remove ollama binary from /usr/local/bin if it exists
      try {
        const ollamaBin = '/usr/local/bin/ollama';
        if (fs.existsSync(ollamaBin)) {
          fs.unlinkSync(ollamaBin);
        }
      } catch {
        // May need sudo — best effort
      }

      onProgress?.('Ollama uninstalled successfully!');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Uninstall Ollama on Linux
   */
  private async uninstallLinux(onProgress?: (message: string) => void): Promise<{ success: boolean; error?: string }> {
    try {
      onProgress?.('Removing Ollama installation...');
      
      // Remove the binary (installed by the install script)
      try {
        await execAsync('sudo rm -f /usr/local/bin/ollama');
      } catch {
        // May not have sudo — try without
        try {
          fs.unlinkSync('/usr/local/bin/ollama');
        } catch {
          console.warn('[OllamaInstaller] Could not remove /usr/local/bin/ollama');
        }
      }

      // Remove systemd service if it exists
      try {
        await execAsync('sudo systemctl stop ollama 2>/dev/null; sudo systemctl disable ollama 2>/dev/null');
        await execAsync('sudo rm -f /etc/systemd/system/ollama.service');
      } catch {
        // Service may not exist
      }

      onProgress?.('Removing Ollama models and configuration...');

      // Remove models and configuration
      const homeDir = process.env.HOME || '';
      const ollamaHome = path.join(homeDir, '.ollama');
      if (fs.existsSync(ollamaHome)) {
        fs.rmSync(ollamaHome, { recursive: true, force: true });
      }

      // Also check /usr/share/ollama
      try {
        await execAsync('sudo rm -rf /usr/share/ollama 2>/dev/null');
      } catch {
        // Best effort
      }

      onProgress?.('Ollama uninstalled successfully!');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Download a file with progress tracking
   */
  private downloadFile(
    url: string,
    dest: string,
    onProgress: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);

      const request = (currentUrl: string): void => {
        https
          .get(currentUrl, (response) => {
            // Handle redirects
            if (response.statusCode === 302 || response.statusCode === 301) {
              const redirectUrl = response.headers.location;
              if (redirectUrl) {
                file.close();
                try {
                  fs.unlinkSync(dest);
                } catch {
                  // Ignore
                }
                request(redirectUrl);
                return;
              }
            }

            if (response.statusCode !== 200) {
              reject(new Error(`Download failed with status ${response.statusCode}`));
              return;
            }

            const totalSize = parseInt(response.headers['content-length'] || '0', 10);
            let downloadedSize = 0;

            response.on('data', (chunk: Buffer) => {
              downloadedSize += chunk.length;
              if (totalSize > 0) {
                onProgress((downloadedSize / totalSize) * 100);
              }
            });

            response.pipe(file);

            file.on('finish', () => {
              file.close();
              resolve();
            });
          })
          .on('error', (err) => {
            fs.unlink(dest, () => { /* ignored */ });
            reject(err);
          });
      };

      request(url);
    });
  }
}

// Singleton instance
export const ollamaInstaller = new OllamaInstaller();

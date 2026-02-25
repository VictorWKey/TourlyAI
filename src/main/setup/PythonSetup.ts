/**
 * PythonSetup - Automatic Python Environment Setup (Cross-Platform)
 * ==================================================================
 * Handles:
 * - Python automatic download and installation (Windows, macOS, Linux)
 * - Python installation detection
 * - Virtual environment creation
 * - Dependencies installation from requirements.txt
 * - Automatic setup on first run
 */

import { spawn, exec, execSync } from 'child_process';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import os from 'os';
import { promisify } from 'util';
import { getProxyUrl } from '../utils/store';

const execAsync = promisify(exec);

// Python download URLs for Windows (Issue #5: ARM64 support)
const PYTHON_VERSION = '3.11.9';
function getPythonDownloadUrl(): string {
  if (process.platform !== 'win32') return ''; // handled by platform-specific methods
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  return `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-${arch}.exe`;
}

// Issue #6: Minimum disk space required (in bytes)
// Actual needs: Python venv (~2.5 GB) + ML models (~1.5 GB) + Ollama/LLM (~4 GB) + pip cache (~2 GB)
const MINIMUM_DISK_SPACE_GB = 10;
const MINIMUM_DISK_SPACE_BYTES = MINIMUM_DISK_SPACE_GB * 1024 * 1024 * 1024;

export interface PythonSetupProgress {
  stage: 'checking' | 'downloading-python' | 'installing-python' | 'creating-venv' | 'installing-deps' | 'complete' | 'error';
  progress: number;
  message: string;
  error?: string;
}

export interface PythonSetupStatus {
  pythonInstalled: boolean;
  pythonVersion?: string;
  pythonPath?: string;
  venvExists: boolean;
  venvPath?: string;
  dependenciesInstalled: boolean;
  /** True only if setup completed fully without interruption */
  setupComplete: boolean;
  /** True if installation was started but not completed (interrupted) */
  installationInterrupted: boolean;
}

/**
 * PythonSetup class for automatic Python environment configuration
 */
// Completion marker filename - created ONLY when installation fully completes
const SETUP_COMPLETE_MARKER = '.setup_complete';
// In-progress marker - created when installation starts, removed when it completes
const SETUP_IN_PROGRESS_MARKER = '.setup_in_progress';

export class PythonSetup {
  /** Directory containing Python source code (read-only in production) */
  private pythonDir: string;
  /** Directory for venv, models, data — stored in userData to survive auto-updates */
  private pythonEnvDir: string;
  private venvDir: string;
  /** Models cache directory (HuggingFace models) */
  private modelsCacheDir: string;
  /** Default data/output directory */
  private dataDir: string;
  private requirementsPath: string;
  private isWindows: boolean;
  private completionMarkerPath: string;
  private inProgressMarkerPath: string;
  private bundledPythonDir: string;
  /** Whether we started Ollama and should stop it on quit */
  private ollamaStartedByUs = false;

  constructor() {
    this.isWindows = process.platform === 'win32';
    
    if (app.isPackaged) {
      // In production, Python source code is bundled in resources (read-only)
      this.pythonDir = path.join(process.resourcesPath, 'python');
    } else {
      // In development, use the python folder in project
      this.pythonDir = path.join(app.getAppPath(), 'python');
    }
    
    // Issue #3 & #11: Store mutable data in userData, NOT in resources/
    // This ensures venv, models, and data survive Squirrel auto-updates
    // (which replace the entire app directory on each update).
    // Production: %APPDATA%/tourlyai-desktop/python-env/
    // Dev:        %APPDATA%/tourlyai-desktop-dev/python-env/
    this.pythonEnvDir = path.join(app.getPath('userData'), 'python-env');
    this.venvDir = path.join(this.pythonEnvDir, 'venv');
    this.modelsCacheDir = path.join(this.pythonEnvDir, 'models', 'hf_cache');
    this.dataDir = path.join(this.pythonEnvDir, 'data');
    
    this.requirementsPath = path.join(this.pythonDir, 'requirements.txt');
    // Path to optional bundled standalone Python (created by scripts/bundle-python.mjs)
    this.bundledPythonDir = path.join(this.pythonDir, 'bundled-env', 'python');
    // Marker files to track installation state
    this.completionMarkerPath = path.join(this.venvDir, SETUP_COMPLETE_MARKER);
    this.inProgressMarkerPath = path.join(this.venvDir, SETUP_IN_PROGRESS_MARKER);
  }

  /**
   * Check if a bundled Python standalone environment exists
   * (created by scripts/bundle-python.mjs for offline-capable installs)
   */
  hasBundledPython(): boolean {
    const exe = this.isWindows
      ? path.join(this.bundledPythonDir, 'python.exe')
      : path.join(this.bundledPythonDir, 'bin', 'python3');
    return fs.existsSync(exe);
  }

  /**
   * Get the bundled Python executable path
   */
  getBundledPythonPath(): string {
    if (this.isWindows) {
      return path.join(this.bundledPythonDir, 'python.exe');
    }
    return path.join(this.bundledPythonDir, 'bin', 'python3');
  }

  /**
   * Get the Python executable path
   */
  getPythonPath(): string {
    const venvPython = this.getVenvPythonPath();
    if (fs.existsSync(venvPython)) {
      return venvPython;
    }
    // Try bundled Python before falling back to system
    if (this.hasBundledPython()) {
      return this.getBundledPythonPath();
    }
    // Fallback to system Python
    return this.isWindows ? 'python' : 'python3';
  }

  /**
   * Check if setup was completed successfully (completion marker exists)
   */
  isSetupComplete(): boolean {
    return fs.existsSync(this.completionMarkerPath);
  }

  /**
   * Check if installation was interrupted (in-progress marker exists but completion marker doesn't)
   */
  isInstallationInterrupted(): boolean {
    return fs.existsSync(this.inProgressMarkerPath) && !fs.existsSync(this.completionMarkerPath);
  }

  /**
   * Mark installation as started (create in-progress marker)
   */
  private markInstallationStarted(): void {
    try {
      // Ensure venv directory exists
      if (!fs.existsSync(this.venvDir)) {
        fs.mkdirSync(this.venvDir, { recursive: true });
      }
      // Remove completion marker if it exists (we're starting fresh)
      if (fs.existsSync(this.completionMarkerPath)) {
        fs.unlinkSync(this.completionMarkerPath);
      }
      // Create in-progress marker with timestamp
      fs.writeFileSync(this.inProgressMarkerPath, JSON.stringify({
        startedAt: new Date().toISOString(),
        pythonVersion: PYTHON_VERSION,
      }));
      console.log('[PythonSetup] Installation marked as started');
    } catch (error) {
      console.warn('[PythonSetup] Failed to create in-progress marker:', error);
    }
  }

  /**
   * Mark installation as complete (create completion marker, remove in-progress marker)
   */
  private markInstallationComplete(): void {
    try {
      // Create completion marker with installation details
      fs.writeFileSync(this.completionMarkerPath, JSON.stringify({
        completedAt: new Date().toISOString(),
        pythonVersion: PYTHON_VERSION,
        platform: process.platform,
      }));
      // Remove in-progress marker
      if (fs.existsSync(this.inProgressMarkerPath)) {
        fs.unlinkSync(this.inProgressMarkerPath);
      }
      console.log('[PythonSetup] Installation marked as complete');
    } catch (error) {
      console.warn('[PythonSetup] Failed to create completion marker:', error);
    }
  }

  /**
   * Clear installation markers (for clean reinstall)
   */
  clearInstallationMarkers(): void {
    try {
      if (fs.existsSync(this.completionMarkerPath)) {
        fs.unlinkSync(this.completionMarkerPath);
      }
      if (fs.existsSync(this.inProgressMarkerPath)) {
        fs.unlinkSync(this.inProgressMarkerPath);
      }
      console.log('[PythonSetup] Installation markers cleared');
    } catch (error) {
      console.warn('[PythonSetup] Failed to clear installation markers:', error);
    }
  }

  /**
   * Validate that dependencies are properly installed
   * Performs comprehensive check of ALL required packages
   */
  private async validateDependencies(): Promise<boolean> {
    const pythonPath = this.getPythonPath();
    try {
      // Write the test script to a temp file to avoid shell quoting issues
      const tempScript = path.join(app.getPath('temp'), 'tourlyai_dep_check.py');
      const testScript = [
        'import sys',
        'try:',
        '    import numpy',
        '    import pandas',
        '    import torch',
        '    import transformers',
        '    import sentence_transformers',
        '    import nltk',
        '    import sklearn',
        '    import matplotlib',
        '    import seaborn',
        '    packages_ok = all([',
        '        hasattr(numpy, "__version__"),',
        '        hasattr(pandas, "__version__"),',
        '        hasattr(torch, "__version__"),',
        '        hasattr(transformers, "__version__"),',
        '    ])',
        '    if not packages_ok:',
        '        sys.exit(1)',
        '    _ = torch.tensor([1, 2, 3])',
        '    sys.exit(0)',
        'except ImportError as e:',
        '    print(f"ImportError: {e}", file=sys.stderr)',
        '    sys.exit(1)',
        'except Exception as e:',
        '    print(f"Error: {e}", file=sys.stderr)',
        '    sys.exit(1)',
      ].join('\n');
      
      fs.writeFileSync(tempScript, testScript);
      
      try {
        const result = await execAsync(`"${pythonPath}" "${tempScript}"`, { timeout: 60000 });
        return result.stderr === '' || !result.stderr.includes('ImportError');
      } finally {
        // Always clean up the temp file
        try { fs.unlinkSync(tempScript); } catch { /* ignore */ }
      }
    } catch {
      return false;
    }
  }

  /**
   * Get the virtual environment Python path
   */
  private getVenvPythonPath(): string {
    if (this.isWindows) {
      return path.join(this.venvDir, 'Scripts', 'python.exe');
    }
    return path.join(this.venvDir, 'bin', 'python');
  }

  /**
   * Get the pip path in virtual environment
   */
  private getVenvPipPath(): string {
    if (this.isWindows) {
      return path.join(this.venvDir, 'Scripts', 'pip.exe');
    }
    return path.join(this.venvDir, 'bin', 'pip');
  }

  /**
   * Check the current Python setup status
   */
  async checkStatus(): Promise<PythonSetupStatus> {
    const status: PythonSetupStatus = {
      pythonInstalled: false,
      venvExists: false,
      dependenciesInstalled: false,
      setupComplete: false,
      installationInterrupted: false,
    };

    // Check for installation markers FIRST
    status.setupComplete = this.isSetupComplete();
    status.installationInterrupted = this.isInstallationInterrupted();

    // Check system Python
    try {
      const pythonCmd = this.isWindows ? 'python' : 'python3';
      const { stdout } = await execAsync(`${pythonCmd} --version`);
      status.pythonInstalled = true;
      status.pythonVersion = stdout.trim().replace('Python ', '');
      status.pythonPath = pythonCmd;
    } catch {
      // Try 'python' as fallback on non-Windows
      if (!this.isWindows) {
        try {
          const { stdout } = await execAsync('python --version');
          const version = stdout.trim().replace('Python ', '');
          // Make sure it's Python 3
          if (version.startsWith('3.')) {
            status.pythonInstalled = true;
            status.pythonVersion = version;
            status.pythonPath = 'python';
          }
        } catch {
          // No Python found
        }
      }
    }

    // Check virtual environment
    const venvPython = this.getVenvPythonPath();
    if (fs.existsSync(venvPython)) {
      status.venvExists = true;
      status.venvPath = this.venvDir;
      
      // Check if key dependencies are installed
      try {
        const checkCmd = `"${venvPython}" -c "import pandas; import torch; import transformers; print('ok')"`;
        await execAsync(checkCmd, { timeout: 30000 });
        status.dependenciesInstalled = true;
      } catch {
        status.dependenciesInstalled = false;
      }
    }

    // IMPORTANT: If venv exists but setup is not marked complete, consider it interrupted
    // This catches cases where installation was killed mid-way
    if (status.venvExists && !status.setupComplete && !status.installationInterrupted) {
      // Check if there's evidence of partial installation
      const pipPath = this.getVenvPipPath();
      if (fs.existsSync(pipPath)) {
        // Venv was created but no completion marker - likely interrupted
        status.installationInterrupted = true;
        console.log('[PythonSetup] Detected incomplete installation (venv exists without completion marker)');
      }
    }

    return status;
  }

  /**
   * Check available disk space on the drive where userData lives.
   * Returns available bytes, or -1 if detection fails.
   */
  private getAvailableDiskSpace(): number {
    try {
      const targetDir = app.getPath('userData');
      // os.freemem() is RAM; we need disk space.
      // On Windows, use the drive letter of the userData path.
      if (this.isWindows) {
        const drive = targetDir.slice(0, 3); // e.g. "C:\\"
        const result = execSync(
          `powershell -Command "(Get-PSDrive -Name '${drive[0]}').Free"`,
          { timeout: 10000 }
        );
        const bytes = parseInt(result.toString().trim(), 10);
        return isNaN(bytes) ? -1 : bytes;
      } else {
        // Unix: use statvfs via df
        const result = execSync(
          `df -k "${targetDir}" | tail -1 | awk '{print $4}'`,
          { timeout: 10000 }
        );
        const kbytes = parseInt(result.toString().trim(), 10);
        return isNaN(kbytes) ? -1 : kbytes * 1024;
      }
    } catch (error) {
      console.warn('[PythonSetup] Failed to check disk space:', error);
      return -1; // Unknown — proceed anyway
    }
  }

  /**
   * Run the complete setup process (with automatic Python installation)
   */
  async setup(onProgress: (p: PythonSetupProgress) => void): Promise<boolean> {
    try {
      // Issue #6: Pre-flight disk space check before starting anything
      onProgress({ stage: 'checking', progress: 2, message: 'Checking available disk space...' });
      const availableSpace = this.getAvailableDiskSpace();
      if (availableSpace !== -1 && availableSpace < MINIMUM_DISK_SPACE_BYTES) {
        const availableGB = (availableSpace / (1024 * 1024 * 1024)).toFixed(1);
        onProgress({
          stage: 'error',
          progress: 0,
          message: 'Insufficient disk space',
          error: `TourlyAI requires at least ${MINIMUM_DISK_SPACE_GB} GB of free disk space for Python, ML models, and dependencies. ` +
            `Currently available: ${availableGB} GB. Please free up disk space and try again.`,
        });
        return false;
      }
      if (availableSpace !== -1) {
        const availableGB = (availableSpace / (1024 * 1024 * 1024)).toFixed(1);
        console.log(`[PythonSetup] Disk space check passed: ${availableGB} GB available`);
      }

      // Step 1: Check Python installation
      onProgress({ stage: 'checking', progress: 5, message: 'Checking Python installation...' });
      
      let status = await this.checkStatus();

      // IMPORTANT: If installation was interrupted, force a clean reinstall
      if (status.installationInterrupted) {
        console.log('[PythonSetup] Detected interrupted installation, cleaning up...');
        onProgress({ stage: 'checking', progress: 8, message: 'Cleaning up incomplete installation...' });
        await this.cleanEnvironment();
        this.clearInstallationMarkers();
        status = await this.checkStatus();
      }
      
      // If Python is not installed, try to install it automatically
      if (!status.pythonInstalled) {
        onProgress({ stage: 'downloading-python', progress: 10, message: 'Downloading Python (~25 MB)...' });
        
        const installed = await this.downloadAndInstallPython(onProgress);
        if (!installed) {
          return false;
        }
        
        // Re-check status after installation
        status = await this.checkStatus();
        if (!status.pythonInstalled) {
          onProgress({
            stage: 'error',
            progress: 0,
            message: 'Python installation error',
            error: 'Python was installed but could not be detected. Please restart the application.',
          });
          return false;
        }
      }

      onProgress({ stage: 'checking', progress: 25, message: `Python ${status.pythonVersion} detected` });

      // Step 2: Create virtual environment if needed
      if (!status.venvExists || !status.setupComplete) {
        // Mark installation as started BEFORE any modifications
        this.markInstallationStarted();
        
        onProgress({ stage: 'creating-venv', progress: 30, message: 'Creating virtual environment...' });
        
        const created = await this.createVirtualEnvironment(onProgress);
        if (!created) {
          return false;
        }
        // After venv creation, dependencies will need to be installed
        status.dependenciesInstalled = false;
      } else {
        onProgress({ stage: 'creating-venv', progress: 40, message: 'Virtual environment found' });
      }

      // Step 3: Install dependencies (~2.5 GB download on first run)
      if (!status.dependenciesInstalled || !status.setupComplete) {
        // Ensure we have the in-progress marker
        if (!fs.existsSync(this.inProgressMarkerPath)) {
          this.markInstallationStarted();
        }
        
        onProgress({
          stage: 'installing-deps',
          progress: 45,
          message: 'Installing Python dependencies (~2.5 GB download, may take 5-15 min)...',
        });
        
        const installed = await this.installDependencies(onProgress);
        if (!installed) {
          return false;
        }
      } else {
        onProgress({ stage: 'installing-deps', progress: 50, message: 'Verifying dependencies...' });
        
        // Validate dependencies are not corrupted
        const valid = await this.validateDependencies();
        if (!valid) {
          // Mark as started since we need to reinstall
          this.markInstallationStarted();
          
          onProgress({ stage: 'installing-deps', progress: 55, message: 'Corrupted packages detected, reinstalling...' });
          
          // Reinstall dependencies
          const installed = await this.installDependencies(onProgress);
          if (!installed) {
            return false;
          }
        } else {
          onProgress({ stage: 'installing-deps', progress: 95, message: 'Dependencies verified successfully' });
        }
      }

      // CRITICAL: Final validation before marking as complete
      onProgress({ stage: 'installing-deps', progress: 95, message: 'Running final validation...' });
      const finalValidation = await this.validateDependencies();
      if (!finalValidation) {
        onProgress({
          stage: 'error',
          progress: 0,
          message: 'Validation error',
          error: 'Dependencies did not pass final validation. Please try again.',
        });
        return false;
      }

      // Download required NLTK data (stopwords, punkt) so it's available offline
      // The visualization modules (generador_texto, generador_sentimientos) need this
      onProgress({ stage: 'installing-deps', progress: 97, message: 'Downloading NLTK language data...' });
      await this.downloadNLTKData();

      // Ensure output directories exist
      fs.mkdirSync(this.modelsCacheDir, { recursive: true });
      fs.mkdirSync(this.dataDir, { recursive: true });

      // Mark installation as COMPLETE only after everything succeeded
      this.markInstallationComplete();

      onProgress({ stage: 'complete', progress: 100, message: 'Python environment ready!' });
      return true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onProgress({
        stage: 'error',
        progress: 0,
        message: 'Setup failed',
        error: errorMessage,
      });
      return false;
    }
  }

  /**
   * Create Python virtual environment
   */
  private async createVirtualEnvironment(
    onProgress: (p: PythonSetupProgress) => void
  ): Promise<boolean> {
    return new Promise((resolve) => {
      // Prefer bundled Python, then system Python
      let pythonCmd: string;
      if (this.hasBundledPython()) {
        pythonCmd = this.getBundledPythonPath();
        console.log('[PythonSetup] Using bundled Python for venv:', pythonCmd);
      } else {
        pythonCmd = this.isWindows ? 'python' : 'python3';
        console.log('[PythonSetup] Using system Python for venv:', pythonCmd);
      }
      
      const venv = spawn(pythonCmd, ['-m', 'venv', this.venvDir], {
        cwd: this.pythonDir,
        shell: this.isWindows,
      });

      venv.stdout?.on('data', (data: Buffer) => {
        console.log('[PythonSetup] venv stdout:', data.toString());
      });

      venv.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString();
        // Not all stderr is an error
        if (!msg.includes('error') && !msg.includes('Error')) {
          console.log('[PythonSetup] venv stderr:', msg);
        } else {
          console.error('[PythonSetup] venv error:', msg);
        }
      });

      venv.on('close', (code) => {
        if (code === 0) {
          onProgress({ stage: 'creating-venv', progress: 30, message: 'Virtual environment created' });
          resolve(true);
        } else {
          onProgress({
            stage: 'error',
            progress: 0,
            message: 'Failed to create virtual environment',
            error: `venv creation failed with code ${code}`,
          });
          resolve(false);
        }
      });

      venv.on('error', (error) => {
        onProgress({
          stage: 'error',
          progress: 0,
          message: 'Failed to create virtual environment',
          error: error.message,
        });
        resolve(false);
      });
    });
  }

  /**
   * Install Python dependencies from requirements.txt
   * Implements: Issue #9 (retry logic), Issue #12 (better progress),
   *             Issue #13 (pip cache for resume)
   */
  private async installDependencies(
    onProgress: (p: PythonSetupProgress) => void
  ): Promise<boolean> {
    const pipPath = this.getVenvPipPath();
    const pythonPath = this.getVenvPythonPath();

    try {
      onProgress({ stage: 'installing-deps', progress: 40, message: 'Upgrading pip...' });
      await execAsync(`"${pythonPath}" -m pip install --upgrade pip`);
    } catch (error) {
      console.warn('[PythonSetup] Failed to upgrade pip:', error);
      // Continue anyway
    }

    // Issue #9/#13: Retry logic with pip cache for resume after interruption
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const success = await this.runPipInstall(pipPath, onProgress, attempt);
      if (success) {
        return true;
      }

      if (attempt < MAX_RETRIES) {
        const waitMsg = `Installation attempt ${attempt} failed. Retrying in ${RETRY_DELAY_MS / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`;
        console.log(`[PythonSetup] ${waitMsg}`);
        onProgress({
          stage: 'installing-deps',
          progress: 45,
          message: waitMsg,
        });
        // Issue #9: Wait before retry — antivirus may release file locks
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    onProgress({
      stage: 'error',
      progress: 0,
      message: 'Failed to install dependencies',
      error: `pip install failed after ${MAX_RETRIES} attempts. ` +
        'Possible causes:\n' +
        '• Antivirus software may be blocking file creation — try adding an exclusion for ' +
        `"${this.pythonEnvDir}"\n` +
        '• Network connection may be unstable — check your internet connection\n' +
        '• Some packages may require Visual C++ Build Tools — install from https://aka.ms/vs/17/release/vs_BuildTools.exe',
    });
    return false;
  }

  /**
   * Run a single pip install attempt with progress tracking
   */
  private runPipInstall(
    pipPath: string,
    onProgress: (p: PythonSetupProgress) => void,
    attempt: number,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const msg = attempt > 1
        ? `Installing dependencies (attempt ${attempt})...`
        : 'Installing dependencies (~2 GB download, may take 5-15 min)...';
      onProgress({ stage: 'installing-deps', progress: 45, message: msg });

      // Issue #13: pip caches downloaded wheels by default in ~/.cache/pip (or %LOCALAPPDATA%\pip\Cache).
      // On retry, already-downloaded wheels are reused automatically — no extra flag needed.
      // Issue #8: If a proxy is configured, pass it to pip via environment variables.
      const proxyUrl = getProxyUrl();
      const proxyEnv: Record<string, string> = {};
      if (proxyUrl) {
        proxyEnv.HTTP_PROXY = proxyUrl;
        proxyEnv.HTTPS_PROXY = proxyUrl;
        proxyEnv.http_proxy = proxyUrl;
        proxyEnv.https_proxy = proxyUrl;
        console.log('[PythonSetup] Using proxy for pip:', proxyUrl);
      }

      const pip = spawn(pipPath, ['install', '-r', this.requirementsPath], {
        cwd: this.pythonDir,
        shell: this.isWindows,
        env: {
          ...process.env,
          ...proxyEnv,
          // Ensure we use the venv
          VIRTUAL_ENV: this.venvDir,
          PATH: this.isWindows 
            ? `${path.join(this.venvDir, 'Scripts')};${process.env.PATH}`
            : `${path.join(this.venvDir, 'bin')}:${process.env.PATH}`,
        },
      });

      let lastProgress = 45;
      // Issue #12: Track packages for better progress indication
      let packagesInstalled = 0;
      let totalStderr = '';

      pip.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString();
        console.log('[PythonSetup] pip:', msg);
        
        // Issue #12: Count installed packages for better progress
        const lines = msg.split('\n');
        for (const line of lines) {
          if (line.includes('Successfully installed')) {
            // "Successfully installed pkg1-1.0 pkg2-2.0" — count packages
            const pkgMatch = line.match(/Successfully installed (.+)/);
            if (pkgMatch) {
              const pkgs = pkgMatch[1].trim().split(/\s+/);
              packagesInstalled += pkgs.length;
            }
            lastProgress = 88;
            onProgress({
              stage: 'installing-deps',
              progress: lastProgress,
              message: `${packagesInstalled} packages installed`,
            });
          } else if (line.includes('Requirement already satisfied')) {
            packagesInstalled++;
            lastProgress = Math.min(45 + Math.floor(packagesInstalled * 0.8), 85);
            onProgress({
              stage: 'installing-deps',
              progress: lastProgress,
              message: `Checking packages... (${packagesInstalled} ready)`,
            });
          }
        }
      });

      pip.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString();
        totalStderr += msg;
        
        // Issue #12: Parse pip download progress for user-friendly messages
        const lines = msg.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('Downloading')) {
            // Extract filename and size from pip's download messages
            // e.g. "Downloading torch-2.0.0-cp311-...-win_amd64.whl (172.3 MB)"
            const sizeMatch = trimmed.match(/\(([^)]+)\)/);
            const nameMatch = trimmed.match(/Downloading\s+(\S+)/);
            const name = nameMatch ? nameMatch[1].split('/').pop()?.split('-')[0] : 'package';
            const size = sizeMatch ? sizeMatch[1] : '';
            
            lastProgress = Math.min(lastProgress + 1, 85);
            onProgress({
              stage: 'installing-deps',
              progress: lastProgress,
              message: `Downloading ${name}${size ? ` (${size})` : ''}...`,
            });
          } else if (trimmed.startsWith('Installing collected')) {
            lastProgress = 86;
            onProgress({
              stage: 'installing-deps',
              progress: lastProgress,
              message: 'Installing collected packages...',
            });
          }
        }
        console.log('[PythonSetup] pip stderr:', msg);
      });

      pip.on('close', (code) => {
        if (code === 0) {
          onProgress({ stage: 'installing-deps', progress: 90, message: 'Dependencies installed successfully' });
          resolve(true);
        } else {
          console.error(`[PythonSetup] pip install failed with code ${code} on attempt ${attempt}`);
          // Issue #9: Check for antivirus-related errors
          if (totalStderr.includes('Access is denied') || totalStderr.includes('PermissionError') || totalStderr.includes('WinError 5')) {
            console.warn('[PythonSetup] Possible antivirus interference detected');
          }
          resolve(false);
        }
      });

      pip.on('error', (error) => {
        console.error(`[PythonSetup] pip spawn error on attempt ${attempt}:`, error.message);
        resolve(false);
      });
    });
  }

  /**
   * Check if a specific package is installed
   */
  async isPackageInstalled(packageName: string): Promise<boolean> {
    const pythonPath = this.getVenvPythonPath();
    if (!fs.existsSync(pythonPath)) {
      return false;
    }

    try {
      await execAsync(`"${pythonPath}" -c "import ${packageName}"`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Download and install Python automatically (cross-platform)
   * - Windows: Downloads official Python installer and runs it silently
   * - macOS: Tries Homebrew first, falls back to python.org pkg
   * - Linux: Tries apt / dnf / pacman package managers
   */
  private async downloadAndInstallPython(
    onProgress: (p: PythonSetupProgress) => void
  ): Promise<boolean> {
    if (this.isWindows) {
      return this.installPythonWindows(onProgress);
    } else if (process.platform === 'darwin') {
      return this.installPythonMacOS(onProgress);
    } else {
      return this.installPythonLinux(onProgress);
    }
  }

  /**
   * Install Python on Windows using the official installer
   */
  private async installPythonWindows(
    onProgress: (p: PythonSetupProgress) => void
  ): Promise<boolean> {
    const tempDir = app.getPath('temp');
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const installerPath = path.join(tempDir, `python-${PYTHON_VERSION}-${arch}.exe`);
    const downloadUrl = getPythonDownloadUrl();

    try {
      // Download Python installer
      onProgress({ stage: 'downloading-python', progress: 10, message: 'Downloading Python (~25 MB)...' });
      
      await this.downloadFile(downloadUrl, installerPath, (percent) => {
        const progress = 10 + Math.round(percent * 0.4); // 10-50%
        onProgress({
          stage: 'downloading-python',
          progress,
          message: `Downloading Python ${PYTHON_VERSION} (${arch})... ${Math.round(percent)}%`,
        });
      });

      // Install Python silently
      onProgress({ stage: 'installing-python', progress: 55, message: 'Installing Python...' });
      
      await this.runPythonInstaller(installerPath, onProgress);

      // Cleanup installer
      try {
        fs.unlinkSync(installerPath);
      } catch {
        // Ignore cleanup errors
      }

      // Refresh PATH for this process
      await this.refreshPath();

      onProgress({ stage: 'installing-python', progress: 75, message: 'Python installed successfully' });
      return true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onProgress({
        stage: 'error',
        progress: 0,
        message: 'Python installation failed',
        error: `${errorMessage}\n\nIf your antivirus is blocking the installation, try temporarily disabling real-time protection and retry.`,
      });
      
      // Cleanup on error
      try {
        if (fs.existsSync(installerPath)) {
          fs.unlinkSync(installerPath);
        }
      } catch {
        // Ignore
      }
      
      return false;
    }
  }

  /**
   * Install Python on macOS using Homebrew or the official pkg installer
   */
  private async installPythonMacOS(
    onProgress: (p: PythonSetupProgress) => void
  ): Promise<boolean> {
    try {
      // Check if Homebrew is available
      try {
        await execAsync('brew --version');
        onProgress({ stage: 'installing-python', progress: 20, message: 'Installing Python via Homebrew...' });
        
        await execAsync('brew install python@3.11', { timeout: 300000 });
        
        // Homebrew may need PATH update
        const brewPrefix = (await execAsync('brew --prefix')).stdout.trim();
        const brewBinDir = path.join(brewPrefix, 'bin');
        if (!process.env.PATH?.includes(brewBinDir)) {
          process.env.PATH = `${brewBinDir}:${process.env.PATH}`;
        }
        
        onProgress({ stage: 'installing-python', progress: 75, message: 'Python installed via Homebrew' });
        return true;
      } catch {
        // Homebrew not available or install failed
        console.log('[PythonSetup] Homebrew not available, trying official installer...');
      }

      // Fallback: download official .pkg from python.org
      const tempDir = app.getPath('temp');
      const pkgPath = path.join(tempDir, `python-${PYTHON_VERSION}-macos11.pkg`);
      const pkgUrl = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-macos11.pkg`;

      onProgress({ stage: 'downloading-python', progress: 15, message: 'Downloading Python installer...' });
      
      await this.downloadFile(pkgUrl, pkgPath, (percent) => {
        onProgress({
          stage: 'downloading-python',
          progress: 15 + Math.round(percent * 0.4),
          message: `Downloading Python ${PYTHON_VERSION}... ${Math.round(percent)}%`,
        });
      });

      onProgress({ stage: 'installing-python', progress: 60, message: 'Installing Python (may require admin)...' });
      
      // Install .pkg — this may prompt for admin password via macOS security dialog
      await execAsync(`installer -pkg "${pkgPath}" -target CurrentUserHomeDirectory`, { timeout: 120000 });

      // Cleanup
      try { fs.unlinkSync(pkgPath); } catch { /* ignore */ }

      // Update PATH to include framework Python
      const frameworkBin = `/Library/Frameworks/Python.framework/Versions/3.11/bin`;
      const userFrameworkBin = path.join(process.env.HOME || '', frameworkBin);
      for (const binPath of [frameworkBin, userFrameworkBin]) {
        if (fs.existsSync(binPath) && !process.env.PATH?.includes(binPath)) {
          process.env.PATH = `${binPath}:${process.env.PATH}`;
        }
      }

      onProgress({ stage: 'installing-python', progress: 75, message: 'Python installed successfully' });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onProgress({
        stage: 'error',
        progress: 0,
        message: 'Python installation failed',
        error: `Could not install Python automatically. Please install Python 3.11+ manually:\n  brew install python@3.11\nor download from https://python.org\n\nDetails: ${errorMessage}`,
      });
      return false;
    }
  }

  /**
   * Install Python on Linux using system package managers
   */
  private async installPythonLinux(
    onProgress: (p: PythonSetupProgress) => void
  ): Promise<boolean> {
    try {
      // Detect available package manager and install
      const packageManagers = [
        {
          name: 'apt',
          check: 'apt --version',
          install: 'sudo apt update && sudo apt install -y python3 python3-venv python3-pip python3-dev',
        },
        {
          name: 'dnf',
          check: 'dnf --version',
          install: 'sudo dnf install -y python3 python3-pip python3-devel',
        },
        {
          name: 'pacman',
          check: 'pacman --version',
          install: 'sudo pacman -Sy --noconfirm python python-pip',
        },
        {
          name: 'zypper',
          check: 'zypper --version',
          install: 'sudo zypper install -y python3 python3-pip python3-venv python3-devel',
        },
      ];

      for (const pm of packageManagers) {
        try {
          await execAsync(pm.check);
          onProgress({
            stage: 'installing-python',
            progress: 20,
            message: `Installing Python via ${pm.name}...`,
          });

          await execAsync(pm.install, { timeout: 300000 });
          
          onProgress({ stage: 'installing-python', progress: 75, message: 'Python installed successfully' });
          return true;
        } catch {
          continue; // Try next package manager
        }
      }

      // No package manager worked
      onProgress({
        stage: 'error',
        progress: 0,
        message: 'Python installation failed',
        error: 'Could not install Python automatically. Please install Python 3.11+ manually using your distribution\'s package manager:\n  Ubuntu/Debian: sudo apt install python3 python3-venv python3-pip\n  Fedora: sudo dnf install python3 python3-pip\n  Arch: sudo pacman -S python python-pip',
      });
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onProgress({
        stage: 'error',
        progress: 0,
        message: 'Python installation failed',
        error: errorMessage,
      });
      return false;
    }
  }

  /**
   * Run the Python installer silently
   */
  private async runPythonInstaller(
    installerPath: string,
    onProgress: (p: PythonSetupProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Issue #4: Use /quiet for fully silent install (no UI at all).
      // /passive shows a progress bar but can confuse users when it pops up.
      // InstallAllUsers=0 - Install for current user only (no admin required)
      // PrependPath=1 - Add Python to PATH
      // Include_pip=1 - Include pip
      // Include_test=0 - Skip test suite
      const args = [
        '/quiet',
        'InstallAllUsers=0',
        'PrependPath=1',
        'Include_pip=1',
        'Include_test=0',
        'Include_doc=0',
        'Include_launcher=1',
        'InstallLauncherAllUsers=0',
      ];

      onProgress({ stage: 'installing-python', progress: 60, message: 'Running installer (this takes a moment)...' });

      const installer = spawn(installerPath, args, {
        shell: true,
        windowsHide: true, // Issue #4: Fully silent — no visible window
      });

      installer.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Python installer exited with code ${code}`));
        }
      });

      installer.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Refresh the PATH environment variable for this process.
   * Issue #10: Check for PATH length overflow on Windows (max ~2048 chars for User PATH,
   * ~32767 total). If PATH is close to the limit, warn but continue.
   */
  private async refreshPath(): Promise<void> {
    if (this.isWindows) {
      try {
        // Get the updated PATH from the registry
        const { stdout: userPath } = await execAsync(
          'powershell -Command "[Environment]::GetEnvironmentVariable(\'Path\', \'User\')"'
        );
        const { stdout: systemPath } = await execAsync(
          'powershell -Command "[Environment]::GetEnvironmentVariable(\'Path\', \'Machine\')"'
        );

        const combinedPath = `${userPath.trim()};${systemPath.trim()}`;
        
        // Issue #10: Windows has a practical PATH limit.
        // User PATH is stored in the registry as REG_EXPAND_SZ, limited to ~2048 chars.
        // The combined process PATH can be up to 32767 chars.
        const USER_PATH_WARN_THRESHOLD = 1800;
        if (userPath.trim().length > USER_PATH_WARN_THRESHOLD) {
          console.warn(
            `[PythonSetup] WARNING: User PATH is ${userPath.trim().length} chars ` +
            `(approaching 2048 limit). Python's PATH entry may be truncated. ` +
            `Consider cleaning up unused entries from your PATH environment variable.`
          );
        }

        // Update process.env.PATH
        process.env.PATH = combinedPath;
        
        console.log(`[PythonSetup] PATH refreshed (${combinedPath.length} chars)`);
      } catch (error) {
        console.warn('[PythonSetup] Failed to refresh PATH:', error);
      }
    } else {
      // On macOS/Linux, check common Python installation locations
      const commonPaths = [
        '/usr/local/bin',
        '/opt/homebrew/bin',                              // Homebrew on Apple Silicon
        '/Library/Frameworks/Python.framework/Versions/3.11/bin', // macOS framework Python
        path.join(process.env.HOME || '', '.local', 'bin'),       // pip --user installs
      ];
      for (const p of commonPaths) {
        if (fs.existsSync(p) && !process.env.PATH?.includes(p)) {
          process.env.PATH = `${p}:${process.env.PATH}`;
        }
      }
      console.log('[PythonSetup] PATH refreshed (Unix)');
    }
  }

  /**
   * Download a file with progress tracking.
   * Issue #8: Supports HTTP/HTTPS proxy when configured in app settings.
   * On Windows with a proxy, delegates to PowerShell Invoke-WebRequest for
   * reliability on corporate networks (handles NTLM auth, PAC scripts, etc.).
   */
  private downloadFile(
    url: string,
    dest: string,
    onProgress: (percent: number) => void
  ): Promise<void> {
    const proxyUrl = getProxyUrl();

    // When a proxy is configured on Windows, use PowerShell for reliability.
    // PowerShell handles corporate proxy auth (NTLM, Kerberos) and PAC scripts
    // better than Node.js's http module.
    if (proxyUrl && this.isWindows) {
      return this.downloadFileViaPowerShell(url, dest, proxyUrl, onProgress);
    }

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);

      const request = (currentUrl: string): void => {
        const getter = currentUrl.startsWith('https:') ? https.get : http.get;
        getter(currentUrl, (response) => {
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
        }).on('error', (err) => {
          fs.unlink(dest, (unlinkErr) => {
            if (unlinkErr) console.error('Error cleaning up file:', unlinkErr);
          });
          reject(err);
        });
      };

      request(url);
    });
  }

  /**
   * Download a file via PowerShell Invoke-WebRequest (proxy-aware).
   * More reliable than Node.js http on corporate Windows networks.
   */
  private async downloadFileViaPowerShell(
    url: string,
    dest: string,
    proxyUrl: string,
    onProgress: (percent: number) => void
  ): Promise<void> {
    console.log(`[PythonSetup] Downloading via PowerShell with proxy: ${proxyUrl}`);
    onProgress(5); // Indicate download started

    const escapedUrl = url.replace(/'/g, "''");
    const escapedDest = dest.replace(/'/g, "''");
    const escapedProxy = proxyUrl.replace(/'/g, "''");

    const command = [
      '$ProgressPreference = "SilentlyContinue"',
      `Invoke-WebRequest -Uri '${escapedUrl}' -OutFile '${escapedDest}' -Proxy '${escapedProxy}' -ProxyUseDefaultCredentials`,
    ].join('; ');

    await execAsync(`powershell -Command "${command}"`, { timeout: 600000 });

    if (!fs.existsSync(dest)) {
      throw new Error('Download failed — file was not created');
    }
    onProgress(100);
  }

  /**
   * Get the path to the Python directory (source code)
   */
  getPythonDir(): string {
    return this.pythonDir;
  }

  /**
   * Get the path to the persistent environment directory (userData)
   */
  getPythonEnvDir(): string {
    return this.pythonEnvDir;
  }

  /**
   * Get the path to the virtual environment
   */
  getVenvDir(): string {
    return this.venvDir;
  }

  /**
   * Get the path to the models cache directory.
   * If bundled models exist (dev or production build), point directly at them
   * to avoid any file copying — the Python bridge passes this as MODELS_CACHE_DIR.
   */
  getModelsCacheDir(): string {
    const bundledModelsDir = path.join(this.pythonDir, 'bundled-models');
    if (fs.existsSync(bundledModelsDir) && fs.readdirSync(bundledModelsDir).length > 0) {
      return bundledModelsDir;
    }
    return this.modelsCacheDir;
  }

  /**
   * Get the default data/output directory
   */
  getDataDir(): string {
    return this.dataDir;
  }

  /**
   * Track whether we started Ollama (to stop it on quit)
   */
  setOllamaStartedByUs(value: boolean): void {
    this.ollamaStartedByUs = value;
  }

  getOllamaStartedByUs(): boolean {
    return this.ollamaStartedByUs;
  }

  /**
   * Download required NLTK data (stopwords, punkt) into the venv.
   * The visualization modules need these at runtime, so downloading them
   * during setup ensures they're available offline and avoids runtime failures
   * behind corporate firewalls.
   */
  private async downloadNLTKData(): Promise<void> {
    const pythonPath = this.getVenvPythonPath();
    if (!fs.existsSync(pythonPath)) {
      console.warn('[PythonSetup] Cannot download NLTK data — venv Python not found');
      return;
    }

    // Store NLTK data inside the venv so it travels with the environment
    const nltkDataDir = path.join(this.venvDir, 'nltk_data');
    try {
      const tempScript = path.join(app.getPath('temp'), 'tourlyai_nltk_setup.py');
      const script = [
        'import nltk, os, sys',
        `nltk_dir = ${JSON.stringify(nltkDataDir)}`,
        'os.makedirs(nltk_dir, exist_ok=True)',
        'nltk.data.path.insert(0, nltk_dir)',
        'datasets = ["stopwords", "punkt", "punkt_tab"]',
        'for ds in datasets:',
        '    try:',
        '        nltk.download(ds, download_dir=nltk_dir, quiet=True)',
        '        print(f"Downloaded {ds}")',
        '    except Exception as e:',
        '        print(f"Warning: failed to download {ds}: {e}", file=sys.stderr)',
        'sys.exit(0)',
      ].join('\n');

      fs.writeFileSync(tempScript, script);

      try {
        // Set NLTK_DATA so the download function finds the right directory
        const env = {
          ...process.env,
          NLTK_DATA: nltkDataDir,
          VIRTUAL_ENV: this.venvDir,
        };
        await execAsync(`"${pythonPath}" "${tempScript}"`, { timeout: 120000, env });
        console.log('[PythonSetup] NLTK data downloaded to:', nltkDataDir);
      } finally {
        try { fs.unlinkSync(tempScript); } catch { /* ignore */ }
      }
    } catch (error) {
      // NLTK data download is not critical — modules will retry at runtime
      console.warn('[PythonSetup] NLTK data download failed (will retry at runtime):', error);
    }
  }

  /**
   * Clean the Python environment (delete venv) and force reinstall
   */
  async cleanEnvironment(): Promise<{ success: boolean; error?: string }> {
    try {
      if (fs.existsSync(this.venvDir)) {
        // Remove venv directory
        fs.rmSync(this.venvDir, { recursive: true, force: true });
        console.log('[PythonSetup] Virtual environment cleaned');
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[PythonSetup] Failed to clean environment:', message);
      return { success: false, error: message };
    }
  }
}

// Singleton instance
export const pythonSetup = new PythonSetup();

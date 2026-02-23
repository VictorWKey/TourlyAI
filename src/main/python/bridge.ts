// ============================================
// Python Bridge for Electron-Python Communication
// ============================================

import { spawn, exec, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { pythonSetup } from '../setup/PythonSetup';
import { getLLMConfig, getOutputDir, getLanguage, getProxyUrl } from '../utils/store';

/**
 * Command structure sent to Python process
 */
export interface PythonCommand {
  action: string;
  [key: string]: unknown;
}

/**
 * Response structure from Python process
 */
export interface PythonResponse {
  success: boolean;
  type?: string;
  error?: string;
  traceback?: string;
  [key: string]: unknown;
}

/**
 * Progress update from Python process
 */
export interface PythonProgress {
  type: 'progress';
  phase: number;
  phaseName: string;
  progress: number;
  message?: string;
}

/**
 * Callback function type for pending responses
 */
type ResponseCallback = {
  resolve: (response: PythonResponse) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
};

/**
 * PythonBridge - Manages communication with Python subprocess
 * 
 * Uses stdin/stdout for JSON message passing.
 * Supports progress updates and command timeouts.
 */
export class PythonBridge extends EventEmitter {
  private process: ChildProcess | null = null;
  private pythonPath: string;
  private scriptPath: string;
  private responseBuffer = '';
  private pendingCallbacks: Map<number, ResponseCallback> = new Map();
  private callId = 0;
  private isReady = false;
  private startPromise: Promise<void> | null = null;
  
  // Track current phase for progress parsing
  private currentPhase: number | null = null;
  private currentPhaseName: string | null = null;

  // Default timeout: 10 minutes for long-running phases
  private readonly DEFAULT_TIMEOUT = 600000;

  constructor() {
    super();
    
    // Use PythonSetup to get the correct Python path
    this.pythonPath = pythonSetup.getPythonPath();
    
    // Determine script path based on environment
    if (app.isPackaged) {
      this.scriptPath = path.join(process.resourcesPath, 'python', 'api_bridge.py');
    } else {
      const projectPythonDir = path.join(app.getAppPath(), 'python');
      this.scriptPath = path.join(projectPythonDir, 'api_bridge.py');
    }
    
    console.log('[PythonBridge] Using Python:', this.pythonPath);
    console.log('[PythonBridge] Script path:', this.scriptPath);
  }

  /**
   * Refresh the Python path from PythonSetup
   * This should be called after setup completes to ensure we use the venv
   */
  refreshPythonPath(): void {
    const newPath = pythonSetup.getPythonPath();
    if (newPath !== this.pythonPath) {
      console.log('[PythonBridge] Python path updated:', this.pythonPath, '->', newPath);
      this.pythonPath = newPath;
    }
  }

  /**
   * Start the Python subprocess
   */
  async start(): Promise<void> {
    // If already starting, wait for that to complete
    if (this.startPromise) {
      return this.startPromise;
    }

    // If already running and ready, return immediately
    if (this.process && this.isReady) {
      return Promise.resolve();
    }

    this.startPromise = new Promise((resolve, reject) => {
      try {
        // Get LLM configuration from store to pass as environment variables
        const llmConfig = getLLMConfig();
        const llmEnv: Record<string, string> = {
          LLM_MODE: llmConfig.mode === 'local' ? 'local' : 'api',
        };
        
        // Add API-specific environment variables
        if (llmConfig.mode === 'api' && llmConfig.apiKey) {
          llmEnv.OPENAI_API_KEY = llmConfig.apiKey;
          llmEnv.OPENAI_MODEL = llmConfig.apiModel || 'gpt-4o-mini';
        }
        
        // Add Ollama-specific environment variables
        if (llmConfig.mode === 'local') {
          // Don't hardcode a fallback model — if localModel is empty, leave
          // OLLAMA_MODEL unset so the Python side can report a clear error
          // instead of silently trying a model the user never installed.
          if (llmConfig.localModel) {
            llmEnv.OLLAMA_MODEL = llmConfig.localModel;
          }
          console.log('[PythonBridge] Using Ollama model:', llmEnv.OLLAMA_MODEL || '(not configured)');
        }
        
        // Add temperature
        llmEnv.LLM_TEMPERATURE = String(llmConfig.temperature ?? 0);

        // Add output directory if configured
        const outputDir = getOutputDir();
        if (outputDir) {
          llmEnv.OUTPUT_DIR = outputDir;
          console.log('[PythonBridge] Using output directory:', outputDir);
        }

        // Issue #3: Pass userData paths so Python writes models/data outside resources/
        // These override the defaults in python/config/config.py
        llmEnv.MODELS_CACHE_DIR = pythonSetup.getModelsCacheDir();
        if (!outputDir) {
          // Only set DATA_DIR when no custom output dir — custom OUTPUT_DIR takes precedence
          llmEnv.DATA_DIR = pythonSetup.getDataDir();
        }
        console.log('[PythonBridge] Models cache dir:', llmEnv.MODELS_CACHE_DIR);
        console.log('[PythonBridge] Data dir:', llmEnv.DATA_DIR || outputDir || '(python default)');

        // Pass language to Python for bilingual prompt generation
        const language = getLanguage();
        llmEnv.ANALYSIS_LANGUAGE = language;
        console.log('[PythonBridge] Using analysis language:', language);
        
        console.log('[PythonBridge] Starting with LLM mode:', llmEnv.LLM_MODE);
        console.log('[PythonBridge] Full LLM config:', JSON.stringify(llmConfig, null, 2));
        
        this.process = spawn(this.pythonPath, [this.scriptPath], {
          cwd: path.dirname(this.scriptPath),
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            ...llmEnv,
            // Issue #8: Pass configured proxy to Python for HuggingFace downloads, NLTK, etc.
            ...(() => {
              const proxy = getProxyUrl();
              if (!proxy) return {};
              return {
                HTTP_PROXY: proxy,
                HTTPS_PROXY: proxy,
                http_proxy: proxy,
                https_proxy: proxy,
              };
            })(),
            PYTHONUNBUFFERED: '1',
            PYTHONIOENCODING: 'utf-8',
            HF_HUB_DISABLE_SYMLINKS_WARNING: '1',
            // Point NLTK to the venv-local data downloaded during setup
            NLTK_DATA: path.join(pythonSetup.getVenvDir(), 'nltk_data'),
          },
        });

        // Handle stdout (JSON responses)
        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleOutput(data.toString());
        });

        // Handle stderr (errors and debug output)
        this.process.stderr?.on('data', (data: Buffer) => {
          const rawMessage = data.toString();
          
          // Split by lines to handle multiple tqdm updates
          const lines = rawMessage.split(/[\r\n]+/).filter(line => line.trim());
          
          for (const line of lines) {
            const message = line.trim();
            if (!message) continue;
            
            // Try to parse tqdm progress from stderr
            // tqdm format: "   Progreso:  42%|████▏     | 205/483 [00:01<00:01, 154.06it/s]"
            // Also matches "   Progress:" for English locale
            if ((message.includes('Progreso') || message.includes('Progress')) && message.includes('%')) {
              // Only parse tqdm if we have an active phase context
              // (otherwise stale stderr data can overwrite completed phases)
              if (this.currentPhase !== null) {
                const progressInfo = this.parseTqdmProgress(message);
                if (progressInfo) {
                  // Emit as progress event
                  this.emit('progress', progressInfo);
                  this.broadcastToWindows('pipeline:progress', progressInfo);
                  continue; // Don't log tqdm as error
                }
              } else {
                continue; // Discard stale tqdm output after phase context cleared
              }
            }
            
            // Filter out info/debug messages - these are NOT errors
            // Only silence them, don't emit as error events
            const infoPatterns = [
              'Progreso', // Progress bar text
              '✅', '⏭️', '•', // Checkmarks and bullets
              'Analizando', 'Clasificando', 'Generando', // Action words
              'cargado', 'completado', 'procesadas', 'omitiendo', // Status words
              'Seleccionando', 'Reducción', 'excluidos', // Selection words
              'reseñas', 'categorías', 'subtópicos', // Data words
              'LLM inicializado', 'OpenAI', 'gpt-4', // LLM init messages
              'Tipos de resumen', 'reseñas representativas', // Summary messages
              'guardado', 'guardados', // Save messages
              'Dataset', 'validación', 'Validación', // Dataset messages
              'Fase', 'columna', // Phase messages
              // Sentiment and classification labels
              'Positivo', 'Negativo', 'Neutro', // Sentiment
              'Subjetiva', 'Mixta', // Subjectivity
              'Alojamiento', 'Gastronomía', 'Transporte', 'Eventos', 'Historia', 'Compras', 'Deportes', 'nocturna', 'Naturaleza', 'Seguridad', 'Fauna', 'Personal', 'servicio', // Categories
              // Statistics patterns
              '|', 'Promedio', 'Total', 'opiniones', 'distribucion',
            ];
            
            if (infoPatterns.some(pattern => message.includes(pattern))) {
              // Emit as info event (not error)
              this.emit('info', message);
              continue;
            }
            
            // Only emit actual error messages (real exceptions, warnings, etc.)
            // Examples: "Traceback", "Error:", "Exception", etc.
            if (message.toLowerCase().includes('error') || 
                message.toLowerCase().includes('exception') ||
                message.toLowerCase().includes('traceback') ||
                message.toLowerCase().includes('failed') ||
                message.toLowerCase().includes('fatal')) {
              this.emit('error', message);
            }
            // Silently ignore other messages (they're just debug output)
          }
        });

        // Handle process close
        this.process.on('close', (code) => {
          this.cleanup();
          this.emit('close', code);
        });

        // Handle process error
        this.process.on('error', (error) => {
          this.cleanup();
          this.emit('error', error.message);
          reject(error);
        });

        // Wait for ready signal or timeout
        const readyTimeout = setTimeout(() => {
          if (!this.isReady) {
            this.isReady = true;
            this.startPromise = null;
            this.emit('warn', 'Ready timeout, assuming process is ready');
            resolve();
          }
        }, 5000);

        // Listen for ready signal
        const readyHandler = (response: PythonResponse) => {
          if (response.type === 'ready') {
            clearTimeout(readyTimeout);
            this.isReady = true;
            this.startPromise = null;
            this.emit('ready');
            resolve();
          }
        };

        this.once('message', readyHandler);
        
      } catch (error) {
        this.startPromise = null;
        reject(error);
      }
    });

    return this.startPromise;
  }

  /**
   * Handle output from Python process
   */
  private handleOutput(data: string): void {
    this.responseBuffer += data;
    
    // Process complete JSON lines
    const lines = this.responseBuffer.split('\n');
    this.responseBuffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line) as PythonResponse;
          
          // Emit message event for any response
          this.emit('message', response);
          
          // Handle progress updates
          if (response.type === 'progress') {
            const progressValue = (response as { progress?: number }).progress;
            const subtype = (response as { subtype?: string }).subtype;
            
            // Always emit for non-pipeline listeners (e.g. ModelDownloader for model downloads)
            this.emit('progress', response);
            
            // Only broadcast to renderer windows if:
            // 1. There's an active phase context (prevent stale events after phase ends)
            // 2. It's NOT a pipeline phase completion event (progress=100 without subtype)
            //    because pipeline.ts sends its own 'completed' status via sendProgressUpdate.
            //    Python's 100% progress has no 'status' field and would be misinterpreted
            //    as 'running' in the renderer, overwriting the completed state.
            // 3. Events with a subtype (e.g. 'model_download') are always forwarded since
            //    they're handled by dedicated listeners, not the pipeline progress handler.
            if (subtype === 'model_download') {
              // Model download progress — forward on dedicated channel only
              // (ModelDownloader listens via bridge.on('progress'), not via pipeline:progress)
              // Don't broadcast on pipeline:progress to avoid creating phantom phase cards
            } else if (subtype) {
              // Other subtypes — emit only, don't broadcast as pipeline progress
            } else if (this.currentPhase !== null && progressValue !== 100) {
              // Pipeline phase progress (intermediate updates only)
              this.broadcastToWindows('pipeline:progress', response);
            }
          } else if (response.type === 'ready') {
            // Ready signal handled in start() - just emit
            this.emit('ready');
          } else {
            // Handle command responses - resolve by callId or fallback to FIFO
            this.resolveByCallId(response);
          }
        } catch (e) {
          // Silently handle parse errors to avoid EPIPE
          this.emit('error', `Failed to parse response: ${line}`);
        }
      }
    }
  }

  /**
   * Resolve a pending callback by callId or fall back to oldest (FIFO)
   */
  private resolveByCallId(response: PythonResponse): void {
    // Try to match by _callId first (preferred — correlation-based)
    const callId = (response as { _callId?: number })._callId;
    if (callId !== undefined && this.pendingCallbacks.has(callId)) {
      const callback = this.pendingCallbacks.get(callId);
      if (callback) {
        clearTimeout(callback.timeoutId);
        this.pendingCallbacks.delete(callId);
        const resp = response as { valid?: boolean; columns?: string[]; missingColumns?: string[] };
        console.log('[PythonBridge] Response matched by callId:', callId, 'success:', response.success, 'valid:', resp.valid, 'columns:', resp.columns?.join(', ') || 'N/A', 'missing:', resp.missingColumns?.join(', ') || 'none', 'error:', response.error?.substring(0, 100) || 'none');
        callback.resolve(response);
        return;
      }
    }

    // Fall back to FIFO matching (for backward compatibility)
    this.resolveOldestPending(response);
  }

  /**
   * Resolve the oldest pending callback (FIFO fallback)
   */
  private resolveOldestPending(response: PythonResponse): void {
    // Find the oldest pending callback (lowest call ID)
    let oldestId: number | null = null;
    for (const id of this.pendingCallbacks.keys()) {
      if (oldestId === null || id < oldestId) {
        oldestId = id;
      }
    }

    if (oldestId !== null) {
      const callback = this.pendingCallbacks.get(oldestId);
      if (callback) {
        clearTimeout(callback.timeoutId);
        this.pendingCallbacks.delete(oldestId);
        const resp = response as { valid?: boolean; columns?: string[]; missingColumns?: string[] };
        console.log('[PythonBridge] Response received - success:', response.success, 'valid:', resp.valid, 'columns:', resp.columns?.join(', ') || 'N/A', 'missing:', resp.missingColumns?.join(', ') || 'none', 'error:', response.error?.substring(0, 100) || 'none');
        callback.resolve(response);
      }
    }
  }

  /**
   * Parse tqdm progress from stderr output
   * Formats:
   * - "   Progreso:  42%|████▏     | 205/483 [00:01<00:01, 154.06it/s]"
   * - "   Progreso: 100%|██████████| 483/483 [00:03<00:00, 158.42it/s]"
   */
  private parseTqdmProgress(line: string): PythonProgress | null {
    try {
      // Extract percentage - handle various formats
      // Match patterns like "Progreso:  42%" or "Progress: 100%"
      const percentMatch = line.match(/(?:Progreso|Progress)[:\s]+(\d+)%/);
      if (!percentMatch) return null;
      
      const progress = parseInt(percentMatch[1], 10);
      
      // Extract current/total if available
      let message = `${progress}%`;
      const countMatch = line.match(/\|\s*(\d+)\/(\d+)/);
      if (countMatch) {
        const current = countMatch[1];
        const total = countMatch[2];
        message = `${current}/${total}`;
      }
      
      // Return progress object with current phase context
      // If no phase context, return null to prevent misattribution
      if (this.currentPhase === null) return null;
      
      return {
        type: 'progress',
        phase: this.currentPhase,
        phaseName: this.currentPhaseName || 'Processing',
        progress,
        message,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Broadcast message to all renderer windows
   */
  private broadcastToWindows(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }

  /**
   * Execute a command and wait for response
   */
  async execute(command: PythonCommand, timeout?: number): Promise<PythonResponse> {
    // Ensure process is started
    if (!this.process || !this.isReady) {
      await this.start();
    }

    if (!this.process?.stdin) {
      throw new Error('Python process stdin not available');
    }

    return new Promise((resolve, reject) => {
      const currentCallId = this.callId++;
      const timeoutMs = timeout || this.DEFAULT_TIMEOUT;
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (this.pendingCallbacks.has(currentCallId)) {
          this.pendingCallbacks.delete(currentCallId);
          reject(new Error(`Python command timeout after ${timeoutMs}ms: ${command.action}`));
        }
      }, timeoutMs);

      // Register callback
      this.pendingCallbacks.set(currentCallId, { resolve, reject, timeoutId });
      
      // Send command with correlation ID so Python can echo it back
      const commandWithId = { ...command, _callId: currentCallId };
      const commandStr = JSON.stringify(commandWithId) + '\n';
      console.log('[PythonBridge] Sending command:', command.action, 'path:', (command as { path?: string }).path?.substring(0, 50) || 'N/A');
      this.process?.stdin?.write(commandStr, (error) => {
        if (error) {
          clearTimeout(timeoutId);
          this.pendingCallbacks.delete(currentCallId);
          reject(new Error(`Failed to write to Python stdin: ${error.message}`));
        }
      });
    });
  }

  /**
   * Check if Python process is running and healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.execute({ action: 'ping' }, 5000);
      return response.success === true;
    } catch {
      return false;
    }
  }

  /**
   * Stop the Python subprocess
   */
  stop(): void {
    this.cleanup();
  }

  /**
   * Restart the Python subprocess with updated configuration
   * This is needed when LLM settings change or after setup completes
   */
  async restart(): Promise<void> {
    console.log('[PythonBridge] Restarting with updated configuration...');
    this.cleanup();
    // Refresh Python path in case setup just completed
    this.refreshPythonPath();
    await this.start();
    console.log('[PythonBridge] Restart complete');
  }

  /**
   * Force stop the Python subprocess immediately (like Ctrl+C)
   * On Windows uses taskkill, on Unix sends SIGINT then SIGKILL
   */
  forceStop(): void {
    if (this.process && this.process.pid) {
      if (process.platform === 'win32') {
        // On Windows, use taskkill to force kill the process tree
        exec(`taskkill /pid ${this.process.pid} /T /F`, () => {
          // Ignore errors, process might already be dead
        });
      } else {
        // First try SIGINT (Ctrl+C) for graceful interruption
        this.process.kill('SIGINT');
        
        // Give it 500ms to respond to SIGINT, then force kill
        setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL');
          }
        }, 500);
      }
    }
    
    this.cleanup();
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    // Clear all pending callbacks with rejection
    for (const [id, callback] of this.pendingCallbacks) {
      clearTimeout(callback.timeoutId);
      callback.reject(new Error('Python bridge stopped'));
    }
    this.pendingCallbacks.clear();

    // Kill process if running
    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.isReady = false;
    this.startPromise = null;
    this.responseBuffer = '';
  }

  /**
   * Get current status
   */
  getStatus(): { running: boolean; ready: boolean; pendingCalls: number } {
    return {
      running: this.process !== null,
      ready: this.isReady,
      pendingCalls: this.pendingCallbacks.size,
    };
  }

  /**
   * Set the current phase context for progress parsing
   */
  setPhaseContext(phase: number | null, phaseName: string | null): void {
    this.currentPhase = phase;
    this.currentPhaseName = phaseName;
  }
}

// Singleton instance
let bridgeInstance: PythonBridge | null = null;

/**
 * Get the singleton PythonBridge instance
 */
export function getPythonBridge(): PythonBridge {
  if (!bridgeInstance) {
    bridgeInstance = new PythonBridge();
  }
  return bridgeInstance;
}

/**
 * Stop and clean up the Python bridge
 */
export function stopPythonBridge(): void {
  if (bridgeInstance) {
    bridgeInstance.stop();
    bridgeInstance = null;
  }
}

// ============================================
// File Operations IPC Handlers
// ============================================

import { ipcMain, dialog, shell } from 'electron';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// Helper function to open folder on Linux using various file managers
async function openFolderLinux(folderPath: string): Promise<string> {
  // Check if we're in WSL
  try {
    const procVersion = readFileSync('/proc/version', 'utf8').toLowerCase();
    
    if (procVersion.includes('microsoft') || procVersion.includes('wsl')) {
      console.log('[IPC] WSL detected, using explorer.exe');
      
      // In WSL, convert Linux path to Windows path using wslpath
      return new Promise<string>((resolve) => {
        const wslpathChild = spawn('wslpath', ['-w', folderPath]);
        let windowsPath = '';
        
        wslpathChild.stdout.on('data', (data) => {
          windowsPath += data.toString().trim();
        });
        
        wslpathChild.on('close', (code) => {
          if (code !== 0 || !windowsPath) {
            console.log('[IPC] wslpath failed, using WSL network path format');
            // Fallback: use \\wsl$ network path format
            windowsPath = `\\\\wsl$\\Ubuntu${folderPath}`;
          }
          
          console.log('[IPC] Opening Windows path:', windowsPath);
          
          const child = spawn('explorer.exe', [windowsPath], {
            detached: true,
            stdio: 'ignore',
          });
          
          child.on('error', (err) => {
            console.log('[IPC] explorer.exe error:', err.message);
            resolve(`explorer.exe failed: ${err.message}`);
          });
          
          child.on('spawn', () => {
            console.log('[IPC] explorer.exe spawned successfully');
            child.unref();
            resolve('');
          });
          
          // Timeout after 3 seconds
          setTimeout(() => resolve('explorer.exe timeout'), 3000);
        });
      });
    }
  } catch (e) {
    console.log('[IPC] Error checking for WSL:', e);
  }
  
  // List of file managers to try in order of preference
  const fileManagers = [
    { cmd: 'gio', args: ['open', folderPath] },                // GNOME (most common)
    { cmd: 'nautilus', args: ['--new-window', folderPath] },   // GNOME Files
    { cmd: 'dolphin', args: ['--new-window', folderPath] },    // KDE
    { cmd: 'thunar', args: [folderPath] },                     // XFCE
    { cmd: 'nemo', args: [folderPath] },                       // Cinnamon
    { cmd: 'pcmanfm', args: [folderPath] },                    // LXDE
    { cmd: 'caja', args: [folderPath] },                       // MATE
    { cmd: 'xdg-open', args: [folderPath] },                   // Fallback
  ];

  for (const fm of fileManagers) {
    try {
      console.log(`[IPC] Trying file manager: ${fm.cmd} ${fm.args.join(' ')}`);
      const result = await new Promise<string>((resolve) => {
        const child = spawn(fm.cmd, fm.args, {
          detached: true,
          stdio: 'ignore',
        });
        
        child.on('error', (err) => {
          // Command not found, try next
          console.log(`[IPC] ${fm.cmd} error:`, err.message);
          resolve(`not_found: ${fm.cmd}`);
        });
        
        child.on('spawn', () => {
          // Successfully spawned
          console.log(`[IPC] ${fm.cmd} spawned successfully`);
          child.unref();
          resolve('');
        });
        
        // Timeout after 2 seconds
        setTimeout(() => resolve(`timeout: ${fm.cmd}`), 2000);
      });

      if (result === '') {
        console.log(`[IPC] Successfully opened folder with ${fm.cmd}`);
        return ''; // Success
      }
    } catch (e) {
      // Continue to next file manager
      console.log(`[IPC] Exception trying ${fm.cmd}:`, e);
    }
  }

  return 'No file manager found';
}

interface FileFilter {
  name: string;
  extensions: string[];
}

interface FileReadResult {
  success: boolean;
  content?: string;
  error?: string;
}

interface FileWriteResult {
  success: boolean;
  error?: string;
}

interface OpenPathResult {
  success: boolean;
  error?: string;
}

export function registerFileHandlers(): void {
  // Select file dialog
  ipcMain.handle('files:select', async (_, filters?: FileFilter[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters || [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Select directory dialog
  ipcMain.handle('files:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Read file contents
  ipcMain.handle('files:read', async (_, filePath: string): Promise<FileReadResult> => {
    try {
      // Validate path
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Ruta de archivo inválida' };
      }

      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
      const content = await fs.readFile(absolutePath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Write file contents
  ipcMain.handle(
    'files:write',
    async (_, filePath: string, content: string): Promise<FileWriteResult> => {
      try {
        // Validate inputs
        if (!filePath || typeof filePath !== 'string') {
          return { success: false, error: 'Ruta de archivo inválida' };
        }
        if (typeof content !== 'string') {
          return { success: false, error: 'El contenido debe ser una cadena de texto' };
        }

        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
        
        // Ensure directory exists
        const dir = path.dirname(absolutePath);
        await fs.mkdir(dir, { recursive: true });
        
        await fs.writeFile(absolutePath, content, 'utf-8');
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Write binary file from base64 content
  ipcMain.handle(
    'files:write-binary',
    async (_, filePath: string, base64Content: string): Promise<FileWriteResult> => {
      try {
        if (!filePath || typeof filePath !== 'string') {
          return { success: false, error: 'Invalid file path' };
        }
        if (typeof base64Content !== 'string') {
          return { success: false, error: 'Content must be a base64 string' };
        }

        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);

        // Ensure directory exists
        const dir = path.dirname(absolutePath);
        await fs.mkdir(dir, { recursive: true });

        const buffer = Buffer.from(base64Content, 'base64');
        await fs.writeFile(absolutePath, buffer);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Write binary file from ArrayBuffer/Uint8Array (more efficient for large files)
  ipcMain.handle(
    'files:write-array-buffer',
    async (_, filePath: string, data: Uint8Array | number[]): Promise<FileWriteResult> => {
      try {
        if (!filePath || typeof filePath !== 'string') {
          return { success: false, error: 'Invalid file path' };
        }
        if (!data) {
          return { success: false, error: 'No data provided' };
        }

        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);

        // Ensure directory exists
        const dir = path.dirname(absolutePath);
        await fs.mkdir(dir, { recursive: true });

        // Convert to Buffer (works with Uint8Array or plain arrays)
        const buffer = Buffer.from(data as Uint8Array);
        await fs.writeFile(absolutePath, buffer);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Open path in system file explorer or application
  ipcMain.handle('files:open-path', async (_, filePath: string): Promise<OpenPathResult> => {
    try {
      console.log('[IPC] open-path called with:', filePath);
      
      if (!filePath || typeof filePath !== 'string') {
        console.log('[IPC] Invalid file path');
        return { success: false, error: 'Ruta de archivo inválida' };
      }

      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
      console.log('[IPC] Resolved absolute path:', absolutePath);
      
      // Check if path exists first
      try {
        await fs.access(absolutePath);
        console.log('[IPC] Path exists');
      } catch (accessError) {
        console.log('[IPC] Path does not exist:', accessError);
        return { success: false, error: `Path does not exist: ${absolutePath}` };
      }
      
      // On Linux, try our custom file manager opener
      if (process.platform === 'linux') {
        console.log('[IPC] Using Linux file manager fallback');
        const errorMessage = await openFolderLinux(absolutePath);
        if (errorMessage) {
          console.log('[IPC] Linux file manager error:', errorMessage);
          return { success: false, error: errorMessage };
        }
        return { success: true };
      }
      
      // On other platforms, use shell.openPath
      console.log('[IPC] Using shell.openPath');
      const errorMessage = await shell.openPath(absolutePath);
      console.log('[IPC] shell.openPath result:', errorMessage);
      
      if (errorMessage) {
        console.log('[IPC] Error from shell.openPath:', errorMessage);
        return { success: false, error: errorMessage };
      }
      
      console.log('[IPC] Successfully opened path');
      return { success: true };
    } catch (error) {
      console.error('[IPC] Exception in open-path handler:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Check if file exists
  ipcMain.handle('files:exists', async (_, filePath: string): Promise<boolean> => {
    try {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  });

  // Get file info (stats)
  ipcMain.handle('files:stat', async (_, filePath: string) => {
    try {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
      const stats = await fs.stat(absolutePath);
      return {
        success: true,
        stats: {
          size: stats.size,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          created: stats.birthtime.toISOString(),
          modified: stats.mtime.toISOString(),
        },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // List images in a directory (for visualizations)
  ipcMain.handle('files:list-images', async (_, dirPath: string) => {
    try {
      const absolutePath = path.isAbsolute(dirPath) ? dirPath : path.resolve(dirPath);

      // Check if directory exists
      try {
        await fs.access(absolutePath);
      } catch {
        return { success: false, error: 'Directory does not exist', images: [] };
      }

      const images: Array<{
        id: string;
        name: string;
        path: string;
        category: string;
        categoryLabel: string;
      }> = [];

      // Category mapping
      const categoryLabels: Record<string, string> = {
        '01_sentimientos': 'Sentimientos',
        '02_subjetividad': 'Subjetividad',
        '03_categorias': 'Categorías',
        '04_topicos': 'Tópicos',
        '05_temporal': 'Temporal',
        '06_texto': 'Texto',
        '07_combinados': 'Análisis Cruzado',
      };

      // Professional display names for each visualization
      const displayNames: Record<string, string> = {
        // Dashboard
        'dashboard_ejecutivo': 'Dashboard Ejecutivo',
        
        // Sentimientos
        'distribucion_sentimientos': 'Distribución de Sentimientos',
        'evolucion_temporal_sentimientos': 'Evolución Temporal de Sentimientos',
        'sentimientos_por_calificacion': 'Sentimientos por Calificación',
        'sentimientos_por_categoria': 'Sentimientos por Categoría',
        'sentimiento_vs_subjetividad': 'Sentimiento vs Subjetividad',
        
        // Subjetividad
        'distribucion_subjetividad': 'Distribución de Subjetividad',
        'subjetividad_por_calificacion': 'Subjetividad por Calificación',
        'evolucion_temporal_subjetividad': 'Evolución Temporal de Subjetividad',
        'wordcloud_positivo': 'Nube de Palabras - Opiniones Positivas',
        'wordcloud_neutro': 'Nube de Palabras - Opiniones Neutras',
        'wordcloud_negativo': 'Nube de Palabras - Opiniones Negativas',
        'top_palabras_comparacion': 'Comparación de Palabras Frecuentes',
        
        // Categorías
        'top_categorias': 'Top Categorías Mencionadas',
        'radar_chart_360': 'Vista 360° - Radar de Categorías',
        'fortalezas_vs_debilidades': 'Fortalezas vs Debilidades',
        'matriz_coocurrencia': 'Matriz de Co-ocurrencia de Categorías',
        'calificacion_por_categoria': 'Calificación Promedio por Categoría',
        'evolucion_categorias': 'Evolución de Categorías en el Tiempo',
        'distribucion_categorias_calificacion': 'Distribución por Categoría y Calificación',
        
        // Tópicos
        'wordcloud_general': 'Nube de Palabras General',
        'top_subtopicos_mencionados': 'Top Subtópicos Más Mencionados',
        'top_subtopicos_problematicos': 'Top Subtópicos Problemáticos',
        'distribucion_subtopicos': 'Distribución de Subtópicos',
        
        // Temporal
        'evolucion_sentimientos': 'Evolución de Sentimientos',
        'tendencia_calificacion': 'Tendencia de Calificación',
        'estacionalidad_categorias': 'Estacionalidad de Categorías',
        'volumen_opiniones_tiempo': 'Volumen de Opiniones en el Tiempo',
        
        // Texto
        'distribucion_longitud': 'Distribución de Longitud de Opiniones',
        'top_bigramas': 'Top Bigramas',
        'top_trigramas': 'Top Trigramas',
        
        // Combinados
        'sentimiento_subjetividad_categoria': 'Sentimiento y Subjetividad por Categoría',
        'calificacion_categoria_sentimiento': 'Calificación, Categoría y Sentimiento',
        'volumen_vs_sentimiento_scatter': 'Volumen vs Sentimiento',
        'correlacion_calificacion_sentimiento': 'Correlación: Calificación y Sentimiento',
      };

      // Scan subdirectories for images
      const subdirs = await fs.readdir(absolutePath, { withFileTypes: true });

      for (const subdir of subdirs) {
        if (!subdir.isDirectory()) continue;

        const categoryPath = path.join(absolutePath, subdir.name);
        const files = await fs.readdir(categoryPath);

        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          if (['.png', '.jpg', '.jpeg', '.svg', '.webp'].includes(ext)) {
            const imagePath = path.join(categoryPath, file);
            const fileNameWithoutExt = file.replace(ext, '');
            const displayName = displayNames[fileNameWithoutExt] || 
                              fileNameWithoutExt.replace(/_/g, ' ');
            
            images.push({
              id: `${subdir.name}-${file}`,
              name: displayName,
              path: imagePath,
              category: subdir.name,
              categoryLabel: categoryLabels[subdir.name] || subdir.name,
            });
          }
        }
      }

      // Also scan root directory for any loose images
      const rootFiles = await fs.readdir(absolutePath);
      for (const file of rootFiles) {
        const filePath = path.join(absolutePath, file);
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          const ext = path.extname(file).toLowerCase();
          if (['.png', '.jpg', '.jpeg', '.svg', '.webp'].includes(ext)) {
            const fileNameWithoutExt = file.replace(ext, '');
            const displayName = displayNames[fileNameWithoutExt] || 
                              fileNameWithoutExt.replace(/_/g, ' ');
            
            images.push({
              id: `root-${file}`,
              name: displayName,
              path: filePath,
              category: 'root',
              categoryLabel: 'General',
            });
          }
        }
      }

      return { success: true, images };
    } catch (error) {
      return { success: false, error: (error as Error).message, images: [] };
    }
  });

  // List directory contents
  ipcMain.handle('files:list-dir', async (_, dirPath: string) => {
    try {
      const absolutePath = path.isAbsolute(dirPath) ? dirPath : path.resolve(dirPath);
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      
      const items = entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        path: path.join(absolutePath, entry.name),
      }));

      return { success: true, items };
    } catch (error) {
      return { success: false, error: (error as Error).message, items: [] };
    }
  });

  // Clean up all dataset output data (visualizations, shared data, processed dataset, backups)
  ipcMain.handle('files:clean-dataset-data', async (_, dataDir: string): Promise<{ success: boolean; deletedPaths: string[]; error?: string }> => {
    try {
      if (!dataDir || typeof dataDir !== 'string') {
        return { success: false, deletedPaths: [], error: 'Ruta de directorio de datos inválida' };
      }

      const absoluteDir = path.isAbsolute(dataDir) ? dataDir : path.resolve(dataDir);
      const deletedPaths: string[] = [];

      // Paths to clean
      const pathsToDelete = [
        path.join(absoluteDir, 'visualizaciones'),  // All chart images
        path.join(absoluteDir, 'shared'),            // categorias_scores.json, resumenes.json
        path.join(absoluteDir, '.backups'),           // Rollback backups
      ];

      const filesToDelete = [
        path.join(absoluteDir, 'dataset.csv'),       // Processed dataset
      ];

      // Also clean any _mapped.csv files in the directory
      try {
        const entries = await fs.readdir(absoluteDir);
        for (const entry of entries) {
          if (entry.endsWith('_mapped.csv')) {
            filesToDelete.push(path.join(absoluteDir, entry));
          }
        }
      } catch {
        // Directory might not exist yet
      }

      // Delete directories recursively
      for (const dirPath of pathsToDelete) {
        try {
          await fs.rm(dirPath, { recursive: true, force: true });
          deletedPaths.push(dirPath);
        } catch {
          // Directory doesn't exist, skip
        }
      }

      // Delete individual files
      for (const filePath of filesToDelete) {
        try {
          await fs.unlink(filePath);
          deletedPaths.push(filePath);
        } catch {
          // File doesn't exist, skip
        }
      }

      console.log(`[IPC] Cleaned dataset data: ${deletedPaths.length} paths removed from ${absoluteDir}`);
      return { success: true, deletedPaths };
    } catch (error) {
      console.error('[IPC] Error cleaning dataset data:', error);
      return { success: false, deletedPaths: [], error: (error as Error).message };
    }
  });

  // Read image file as base64 data URL
  ipcMain.handle('files:read-image-base64', async (_, filePath: string) => {
    try {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
      const buffer = await fs.readFile(absolutePath);
      const ext = path.extname(filePath).toLowerCase();
      
      // Determine MIME type
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
      };
      
      const mimeType = mimeTypes[ext] || 'image/png';
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;
      
      return { success: true, dataUrl };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Backup dataset data to a user-selected directory
  ipcMain.handle('files:backup-dataset-data', async (_, dataDir: string): Promise<{ success: boolean; backupPath?: string; error?: string }> => {
    try {
      if (!dataDir || typeof dataDir !== 'string') {
        return { success: false, error: 'Ruta de directorio de datos inválida' };
      }

      const absoluteDir = path.isAbsolute(dataDir) ? dataDir : path.resolve(dataDir);

      // Check if data directory exists
      try {
        await fs.access(absoluteDir);
      } catch {
        return { success: false, error: 'No hay datos para respaldar. El directorio de datos no existe.' };
      }

      // Open a save dialog to pick destination folder
      const result = await dialog.showOpenDialog({
        title: 'Seleccionar carpeta para la copia de seguridad',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Guardar copia aquí',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'cancelado' };
      }

      const destBase = result.filePaths[0];
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupFolderName = `backup-analysis-${timestamp}`;
      const backupPath = path.join(destBase, backupFolderName);

      await fs.mkdir(backupPath, { recursive: true });

      // Directories to copy
      const dirsToCopy = ['visualizaciones', 'shared', '.backups'];
      // Files to copy
      const filesToCopy = ['dataset.csv'];

      // Also include any _mapped.csv files
      try {
        const entries = await fs.readdir(absoluteDir);
        for (const entry of entries) {
          if (entry.endsWith('_mapped.csv')) {
            filesToCopy.push(entry);
          }
        }
      } catch {
        // Directory might not have extra files
      }

      let copiedCount = 0;

      // Copy directories recursively
      for (const dirName of dirsToCopy) {
        const srcPath = path.join(absoluteDir, dirName);
        const destPath = path.join(backupPath, dirName);
        try {
          await fs.access(srcPath);
          await fs.cp(srcPath, destPath, { recursive: true });
          copiedCount++;
        } catch {
          // Directory doesn't exist, skip
        }
      }

      // Copy individual files
      for (const fileName of filesToCopy) {
        const srcPath = path.join(absoluteDir, fileName);
        const destPath = path.join(backupPath, fileName);
        try {
          await fs.access(srcPath);
          await fs.copyFile(srcPath, destPath);
          copiedCount++;
        } catch {
          // File doesn't exist, skip
        }
      }

      if (copiedCount === 0) {
        // Clean up the empty backup folder
        await fs.rm(backupPath, { recursive: true, force: true });
        return { success: false, error: 'No se encontraron datos para respaldar.' };
      }

      console.log(`[IPC] Backup created at: ${backupPath} (${copiedCount} items copied)`);
      return { success: true, backupPath };
    } catch (error) {
      console.error('[IPC] Error creating backup:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Delete a single file from disk (used for report deletion, etc.)
  ipcMain.handle('files:delete', async (_, filePath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Ruta de archivo inválida' };
      }
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
      await fs.unlink(absolutePath);
      console.log(`[IPC] Deleted file: ${absolutePath}`);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error deleting file:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  console.log('[IPC] File handlers registered');
}

/**
 * Pre-bundle Python Environment for Distribution (Cross-Platform)
 * ================================================================
 * 
 * This script creates a portable Python environment that can be
 * bundled with the installer, eliminating the need for users to
 * download Python + dependencies on first run.
 * 
 * Supports: Windows (x64), macOS (x64, arm64), Linux (x64, arm64)
 * 
 * USAGE:
 *   node scripts/bundle-python.mjs
 *   node scripts/bundle-python.mjs --platform=darwin --arch=arm64  (cross-build)
 * 
 * WHAT IT DOES:
 *   1. Downloads python-build-standalone (portable Python, no installer needed)
 *   2. Creates a venv with all pip dependencies pre-installed
 *   3. Outputs to python/bundled-env/ ready for extraResource inclusion
 * 
 * AFTER RUNNING:
 *   Update forge.config.ts extraResource to include the bundled env:
 *     extraResource: ['./python'],  // already includes bundled-env/
 *   
 *   The PythonSetup.ts will detect the bundled env and skip download.
 * 
 * SIZE ESTIMATE:
 *   ~1.5 GB (Python ~50MB + PyTorch ~800MB + Transformers ~200MB + others)
 *   The installer will be ~500MB compressed.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const pythonDir = join(projectRoot, 'python');
const bundledDir = join(pythonDir, 'bundled-env');
const requirementsPath = join(pythonDir, 'requirements.txt');

// ── Platform detection (allow override via CLI args) ──
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  acc[key] = value;
  return acc;
}, {});

const targetPlatform = args.platform || process.platform;   // win32 | darwin | linux
const targetArch = args.arch || process.arch;               // x64 | arm64

// ── Python standalone build URLs per platform/arch ──
const PYTHON_STANDALONE_VERSION = '20241016';
const PYTHON_VERSION = '3.11.10';

function getStandaloneUrl() {
  const base = `https://github.com/indygreg/python-build-standalone/releases/download/${PYTHON_STANDALONE_VERSION}`;
  const pyVer = `cpython-${PYTHON_VERSION}+${PYTHON_STANDALONE_VERSION}`;

  const archMap = { x64: 'x86_64', arm64: 'aarch64' };
  const arch = archMap[targetArch];
  if (!arch) {
    console.error(`ERROR: Unsupported architecture "${targetArch}". Supported: x64, arm64`);
    process.exit(1);
  }

  const platformTriples = {
    win32:  `${arch}-pc-windows-msvc`,
    darwin: `${arch}-apple-darwin`,
    linux:  `${arch}-unknown-linux-gnu`,
  };

  const triple = platformTriples[targetPlatform];
  if (!triple) {
    console.error(`ERROR: Unsupported platform "${targetPlatform}". Supported: win32, darwin, linux`);
    process.exit(1);
  }

  return `${base}/${pyVer}-${triple}-install_only_stripped.tar.gz`;
}

// ── Platform-specific binary paths ──
function getPythonBinary(baseDir) {
  if (targetPlatform === 'win32') {
    return join(baseDir, 'python.exe');
  }
  return join(baseDir, 'bin', 'python3');
}

function getPipBinary(venvDir) {
  if (targetPlatform === 'win32') {
    return join(venvDir, 'Scripts', 'pip.exe');
  }
  return join(venvDir, 'bin', 'pip');
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`  Downloading: ${url}`);
    const file = createWriteStream(dest);
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        rmSync(dest, { force: true });
        return download(response.headers.location, dest).then(resolve).catch(reject);
      }
      const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (totalBytes > 0) {
          const pct = Math.round((downloaded / totalBytes) * 100);
          process.stdout.write(`\r  Progress: ${pct}% (${(downloaded / 1e6).toFixed(1)}MB / ${(totalBytes / 1e6).toFixed(1)}MB)`);
        }
      });
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('\n  Download complete.');
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      rmSync(dest, { force: true });
      reject(err);
    });
  });
}

async function main() {
  console.log('=== Python Environment Bundler (Cross-Platform) ===');
  console.log(`  Target: ${targetPlatform}/${targetArch}\n`);

  const standaloneUrl = getStandaloneUrl();

  // Step 1: Download standalone Python
  const tarPath = join(projectRoot, 'python-standalone.tar.gz');
  if (!existsSync(tarPath)) {
    console.log('Step 1: Downloading Python standalone build...');
    await download(standaloneUrl, tarPath);
  } else {
    console.log('Step 1: Python standalone archive already downloaded.');
  }

  // Step 2: Extract
  console.log('\nStep 2: Extracting Python...');
  if (existsSync(bundledDir)) {
    rmSync(bundledDir, { recursive: true, force: true });
  }
  mkdirSync(bundledDir, { recursive: true });

  // Extract using tar (available on Windows 10+, macOS, and Linux)
  execSync(`tar -xzf "${tarPath}" -C "${bundledDir}"`, { stdio: 'inherit' });

  // The archive extracts to a 'python/' subfolder inside bundledDir
  const extractedPython = join(bundledDir, 'python');
  const pythonExe = getPythonBinary(extractedPython);

  if (!existsSync(pythonExe)) {
    console.error(`ERROR: Python executable not found after extraction.`);
    console.error('Expected at:', pythonExe);
    process.exit(1);
  }
  console.log(`  Python extracted: ${pythonExe}`);

  // On macOS/Linux, ensure the binary is executable
  if (targetPlatform !== 'win32') {
    execSync(`chmod +x "${pythonExe}"`, { stdio: 'inherit' });
  }

  // Step 3: Create venv with bundled Python
  console.log('\nStep 3: Creating virtual environment...');
  const venvDir = join(pythonDir, 'venv');
  if (existsSync(venvDir)) {
    rmSync(venvDir, { recursive: true, force: true });
  }
  execSync(`"${pythonExe}" -m venv "${venvDir}"`, { stdio: 'inherit' });

  // Step 4: Install dependencies
  const pipExe = getPipBinary(venvDir);
  console.log('\nStep 4: Installing dependencies (this may take 10-20 minutes)...');
  execSync(`"${pipExe}" install --upgrade pip`, { stdio: 'inherit' });
  execSync(`"${pipExe}" install -r "${requirementsPath}"`, {
    stdio: 'inherit',
    env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' },
  });

  // Step 5: Download HuggingFace NLP models into the bundle
  // These 4 models are required for the analysis pipeline (~2.5 GB total)
  const bundledModelsDir = join(pythonDir, 'bundled-models');
  const venvPythonExe = targetPlatform === 'win32'
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python3');

  console.log('\nStep 5: Downloading HuggingFace NLP models (~2.5 GB)...');
  if (existsSync(bundledModelsDir)) {
    rmSync(bundledModelsDir, { recursive: true, force: true });
  }
  mkdirSync(bundledModelsDir, { recursive: true });

  const modelsToDownload = [
    'nlptown/bert-base-multilingual-uncased-sentiment',
    'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
    'victorwkey/tourism-subjectivity-bert',
    'victorwkey/tourism-categories-bert',
  ];

  // Download each model using transformers/sentence-transformers snapshot_download
  const downloadScript = `
import os, sys
os.environ['HF_HOME'] = sys.argv[1]
os.environ['TRANSFORMERS_CACHE'] = sys.argv[1]

from huggingface_hub import snapshot_download

models = ${JSON.stringify(modelsToDownload)}
for model_id in models:
    print(f'  Downloading {model_id}...')
    try:
        snapshot_download(repo_id=model_id, cache_dir=sys.argv[1])
        print(f'  ✓ {model_id} downloaded')
    except Exception as e:
        print(f'  ✗ Failed to download {model_id}: {e}')
        sys.exit(1)

print('All models downloaded successfully.')
`;

  const downloadScriptPath = join(projectRoot, '_download_models_temp.py');
  writeFileSync(downloadScriptPath, downloadScript);

  try {
    execSync(`"${venvPythonExe}" "${downloadScriptPath}" "${bundledModelsDir}"`, {
      stdio: 'inherit',
      env: { ...process.env, HF_HOME: bundledModelsDir, TRANSFORMERS_CACHE: bundledModelsDir },
    });
  } finally {
    rmSync(downloadScriptPath, { force: true });
  }

  // Step 6: Create completion marker
  const markerPath = join(venvDir, '.setup_complete');
  writeFileSync(markerPath, JSON.stringify({
    completedAt: new Date().toISOString(),
    pythonVersion: PYTHON_VERSION,
    platform: targetPlatform,
    arch: targetArch,
    bundled: true,
  }));

  // Step 7: Clean up download
  rmSync(tarPath, { force: true });

  console.log('\n=== Bundle complete! ===');
  console.log(`  Platform:       ${targetPlatform}/${targetArch}`);
  console.log(`  Bundled Python: ${extractedPython}`);
  console.log(`  Virtual env:    ${venvDir}`);
  console.log(`  Bundled models: ${bundledModelsDir}`);
  console.log(`\nThe venv and models are ready and will be included in the packaged app.`);
  console.log('Users will NOT need to download Python or NLP models on first run.');
}

main().catch((err) => {
  console.error('Bundle failed:', err);
  process.exit(1);
});

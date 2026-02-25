/**
 * Download HuggingFace NLP Models for Bundling
 * ==============================================
 * 
 * Downloads the 4 required NLP models into python/bundled-models/
 * so they are included in the production build (via extraResource).
 * 
 * This is also called automatically as Step 5 of bundle-python.mjs,
 * but you can run this script standalone if you only need the models.
 * 
 * USAGE:
 *   node scripts/download-models.mjs
 * 
 * PREREQUISITES:
 *   - A Python environment with huggingface_hub installed.
 *     The script tries (in order):
 *       1. python/bundled-env/ venv (from bundle-python.mjs)
 *       2. .venv/ (dev virtual environment)
 *       3. python/venv/ (app-created venv)
 *       4. System python3 / python
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { platform } from 'os';

const projectRoot = resolve(import.meta.dirname, '..');
const pythonDir = join(projectRoot, 'python');
const bundledModelsDir = join(pythonDir, 'bundled-models');
const isWin = platform() === 'win32';

// Models required by the NLP pipeline (~2.5 GB total)
const MODELS = [
  'nlptown/bert-base-multilingual-uncased-sentiment',
  'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
  'victorwkey/tourism-subjectivity-bert',
  'victorwkey/tourism-categories-bert',
];

/**
 * Find a usable Python executable that has huggingface_hub installed.
 */
function findPython() {
  const candidates = isWin
    ? [
        join(pythonDir, 'bundled-env', 'Scripts', 'python.exe'),
        join(projectRoot, '.venv', 'Scripts', 'python.exe'),
        join(pythonDir, 'venv', 'Scripts', 'python.exe'),
        'python',
      ]
    : [
        join(pythonDir, 'bundled-env', 'bin', 'python3'),
        join(projectRoot, '.venv', 'bin', 'python3'),
        join(pythonDir, 'venv', 'bin', 'python3'),
        'python3',
        'python',
      ];

  for (const candidate of candidates) {
    try {
      // Check it exists and has huggingface_hub
      execSync(`"${candidate}" -c "import huggingface_hub"`, { stdio: 'pipe' });
      return candidate;
    } catch {
      // Try next candidate
    }
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────

console.log('╔══════════════════════════════════════════════════╗');
console.log('║  Download HuggingFace NLP Models for Bundling   ║');
console.log('╚══════════════════════════════════════════════════╝\n');

const pythonExe = findPython();
if (!pythonExe) {
  console.error('✗ No Python with huggingface_hub found.');
  console.error('  Install it first:  pip install huggingface_hub');
  process.exit(1);
}
console.log(`Using Python: ${pythonExe}\n`);

// Clean and create output directory
if (existsSync(bundledModelsDir)) {
  console.log('Removing existing bundled-models/...');
  rmSync(bundledModelsDir, { recursive: true, force: true });
}
mkdirSync(bundledModelsDir, { recursive: true });

// Write temporary download script
const downloadScript = `
import os, sys
os.environ['HF_HOME'] = sys.argv[1]
os.environ['TRANSFORMERS_CACHE'] = sys.argv[1]

from huggingface_hub import snapshot_download

# Patterns for formats we do NOT need \u2014 keeps only safetensors
IGNORE = [
    "*.h5",            # TensorFlow
    "*.msgpack",       # Flax / JAX
    "*.onnx",          # ONNX (all variants)
    "*.ot",            # OpenAI Triton
    "*.bin",           # pytorch_model.bin (safetensors is preferred)
    "openvino_*",      # OpenVINO
    "*openvino*",      # OpenVINO alt naming
    "onnx/*",          # ONNX subfolder
    "flax_model*",     # Flax naming
    "tf_model*",       # TF naming
    "rust_model*",     # Rust/Candle
    "coreml/*",        # CoreML
]

models = ${JSON.stringify(MODELS)}
for i, model_id in enumerate(models, 1):
    print(f'  [{i}/${MODELS.length}] Downloading {model_id}...')
    try:
        snapshot_download(repo_id=model_id, cache_dir=sys.argv[1], ignore_patterns=IGNORE)
        print(f'  \u2713 {model_id}')
    except Exception as e:
        print(f'  \u2717 Failed: {model_id}: {e}')
        sys.exit(1)

print('\\nAll models downloaded successfully.')
`;

const tempScript = join(projectRoot, '_download_models_temp.py');
writeFileSync(tempScript, downloadScript);

try {
  console.log(`Downloading ${MODELS.length} models (~2.5 GB)...\n`);
  execSync(`"${pythonExe}" "${tempScript}" "${bundledModelsDir}"`, {
    stdio: 'inherit',
    env: { ...process.env, HF_HOME: bundledModelsDir, TRANSFORMERS_CACHE: bundledModelsDir },
  });
  console.log(`\n✓ Models saved to: python/bundled-models/`);
  console.log('  They will be included in the next build (npm run make).');
} catch (err) {
  console.error('\n✗ Model download failed:', err.message);
  process.exit(1);
} finally {
  rmSync(tempScript, { force: true });
}

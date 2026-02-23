/**
 * Shared types, constants, and helpers for the SetupWizard
 */

// ── Types ────────────────────────────────────────────────────────────

export type SetupStep =
  | 'welcome'
  | 'python-setup'
  | 'hardware-select'
  | 'llm-choice'
  | 'model-select'
  | 'llm-setup'
  | 'models'
  | 'output-dir'
  | 'complete';

export interface SetupWizardProps {
  onComplete: () => void;
}

export interface HardwareConfig {
  cpu: 'low' | 'mid' | 'high';
  ram: number; // in GB
  gpu: 'none' | 'integrated' | 'dedicated';
  vram?: number; // in GB, only if dedicated GPU
}

export interface OllamaModelOption {
  id: string;
  name: string;
  size: string;
  minRam: number;
  minVram?: number;
  recommended: boolean;
  performance: 'fast' | 'balanced' | 'powerful';
}

export interface OpenAIModelOption {
  id: string;
  name: string;
  costTier: 'low' | 'medium' | 'high';
  recommended: boolean;
}

// ── Constants ────────────────────────────────────────────────────────

/** Step order for navigation */
export const STEP_ORDER: SetupStep[] = [
  'welcome',
  'python-setup',
  'llm-choice',
  'llm-setup',
  'output-dir',
  'complete',
];

export const OLLAMA_MODELS: OllamaModelOption[] = [
  {
    id: 'llama3.1:8b',
    name: 'Llama 3.1 8B',
    size: '~4.9 GB',
    minRam: 16,
    minVram: 8,
    recommended: true,
    performance: 'balanced',
  },
  {
    id: 'deepseek-r1:14b',
    name: 'DeepSeek R1 14B',
    size: '~9.0 GB',
    minRam: 32,
    minVram: 12,
    recommended: false,
    performance: 'powerful',
  },
  {
    id: 'deepseek-r1:8b',
    name: 'DeepSeek R1 8B',
    size: '~9.0 GB',
    minRam: 24,
    minVram: 10,
    recommended: false,
    performance: 'powerful',
  },
  {
    id: 'mistral:7b',
    name: 'Mistral 7B',
    size: '~4.4 GB',
    minRam: 12,
    minVram: 6,
    recommended: false,
    performance: 'fast',
  },
];

export const OPENAI_MODELS: OpenAIModelOption[] = [
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    costTier: 'low',
    recommended: false,
  },
  {
    id: 'gpt-5-nano',
    name: 'GPT-5 Nano',
    costTier: 'low',
    recommended: true,
  },
  {
    id: 'gpt-5',
    name: 'GPT-5',
    costTier: 'high',
    recommended: false,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

/** Sanitize a model ID into a valid i18n key (e.g. 'llama3.1:8b' → 'llama3_1_8b') */
export const modelKey = (id: string) => id.replace(/[.:_-]/g, '_');

/**
 * Pick the most capable Ollama model the hardware can run.
 * Priority: largest model whose VRAM (with GPU) or RAM (CPU-only) requirement is met.
 */
export function getRecommendedOllamaModel(hw: HardwareConfig): string {
  const vram = hw.vram ?? 0;
  const ram = hw.ram ?? 8;
  const hasGPU = hw.gpu === 'dedicated';

  if (hasGPU) {
    // VRAM is the binding constraint for GPU inference
    if (vram >= 12) return 'deepseek-r1:14b';
    if (vram >= 10) return 'deepseek-r1:8b';
    if (vram >= 8)  return 'llama3.1:8b';
    if (vram >= 6)  return 'mistral:7b';
  }

  // CPU / integrated GPU — system RAM is the binding constraint
  if (ram >= 32) return 'deepseek-r1:14b';
  if (ram >= 24) return 'deepseek-r1:8b';
  if (ram >= 16) return 'llama3.1:8b';
  return 'mistral:7b';
}

export function getStepIndex(step: SetupStep): number {
  return STEP_ORDER.indexOf(step);
}

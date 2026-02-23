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
  'hardware-select',
  'llm-choice',
  'model-select',
  'llm-setup',
  'models',
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
    recommended: true,
  },
  {
    id: 'gpt-5-nano',
    name: 'GPT-5 Nano',
    costTier: 'low',
    recommended: false,
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

export function getStepIndex(step: SetupStep): number {
  return STEP_ORDER.indexOf(step);
}

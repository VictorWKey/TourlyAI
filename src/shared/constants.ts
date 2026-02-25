// ============================================
// TourlyAI - Constants
// ============================================

export const PIPELINE_PHASES = [
  {
    id: 1,
    name: 'Basic Processing',
    description: 'Clean and preprocess the dataset',
    requiresLLM: false,
  },
  {
    id: 2,
    name: 'Basic Statistics',
    description: 'Generate basic dataset statistics and insights',
    requiresLLM: false,
  },
  {
    id: 3,
    name: 'Sentiment Analysis',
    description: 'Analyze sentiment using HuggingFace BERT',
    requiresLLM: false,
  },
  {
    id: 4,
    name: 'Subjectivity Analysis',
    description: 'Classify subjective vs objective content',
    requiresLLM: false,
  },
  {
    id: 5,
    name: 'Category Classification',
    description: 'Multi-label category classification',
    requiresLLM: false,
  },
  {
    id: 6,
    name: 'Hierarchical Topic Analysis',
    description: 'Topic modeling with BERTopic + LLM',
    requiresLLM: true,
  },
  {
    id: 7,
    name: 'Intelligent Summarization',
    description: 'Generate structured summaries with LangChain + LLM',
    requiresLLM: true,
  },
  {
    id: 8,
    name: 'Strategic Insights',
    description: 'Generate data-driven strategic analysis with LLM',
    requiresLLM: true,
  },
  {
    id: 9,
    name: 'Visualizations & Insights',
    description: 'Create charts and export analytical metrics',
    requiresLLM: false,
    partialWithoutLLM: true,
  },
] as const;

export const DEFAULT_LLM_CONFIG = {
  mode: 'local' as const,
  localModel: '',
  apiProvider: 'openai' as const,
  apiKey: '',
  apiModel: 'gpt-4o-mini',
  temperature: 0.7,
};

export const DEFAULT_APP_SETTINGS = {
  theme: 'system' as const,
  language: 'en',
  outputDir: '',
};

export const SUPPORTED_FILE_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

export const APP_NAME = 'TourlyAI';
// Version is read from package.json at build time via Vite define
// Fallback to 1.0.0 if not available
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

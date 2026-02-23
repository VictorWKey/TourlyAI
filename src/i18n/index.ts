/**
 * i18n Configuration
 * ==================
 * Internationalization setup using i18next + react-i18next.
 * Supports Spanish (es) and English (en).
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Spanish translations
import esCommon from './locales/es/common.json';
import esHome from './locales/es/home.json';
import esPipeline from './locales/es/pipeline.json';
import esData from './locales/es/data.json';
import esVisualizations from './locales/es/visualizations.json';
import esResumenes from './locales/es/resumenes.json';
import esInsights from './locales/es/insights.json';
import esMetrics from './locales/es/metrics.json';
import esSettings from './locales/es/settings.json';
import esSetup from './locales/es/setup.json';
import esComponents from './locales/es/components.json';
import esResults from './locales/es/results.json';
import esReviews from './locales/es/reviews.json';
import esReports from './locales/es/reports.json';
import esHelp from './locales/es/help.json';

// English translations
import enCommon from './locales/en/common.json';
import enHome from './locales/en/home.json';
import enPipeline from './locales/en/pipeline.json';
import enData from './locales/en/data.json';
import enVisualizations from './locales/en/visualizations.json';
import enResumenes from './locales/en/resumenes.json';
import enInsights from './locales/en/insights.json';
import enMetrics from './locales/en/metrics.json';
import enSettings from './locales/en/settings.json';
import enSetup from './locales/en/setup.json';
import enComponents from './locales/en/components.json';
import enResults from './locales/en/results.json';
import enReviews from './locales/en/reviews.json';
import enReports from './locales/en/reports.json';
import enHelp from './locales/en/help.json';

export const defaultNS = 'common';
export const supportedLanguages = ['es', 'en'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

i18n.use(initReactI18next).init({
  resources: {
    es: {
      common: esCommon,
      home: esHome,
      pipeline: esPipeline,
      data: esData,
      visualizations: esVisualizations,
      resumenes: esResumenes,
      insights: esInsights,
      metrics: esMetrics,
      settings: esSettings,
      setup: esSetup,
      components: esComponents,
      results: esResults,
      reviews: esReviews,
      reports: esReports,
      help: esHelp,
    },
    en: {
      common: enCommon,
      home: enHome,
      pipeline: enPipeline,
      data: enData,
      visualizations: enVisualizations,
      resumenes: enResumenes,
      insights: enInsights,
      metrics: enMetrics,
      settings: enSettings,
      setup: enSetup,
      components: enComponents,
      results: enResults,
      reviews: enReviews,
      reports: enReports,
      help: enHelp,
    },
  },
  lng: 'es', // default language, will be overridden by stored setting
  fallbackLng: 'es',
  defaultNS,
  ns: [
    'common',
    'home',
    'pipeline',
    'data',
    'visualizations',
    'resumenes',
    'insights',
    'metrics',
    'settings',
    'setup',
    'components',
    'results',
    'reviews',
    'reports',
    'help',
  ],
  interpolation: {
    escapeValue: false, // React already escapes
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;

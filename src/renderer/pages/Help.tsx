/**
 * Help Page
 * ==========
 * FAQ-style help center for non-technical tourism professionals.
 * Features:
 * - Category-based filtering
 * - Expandable accordion questions
 * - Real-time search
 * - Markdown-like bold rendering in answers
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HelpCircle,
  Search,
  ChevronDown,
  ChevronRight,
  Rocket,
  Database,
  PlayCircle,
  Cpu,
  FileBarChart,
  Wrench,
} from 'lucide-react';
import { PageLayout } from '../components/layout';
import { cn } from '../lib/utils';

// Category definitions with icon mapping
type CategoryId = 'all' | 'getting-started' | 'data' | 'analysis' | 'ai' | 'results' | 'troubleshooting';

interface CategoryDef {
  id: CategoryId;
  icon: React.ComponentType<{ className?: string }>;
}

const categories: CategoryDef[] = [
  { id: 'getting-started', icon: Rocket },
  { id: 'data', icon: Database },
  { id: 'analysis', icon: PlayCircle },
  { id: 'ai', icon: Cpu },
  { id: 'results', icon: FileBarChart },
  { id: 'troubleshooting', icon: Wrench },
];

// Map each FAQ key to its category
const faqCategoryMap: Record<string, CategoryId> = {
  'what-is-tourlyai': 'getting-started',
  'who-is-it-for': 'getting-started',
  'what-is-csv': 'data',
  'what-data-needed': 'data',
  'how-many-reviews': 'data',
  'data-privacy': 'data',
  'what-are-phases': 'analysis',
  'how-long-analysis': 'analysis',
  'what-is-ollama': 'ai',
  'local-vs-cloud': 'ai',
  'what-is-api-key': 'ai',
  'what-is-sentiment': 'analysis',
  'what-are-categories': 'analysis',
  'what-are-topics': 'analysis',
  'what-are-insights': 'results',
  'how-to-read-charts': 'results',
  'how-to-export': 'results',
  'analysis-failed': 'troubleshooting',
  'ollama-not-running': 'troubleshooting',
  'change-language': 'troubleshooting',
  'reset-app': 'troubleshooting',
  'supported-languages-reviews': 'data',
  'computer-requirements': 'getting-started',
};

// All FAQ keys in display order
const faqKeys = Object.keys(faqCategoryMap);

/**
 * Render text with **bold** markdown support and newlines
 */
function RichText({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <>
      {lines.map((line, lineIdx) => (
        <React.Fragment key={lineIdx}>
          {lineIdx > 0 && <br />}
          {line.split(/(\*\*[^*]+\*\*)/).map((segment, segIdx) => {
            if (segment.startsWith('**') && segment.endsWith('**')) {
              return (
                <strong key={segIdx} className="font-semibold text-slate-900 dark:text-white">
                  {segment.slice(2, -2)}
                </strong>
              );
            }
            return <React.Fragment key={segIdx}>{segment}</React.Fragment>;
          })}
        </React.Fragment>
      ))}
    </>
  );
}

/**
 * Single FAQ accordion item
 */
function FAQItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden transition-colors">
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 px-5 py-4 text-left transition-colors',
          'hover:bg-slate-50 dark:hover:bg-slate-800/50',
          isOpen && 'bg-blue-50/50 dark:bg-blue-900/10'
        )}
        aria-expanded={isOpen}
      >
        <div className={cn(
          'shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors',
          isOpen
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
        )}>
          {isOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
        <span className={cn(
          'font-medium text-sm',
          isOpen
            ? 'text-blue-900 dark:text-blue-100'
            : 'text-slate-700 dark:text-slate-200'
        )}>
          {question}
        </span>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 pt-1 pl-14">
          <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            <RichText text={answer} />
          </div>
        </div>
      )}
    </div>
  );
}

export function Help() {
  const { t } = useTranslation('help');
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  // Toggle a single FAQ item
  const toggleItem = (key: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Filter FAQ items by category and search
  const filteredFaqs = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return faqKeys.filter((key) => {
      // Category filter
      if (activeCategory !== 'all' && faqCategoryMap[key] !== activeCategory) {
        return false;
      }

      // Search filter
      if (query) {
        const question = t(`faq.${key}.question`).toLowerCase();
        const answer = t(`faq.${key}.answer`).toLowerCase();
        return question.includes(query) || answer.includes(query);
      }

      return true;
    });
  }, [activeCategory, searchQuery, t]);

  return (
    <PageLayout
      title={t('title')}
      description={t('description')}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className={cn(
              'w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700',
              'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
              'placeholder-slate-400 dark:placeholder-slate-500',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              'text-sm transition-colors'
            )}
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors',
              activeCategory === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            )}
          >
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
            {t('categories.getting-started').split(' ')[0] === t('categories.getting-started') ? 'All' : ''}
            {/* "All" / "Todas" — use a simple label since it's not a named category */}
            {activeCategory === 'all' ? '' : ''} 
            {(() => {
              // We don't have a translation key for "all", use the common one
              try { return t('common:visualizationCategories.all'); } catch { return 'All'; }
            })()}
          </button>
          {categories.map(({ id, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveCategory(id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors',
                activeCategory === id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
              )}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {t(`categories.${id}`)}
            </button>
          ))}
        </div>

        {/* FAQ List */}
        <div className="space-y-3">
          {filteredFaqs.length === 0 ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" aria-hidden="true" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {t('noResults')}
              </p>
            </div>
          ) : (
            filteredFaqs.map((key) => (
              <FAQItem
                key={key}
                question={t(`faq.${key}.question`)}
                answer={t(`faq.${key}.answer`)}
                isOpen={openItems.has(key)}
                onToggle={() => toggleItem(key)}
              />
            ))
          )}
        </div>
      </div>
    </PageLayout>
  );
}

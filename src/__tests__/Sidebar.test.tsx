import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../renderer/components/layout/Sidebar';
import { useSettingsStore } from '../renderer/stores/settingsStore';

// Mock i18n — return the key as display text
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock useOllamaStatus hook
const mockOllamaStatus = { isRunning: false, isLoading: false };
vi.mock('../renderer/hooks/useOllama', () => ({
  useOllamaStatus: () => mockOllamaStatus,
}));

// Mock ThemeToggle to a simple element
vi.mock('../renderer/components/settings/ThemeSelector', () => ({
  ThemeToggle: ({ className }: { className?: string }) => (
    <button className={className} data-testid="theme-toggle">Toggle</button>
  ),
}));

// Mock logo import
vi.mock('../renderer/assets/logos/logo-white.png', () => ({
  default: 'logo-white.png',
}));

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Sidebar />
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.getState().reset();
    mockOllamaStatus.isRunning = false;
    mockOllamaStatus.isLoading = false;
  });

  it('renders app name and subtitle', () => {
    renderSidebar();
    expect(screen.getByText('common:app.name')).toBeInTheDocument();
    expect(screen.getByText('common:app.subtitle')).toBeInTheDocument();
  });

  it('renders all navigation links', () => {
    renderSidebar();
    // 11 nav items
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(11);
  });

  it('renders nav links with correct paths', () => {
    renderSidebar();
    const links = screen.getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/data');
    expect(hrefs).toContain('/pipeline');
    expect(hrefs).toContain('/settings');
  });

  it('renders theme toggle', () => {
    renderSidebar();
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
  });

  it('renders version number', () => {
    renderSidebar();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  it('shows ollama status section when LLM mode is local', () => {
    useSettingsStore.getState().setLLMConfig({ mode: 'local' });
    renderSidebar();
    expect(screen.getByText('components:sidebar.ollamaStatus')).toBeInTheDocument();
  });

  it('shows checking status when Ollama is loading', () => {
    useSettingsStore.getState().setLLMConfig({ mode: 'local' });
    mockOllamaStatus.isLoading = true;
    renderSidebar();
    expect(screen.getByText('components:sidebar.checking')).toBeInTheDocument();
  });

  it('shows offline status when Ollama is not running', () => {
    useSettingsStore.getState().setLLMConfig({ mode: 'local' });
    mockOllamaStatus.isRunning = false;
    mockOllamaStatus.isLoading = false;
    renderSidebar();
    expect(screen.getByText('components:sidebar.ollamaOffline')).toBeInTheDocument();
  });

  it('shows API status section when LLM mode is api', () => {
    useSettingsStore.getState().setLLMConfig({ mode: 'api', apiKey: 'sk-test' });
    renderSidebar();
    expect(screen.getByText('components:sidebar.apiStatus')).toBeInTheDocument();
    expect(screen.getByText('components:sidebar.apiKeyConfigured')).toBeInTheDocument();
  });

  it('shows API key not configured when no key', () => {
    useSettingsStore.getState().setLLMConfig({ mode: 'api', apiKey: '' });
    renderSidebar();
    expect(screen.getByText('components:sidebar.apiKeyNotConfigured')).toBeInTheDocument();
  });

  it('shows no-LLM warning when mode is none', () => {
    useSettingsStore.getState().setLLMConfig({ mode: 'none' });
    renderSidebar();
    expect(screen.getAllByText('components:sidebar.noLlm').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('components:sidebar.limitedFunc')).toBeInTheDocument();
  });

  it('has accessible navigation landmark', () => {
    renderSidebar();
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAttribute('aria-label', 'common:app.name');
  });
});

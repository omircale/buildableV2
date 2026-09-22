import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { supabase, useAuth } from './cloud/supabase';
import { DEFAULT_CONFIG, type EngineeringConfig } from './engine';
import { useT } from './i18n';
// The editor (three.js) and the admin screen load only when they are opened.
const DesignerPage = lazy(() => import('./pages/Designer').then((m) => ({ default: m.DesignerPage })));
const AdminPage = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminPage })));
import { stepFromRoute, type Step } from './pages/steps';
import { HomePage } from './pages/Home';
import { LoginPage } from './pages/Login';
import { ProjectsPage } from './pages/Projects';
import { DecorsPage } from './pages/Decors';
import { useDesign } from './state/designStore';
import { useResolvedTheme, useUi } from './state/uiStore';
import { CommandPalette, useRegisterCommands, type Command } from './ui/CommandPalette';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { FURNITURE_TYPES, presetFor } from './ui/furnitureCatalog';

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

function useDocumentPreferences() {
  const t = useT();
  const locale = useUi((s) => s.locale);
  const theme = useResolvedTheme();
  const setSystemDark = useUi((s) => s.setSystemDark);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [setSystemDark]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = t.dir;
  }, [locale, t.dir]);
}

function useGlobalCommands() {
  const t = useT();
  const locale = useUi((s) => s.locale);
  const setTheme = useUi((s) => s.setTheme);
  const setLocale = useUi((s) => s.setLocale);
  const startNew = useDesign((s) => s.startNew);
  const commands = useMemo<Command[]>(
    () => [
      { id: 'home', group: 'steps', label: t.command.actions.home, keywords: 'home בית', run: () => (window.location.hash = '#/') },
      {
        id: 'new-design',
        group: 'actions',
        label: t.command.actions.newDesign,
        keywords: 'new חדש',
        run: () => {
          startNew();
          window.location.hash = '#/design/setup';
        },
      },
      { id: 'theme-light', group: 'actions', label: t.command.actions.themeLight, keywords: 'day light theme יום בהיר', run: () => setTheme('light') },
      { id: 'theme-dark', group: 'actions', label: t.command.actions.themeDark, keywords: 'night dark theme לילה כהה', run: () => setTheme('dark') },
      { id: 'theme-system', group: 'actions', label: t.command.actions.themeSystem, keywords: 'system theme מערכת', run: () => setTheme('system') },
      { id: 'lang', group: 'actions', label: t.command.actions.language, keywords: 'language שפה english עברית', run: () => setLocale(locale === 'he' ? 'en' : 'he') },
      ...FURNITURE_TYPES.map((f) => ({
        id: `furniture-${f.kind}`,
        group: 'furniture' as const,
        label: t.furniture[f.kind].name,
        detail: f.available ? t.furniture[f.kind].blurb : t.common.soon,
        keywords: t.furniture[f.kind].blurb,
        disabled: !f.available,
        run: () => {
          // Opening a furniture type from search starts a new project of that type (the current one stays in My projects).
          const preset = presetFor(f, { w: null, h: null, d: null });
          if (!preset) return;
          startNew(preset, t.furniture[f.kind].name);
          window.location.hash = '#/design/setup';
        },
      })),
      { id: 'decors-page', group: 'materials', label: t.decors.openCatalog, keywords: 'decor finishes catalog גוונים קטלוג פורמייקה', run: () => (window.location.hash = '#/decors') },
      { id: 'projects-page', group: 'steps', label: t.header.projects, keywords: 'projects פרויקטים', run: () => (window.location.hash = '#/projects') },
    ],
    [t, locale, setTheme, setLocale, startNew],
  );
  useRegisterCommands('global', commands);
}

export default function App() {
  const t = useT();
  const locale = useUi((s) => s.locale);
  const route = useHashRoute();
  const auth = useAuth();
  const setConfig = useDesign((s) => s.setConfig);
  useDocumentPreferences();
  useGlobalCommands();

  useEffect(() => {
    if (!supabase || !auth.role) return;
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'engineering_config')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) setConfig({ ...DEFAULT_CONFIG, ...(data.value as Partial<EngineeringConfig>) });
      });
  }, [auth.role, setConfig]);

  let page;
  if (route.startsWith('#/admin')) page = <AdminPage auth={auth} />;
  else if (route.startsWith('#/login')) page = <LoginPage auth={auth} />;
  else if (route.startsWith('#/projects')) page = <ProjectsPage auth={auth} />;
  else if (route.startsWith('#/decors')) page = <DecorsPage auth={auth} />;
  else if (route.startsWith('#/design')) {
    const step = route.split('/')[2] as Step;
    page = <DesignerPage auth={auth} step={stepFromRoute(step)} />;
  } else page = <HomePage auth={auth} />;

  return (
    <>
      <ErrorBoundary locale={locale} key={route.split('/')[1]}>
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-paper text-muted">{t.common.loading}</div>}>{page}</Suspense>
      </ErrorBoundary>
      <CommandPalette />
    </>
  );
}

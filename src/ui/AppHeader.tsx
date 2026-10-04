import type { ReactNode } from 'react';
import type { AuthState } from '../cloud/supabase';
import { useT } from '../i18n';
import { useResolvedTheme, useUi } from '../state/uiStore';
import { Kbd } from './common';
import { IconLogo, IconMoon, IconSearch, IconSun, IconUser } from './icons';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function ThemeToggle() {
  const t = useT();
  const resolved = useResolvedTheme();
  const setTheme = useUi((s) => s.setTheme);
  const next = resolved === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? t.header.theme.dark : t.header.theme.light;
  return (
    <button type="button" onClick={() => setTheme(next)} title={label} aria-label={label} className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-sunken">
      {resolved === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
    </button>
  );
}

export function SearchButton({ compact }: { compact?: boolean }) {
  const t = useT();
  const setCommandOpen = useUi((s) => s.setCommandOpen);
  return (
    <button
      type="button"
      onClick={() => setCommandOpen(true)}
      aria-label={t.header.search}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg text-[15px] text-muted ring-1 ring-line hover:bg-sunken ${compact ? 'w-10 justify-center' : 'w-10 justify-center md:w-64 md:justify-start md:px-3'}`}
    >
      <IconSearch size={18} />
      {!compact && (
        <>
          <span className="hidden flex-1 truncate text-start md:inline">{t.header.search}</span>
          <span className="hidden md:inline-flex">
            <Kbd>{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
          </span>
        </>
      )}
    </button>
  );
}

export function AppHeader({ auth, start, center, end }: { auth: AuthState; start?: ReactNode; center?: ReactNode; end?: ReactNode }) {
  const t = useT();
  const locale = useUi((s) => s.locale);
  const setLocale = useUi((s) => s.setLocale);
  return (
    <header className="no-print flex h-16 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 sm:gap-3 sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <a href="#/" className="flex items-center gap-2 rounded-lg text-accent" aria-label={t.header.home} title={t.header.home}>
          <IconLogo size={26} />
          {!start && <span className="text-xl font-bold tracking-tight text-ink">Buildable</span>}
        </a>
        {start}
      </div>
      {center && <div className="flex shrink-0 items-center">{center}</div>}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        {end}
        {/* In the editor the header also carries the stepper, so the link only shows where there is room. */}
        <a href="#/projects" className={`${center ? 'hidden 2xl:inline-flex' : 'hidden sm:inline-flex'} h-10 items-center rounded-lg px-3 text-[15px] whitespace-nowrap hover:bg-sunken`}>
          {t.header.projects}
        </a>
        <SearchButton compact={Boolean(center)} />
        <button type="button" onClick={() => setLocale(locale === 'he' ? 'en' : 'he')} aria-label={t.header.switchLanguageLabel} title={t.header.switchLanguageLabel} className="inline-flex h-10 items-center rounded-lg px-3 text-[15px] hover:bg-sunken">
          {t.header.switchLanguage}
        </button>
        <ThemeToggle />
        {auth.role === 'admin' && (
          <a href="#/admin" className="inline-flex h-10 items-center rounded-lg px-3 text-[15px] hover:bg-sunken">
            {t.header.admin}
          </a>
        )}
        <a href="#/login" title={auth.session?.user.email ?? t.header.signIn} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[15px] whitespace-nowrap ring-1 ring-line hover:bg-sunken">
          <IconUser size={18} />
          {!auth.session && <span className="hidden sm:inline">{t.header.signIn}</span>}
        </a>
      </div>
    </header>
  );
}

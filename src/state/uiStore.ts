import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';
export type Locale = 'he' | 'en';
export type AdvancedTab = 'checks' | 'order' | 'cut' | 'sheets' | 'bom' | 'assembly' | 'impact';

const STORAGE_KEY = 'buildable.ui.v1';

export type ViewStyle = 'realistic' | 'illustration';

interface Persisted {
  theme: ThemePreference;
  locale: Locale;
  advancedOpen: boolean;
  /** Open/closed state of collapsible sections, keyed by section id. */
  sections: Record<string, boolean>;
  viewStyle: ViewStyle;
}

interface UiState extends Persisted {
  systemDark: boolean;
  advancedTab: AdvancedTab;
  focusCheckId: string | null;
  commandOpen: boolean;
  setTheme: (t: ThemePreference) => void;
  setLocale: (l: Locale) => void;
  setSystemDark: (d: boolean) => void;
  setAdvancedOpen: (open: boolean) => void;
  openAdvanced: (tab: AdvancedTab, focusCheckId?: string) => void;
  setAdvancedTab: (tab: AdvancedTab) => void;
  setCommandOpen: (open: boolean) => void;
  setSectionOpen: (id: string, open: boolean) => void;
  setViewStyle: (v: ViewStyle) => void;
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>;
      return {
        theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'system',
        locale: p.locale === 'en' ? 'en' : 'he',
        advancedOpen: Boolean(p.advancedOpen),
        sections: p.sections && typeof p.sections === 'object' ? p.sections : {},
        viewStyle: p.viewStyle === 'illustration' ? 'illustration' : 'realistic',
      };
    }
  } catch {
    // Blocked storage falls back to defaults.
  }
  return { theme: 'system', locale: 'he', advancedOpen: false, sections: {}, viewStyle: 'realistic' };
}

function save(s: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: s.theme, locale: s.locale, advancedOpen: s.advancedOpen, sections: s.sections, viewStyle: s.viewStyle }));
  } catch {
    // Preferences stay in memory only.
  }
}

const prefersDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const useUi = create<UiState>((set, get) => ({
  ...load(),
  systemDark: prefersDark(),
  advancedTab: 'checks',
  focusCheckId: null,
  commandOpen: false,
  setTheme: (theme) => {
    set({ theme });
    save(get());
  },
  setLocale: (locale) => {
    set({ locale });
    save(get());
  },
  setSystemDark: (systemDark) => set({ systemDark }),
  setAdvancedOpen: (advancedOpen) => {
    set({ advancedOpen });
    save(get());
  },
  openAdvanced: (advancedTab, focusCheckId) => {
    set({ advancedOpen: true, advancedTab, focusCheckId: focusCheckId ?? null });
    save(get());
  },
  setAdvancedTab: (advancedTab) => set({ advancedTab, focusCheckId: null }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setSectionOpen: (id, open) => {
    set((s) => ({ sections: { ...s.sections, [id]: open } }));
    save(get());
  },
  setViewStyle: (viewStyle) => {
    set({ viewStyle });
    save(get());
  },
}));

export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useUi((s) => s.theme);
  const systemDark = useUi((s) => s.systemDark);
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

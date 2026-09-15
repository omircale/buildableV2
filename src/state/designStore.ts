import { create } from 'zustand';
import { DEFAULT_CONFIG, DEFAULT_OPEN_SHELF, type ComponentRole, type DesignChange, type EngineeringConfig, type OpenShelfParams } from '../engine';

export type ViewMode = 'design' | 'structural' | 'exploded' | 'measure' | 'warnings';
export type UserMode = 'beginner' | 'advanced';

const STORAGE_KEY = 'buildable.design.v1';
const HISTORY_LIMIT = 100;
const COALESCE_MS = 600;

interface Persisted {
  params: OpenShelfParams;
  projectName: string;
  cloudProjectId: string | null;
}

interface DesignState extends Persisted {
  past: OpenShelfParams[];
  future: OpenShelfParams[];
  lastEdit: { key: string; at: number } | null;
  /** Params as they were before the most recent edit — drives the change-impact panel. */
  previous: OpenShelfParams | null;
  config: EngineeringConfig;
  viewMode: ViewMode;
  userMode: UserMode;
  selectedId: string | null;
  hiddenRoles: ComponentRole[];

  update: (patch: Partial<OpenShelfParams>, coalesceKey?: string) => void;
  applyChange: (change: DesignChange) => void;
  replaceParams: (params: OpenShelfParams, name?: string, cloudProjectId?: string | null) => void;
  undo: () => void;
  redo: () => void;
  setConfig: (c: EngineeringConfig) => void;
  setViewMode: (m: ViewMode) => void;
  setUserMode: (m: UserMode) => void;
  select: (id: string | null) => void;
  toggleRole: (r: ComponentRole) => void;
  setProjectName: (n: string) => void;
  setCloudProjectId: (id: string | null) => void;
  reset: () => void;
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Persisted>;
      if (parsed.params?.template === 'open_shelf') {
        return {
          params: { ...DEFAULT_OPEN_SHELF, ...parsed.params, finish: { ...DEFAULT_OPEN_SHELF.finish, ...parsed.params.finish } },
          projectName: parsed.projectName ?? 'פרויקט חדש',
          cloudProjectId: parsed.cloudProjectId ?? null,
        };
      }
    }
  } catch {
    // Corrupt or blocked storage falls back to defaults.
  }
  return { params: DEFAULT_OPEN_SHELF, projectName: 'פרויקט חדש', cloudProjectId: null };
}

function save(s: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ params: s.params, projectName: s.projectName, cloudProjectId: s.cloudProjectId }));
  } catch {
    // Storage may be full or disabled; the design stays in memory.
  }
}

export const useDesign = create<DesignState>((set, get) => ({
  ...load(),
  past: [],
  future: [],
  lastEdit: null,
  previous: null,
  config: DEFAULT_CONFIG,
  viewMode: 'design',
  userMode: 'beginner',
  selectedId: null,
  hiddenRoles: [],

  update: (patch, coalesceKey) => {
    const s = get();
    const next = { ...s.params, ...patch, template: 'open_shelf' as const };
    const now = Date.now();
    const coalesce = coalesceKey && s.lastEdit?.key === coalesceKey && now - s.lastEdit.at < COALESCE_MS;
    set({
      params: next,
      past: coalesce ? s.past : [...s.past, s.params].slice(-HISTORY_LIMIT),
      previous: coalesce ? s.previous : s.params,
      future: [],
      lastEdit: coalesceKey ? { key: coalesceKey, at: now } : null,
    });
    save(get());
  },
  applyChange: (change) => get().update(change.set),
  replaceParams: (params, name, cloudProjectId) => {
    const s = get();
    set({
      params,
      past: [...s.past, s.params].slice(-HISTORY_LIMIT),
      previous: s.params,
      future: [],
      lastEdit: null,
      projectName: name ?? s.projectName,
      cloudProjectId: cloudProjectId === undefined ? s.cloudProjectId : cloudProjectId,
    });
    save(get());
  },
  undo: () => {
    const s = get();
    if (!s.past.length) return;
    set({ params: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.params, ...s.future], previous: s.params, lastEdit: null });
    save(get());
  },
  redo: () => {
    const s = get();
    if (!s.future.length) return;
    set({ params: s.future[0], future: s.future.slice(1), past: [...s.past, s.params], previous: s.params, lastEdit: null });
    save(get());
  },
  setConfig: (config) => set({ config }),
  setViewMode: (viewMode) => set({ viewMode }),
  setUserMode: (userMode) => set({ userMode }),
  select: (selectedId) => set({ selectedId }),
  toggleRole: (r) => set((s) => ({ hiddenRoles: s.hiddenRoles.includes(r) ? s.hiddenRoles.filter((x) => x !== r) : [...s.hiddenRoles, r] })),
  setProjectName: (projectName) => {
    set({ projectName });
    save(get());
  },
  setCloudProjectId: (cloudProjectId) => {
    set({ cloudProjectId });
    save(get());
  },
  reset: () => {
    const s = get();
    set({ params: DEFAULT_OPEN_SHELF, past: [...s.past, s.params], future: [], previous: s.params, projectName: 'פרויקט חדש', cloudProjectId: null, selectedId: null });
    save(get());
  },
}));

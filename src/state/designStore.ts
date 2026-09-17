import { create } from 'zustand';
import { DEFAULT_CONFIG, DEFAULT_OPEN_SHELF, withDefaults, type ComponentRole, type DesignChange, type DesignParams, type EngineeringConfig, type ParamsPatch } from '../engine';

export type ViewMode = 'design' | 'structural' | 'exploded' | 'measure' | 'warnings';

const STORAGE_KEY = 'buildable.design.v2';
const PROJECTS_KEY = 'buildable.projects.v1';
const HISTORY_LIMIT = 100;
const COALESCE_MS = 600;
const DEFAULT_NAME = 'פרויקט חדש';

/** A design kept on this device. The active one mirrors the editor state; the others wait to be reopened. */
export interface LocalProject {
  id: string;
  name: string;
  params: DesignParams;
  cloudProjectId: string | null;
  updatedAt: number;
}

interface Persisted {
  projectId: string;
  params: DesignParams;
  projectName: string;
  cloudProjectId: string | null;
  updatedAt: number | null;
}

interface DesignState extends Persisted {
  projects: LocalProject[];
  past: DesignParams[];
  future: DesignParams[];
  lastEdit: { key: string; at: number } | null;
  /** Params as they were before the most recent edit — drives the change-impact panel. */
  previous: DesignParams | null;
  config: EngineeringConfig;
  viewMode: ViewMode;
  selectedId: string | null;
  /** Show only the selected component in the 3D view. */
  isolated: boolean;
  hiddenRoles: ComponentRole[];

  update: (patch: ParamsPatch, coalesceKey?: string) => void;
  applyChange: (change: DesignChange) => void;
  replaceParams: (params: DesignParams, name?: string, cloudProjectId?: string | null) => void;
  undo: () => void;
  redo: () => void;
  setConfig: (c: EngineeringConfig) => void;
  setViewMode: (m: ViewMode) => void;
  select: (id: string | null) => void;
  setIsolated: (on: boolean) => void;
  toggleRole: (r: ComponentRole) => void;
  setProjectName: (n: string) => void;
  setCloudProjectId: (id: string | null) => void;
  reset: () => void;
  /** Starts a new project from a catalog preset; the current project stays in "My projects". */
  startNew: (params?: DesignParams, name?: string) => void;
  /** Imports a design (e.g. from a backup file) as a new project. */
  importProject: (params: DesignParams, name: string) => void;
  openProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  duplicateProject: (id: string, copySuffix: string) => void;
  deleteProject: (id: string) => void;
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p${Date.now()}${Math.random().toString(36).slice(2)}`);

function loadProjects(): LocalProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Partial<LocalProject>[];
    return list.flatMap((p) => {
      const params = withDefaults(p.params);
      return params && p.id ? [{ id: p.id, name: p.name ?? DEFAULT_NAME, params, cloudProjectId: p.cloudProjectId ?? null, updatedAt: p.updatedAt ?? 0 }] : [];
    });
  } catch {
    return [];
  }
}

function loadActive(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Persisted>;
      const params = withDefaults(parsed.params);
      if (params) {
        return {
          // Designs saved before "My projects" existed get an id on first load.
          projectId: parsed.projectId ?? newId(),
          params,
          projectName: parsed.projectName ?? DEFAULT_NAME,
          cloudProjectId: parsed.cloudProjectId ?? null,
          updatedAt: parsed.updatedAt ?? null,
        };
      }
    }
  } catch {
    // Corrupt or blocked storage falls back to defaults.
  }
  return { projectId: newId(), params: DEFAULT_OPEN_SHELF, projectName: DEFAULT_NAME, cloudProjectId: null, updatedAt: null };
}

function writeStorage(active: Persisted, projects: LocalProject[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch {
    // Storage may be full or disabled; the design stays in memory.
  }
}

/** Upserts the active design into the project list, newest first. */
function withActive(s: Persisted, projects: LocalProject[]): LocalProject[] {
  if (s.updatedAt == null) return projects;
  const entry: LocalProject = { id: s.projectId, name: s.projectName, params: s.params, cloudProjectId: s.cloudProjectId, updatedAt: s.updatedAt };
  return [entry, ...projects.filter((p) => p.id !== s.projectId)].sort((a, b) => b.updatedAt - a.updatedAt);
}

const initialActive = loadActive();

export const useDesign = create<DesignState>((set, get) => {
  /** Persists the active design and refreshes its entry in the project list. */
  const persist = () => {
    const s = get();
    const active: Persisted = { projectId: s.projectId, params: s.params, projectName: s.projectName, cloudProjectId: s.cloudProjectId, updatedAt: s.updatedAt };
    const projects = withActive(active, s.projects);
    set({ projects });
    writeStorage(active, projects);
  };
  const fresh = { past: [], future: [], previous: null, lastEdit: null, selectedId: null, isolated: false };

  return {
    ...initialActive,
    projects: withActive(initialActive, loadProjects()),
    past: [],
    future: [],
    lastEdit: null,
    previous: null,
    config: DEFAULT_CONFIG,
    viewMode: 'design',
    selectedId: null,
    isolated: false,
    hiddenRoles: [],

    update: (patch, coalesceKey) => {
      const s = get();
      const next = { ...s.params, ...patch, template: s.params.template } as DesignParams;
      const now = Date.now();
      const coalesce = coalesceKey && s.lastEdit?.key === coalesceKey && now - s.lastEdit.at < COALESCE_MS;
      set({
        params: next,
        past: coalesce ? s.past : [...s.past, s.params].slice(-HISTORY_LIMIT),
        previous: coalesce ? s.previous : s.params,
        future: [],
        lastEdit: coalesceKey ? { key: coalesceKey, at: now } : null,
        updatedAt: now,
      });
      persist();
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
        updatedAt: Date.now(),
      });
      persist();
    },
    undo: () => {
      const s = get();
      if (!s.past.length) return;
      set({ params: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.params, ...s.future], previous: s.params, lastEdit: null, updatedAt: Date.now() });
      persist();
    },
    redo: () => {
      const s = get();
      if (!s.future.length) return;
      set({ params: s.future[0], future: s.future.slice(1), past: [...s.past, s.params], previous: s.params, lastEdit: null, updatedAt: Date.now() });
      persist();
    },
    setConfig: (config) => set({ config }),
    setViewMode: (viewMode) => set({ viewMode }),
    select: (selectedId) => set({ selectedId, isolated: selectedId ? get().isolated : false }),
    setIsolated: (isolated) => set({ isolated: isolated && get().selectedId != null }),
    toggleRole: (r) => set((s) => ({ hiddenRoles: s.hiddenRoles.includes(r) ? s.hiddenRoles.filter((x) => x !== r) : [...s.hiddenRoles, r] })),
    setProjectName: (projectName) => {
      set({ projectName, updatedAt: Date.now() });
      persist();
    },
    setCloudProjectId: (cloudProjectId) => {
      set({ cloudProjectId });
      persist();
    },
    reset: () => get().startNew(DEFAULT_OPEN_SHELF),
    startNew: (params, name) => {
      set({ ...fresh, projectId: newId(), params: params ?? DEFAULT_OPEN_SHELF, projectName: name ?? DEFAULT_NAME, cloudProjectId: null, updatedAt: Date.now() });
      persist();
    },
    importProject: (params, name) => get().startNew(params, name),
    openProject: (id) => {
      const p = get().projects.find((x) => x.id === id);
      if (!p) return;
      // History belongs to one project: switching never lets Undo pull another project's design in.
      set({ ...fresh, projectId: p.id, params: p.params, projectName: p.name, cloudProjectId: p.cloudProjectId, updatedAt: p.updatedAt });
      persist();
    },
    renameProject: (id, name) => {
      if (id === get().projectId) return get().setProjectName(name);
      const projects = get().projects.map((p) => (p.id === id ? { ...p, name } : p));
      set({ projects });
      persist();
    },
    duplicateProject: (id, copySuffix) => {
      const p = get().projects.find((x) => x.id === id);
      if (!p) return;
      const copy: LocalProject = { ...p, id: newId(), name: `${p.name} ${copySuffix}`, cloudProjectId: null, updatedAt: Date.now() };
      set({ projects: [copy, ...get().projects] });
      persist();
    },
    deleteProject: (id) => {
      const rest = get().projects.filter((p) => p.id !== id);
      if (id === get().projectId) {
        // Deleting the open project moves the editor to the most recent remaining one (or a blank bookcase).
        const next = rest[0];
        set({ projects: rest, ...fresh, ...(next ? { projectId: next.id, params: next.params, projectName: next.name, cloudProjectId: next.cloudProjectId, updatedAt: next.updatedAt } : { projectId: newId(), params: DEFAULT_OPEN_SHELF, projectName: DEFAULT_NAME, cloudProjectId: null, updatedAt: null }) });
      } else set({ projects: rest });
      persist();
    },
  };
});

import { create } from 'zustand';
import { blankStudio, type ElementStatus, type FieldMark, type Manual, type StudioProject, type StudioSpace } from '../engine/studio/model';
import type { Pt } from '../engine/geometry';
import { onOwnerChange, ownedKey } from './owner';

/**
 * The studio prototype's project, kept on this device under whoever is signed in.
 *
 * Only decisions are stored; the proposal and its issues are recomputed from them. Every change that
 * touches the design raises the revision, which is what an approval is tied to.
 */

const STORAGE_BASE = 'buildable.studio.v1';
const storageKey = () => ownedKey(STORAGE_BASE);

function load(): StudioProject {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return blankStudio();
    const p = JSON.parse(raw) as Partial<StudioProject>;
    const blank = blankStudio();
    return { ...blank, ...p, design: { ...blank.design, ...(p.design ?? {}) } };
  } catch {
    return blankStudio();
  }
}

interface StudioState extends StudioProject {
  saveFailed: boolean;
  loadSpaces: (spaces: StudioSpace[], fileName: string) => void;
  setName: (name: string) => void;
  setCity: (city: string) => void;
  setCeiling: (mm: number | null) => void;
  setManual: (key: 'slopePct' | 'diameterMm', value: Manual | null) => void;
  setConnection: (at: Pt | null) => void;
  patchSpace: (id: string, patch: Partial<Pick<StudioSpace, 'name' | 'use'>>) => void;
  setStatus: (ids: string[], status: ElementStatus) => void;
  acknowledge: (issueId: string) => void;
  approve: (by: string) => void;
  addMark: (mark: Omit<FieldMark, 'id' | 'createdAt'>) => void;
  removeMark: (id: string) => void;
  reset: () => void;
}

const PROJECT_KEYS: (keyof StudioProject)[] = ['name', 'fileName', 'spaces', 'design', 'status', 'acknowledged', 'approvals', 'marks', 'revision'];

export const useStudio = create<StudioState>((set, get) => {
  const persist = () => {
    const s = get();
    const project = Object.fromEntries(PROJECT_KEYS.map((k) => [k, s[k]]));
    try {
      localStorage.setItem(storageKey(), JSON.stringify(project));
      if (s.saveFailed) set({ saveFailed: false });
    } catch {
      set({ saveFailed: true });
    }
  };
  /** A change to the design: the revision moves, so an earlier approval no longer stands. */
  const change = (patch: Partial<StudioProject>) => {
    set({ ...patch, revision: get().revision + 1 });
    persist();
  };
  const note = (patch: Partial<StudioProject>) => {
    set(patch);
    persist();
  };

  return {
    ...load(),
    saveFailed: false,
    loadSpaces: (spaces, fileName) =>
      change({ spaces, fileName, status: {}, acknowledged: [], design: { ...get().design, connection: null } }),
    setName: (name) => note({ name }),
    setCity: (city) => change({ design: { ...get().design, city } }),
    setCeiling: (ceilingMm) => change({ design: { ...get().design, ceilingMm } }),
    setManual: (key, value) => change({ design: { ...get().design, [key]: value } }),
    // Moving the connection moves every run that ends there and the water entry beside it, so those go
    // back to being proposals; the point itself was placed by a person, so it counts as decided.
    setConnection: (connection) => {
      const status = Object.fromEntries(Object.entries(get().status).filter(([id]) => !/_drain_out$|_water_\d+$|^backflow$/.test(id)));
      change({ design: { ...get().design, connection }, status: connection ? { ...status, sewer_connection: 'accepted' } : status });
    },
    patchSpace: (id, patch) => change({ spaces: get().spaces.map((s) => (s.id === id ? { ...s, ...patch } : s)) }),
    setStatus: (ids, status) => change({ status: { ...get().status, ...Object.fromEntries(ids.map((id) => [id, status])) } }),
    acknowledge: (issueId) => note({ acknowledged: [...new Set([...get().acknowledged, issueId])] }),
    approve: (by) => note({ approvals: [...get().approvals, { by, at: Date.now(), revision: get().revision }] }),
    addMark: (mark) =>
      note({ marks: [...get().marks, { ...mark, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() }] }),
    removeMark: (id) => note({ marks: get().marks.filter((m) => m.id !== id), acknowledged: get().acknowledged.filter((a) => a !== `mark_${id}`) }),
    reset: () => {
      set({ ...blankStudio() });
      persist();
    },
  };
});

onOwnerChange(() => useStudio.setState({ ...load() }));

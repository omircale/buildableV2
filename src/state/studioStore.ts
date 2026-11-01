import { create } from 'zustand';
import { blankStudio, type ElementStatus, type FieldMark, type Manual, type ProjectKind, type StudioProject, type StudioSpace } from '../engine/studio/model';
import type { Pt } from '../engine/geometry';
import { onOwnerChange, ownedKey } from './owner';

/**
 * The studio prototype's project, kept on this device under whoever is signed in.
 *
 * Only decisions are stored; the proposal and its issues are recomputed from them. Every change that
 * touches the design raises the revision, which is what an approval is tied to.
 *
 * A project can also live in the account (studioSync.ts keeps the two in step). `edits` counts every
 * change made on this device; `cloud.syncedEdits` is how many of them the account has, so the project
 * has unsaved changes exactly when the two differ — including changes made while offline.
 */

const STORAGE_BASE = 'buildable.studio.v1';
const storageKey = () => ownedKey(STORAGE_BASE);

/** Where this device's copy stands against the account's. */
export interface CloudLink {
  id: string;
  /** The account's version this device last saved or opened. */
  version: number;
  savedAt: string;
  syncedEdits: number;
}

interface Kept extends StudioProject {
  cloud: CloudLink | null;
  edits: number;
}

const blankKept = (): Kept => ({ ...blankStudio(), cloud: null, edits: 0 });

/** A project as it arrives from storage or from the account: whatever it lacks is filled from blank. */
function fill(p: Partial<StudioProject>): StudioProject {
  const blank = blankStudio();
  const project = { ...blank, ...p, design: { ...blank.design, ...(p.design ?? {}) } };
  return Object.fromEntries(PROJECT_KEYS.map((k) => [k, project[k]])) as unknown as StudioProject;
}

function load(): Kept {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return blankKept();
    const p = JSON.parse(raw) as Partial<Kept>;
    return { ...fill(p), cloud: p.cloud ?? null, edits: typeof p.edits === 'number' ? p.edits : 0 };
  } catch {
    return blankKept();
  }
}

interface StudioState extends Kept {
  saveFailed: boolean;
  /** This device's copy is now the account's project `link`, saved up to edit `syncedEdits`; null: on this device only. */
  linkCloud: (link: CloudLink | null) => void;
  /** Replaces this device's project with the account's copy. */
  openCloud: (data: Partial<StudioProject>, link: Omit<CloudLink, 'syncedEdits'>) => void;
  loadSpaces: (spaces: StudioSpace[], fileName: string) => void;
  setName: (name: string) => void;
  setCity: (city: string) => void;
  setKind: (kind: ProjectKind) => void;
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

/** The project itself, without this device's bookkeeping: what is saved to the account. */
export function studioSnapshot(s: StudioProject): StudioProject {
  return Object.fromEntries(PROJECT_KEYS.map((k) => [k, s[k]])) as unknown as StudioProject;
}

/** Whether this device holds changes the account does not have yet. */
export const hasUnsaved = (s: Pick<Kept, 'cloud' | 'edits'>) => s.cloud !== null && s.cloud.syncedEdits !== s.edits;

export const useStudio = create<StudioState>((set, get) => {
  const persist = () => {
    const s = get();
    const project = { ...studioSnapshot(s), cloud: s.cloud, edits: s.edits };
    try {
      localStorage.setItem(storageKey(), JSON.stringify(project));
      if (s.saveFailed) set({ saveFailed: false });
    } catch {
      set({ saveFailed: true });
    }
  };
  /** A change to the design: the revision moves, so an earlier approval no longer stands. */
  const change = (patch: Partial<Kept>) => {
    set({ ...patch, revision: get().revision + 1, edits: get().edits + 1 });
    persist();
  };
  const note = (patch: Partial<Kept>) => {
    set({ ...patch, edits: get().edits + 1 });
    persist();
  };

  return {
    ...load(),
    saveFailed: false,
    linkCloud: (cloud) => {
      set({ cloud });
      persist();
    },
    openCloud: (data, link) => {
      set({ ...fill(data), cloud: { ...link, syncedEdits: get().edits } });
      persist();
    },
    // A new plan is a new project: every decision, value, approval and mark belonged to the old one, and
    // so did its place in the account.
    loadSpaces: (spaces, fileName) => change({ ...blankStudio(), spaces, fileName, cloud: null }),
    setName: (name) => note({ name }),
    setCity: (city) => change({ design: { ...get().design, city } }),
    setKind: (kind) => change({ design: { ...get().design, kind } }),
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
      set({ ...blankStudio(), cloud: null });
      persist();
    },
  };
});

onOwnerChange(() => useStudio.setState({ ...load() }));

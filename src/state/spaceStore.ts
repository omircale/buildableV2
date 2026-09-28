import { create } from 'zustand';
import { emptySpace, type ConnectionPoint, type Space } from '../engine';
import type { ServiceKind } from '../engine';
import type { ServiceSource } from '../engine';

/**
 * A room a maintenance manager is surveying, and what is going into it.
 *
 * Kept apart from the design store on purpose: a design is a piece of furniture, a survey is a room,
 * and a project usually has one room and several pieces. This holds only what a person on site types
 * in — everything derived from it (areas, service shortfalls, the bill) is computed by the engine and
 * never stored, so there is no second copy of the truth to drift.
 */

const STORAGE_KEY = 'buildable.survey.v1';

export interface Survey {
  /** The room as the engine models it. */
  space: Space;
  /**
   * The two numbers a person actually measures, held in their own right.
   *
   * They cannot be derived back out of the footprint while one of them is still missing — the first
   * dimension typed would have nothing to pair with and would be thrown away on the spot, so the
   * second could never complete it. Keeping them here lets a half-measured room stay half-measured on
   * screen while the *engine* still sees an unmeasured room, which is the honest split.
   */
  widthMm: number | null;
  depthMm: number | null;
  /** Where the room sits in the hotel. The space model does not carry a building or a floor. */
  buildingId: string;
  levelId: string;
  /** What is going in, by equipment id. */
  equipmentIds: string[];
  /** The risers, mains and panels the points hang off. */
  sources: ServiceSource[];
  updatedAt: number | null;
}

function blank(): Survey {
  return {
    space: { ...emptySpace('room_1', 'חלל חדש', 'New space'), heightMm: null },
    widthMm: null,
    depthMm: null,
    buildingId: 'main',
    levelId: '0',
    equipmentIds: [],
    sources: [],
    updatedAt: null,
  };
}

function load(): Survey {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw) as Partial<Survey>;
    const base = blank();
    if (!parsed.space) return base;
    return {
      space: { ...base.space, ...parsed.space },
      widthMm: parsed.widthMm ?? null,
      depthMm: parsed.depthMm ?? null,
      buildingId: parsed.buildingId ?? base.buildingId,
      levelId: parsed.levelId ?? base.levelId,
      equipmentIds: parsed.equipmentIds ?? [],
      sources: parsed.sources ?? [],
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch {
    // Corrupt or blocked storage falls back to an empty survey rather than losing the screen.
    return blank();
  }
}

/** A rectangular room from two dimensions. Most rooms a manager measures with a tape are rectangles. */
export function rectangleFootprint(widthMm: number, depthMm: number) {
  return [
    { x: 0, y: 0 },
    { x: widthMm, y: 0 },
    { x: widthMm, y: depthMm },
    { x: 0, y: depthMm },
  ];
}

/** The width and depth of a rectangular footprint, or nulls when it is not a rectangle. */
export function rectangleSize(space: Space): { widthMm: number | null; depthMm: number | null } {
  const f = space.footprintMm;
  if (f.length !== 4) return { widthMm: null, depthMm: null };
  const xs = f.map((p) => p.x);
  const ys = f.map((p) => p.y);
  return { widthMm: Math.max(...xs) - Math.min(...xs), depthMm: Math.max(...ys) - Math.min(...ys) };
}

export interface SurveyState extends Survey {
  setName: (nameHe: string) => void;
  setRectangle: (widthMm: number | null, depthMm: number | null) => void;
  setHeight: (heightMm: number | null) => void;
  toggleOpenEdge: (index: number) => void;
  setPlace: (buildingId: string, levelId: string) => void;
  toggleEquipment: (id: string) => void;
  addConnection: (kind: ServiceKind) => void;
  updateConnection: (id: string, patch: Partial<ConnectionPoint>) => void;
  removeConnection: (id: string) => void;
  addSource: (kind: ServiceKind) => void;
  updateSource: (id: string, patch: Partial<ServiceSource>) => void;
  removeSource: (id: string) => void;
  reset: () => void;
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export const useSurvey = create<SurveyState>((set, get) => {
  const persist = () => {
    const { space, widthMm, depthMm, buildingId, levelId, equipmentIds, sources } = get();
    const next: Survey = { space, widthMm, depthMm, buildingId, levelId, equipmentIds, sources, updatedAt: Date.now() };
    set({ updatedAt: next.updatedAt });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage may be full or disabled; the survey stays in memory for this session.
    }
  };

  const patchSpace = (patch: Partial<Space>) => {
    set({ space: { ...get().space, ...patch } });
    persist();
  };

  return {
    ...load(),

    setName: (nameHe) => patchSpace({ nameHe }),

    setRectangle: (widthMm, depthMm) => {
      // The typed numbers are kept whatever happens; the footprint only exists once both are real.
      // Half a rectangle is not a smaller room, so the engine gets nothing until the pair is complete.
      const w = widthMm != null && widthMm > 0 ? widthMm : null;
      const d = depthMm != null && depthMm > 0 ? depthMm : null;
      set({ widthMm: w, depthMm: d });
      patchSpace({ footprintMm: w != null && d != null ? rectangleFootprint(w, d) : [] });
    },

    setHeight: (heightMm) => patchSpace({ heightMm: heightMm != null && heightMm > 0 ? heightMm : null }),

    toggleOpenEdge: (index) => {
      const open = new Set(get().space.openEdges ?? []);
      if (open.has(index)) open.delete(index);
      else open.add(index);
      patchSpace({ openEdges: [...open].sort((a, b) => a - b) });
    },

    setPlace: (buildingId, levelId) => {
      set({ buildingId, levelId });
      persist();
    },

    toggleEquipment: (id) => {
      const have = get().equipmentIds;
      set({ equipmentIds: have.includes(id) ? have.filter((x) => x !== id) : [...have, id] });
      persist();
    },

    addConnection: (kind) => {
      const point: ConnectionPoint = { id: nextId('pt'), kind, atMm: null, existing: true };
      patchSpace({ connections: [...get().space.connections, point] });
    },

    updateConnection: (id, patch) => patchSpace({ connections: get().space.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),

    removeConnection: (id) => patchSpace({ connections: get().space.connections.filter((c) => c.id !== id) }),

    addSource: (kind) => {
      const source: ServiceSource = { id: nextId('src'), kind, nameHe: '', nameEn: '', atMm: null, spareWays: null };
      set({ sources: [...get().sources, source] });
      persist();
    },

    updateSource: (id, patch) => {
      set({ sources: get().sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
      persist();
    },

    removeSource: (id) => {
      // A point fed from a source that is being deleted loses its feed rather than keeping a dead id.
      set({
        sources: get().sources.filter((s) => s.id !== id),
        space: { ...get().space, connections: get().space.connections.map((c) => (c.fedBy === id ? { ...c, fedBy: undefined } : c)) },
      });
      persist();
    },

    reset: () => {
      set(blank());
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing to do; the in-memory reset already happened.
      }
    },
  };
});

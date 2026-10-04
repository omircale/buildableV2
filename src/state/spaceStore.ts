import { create } from 'zustand';
import { emptySpace, type ConnectionPoint, type Space } from '../engine';
import type { ServiceKind } from '../engine';
import type { FinishScheduleSpec, ServiceSource } from '../engine';

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
  /**
   * True while the room's outline is the built-in example rather than a measurement.
   *
   * The walkthrough can start from an example room so a client sees the whole journey before anyone
   * has measured anything. Every quantity that follows is then computed from invented dimensions, and
   * this flag is what lets every screen say so. It clears the moment someone types a real width or
   * depth — a ceiling height alone does not make an invented floor real.
   */
  sample: boolean;
  /** Where the room sits in the hotel. The space model does not carry a building or a floor. */
  buildingId: string;
  levelId: string;
  /** What is going in, by equipment id. An id appears once per unit — two fridges are two entries. */
  equipmentIds: string[];
  /** The risers, mains and panels the points hang off. */
  sources: ServiceSource[];
  /**
   * What the person answered to the refinement questions, by question id, as they would read it back.
   * Only the answers that change nothing in the model live here — "I don't know, ask on site" — so the
   * question is not asked again. Answers that do change the model are written to the model itself.
   */
  answers: Record<string, string>;
  /** Whether the piece in the design editor is part of this room's bill. Off until someone says so. */
  includeDesign: boolean;
  updatedAt: number | null;
}

/**
 * A project is several rooms and one finish schedule.
 *
 * The flat `Survey` fields above are always the room that is open; the rest of the project's rooms wait
 * in `others`. Keeping the open room flat means every screen written for one room keeps working, and a
 * project of forty rooms costs those screens nothing. `order` is the rooms' order in the bill — which
 * is their structure number in it, so it must not shuffle when a different room is opened.
 */
export interface ProjectExtras {
  others: Survey[];
  order: string[];
  /** The project's finish schedule. A finish names the rooms it is used in by their space ids. */
  finishes: FinishScheduleSpec[];
}

/** The example room: a pool bar, open to the deck along its long side. Dimensions are invented. */
export const SAMPLE_ROOM = { widthMm: 7200, depthMm: 3600, heightMm: 2700, openEdges: [0], nameHe: 'בר בריכה (חדר לדוגמה)', nameEn: 'Pool bar (example room)' } as const;

function blank(): Survey {
  return {
    space: { ...emptySpace('room_1', 'חלל חדש', 'New space'), heightMm: null },
    widthMm: null,
    depthMm: null,
    sample: false,
    buildingId: 'main',
    levelId: '0',
    equipmentIds: [],
    sources: [],
    answers: {},
    includeDesign: false,
    updatedAt: null,
  };
}

function blankProject(): Survey & ProjectExtras {
  const room = blank();
  return { ...room, others: [], order: [room.space.id], finishes: [] };
}

/** The per-room fields of the store, taken as a snapshot that can be parked in `others`. */
function snapshot(s: Survey): Survey {
  const { space, widthMm, depthMm, sample, buildingId, levelId, equipmentIds, sources, answers, includeDesign, updatedAt } = s;
  return { space, widthMm, depthMm, sample, buildingId, levelId, equipmentIds, sources, answers, includeDesign, updatedAt };
}

/** Every room of the project, the open one included, in bill order. */
export function projectRooms(s: Survey & ProjectExtras): Survey[] {
  const all = [snapshot(s), ...s.others];
  const byId = new Map(all.map((r) => [r.space.id, r]));
  const ordered = s.order.map((id) => byId.get(id)).filter((r): r is Survey => r != null);
  return [...ordered, ...all.filter((r) => !s.order.includes(r.space.id))];
}

function load(): Survey & ProjectExtras {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return blankProject();
    const parsed = JSON.parse(raw) as Partial<Survey>;
    const base = blank();
    if (!parsed.space) return blankProject();
    const extras = parsed as Partial<ProjectExtras>;
    return {
      others: extras.others ?? [],
      order: extras.order ?? [parsed.space.id ?? base.space.id],
      finishes: extras.finishes ?? [],
      space: { ...base.space, ...parsed.space },
      widthMm: parsed.widthMm ?? null,
      depthMm: parsed.depthMm ?? null,
      sample: parsed.sample ?? false,
      buildingId: parsed.buildingId ?? base.buildingId,
      levelId: parsed.levelId ?? base.levelId,
      equipmentIds: parsed.equipmentIds ?? [],
      sources: parsed.sources ?? [],
      answers: parsed.answers ?? {},
      includeDesign: parsed.includeDesign ?? false,
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch {
    // Corrupt or blocked storage falls back to an empty survey rather than losing the screen.
    return blankProject();
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

/** How many of one item are in the room. */
export function countOf(equipmentIds: string[], id: string): number {
  return equipmentIds.filter((x) => x === id).length;
}

export interface SurveyState extends Survey, ProjectExtras {
  setName: (nameHe: string) => void;
  setRectangle: (widthMm: number | null, depthMm: number | null) => void;
  setHeight: (heightMm: number | null) => void;
  toggleOpenEdge: (index: number) => void;
  setPlace: (buildingId: string, levelId: string) => void;
  /** Adds one of an item, or takes every one of it out if it is already there. */
  toggleEquipment: (id: string) => void;
  setEquipmentCount: (id: string, count: number) => void;
  /** Returns the new point's id. */
  addConnection: (kind: ServiceKind, patch?: Partial<ConnectionPoint>) => string;
  updateConnection: (id: string, patch: Partial<ConnectionPoint>) => void;
  removeConnection: (id: string) => void;
  /** Returns the new source's id. */
  addSource: (kind: ServiceKind, patch?: Partial<ServiceSource>) => string;
  updateSource: (id: string, patch: Partial<ServiceSource>) => void;
  removeSource: (id: string) => void;
  answer: (questionId: string, label: string) => void;
  clearAnswer: (questionId: string) => void;
  setIncludeDesign: (include: boolean) => void;
  /** Adds an empty room and opens it. */
  addRoom: () => void;
  /** Copies the open room `copies` times — forty identical guest rooms are one room, measured once. */
  duplicateRoom: (copies: number) => void;
  openRoom: (spaceId: string) => void;
  /** Removes a room. The last room is emptied instead, so a project always has one. */
  removeRoom: (spaceId: string) => void;
  upsertFinish: (spec: FinishScheduleSpec) => void;
  /** Adds several finishes at once, replacing any that share a code — what an imported schedule does. */
  importFinishes: (specs: FinishScheduleSpec[]) => void;
  removeFinish: (code: string) => void;
  toggleFinishRoom: (code: string, spaceId: string) => void;
  /** Replaces the outline with the example room and marks it as an example. */
  loadSample: () => void;
  /** Takes the example room out entirely, so a real measurement never sits on an invented one. */
  clearSample: () => void;
  reset: () => void;
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export const useSurvey = create<SurveyState>((set, get) => {
  const persist = () => {
    const updatedAt = Date.now();
    set({ updatedAt });
    const { others, order, finishes } = get();
    const next: Survey & ProjectExtras = { ...snapshot(get()), updatedAt, others, order, finishes };
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

    // The person named the room; that is its name whichever language the screen is in.
    setName: (name) => patchSpace({ nameHe: name, nameEn: name }),

    setRectangle: (widthMm, depthMm) => {
      // The typed numbers are kept whatever happens; the footprint only exists once both are real.
      // Half a rectangle is not a smaller room, so the engine gets nothing until the pair is complete.
      const w = widthMm != null && widthMm > 0 ? widthMm : null;
      const d = depthMm != null && depthMm > 0 ? depthMm : null;
      // Typing a floor dimension is a measurement, so the room stops being the example.
      set({ widthMm: w, depthMm: d, sample: false });
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

    setEquipmentCount: (id, count) => {
      const n = Math.max(0, Math.min(20, Math.round(count)));
      set({ equipmentIds: [...get().equipmentIds.filter((x) => x !== id), ...Array<string>(n).fill(id)] });
      persist();
    },

    addConnection: (kind, patch) => {
      const point: ConnectionPoint = { id: nextId('pt'), kind, atMm: null, existing: true, ...patch };
      patchSpace({ connections: [...get().space.connections, point] });
      return point.id;
    },

    updateConnection: (id, patch) => patchSpace({ connections: get().space.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),

    removeConnection: (id) => patchSpace({ connections: get().space.connections.filter((c) => c.id !== id) }),

    addSource: (kind, patch) => {
      const source: ServiceSource = { id: nextId('src'), kind, nameHe: '', nameEn: '', atMm: null, spareWays: null, ...patch };
      set({ sources: [...get().sources, source] });
      persist();
      return source.id;
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

    answer: (questionId, label) => {
      set({ answers: { ...get().answers, [questionId]: label } });
      persist();
    },

    clearAnswer: (questionId) => {
      const { [questionId]: _dropped, ...rest } = get().answers;
      set({ answers: rest });
      persist();
    },

    setIncludeDesign: (includeDesign) => {
      set({ includeDesign });
      persist();
    },

    addRoom: () => {
      const st = get();
      const ids = projectRooms(st).map((r) => r.space.id);
      const n = Math.max(0, ...ids.map((id) => Number(id.replace(/\D+/g, '')) || 0)) + 1;
      const room = blank();
      room.space = { ...room.space, id: `room_${n}`, nameHe: `חלל ${n}`, nameEn: `Space ${n}` };
      // A new room is on the same floor of the same building until someone says otherwise.
      room.buildingId = st.buildingId;
      room.levelId = st.levelId;
      set({ ...room, others: [...st.others, snapshot(st)], order: [...st.order, room.space.id] });
      persist();
    },

    duplicateRoom: (copies) => {
      const st = get();
      const count = Math.max(1, Math.min(98, Math.round(copies)));
      const ids = projectRooms(st).map((r) => r.space.id);
      let n = Math.max(0, ...ids.map((id) => Number(id.replace(/\D+/g, '')) || 0));
      const source = snapshot(st);
      const made: Survey[] = [];
      for (let i = 0; i < count; i++) {
        n += 1;
        made.push({ ...source, space: { ...source.space, id: `room_${n}`, nameHe: `${source.space.nameHe} (${i + 2})`, nameEn: `${source.space.nameEn} (${i + 2})` } });
      }
      // A copy is used wherever the original is: the finishes that name this room name its copies too.
      const finishes = st.finishes.map((f) => (f.areas.includes(source.space.id) ? { ...f, areas: [...f.areas, ...made.map((m) => m.space.id)] } : f));
      set({ others: [...st.others, ...made], order: [...st.order, ...made.map((m) => m.space.id)], finishes });
      persist();
    },

    openRoom: (spaceId) => {
      const st = get();
      if (st.space.id === spaceId) return;
      const target = st.others.find((r) => r.space.id === spaceId);
      if (!target) return;
      set({ ...target, others: [...st.others.filter((r) => r.space.id !== spaceId), snapshot(st)] });
      persist();
    },

    removeRoom: (spaceId) => {
      const st = get();
      const finishes = st.finishes.map((f) => ({ ...f, areas: f.areas.filter((id) => id !== spaceId) }));
      if (st.space.id !== spaceId) {
        set({ others: st.others.filter((r) => r.space.id !== spaceId), order: st.order.filter((id) => id !== spaceId), finishes });
      } else if (st.others.length) {
        const next = projectRooms(st).find((r) => r.space.id !== spaceId)!;
        set({ ...next, others: st.others.filter((r) => r.space.id !== next.space.id), order: st.order.filter((id) => id !== spaceId), finishes });
      } else {
        const room = blank();
        set({ ...room, order: [room.space.id], finishes });
      }
      persist();
    },

    upsertFinish: (spec) => {
      const rest = get().finishes.filter((f) => f.code !== spec.code);
      set({ finishes: [...rest, spec].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })) });
      persist();
    },

    importFinishes: (specs) => {
      const codes = new Set(specs.map((x) => x.code));
      const kept = get().finishes.filter((f) => !codes.has(f.code));
      set({ finishes: [...kept, ...specs].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })) });
      persist();
    },

    removeFinish: (code) => {
      set({ finishes: get().finishes.filter((f) => f.code !== code) });
      persist();
    },

    toggleFinishRoom: (code, spaceId) => {
      set({ finishes: get().finishes.map((f) => (f.code !== code ? f : { ...f, areas: f.areas.includes(spaceId) ? f.areas.filter((id) => id !== spaceId) : [...f.areas, spaceId] })) });
      persist();
    },

    loadSample: () => {
      set({ widthMm: SAMPLE_ROOM.widthMm, depthMm: SAMPLE_ROOM.depthMm, sample: true });
      patchSpace({
        nameHe: SAMPLE_ROOM.nameHe,
        nameEn: SAMPLE_ROOM.nameEn,
        footprintMm: rectangleFootprint(SAMPLE_ROOM.widthMm, SAMPLE_ROOM.depthMm),
        heightMm: SAMPLE_ROOM.heightMm,
        openEdges: [...SAMPLE_ROOM.openEdges],
      });
    },

    clearSample: () => {
      if (!get().sample) return;
      const empty = blank().space;
      set({ widthMm: null, depthMm: null, sample: false });
      patchSpace({ nameHe: empty.nameHe, nameEn: empty.nameEn, footprintMm: [], heightMm: null, openEdges: [] });
    },

    reset: () => {
      set(blankProject());
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing to do; the in-memory reset already happened.
      }
    },
  };
});

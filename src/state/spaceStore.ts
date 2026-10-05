import { onOwnerChange, ownedKey } from './owner';
import { create } from 'zustand';
import { emptySpace, type ConnectionPoint, type Space } from '../engine';
import type { ServiceKind } from '../engine';
import type { DesignParams, FinishScheduleSpec, Sector, ServiceSource } from '../engine';

/**
 * A room a maintenance manager is surveying, and what is going into it.
 *
 * Kept apart from the design store on purpose: a design is a piece of furniture, a survey is a room,
 * and a project usually has one room and several pieces. This holds only what a person on site types
 * in — everything derived from it (areas, service shortfalls, the bill) is computed by the engine and
 * never stored, so there is no second copy of the truth to drift.
 */

const STORAGE_BASE = 'buildable.survey.v1';
const storageKey = () => ownedKey(STORAGE_BASE);

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
  /**
   * Which kind of place this room is, for choosing what equipment to offer first. It narrows a list;
   * it changes nothing in the bill, and equipment already in the room stays whatever this says.
   */
  sector: Sector | 'all';
  /** What is going in, by equipment id. An id appears once per unit — two fridges are two entries. */
  equipmentIds: string[];
  /** The risers, mains and panels the points hang off. */
  sources: ServiceSource[];
  /**
   * What the person answered to the refinement questions, by question id, as they would read it back.
   * Only the answers that change nothing in the model live here — "I don't know, ask on site" — so the
   * question is not asked again. Answers that do change the model are written to the model itself.
   */
  answers: Record<string, AnswerCode>;
  /**
   * The piece of furniture put in this room, as it was when it was put there.
   *
   * It is a copy, not a pointer to whatever the design editor has open. A bill that followed the editor
   * would change every time someone opened a different design — the bar counter in a tendered room
   * quietly becoming a child's bed. Bringing a later change of the design into the room is a deliberate
   * act: put the piece in again.
   */
  piece: IncludedPiece | null;
  updatedAt: number | null;
}

export interface IncludedPiece {
  name: string;
  params: DesignParams;
}

/**
 * How a refinement question was closed without changing the model.
 *
 * Stored as a code, never as the words on the button. The words depend on the language the screen was
 * in, and an answer saved as Hebrew text was unrecognisable after a switch to English — the screen then
 * reported that every question had been answered when three had only been deferred.
 */
export type AnswerCode = 'ask_on_site' | 'none' | 'not_stated' | 'all_built' | 'open_marked';
const ANSWER_CODES: readonly AnswerCode[] = ['ask_on_site', 'none', 'not_stated', 'all_built', 'open_marked'];

/** Answers saved before codes existed were button text, in either language. They are read back once. */
function answerCode(questionId: string, saved: unknown): AnswerCode {
  if (ANSWER_CODES.includes(saved as AnswerCode)) return saved as AnswerCode;
  const text = String(saved);
  if (/כל הקירות בנויים|Every wall is built/.test(text)) return 'all_built';
  if (/^(פתוח|Open)/.test(text)) return 'open_marked';
  if (/אין בחלל|None in the space/.test(text)) return 'none';
  return questionId.startsWith('capacity:') ? 'not_stated' : 'ask_on_site';
}

/** The interchange format numbers a room with two digits, so a bill cannot hold more than this. */
export const MAX_ROOMS = 99;

/** What the last undoable action was, so the screen can say what "undo" will bring back. */
export type UndoKind = 'room_removed' | 'finish_removed' | 'source_removed' | 'point_removed' | 'rooms_duplicated' | 'project_reset' | 'backup_restored' | 'finishes_imported';

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
  /** What was last written in the describe step, kept so leaving the step does not erase it. */
  describeText: string;
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
    sector: 'all',
    equipmentIds: [],
    sources: [],
    answers: {},
    piece: null,
    updatedAt: null,
  };
}

function blankProject(): Survey & ProjectExtras {
  const room = blank();
  return { ...room, others: [], order: [room.space.id], finishes: [], describeText: '' };
}

/** A saved room read back into today's shape, whatever version wrote it. */
function reviveRoom(saved: Partial<Survey>): Survey {
  const base = blank();
  const answers: Record<string, AnswerCode> = {};
  for (const [id, value] of Object.entries(saved.answers ?? {})) answers[id] = answerCode(id, value);
  return {
    space: { ...base.space, ...saved.space },
    widthMm: saved.widthMm ?? null,
    depthMm: saved.depthMm ?? null,
    sample: saved.sample ?? false,
    buildingId: saved.buildingId ?? base.buildingId,
    levelId: saved.levelId ?? base.levelId,
    sector: saved.sector ?? 'all',
    equipmentIds: saved.equipmentIds ?? [],
    sources: saved.sources ?? [],
    answers,
    // An older save only recorded *that* a piece was included, not which. It cannot be reconstructed,
    // so the room comes back without one rather than with whatever the editor happens to hold.
    piece: saved.piece ?? null,
    updatedAt: saved.updatedAt ?? null,
  };
}

/** A whole saved project read back, or null when the text is not one. */
function reviveProject(parsed: unknown): (Survey & ProjectExtras) | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const saved = parsed as Partial<Survey & ProjectExtras>;
  if (!saved.space || typeof saved.space !== 'object' || !Array.isArray(saved.space.footprintMm)) return null;
  const open = reviveRoom(saved);
  const others = Array.isArray(saved.others) ? saved.others.filter((r) => r?.space?.id).map(reviveRoom) : [];
  const ids = [open.space.id, ...others.map((r) => r.space.id)];
  const order = Array.isArray(saved.order) ? saved.order.filter((id) => ids.includes(id)) : [];
  return {
    ...open,
    others,
    order: [...order, ...ids.filter((id) => !order.includes(id))],
    finishes: Array.isArray(saved.finishes) ? saved.finishes : [],
    describeText: typeof saved.describeText === 'string' ? saved.describeText : '',
  };
}

/** The per-room fields of the store, taken as a snapshot that can be parked in `others`. */
function snapshot(s: Survey): Survey {
  const { space, widthMm, depthMm, sample, buildingId, levelId, sector, equipmentIds, sources, answers, piece, updatedAt } = s;
  return { space, widthMm, depthMm, sample, buildingId, levelId, sector, equipmentIds, sources, answers, piece, updatedAt };
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
    const raw = localStorage.getItem(storageKey());
    return (raw && reviveProject(JSON.parse(raw))) || blankProject();
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
  setSector: (sector: Sector | 'all') => void;
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
  answer: (questionId: string, code: AnswerCode) => void;
  clearAnswer: (questionId: string) => void;
  /** Puts a piece in the open room as it is now, or takes it out with null. */
  setPiece: (piece: IncludedPiece | null) => void;
  setDescribeText: (text: string) => void;
  /** The last action that can be taken back, or null. Not saved: it is gone after a refresh. */
  undoable: { kind: UndoKind; snapshot: string } | null;
  undo: () => void;
  dismissUndo: () => void;
  /** The whole project as a file's contents. */
  exportProject: () => string;
  /** Replaces the project with one read from a backup file. False when the text is not a project. */
  restoreProject: (text: string) => boolean;
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
    const { others, order, finishes, describeText } = get();
    const next: Survey & ProjectExtras = { ...snapshot(get()), updatedAt, others, order, finishes, describeText };
    try {
      localStorage.setItem(storageKey(), JSON.stringify(next));
    } catch {
      // Storage may be full or disabled; the survey stays in memory for this session.
    }
  };

  /** The project as it stands, taken before an action that destroys something, so it can be put back. */
  const remember = (kind: UndoKind) => {
    const { others, order, finishes, describeText } = get();
    set({ undoable: { kind, snapshot: JSON.stringify({ ...snapshot(get()), others, order, finishes, describeText }) } });
  };

  const patchSpace = (patch: Partial<Space>) => {
    set({ space: { ...get().space, ...patch } });
    persist();
  };

  return {
    ...load(),
    undoable: null,

    undo: () => {
      const last = get().undoable;
      const back = last && reviveProject(JSON.parse(last.snapshot));
      if (!back) return;
      set({ ...back, undoable: null });
      persist();
    },

    dismissUndo: () => set({ undoable: null }),

    exportProject: () => {
      const { others, order, finishes, describeText } = get();
      return JSON.stringify({ format: 'buildable-project', version: 1, ...snapshot(get()), others, order, finishes, describeText }, null, 2);
    },

    restoreProject: (text) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return false;
      }
      const project = reviveProject(parsed);
      if (!project) return false;
      remember('backup_restored');
      set(project);
      persist();
      return true;
    },

    setDescribeText: (describeText) => {
      set({ describeText });
      persist();
    },

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

    setSector: (sector) => {
      set({ sector });
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

    removeConnection: (id) => {
      remember('point_removed');
      patchSpace({ connections: get().space.connections.filter((c) => c.id !== id) });
    },

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
      remember('source_removed');
      // A point fed from a source that is being deleted loses its feed rather than keeping a dead id.
      set({
        sources: get().sources.filter((s) => s.id !== id),
        space: { ...get().space, connections: get().space.connections.map((c) => (c.fedBy === id ? { ...c, fedBy: undefined } : c)) },
      });
      persist();
    },

    answer: (questionId, code) => {
      set({ answers: { ...get().answers, [questionId]: code } });
      persist();
    },

    clearAnswer: (questionId) => {
      const { [questionId]: _dropped, ...rest } = get().answers;
      set({ answers: rest });
      persist();
    },

    setPiece: (piece) => {
      // A deep copy, so nothing the editor does later can reach into the room.
      set({ piece: piece ? { name: piece.name, params: JSON.parse(JSON.stringify(piece.params)) as DesignParams } : null });
      persist();
    },

    addRoom: () => {
      const st = get();
      const ids = projectRooms(st).map((r) => r.space.id);
      if (ids.length >= MAX_ROOMS) return;
      const n = Math.max(0, ...ids.map((id) => Number(id.replace(/\D+/g, '')) || 0)) + 1;
      const room = blank();
      room.space = { ...room.space, id: `room_${n}`, nameHe: `חלל ${n}`, nameEn: `Space ${n}` };
      // A new room is on the same floor of the same building until someone says otherwise.
      room.buildingId = st.buildingId;
      room.levelId = st.levelId;
      // …and the same kind of place: the next room of an office is usually an office.
      room.sector = st.sector;
      set({ ...room, others: [...st.others, snapshot(st)], order: [...st.order, room.space.id] });
      persist();
    },

    duplicateRoom: (copies) => {
      const st = get();
      const ids = projectRooms(st).map((r) => r.space.id);
      // Never past what a bill can number: the copies are cut to the room that is left.
      const count = Math.min(Math.max(1, Math.round(copies)), MAX_ROOMS - ids.length);
      if (count < 1) return;
      remember('rooms_duplicated');
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
      remember('room_removed');
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
      remember('finishes_imported');
      const existing = new Map(get().finishes.map((f) => [f.code, f]));
      // A re-imported finish that names no rooms keeps the rooms it already had: a schedule file often
      // carries no room column at all, and importing it must not empty every finish's rooms.
      const merged = specs.map((spec) => (spec.areas.length === 0 && existing.get(spec.code)?.areas.length ? { ...spec, areas: existing.get(spec.code)!.areas } : spec));
      const codes = new Set(specs.map((x) => x.code));
      const kept = get().finishes.filter((f) => !codes.has(f.code));
      set({ finishes: [...kept, ...merged].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })) });
      persist();
    },

    removeFinish: (code) => {
      remember('finish_removed');
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
      remember('project_reset');
      set(blankProject());
      try {
        localStorage.removeItem(storageKey());
      } catch {
        // Nothing to do; the in-memory reset already happened.
      }
    },
  };
});

// Another person signed in, or the last one signed out: the screen shows their work, not the last person's.
onOwnerChange(() => useSurvey.setState({ ...load(), undoable: null }));

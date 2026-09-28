import type { Pt } from '../geometry';
import { polygonArea } from '../geometry';
import type { ServiceKind } from '../equipment/catalog';
import type { Source, Vec3 } from '../types';

/**
 * The room a project happens inside.
 *
 * Until now this engine designed a piece of furniture standing in nothing. A bill of quantities for a
 * hotel cannot be written that way: a water point cannot be counted without a wall to put it on, a
 * run of pipe has no length without somewhere to run from, and "how much paint" has no answer
 * without a surface. The room is the missing container, and almost everything else waits on it.
 *
 * Two rules carried over from the rest of the engine:
 *
 * - **Measured or unknown, never assumed.** A dimension nobody measured is null, and the quantities
 *   that depend on it come back null too rather than plausible.
 * - **Counted, never certified.** A connection point records what is there and where. It never says
 *   whether a layout complies, what diameter a drain needs or how far a socket must sit from water —
 *   those are a licensed trade's to decide, and this engine does not decide them.
 */

/** A wall is an edge of the floor polygon. Some edges have no wall at all — a bar open to a pool deck. */
export interface WallSegment {
  id: string;
  from: Pt;
  to: Pt;
  /** False when the edge is open to the outside or to an adjoining space. */
  built: boolean;
  lengthMm: number;
}

/** A door or a window. Named apart from the furniture `Opening`, which is a void a component fills. */
export interface Aperture {
  id: string;
  kind: 'door' | 'window' | 'pass_through';
  wallId: string;
  /** Distance along the wall from its start, to the near edge. */
  offsetMm: number;
  widthMm: number;
  heightMm: number;
  /** Height of the sill above the floor; 0 for a door. */
  sillMm: number;
}

/** Something that cannot be moved or built into — a structural column, a beam, a riser. */
export interface Obstacle {
  id: string;
  nameHe: string;
  nameEn: string;
  originMm: Vec3;
  sizeMm: Vec3;
  /** A column can be boxed in; a live riser may need access. Stated, never inferred. */
  noteHe?: string;
  noteEn?: string;
}

/**
 * A service that already reaches this room, or one the project will have to bring.
 *
 * The vocabulary is the same `ServiceKind` the equipment catalogue uses, which is what lets a sink's
 * stated need be matched against what the room actually has.
 */
export interface ConnectionPoint {
  id: string;
  kind: ServiceKind;
  /** Where it is. Null when its existence is known but its position was not measured. */
  atMm: Vec3 | null;
  /** True when it is already there; false when the project has to create it. */
  existing: boolean;
  /** What the trade said about it, verbatim. Never a calculated value. */
  noteHe?: string;
  noteEn?: string;
  sources?: Source[];
}

/** A named part of the room, so a bill can be read by where the work happens as well as by trade. */
export interface Zone {
  id: string;
  nameHe: string;
  nameEn: string;
  /** Optional footprint; a zone can be just a name until someone draws it. */
  footprintMm?: Pt[];
}

export interface Space {
  id: string;
  nameHe: string;
  nameEn: string;
  /**
   * Floor outline in mm, either winding. Empty until someone measures the room.
   *
   * These are **plan** coordinates. The engine's `Vec3` has y pointing up, so a plan point's `y` is a
   * `Vec3`'s `z`. Convert with `onFloor` rather than by hand — getting it wrong puts a water point in
   * a wall.
   */
  footprintMm: Pt[];
  /** Floor to ceiling. Null when not measured — quantities that need it then come back null. */
  heightMm: number | null;
  /** Which footprint edges actually carry a wall, by edge index. Absent index = built. */
  openEdges?: number[];
  apertures: Aperture[];
  obstacles: Obstacle[];
  connections: ConnectionPoint[];
  zones: Zone[];
}

/** A point in the room, seen from above. The engine's y is up, so the plan's second axis is z. */
export function onFloor(v: Vec3): Pt {
  return { x: v.x, y: v.z };
}

export function emptySpace(id: string, nameHe: string, nameEn: string): Space {
  return { id, nameHe, nameEn, footprintMm: [], heightMm: null, apertures: [], obstacles: [], connections: [], zones: [] };
}

/** The walls, derived from the floor outline so the two can never disagree. */
export function wallsOf(space: Space): WallSegment[] {
  const n = space.footprintMm.length;
  if (n < 3) return [];
  const open = new Set(space.openEdges ?? []);
  return space.footprintMm.map((from, i) => {
    const to = space.footprintMm[(i + 1) % n];
    return { id: `wall_${i + 1}`, from, to, built: !open.has(i), lengthMm: Math.hypot(to.x - from.x, to.y - from.y) };
  });
}

/** Floor area in m². Null when the room has not been measured. */
export function floorAreaM2(space: Space): number | null {
  if (space.footprintMm.length < 3) return null;
  return polygonArea(space.footprintMm) / 1e6;
}

/**
 * Wall area in m², with doors and windows taken out — the quantity a painter or a cladder is paid by.
 * Null when the ceiling height was never measured, because the answer genuinely is not known.
 */
export function wallAreaM2(space: Space): number | null {
  if (space.heightMm == null) return null;
  const walls = wallsOf(space).filter((w) => w.built);
  if (!walls.length) return null;
  const gross = walls.reduce((a, w) => a + w.lengthMm * space.heightMm!, 0);
  const holes = space.apertures.reduce((a, ap) => a + ap.widthMm * ap.heightMm, 0);
  return Math.max(0, gross - holes) / 1e6;
}

/** Perimeter of the built walls, in metres — skirting, coving, a run of trunking. */
export function builtPerimeterM(space: Space): number | null {
  const walls = wallsOf(space).filter((w) => w.built);
  if (!walls.length) return null;
  return walls.reduce((a, w) => a + w.lengthMm, 0) / 1000;
}

export interface ConnectionMatch {
  kind: ServiceKind;
  /** How many the equipment asked for. */
  required: number;
  /** How many the room already has. */
  existing: number;
  /** How many the project has to create — never negative. */
  toCreate: number;
  /** Straight-line distance to the nearest existing point of this kind, in mm. Null when unknown. */
  nearestMm: number | null;
}

/**
 * What a room already provides against what the equipment in it needs.
 *
 * This is the first thing the space model makes possible and the reason it blocks the rest: the new
 * points a project has to create are bill-of-quantities lines, and they cannot be counted without
 * knowing what is already there.
 *
 * `nearestMm` is a straight line between two points. It is **not** a pipe length and not a route —
 * routing a drain is licensed design, and the number here exists to tell a person "the nearest drain
 * is nine metres away", which is a fact about the room, not a proposal.
 */
export function matchServices(space: Space, required: { kind: ServiceKind; quantity: number }[], atMm?: Vec3): ConnectionMatch[] {
  return required.map(({ kind, quantity }) => {
    const points = space.connections.filter((c) => c.kind === kind && c.existing);
    const measured = points.filter((c) => c.atMm != null);
    const nearestMm =
      atMm && measured.length
        ? Math.min(...measured.map((c) => Math.hypot(c.atMm!.x - atMm.x, c.atMm!.y - atMm.y, c.atMm!.z - atMm.z)))
        : null;
    return { kind, required: quantity, existing: points.length, toCreate: Math.max(0, quantity - points.length), nearestMm };
  });
}

/** Whether a point lies inside the room's floor outline — ray casting, holes not supported. */
export function insideFootprint(space: Space, at: Pt): boolean {
  const poly = space.footprintMm;
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const crosses = a.y > at.y !== b.y > at.y && at.x < ((b.x - a.x) * (at.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Obstacles a proposed box would run into. A column is not a suggestion. */
export function obstaclesHitBy(space: Space, originMm: Vec3, sizeMm: Vec3): Obstacle[] {
  const overlaps = (aMin: number, aSize: number, bMin: number, bSize: number) => aMin < bMin + bSize && bMin < aMin + aSize;
  return space.obstacles.filter(
    (o) =>
      overlaps(originMm.x, sizeMm.x, o.originMm.x, o.sizeMm.x) &&
      overlaps(originMm.y, sizeMm.y, o.originMm.y, o.sizeMm.y) &&
      overlaps(originMm.z, sizeMm.z, o.originMm.z, o.sizeMm.z),
  );
}

/** Everything about the room that is not yet known, in the words a person would use to go and measure it. */
export function whatIsMissing(space: Space): { field: string; he: string; en: string }[] {
  const gaps: { field: string; he: string; en: string }[] = [];
  if (space.footprintMm.length < 3) gaps.push({ field: 'footprint', he: 'מידות החלל לא נמדדו', en: 'The room has not been measured' });
  if (space.heightMm == null) gaps.push({ field: 'height', he: 'גובה התקרה לא נמדד', en: 'The ceiling height has not been measured' });
  if (!space.connections.length) gaps.push({ field: 'connections', he: 'לא נרשמו נקודות חיבור קיימות', en: 'No existing connection points were recorded' });
  for (const c of space.connections) {
    if (c.existing && c.atMm == null) {
      gaps.push({ field: `connection:${c.id}`, he: `מיקום נקודת החיבור ${c.id} לא נמדד`, en: `The position of connection point ${c.id} was not measured` });
    }
  }
  return gaps;
}

export interface SpaceProblem {
  code: string;
  severity: 'red' | 'yellow';
  subject: string;
  he: string;
  en: string;
}

/**
 * Measurement errors in the room itself.
 *
 * `wallAreaM2` clamps at zero and `insideFootprint` quietly answers false, which is the right
 * behaviour for a calculation but the wrong behaviour for a survey: a window recorded as 3 m wide on a
 * 2.4 m wall is a mistake somebody has to go and correct, and absorbing it produces a bill whose
 * quantities are wrong in a way nobody can see. This is the only place in the space model that says
 * something is wrong — and it says it about the measurements, never about the design.
 */
export function spaceProblems(space: Space): SpaceProblem[] {
  const problems: SpaceProblem[] = [];
  const walls = new Map(wallsOf(space).map((w) => [w.id, w]));

  for (const ap of space.apertures) {
    const wall = walls.get(ap.wallId);
    if (!wall) {
      problems.push({
        code: 'aperture_on_no_wall',
        severity: 'red',
        subject: ap.id,
        he: `הפתח ${ap.id} משויך לקיר ${ap.wallId} שאינו קיים`,
        en: `Aperture ${ap.id} is on wall ${ap.wallId}, which does not exist`,
      });
      continue;
    }
    if (ap.offsetMm + ap.widthMm > wall.lengthMm + 1) {
      problems.push({
        code: 'aperture_past_wall_end',
        severity: 'red',
        subject: ap.id,
        he: `הפתח ${ap.id} חורג מקצה הקיר — בדוק את המידה`,
        en: `Aperture ${ap.id} runs past the end of its wall — check the measurement`,
      });
    }
    if (space.heightMm != null && ap.sillMm + ap.heightMm > space.heightMm + 1) {
      problems.push({
        code: 'aperture_past_ceiling',
        severity: 'red',
        subject: ap.id,
        he: `הפתח ${ap.id} גבוה מהתקרה — בדוק את המידה`,
        en: `Aperture ${ap.id} is taller than the ceiling — check the measurement`,
      });
    }
  }

  // Two apertures cannot occupy the same stretch of the same wall.
  for (const wallId of new Set(space.apertures.map((a) => a.wallId))) {
    const onWall = space.apertures.filter((a) => a.wallId === wallId).sort((a, b) => a.offsetMm - b.offsetMm);
    for (let i = 1; i < onWall.length; i++) {
      const prev = onWall[i - 1];
      if (onWall[i].offsetMm < prev.offsetMm + prev.widthMm - 1) {
        problems.push({
          code: 'apertures_overlap',
          severity: 'red',
          subject: `${prev.id}+${onWall[i].id}`,
          he: `הפתחים ${prev.id} ו-${onWall[i].id} חופפים על אותו קיר`,
          en: `Apertures ${prev.id} and ${onWall[i].id} overlap on the same wall`,
        });
      }
    }
  }

  for (const o of space.obstacles) {
    const centre = onFloor({ x: o.originMm.x + o.sizeMm.x / 2, y: 0, z: o.originMm.z + o.sizeMm.z / 2 });
    if (space.footprintMm.length >= 3 && !insideFootprint(space, centre)) {
      problems.push({
        code: 'obstacle_outside_room',
        severity: 'yellow',
        subject: o.id,
        he: `${o.nameHe} ממוקם מחוץ למידות החלל — בדוק את נקודת הייחוס`,
        en: `${o.nameEn} sits outside the measured room — check the reference point`,
      });
    }
  }

  for (const c of space.connections) {
    if (c.atMm && space.footprintMm.length >= 3 && !insideFootprint(space, onFloor(c.atMm))) {
      problems.push({
        code: 'connection_outside_room',
        severity: 'yellow',
        subject: c.id,
        he: `נקודת החיבור ${c.id} ממוקמת מחוץ למידות החלל — בדוק את נקודת הייחוס`,
        en: `Connection point ${c.id} sits outside the measured room — check the reference point`,
      });
    }
  }

  return problems;
}

import type { Component, Vec3 } from './types';

/**
 * Geometry the validator can reason about, including boards that are not axis-aligned.
 *
 * Until now every geometric check was a bounding-box test on `origin + size`, and callers had to
 * filter rotated members out of it — a rotated board's bounding box overlaps its neighbours even
 * when the board itself does not. That left every angled member (roof rafters today, an angled leg
 * or a rocking chair tomorrow) with no geometric checking at all, while still reporting GREEN.
 *
 * A component is a box that may be rotated about the z axis through its own centre, so its footprint
 * in the xy plane is a convex quad and its z extent is an interval. That is enough to compute real
 * intersection and real contact.
 */

export interface Pt {
  x: number;
  y: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The corners of a component's real xy footprint, counter-clockwise, after its own rotation.
 *
 * Square-ended boards give a rectangle. A board with angled ends gives the shape actually cut, so a
 * rafter mitred against a ridge neither reports overlapping it nor floating away from it.
 */
export function cornersXY(c: Component): Pt[] {
  const cx = c.origin.x + c.size.x / 2;
  const cy = c.origin.y + c.size.y / 2;
  const hx = c.size.x / 2;
  const hy = c.size.y / 2;
  const tanStart = Math.tan(rad(c.endCutDeg?.start ?? 0));
  const tanEnd = Math.tan(rad(c.endCutDeg?.end ?? 0));
  const a = rad(c.rotationZDeg ?? 0);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    { x: -hx + -hy * tanStart, y: -hy },
    { x: hx + -hy * tanEnd, y: -hy },
    { x: hx + hy * tanEnd, y: hy },
    { x: -hx + hy * tanStart, y: hy },
  ].map((p) => ({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }));
}

/** Extra length an angled end takes out of the board that has to be ordered, in mm. */
export function angledEndAllowanceMm(c: Component): number {
  const spread = Math.abs(Math.tan(rad(c.endCutDeg?.start ?? 0))) + Math.abs(Math.tan(rad(c.endCutDeg?.end ?? 0)));
  return (c.size.y / 2) * spread;
}

/** Signed area doubled; positive for counter-clockwise. */
function shoelace2(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

export function polygonArea(poly: Pt[]): number {
  return Math.abs(shoelace2(poly)) / 2;
}

/**
 * Sutherland–Hodgman: clip `subject` by every edge of the convex `clip`.
 * Both polygons must be convex and counter-clockwise, which every component footprint is.
 */
export function clipPolygon(subject: Pt[], clip: Pt[]): Pt[] {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    // Positive side of the directed edge a→b is inside, for a counter-clockwise clip polygon.
    const side = (p: Pt) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const sCur = side(cur);
      const sPrev = side(prev);
      if (sCur >= 0) {
        if (sPrev < 0) out.push(intersect(prev, cur, sPrev, sCur));
        out.push(cur);
      } else if (sPrev >= 0) {
        out.push(intersect(prev, cur, sPrev, sCur));
      }
    }
  }
  return out;
}

function intersect(p: Pt, q: Pt, sp: number, sq: number): Pt {
  const t = sp / (sp - sq);
  return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
}

/** Overlap of the two z intervals, in mm; negative when they are apart. */
function zOverlap(a: Component, b: Component): number {
  return Math.min(a.origin.z + a.size.z, b.origin.z + b.size.z) - Math.max(a.origin.z, b.origin.z);
}

/**
 * Volume two components share, in mm³. Boards that merely touch share zero volume, which is what
 * makes this usable as an error test: any positive result is material in the same place twice.
 */
export function overlapVolumeMm3(a: Component, b: Component): number {
  const dz = zOverlap(a, b);
  if (dz <= 0) return 0;
  const area = polygonArea(clipPolygon(cornersXY(a), cornersXY(b)));
  return area * dz;
}

/**
 * Pairs of components whose material occupies the same space.
 *
 * `minVolumeMm3` ignores slivers from rounding: a 1 cm³ overlap is a real modelling error, a
 * thousandth of that is two boards meeting at a mitre.
 */
export function findOverlaps(components: Component[], minVolumeMm3 = 1000): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      if (overlapVolumeMm3(components[i], components[j]) > minVolumeMm3) pairs.push([components[i].id, components[j].id]);
    }
  }
  return pairs;
}

/**
 * Area over which two components touch, in mm². Faces that are apart by less than `gapMm` count as
 * touching, because ordered sizes are whole centimetres and joints land a fraction of a millimetre off.
 */
export function contactAreaMm2(a: Component, b: Component, gapMm = 0.6): number {
  // Along z: either the boards' z ranges overlap (side by side in the xy plane) or they meet face to face.
  const dz = zOverlap(a, b);
  const xyArea = polygonArea(clipPolygon(cornersXY(a), cornersXY(b)));

  // Face to face across z: their xy footprints overlap and their z faces are within the gap.
  if (dz <= 0 && dz > -gapMm && xyArea > 0) return xyArea;

  if (dz <= 0) return 0;

  // Side by side: grow one footprint by the gap and measure how much of the seam the other covers.
  // Measured both ways and kept at the larger, so contact is the same fact whichever board asks.
  const seam = Math.max(
    polygonArea(clipPolygon(expand(cornersXY(a), gapMm), cornersXY(b))),
    polygonArea(clipPolygon(expand(cornersXY(b), gapMm), cornersXY(a))),
  ) - xyArea;
  if (seam <= 0) return 0;
  // The seam is a band `gapMm` wide along the shared edge; its length times the shared z depth is the contact.
  return (seam / gapMm) * dz;
}

/**
 * Push every EDGE of a convex counter-clockwise polygon outwards by `d`.
 *
 * Offsetting the vertices radially from the centroid instead would barely widen a long thin board —
 * its corners point almost along its length — so a 960 x 18 shelf would appear not to reach the
 * panel 1.5 mm away, and contact would come out different depending on which board you asked about.
 */
function expand(poly: Pt[], d: number): Pt[] {
  const n = poly.length;
  // Each edge becomes a line moved out along its own outward normal; the new corners are where
  // consecutive moved lines cross.
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Interior is left of a→b for a counter-clockwise ring, so the outward normal is (dy, -dx).
    const nx = dy / len;
    const ny = -dx / len;
    return { a: { x: a.x + nx * d, y: a.y + ny * d }, dir: { x: dx, y: dy } };
  });
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i + n - 1) % n];
    const cur = lines[i];
    const cross = prev.dir.x * cur.dir.y - prev.dir.y * cur.dir.x;
    if (Math.abs(cross) < 1e-9) {
      out.push(cur.a);
      continue;
    }
    const t = ((cur.a.x - prev.a.x) * cur.dir.y - (cur.a.y - prev.a.y) * cur.dir.x) / cross;
    out.push({ x: prev.a.x + prev.dir.x * t, y: prev.a.y + prev.dir.y * t });
  }
  return out;
}

/** Lowest point of a component in y, accounting for its rotation. */
export function lowestY(c: Component): number {
  return Math.min(...cornersXY(c).map((p) => p.y));
}

export interface SupportOptions {
  /** Floor height; a component reaching it is held up by the ground. */
  floorYMm?: number;
  /**
   * How far apart two boards may sit and still count as joined.
   *
   * Parts are ordered in whole centimetres, so a board screwed into an opening is up to half an
   * ordering step narrower than the opening it fills. Anything further apart than that is not a
   * joint with a tolerance — it is a part that touches nothing.
   */
  gapMm?: number;
  minContactMm2?: number;
}

export interface SupportReport {
  /** Components with no chain of contact back to the floor — a lone board or a whole sub-assembly. */
  floating: string[];
  /** Contact area each component has with the floor and with its neighbours, in mm². */
  contact: Map<string, number>;
}

/**
 * Which components are held up by the ground, directly or through the parts they touch.
 *
 * Support has to be traced from the floor rather than measured locally: two boards screwed to each
 * other and to nothing else hold each other up in the arithmetic and hang in mid-air in the room.
 * So contact builds a graph, the parts reaching the floor seed it, and whatever the flood does not
 * reach is floating — a single board or a whole sub-assembly.
 *
 * Every piece of furniture in the catalog stands on the floor. A wall-mounted piece will need an
 * anchor to seed this the way the floor does; until then it would correctly report as unsupported.
 */
export function supportReport(components: Component[], options: SupportOptions = {}): SupportReport {
  const { floorYMm = 0, gapMm = 0.6, minContactMm2 = 100 } = options;
  const solid = components.filter((c) => !c.reference);
  const contact = new Map<string, number>();
  const touches = new Map<string, string[]>();
  for (const c of solid) {
    contact.set(c.id, 0);
    touches.set(c.id, []);
  }

  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const area = contactAreaMm2(solid[i], solid[j], gapMm);
      if (area < minContactMm2) continue;
      contact.set(solid[i].id, (contact.get(solid[i].id) ?? 0) + area);
      contact.set(solid[j].id, (contact.get(solid[j].id) ?? 0) + area);
      touches.get(solid[i].id)!.push(solid[j].id);
      touches.get(solid[j].id)!.push(solid[i].id);
    }
  }

  // A part hung on hardware touches nothing, so its fastenings are edges in the graph too.
  for (const c of solid) {
    for (const id of c.fastenedTo ?? []) {
      if (!touches.has(id)) continue;
      touches.get(c.id)!.push(id);
      touches.get(id)!.push(c.id);
    }
  }

  const grounded = new Set<string>();
  const queue = solid.filter((c) => lowestY(c) <= floorYMm + gapMm).map((c) => c.id);
  for (const id of queue) grounded.add(id);
  while (queue.length) {
    for (const next of touches.get(queue.pop()!) ?? []) {
      if (grounded.has(next)) continue;
      grounded.add(next);
      queue.push(next);
    }
  }

  return {
    floating: solid.filter((c) => !grounded.has(c.id)).map((c) => c.id),
    contact,
  };
}

/** Overall bounding box of a set of components, honouring rotation. */
export function boundsOf(components: Component[]): { min: Vec3; max: Vec3 } {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (const c of components) {
    for (const p of cornersXY(c)) {
      xs.push(p.x);
      ys.push(p.y);
    }
    zs.push(c.origin.z, c.origin.z + c.size.z);
  }
  return {
    min: { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) },
    max: { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) },
  };
}

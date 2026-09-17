import type { Component } from '../engine';

/**
 * Isometric line drawings of the model for printed assembly steps. Pure 2D geometry (no WebGL), so the
 * drawings are deterministic, testable and print crisply.
 *
 * Screen axes: x' = (x − z)·cos30°, y'(down) = −y + (x + z)·sin30°. The viewer looks along −(1, 1, 1),
 * so the faces facing +x, +y and +z of an unrotated box are the visible ones.
 */
const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
const VIEW: [number, number, number] = [1, 1, 1];

export type Shade = 'top' | 'front' | 'side';

export interface Face {
  componentId: string;
  points: [number, number][];
  shade: Shade;
}

export interface Drawing {
  faces: Face[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

type V3 = [number, number, number];

export function project([x, y, z]: V3): [number, number] {
  return [(x - z) * C30, -y + (x + z) * S30];
}

/** The 8 corners of a component box in model space, with its z-axis rotation applied about the box centre. */
export function corners(c: Pick<Component, 'origin' | 'size' | 'rotationZDeg'>): V3[] {
  const { origin: o, size: s } = c;
  const cx = o.x + s.x / 2;
  const cy = o.y + s.y / 2;
  const a = ((c.rotationZDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const out: V3[] = [];
  for (const dx of [0, 1]) for (const dy of [0, 1]) for (const dz of [0, 1]) {
    const x = o.x + dx * s.x - cx;
    const y = o.y + dy * s.y - cy;
    out.push([cx + x * cos - y * sin, cy + x * sin + y * cos, o.z + dz * s.z]);
  }
  return out;
}

// Corner indices (dx, dy, dz as bits 4, 2, 1) of each face, wound in order, with its unrotated outward normal.
const FACES: { idx: [number, number, number, number]; normal: V3 }[] = [
  { idx: [4, 5, 7, 6], normal: [1, 0, 0] },
  { idx: [0, 2, 3, 1], normal: [-1, 0, 0] },
  { idx: [2, 6, 7, 3], normal: [0, 1, 0] },
  { idx: [0, 1, 5, 4], normal: [0, -1, 0] },
  { idx: [1, 3, 7, 5], normal: [0, 0, 1] },
  { idx: [0, 4, 6, 2], normal: [0, 0, -1] },
];

function rotateNormal([x, y, z]: V3, deg: number): V3 {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Visible faces of every component, back to front (painter's order by box centre). */
export function drawComponents(components: Pick<Component, 'id' | 'origin' | 'size' | 'rotationZDeg'>[]): Drawing {
  const depth = (c: (typeof components)[number]) => dot([c.origin.x + c.size.x / 2, c.origin.y + c.size.y / 2, c.origin.z + c.size.z / 2], VIEW);
  const faces: Face[] = [];
  for (const c of [...components].sort((a, b) => depth(a) - depth(b))) {
    const pts = corners(c);
    for (const f of FACES) {
      const n = rotateNormal(f.normal, c.rotationZDeg ?? 0);
      if (dot(n, VIEW) <= 1e-6) continue;
      const shade: Shade = Math.abs(n[1]) >= Math.abs(n[0]) && Math.abs(n[1]) >= Math.abs(n[2]) ? 'top' : Math.abs(n[2]) >= Math.abs(n[0]) ? 'front' : 'side';
      faces.push({ componentId: c.id, points: f.idx.map((i) => project(pts[i])), shade });
    }
  }
  const xs = faces.flatMap((f) => f.points.map((p) => p[0]));
  const ys = faces.flatMap((f) => f.points.map((p) => p[1]));
  return {
    faces,
    bounds: xs.length ? { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } : { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  };
}

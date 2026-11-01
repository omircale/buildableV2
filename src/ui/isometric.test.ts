import { describe, expect, it } from 'vitest';
import { corners, drawComponents, project } from './isometric';

const box = (id: string, x: number, y: number, z: number, sx = 100, sy = 100, sz = 100, rotationZDeg?: number) => ({ id, origin: { x, y, z }, size: { x: sx, y: sy, z: sz }, rotationZDeg });

describe('isometric assembly drawings', () => {
  it('projects the model axes the expected way (x right-down, z left-down, y up)', () => {
    expect(project([0, 0, 0])).toEqual([0, 0]);
    const [xRight, xDown] = project([100, 0, 0]);
    expect(xRight).toBeGreaterThan(0);
    expect(xDown).toBeGreaterThan(0);
    const [zLeft, zDown] = project([0, 0, 100]);
    expect(zLeft).toBeLessThan(0);
    expect(zDown).toBeGreaterThan(0);
    expect(project([0, 100, 0])[1]).toBe(-100);
  });

  it('a box shows exactly its top, front and side faces', () => {
    const d = drawComponents([box('a', 0, 0, 0)]);
    expect(d.faces.map((f) => f.shade).sort()).toEqual(['front', 'side', 'top']);
  });

  it('a rotated box keeps its size; at 45° one face turns edge-on and is dropped', () => {
    const c = box('r', 0, 0, 0, 400, 100, 18, 45);
    const pts = corners(c);
    // Corner 4 differs from corner 0 along the box's own x edge.
    const dist = Math.hypot(pts[4][0] - pts[0][0], pts[4][1] - pts[0][1], pts[4][2] - pts[0][2]);
    expect(dist).toBeCloseTo(400, 6);
    expect(drawComponents([c]).faces).toHaveLength(2);
    expect(drawComponents([{ ...c, rotationZDeg: 30 }]).faces).toHaveLength(3);
  });

  it('draws far boxes before near ones', () => {
    const d = drawComponents([box('near', 500, 0, 500), box('far', 0, 0, 0)]);
    expect(d.faces[0].componentId).toBe('far');
    expect(d.faces.at(-1)!.componentId).toBe('near');
  });
});

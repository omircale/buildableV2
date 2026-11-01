import { describe, expect, it } from 'vitest';
import { contactAreaMm2, findOverlaps, lowestY, overlapVolumeMm3, polygonArea, cornersXY, supportReport } from './geometry';
import type { Component } from './types';

/** A plain board; `rot` rotates it about the z axis through its own centre. */
function board(id: string, origin: [number, number, number], size: [number, number, number], rot?: number): Component {
  return {
    id,
    name: id,
    role: 'shelf',
    materialId: 'm',
    thicknessMm: 18,
    origin: { x: origin[0], y: origin[1], z: origin[2] },
    size: { x: size[0], y: size[1], z: size[2] },
    ...(rot === undefined ? {} : { rotationZDeg: rot }),
  };
}

describe('footprint', () => {
  it('an unrotated board keeps its corners', () => {
    const pts = cornersXY(board('a', [0, 0, 0], [100, 50, 18]));
    expect(polygonArea(pts)).toBeCloseTo(100 * 50, 6);
    expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(0, 6);
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(50, 6);
  });

  it('rotation is about the centre and preserves area', () => {
    const c = board('a', [0, 0, 0], [100, 50, 18], 45);
    expect(polygonArea(cornersXY(c))).toBeCloseTo(100 * 50, 6);
    // The centre does not move.
    const pts = cornersXY(c);
    const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
    expect(cx).toBeCloseTo(50, 6);
  });

  it('lowestY accounts for rotation', () => {
    // A 100 x 20 board turned 45° dips below its unrotated bottom edge.
    expect(lowestY(board('a', [0, 100, 0], [100, 20, 18], 45))).toBeLessThan(100);
  });
});

describe('overlap', () => {
  it('boards that merely touch do not overlap', () => {
    const a = board('a', [0, 0, 0], [100, 100, 18]);
    const b = board('b', [100, 0, 0], [100, 100, 18]);
    expect(overlapVolumeMm3(a, b)).toBe(0);
    expect(findOverlaps([a, b])).toEqual([]);
  });

  it('boards in the same place overlap', () => {
    const a = board('a', [0, 0, 0], [100, 100, 18]);
    const b = board('b', [50, 0, 0], [100, 100, 18]);
    expect(overlapVolumeMm3(a, b)).toBeCloseTo(50 * 100 * 18, 6);
    expect(findOverlaps([a, b])).toEqual([['a', 'b']]);
  });

  it('boards apart in z never overlap however they sit in xy', () => {
    const a = board('a', [0, 0, 0], [100, 100, 18]);
    const b = board('b', [0, 0, 18], [100, 100, 18]);
    expect(overlapVolumeMm3(a, b)).toBe(0);
  });

  /**
   * The case the old bounding-box test could not see. Two boards crossing at 90° in the same plane
   * genuinely share material; the old check was told to skip any rotated member, so it reported nothing.
   */
  it('finds material shared between two rotated boards', () => {
    const a = board('a', [0, 0, 0], [400, 100, 18], 45);
    const b = board('b', [0, 0, 0], [400, 100, 18], -45);
    expect(overlapVolumeMm3(a, b)).toBeGreaterThan(100 * 100 * 18 * 0.5);
    expect(findOverlaps([a, b])).toEqual([['a', 'b']]);
  });

  it('a rotated board clear of its neighbour is not a false positive', () => {
    // Bounding boxes overlap; the boards themselves do not.
    const a = board('a', [0, 0, 0], [400, 40, 18], 45);
    const b = board('b', [260, 260, 0], [60, 60, 18]);
    expect(overlapVolumeMm3(a, b)).toBe(0);
  });
});

describe('contact and support', () => {
  it('a board on the floor is supported', () => {
    const a = board('a', [0, 0, 0], [100, 500, 18]);
    expect(supportReport([a]).floating).toEqual([]);
  });

  it('a board resting on another is supported', () => {
    const post = board('post', [0, 0, 0], [100, 500, 18]);
    const beam = board('beam', [0, 500, 0], [400, 100, 18]);
    expect(contactAreaMm2(post, beam)).toBeGreaterThan(100);
    expect(supportReport([post, beam]).floating).toEqual([]);
  });

  /** The Montessori ridge board: in mid-air above the rafters, touching nothing. */
  it('a board floating above everything is reported', () => {
    const post = board('post', [0, 0, 0], [100, 500, 18]);
    const floater = board('ridge', [0, 535, 0], [400, 100, 18]);
    expect(contactAreaMm2(post, floater)).toBe(0);
    expect(supportReport([post, floater]).floating).toEqual(['ridge']);
  });

  it('a gap under a millimetre still counts as contact', () => {
    const post = board('post', [0, 0, 0], [100, 500, 18]);
    const beam = board('beam', [0, 500.4, 0], [400, 100, 18]);
    expect(supportReport([post, beam]).floating).toEqual([]);
  });

  /**
   * The hole a local contact measurement leaves: two boards screwed to each other and to nothing
   * else hold each other up in the arithmetic while hanging in mid-air in the room.
   */
  it('a pair of boards touching only each other is still floating', () => {
    const a = board('a', [0, 900, 0], [400, 18, 300]);
    const b = board('b', [0, 918, 0], [400, 18, 300]);
    expect(contactAreaMm2(a, b)).toBeGreaterThan(100);
    expect(supportReport([a, b]).floating).toEqual(['a', 'b']);
  });

  it('a stack standing on the floor is supported all the way up', () => {
    const base = board('base', [0, 0, 0], [400, 300, 300]);
    const mid = board('mid', [0, 300, 0], [400, 18, 300]);
    const top = board('top', [0, 318, 0], [400, 18, 300]);
    expect(supportReport([base, mid, top]).floating).toEqual([]);
  });

  it('reference components neither float nor hold anything up', () => {
    const mattress: Component = { ...board('mattress', [0, 900, 0], [700, 100, 1600]), reference: true };
    expect(supportReport([mattress]).floating).toEqual([]);
  });
});

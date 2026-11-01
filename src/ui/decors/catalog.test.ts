import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DECOR_CATALOG, decorFacets, filterDecors } from './catalog';

const files = new Set(readdirSync('public/decors'));

describe('distributor decor catalog', () => {
  it('every entry points at an image that is actually in the project', () => {
    expect(DECOR_CATALOG.decors.length).toBeGreaterThan(100);
    for (const d of DECOR_CATALOG.decors) {
      expect(files.has(d.image.replace('decors/', '')), `${d.code} → ${d.image}`).toBe(true);
    }
  });

  it('every entry keeps its source and permission trail, so an image can be traced or removed', () => {
    expect(DECOR_CATALOG.permission).toMatch(/permission/i);
    expect(DECOR_CATALOG.attribution.length).toBeGreaterThan(5);
    for (const d of DECOR_CATALOG.decors) {
      expect(d.sourceUrl).toMatch(/^https:/);
      expect(d.imageSourceUrl).toMatch(/^https:/);
      expect(d.code).toBeTruthy();
      expect(d.nameHe).toBeTruthy();
    }
  });

  it('codes are unique', () => {
    const codes = DECOR_CATALOG.decors.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('filters by material, family, finish and free text (including the code)', () => {
    const all = DECOR_CATALOG.decors;
    const wood = filterDecors(all, { family: 'wood' });
    expect(wood.length).toBeGreaterThan(10);
    expect(wood.every((d) => d.family === 'wood')).toBe(true);
    const hpl = filterDecors(all, { materialType: 'hpl' });
    expect(hpl.every((d) => d.materialType === 'hpl')).toBe(true);
    const byCode = filterDecors(all, { query: all[0].code.toLowerCase() });
    expect(byCode.map((d) => d.code)).toContain(all[0].code);
    expect(filterDecors(all, { query: 'אלון' }).length).toBeGreaterThan(3);
    expect(filterDecors(all, { query: 'זזזזז' })).toHaveLength(0);
  });

  it('offers facets for the filter chips, most common first', () => {
    const families = decorFacets(DECOR_CATALOG.decors, 'family');
    expect(families[0]).toBe('solid');
    expect(families).toContain('wood');
  });
});

describe('how a previewed finish is mapped onto a part', () => {
  it('keeps a real-world tile size and stands the grain up on upright parts', async () => {
    const { decorTiling, TILE_M } = await import('./useDecorTexture');
    // A 76 x 1.8 x 29 cm shelf: the visible face is 0.76 x 0.29 m.
    const shelf = decorTiling({ x: 760, y: 18, z: 290 });
    expect(shelf.repeat[0]).toBeCloseTo(0.76 / TILE_M, 5);
    expect(shelf.repeat[1]).toBeCloseTo(0.29 / TILE_M, 5);
    expect(shelf.rotation).toBe(0);
    // A side panel is cut with the grain running up.
    expect(decorTiling({ x: 18, y: 1800, z: 290 }, 'y').rotation).toBeCloseTo(Math.PI / 2, 5);
    // A tiny part still shows a readable piece of the pattern.
    expect(decorTiling({ x: 50, y: 18, z: 50 }).repeat[0]).toBeGreaterThanOrEqual(0.35);
  });
});

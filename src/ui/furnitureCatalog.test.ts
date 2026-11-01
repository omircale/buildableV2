import { describe, expect, test } from 'vitest';
import { runDesign } from '../engine';
import { FURNITURE_TYPES, fitsSpace, presetFor, type SpaceCm } from './furnitureCatalog';

const ANY: SpaceCm = { w: null, h: null, d: null };
const openShelf = FURNITURE_TYPES.find((f) => f.kind === 'open_shelf')!;

describe('fitsSpace (home screen "how much space do you have" filter)', () => {
  test('an empty space (nothing typed yet) fits everything', () => {
    for (const t of FURNITURE_TYPES) expect(fitsSpace(t, ANY)).toBe(true);
  });

  test('a space exactly at the minimum still fits', () => {
    expect(fitsSpace(openShelf, { w: openShelf.minCm.w, h: openShelf.minCm.h, d: openShelf.minCm.d })).toBe(true);
  });

  test('a space one centimetre short on any single dimension excludes the item', () => {
    expect(fitsSpace(openShelf, { w: openShelf.minCm.w - 1, h: ANY.h, d: ANY.d })).toBe(false);
    expect(fitsSpace(openShelf, { w: ANY.w, h: openShelf.minCm.h - 1, d: ANY.d })).toBe(false);
    expect(fitsSpace(openShelf, { w: ANY.w, h: ANY.h, d: openShelf.minCm.d - 1 })).toBe(false);
  });

  test('every catalog entry declares a well-formed minimum size', () => {
    for (const t of FURNITURE_TYPES) {
      expect(t.minCm.w).toBeGreaterThan(0);
      expect(t.minCm.h).toBeGreaterThan(0);
      expect(t.minCm.d).toBeGreaterThan(0);
    }
  });

  test('every available type has a preset that builds; only the pull-up station is blocked', () => {
    const available = FURNITURE_TYPES.filter((f) => f.available);
    expect(available.length).toBeGreaterThanOrEqual(15);
    for (const type of available) {
      const p = presetFor(type, ANY)!;
      expect(p, type.kind).toBeTruthy();
      expect(runDesign(p).report.exportBlocked, type.kind).toBe(type.kind === 'pullup');
    }
  });

  test('the user space sizes shelf-family presets', () => {
    const p = presetFor(openShelf, { w: 120, h: 90, d: 40 })!;
    expect(p).toMatchObject({ widthMm: 1200, heightMm: 900, depthMm: 400 });
  });
});

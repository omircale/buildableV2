import { describe, expect, it } from 'vitest';
import { DEFAULT_OPEN_SHELF, runDesign } from './index';
import { SYSTEM32, pinHoleCount } from './templates/openShelf';

const pins = { ...DEFAULT_OPEN_SHELF, shelfMounting: 'pins' as const };

describe('adjustable shelves on 32 mm line-bored supports', () => {
  it('uses the 32 mm system values from the source', () => {
    expect(SYSTEM32).toEqual({ pitchMm: 32, holeDiameterMm: 5, setbackMm: 37, holeDepthMm: [12, 14] });
  });

  it('hole count: first hole 64 mm up, then every 32 mm, leaving 64 mm at the top', () => {
    // Interior 1764 mm: (1764 - 128) / 32 = 51.1 → 51 steps → 52 holes.
    expect(pinHoleCount(1764)).toBe(52);
    expect(pinHoleCount(100)).toBe(0);
  });

  it('loose shelves are one whole centimetre shorter than the bay and centred in it', () => {
    const r = runDesign(pins);
    const bottom = r.model.components.find((c) => c.id === 'bottom')!;
    const shelf = r.model.components.find((c) => c.id === 'shelf_1')!;
    expect(bottom.size.x - shelf.size.x).toBe(10);
    expect(shelf.origin.x - bottom.origin.x).toBe(5);
    expect(shelf.spanMm).toBe(bottom.size.x);
  });

  it('sides get drilling notes on one face, dividers on both faces offset by half a pitch', () => {
    const r = runDesign({ ...pins, dividerCount: 1, widthMm: 1200 }, undefined, 'en');
    const side = r.model.parts.find((p) => p.componentIds.includes('side_l'))!;
    const divider = r.model.parts.find((p) => p.componentIds.includes('divider_1'))!;
    expect(side.machining!.join()).toContain('inner face only');
    expect(side.machining!.join()).toContain('Ø5 mm');
    expect(divider.machining!.join()).toContain('offset by 16 mm');
  });

  it('adds 4 supports per shelf, removes shelf screws, and changes the assembly step', () => {
    const fixed = runDesign(DEFAULT_OPEN_SHELF);
    const loose = runDesign(pins);
    expect(loose.model.hardware.find((h) => h.id === 'shelf_pin')!.quantity).toBe(3 * 4);
    expect(fixed.model.hardware.find((h) => h.id === 'shelf_pin')).toBeUndefined();
    const screws = (r: typeof fixed) => r.model.hardware.find((h) => h.id === 'joint_screw')!.quantity;
    expect(screws(loose)).toBeLessThan(screws(fixed));
    expect(loose.assembly.some((s) => s.hardware.includes('shelf_pin'))).toBe(true);
  });

  it('shelves stay structurally checked and the clearance note is shown', () => {
    const r = runDesign(pins);
    expect(r.report.checks.some((c) => c.id.startsWith('structure.deflection') && c.componentIds.includes('shelf_1'))).toBe(true);
    expect(r.report.checks.find((c) => c.id === 'assembly.shelf_pins')!.title).toContain('5');
    expect(r.report.exportBlocked).toBe(false);
  });
});

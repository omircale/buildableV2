import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BENCH,
  DEFAULT_CHAIR,
  DEFAULT_COFFEE_TABLE,
  DEFAULT_CONFIG,
  DEFAULT_DESK,
  DEFAULT_DOUBLE_BED,
  DEFAULT_FLOOR_BED,
  DEFAULT_KIDS_CHAIR,
  DEFAULT_NIGHTSTAND,
  DEFAULT_OPEN_SHELF,
  DEFAULT_PULLUP,
  DEFAULT_SINGLE_BED,
  applyChange,
  bedLayout,
  hingesForDoor,
  runDesign,
  withDefaults,
  type BedParams,
  type DesignParams,
} from './index';
import { findOverlaps } from './validation/validate';

const PRESETS: [string, DesignParams][] = [
  ['single bed', DEFAULT_SINGLE_BED],
  ['double bed', DEFAULT_DOUBLE_BED],
  ['floor bed', DEFAULT_FLOOR_BED],
  ['desk', DEFAULT_DESK],
  ['bench', DEFAULT_BENCH],
  ['coffee table', DEFAULT_COFFEE_TABLE],
  ['nightstand', DEFAULT_NIGHTSTAND],
  ['chair', DEFAULT_CHAIR],
  ['kids chair', DEFAULT_KIDS_CHAIR],
  ['shoe cabinet', { ...DEFAULT_OPEN_SHELF, widthMm: 800, heightMm: 1000, depthMm: 350, shelfCount: 2, doors: 'hinged' }],
];

describe('furniture templates', () => {
  it.each(PRESETS)('%s: builds, fits the supplier, and is orderable', (_, p) => {
    const r = runDesign(p, DEFAULT_CONFIG);
    const solid = r.model.components.filter((c) => !c.reference && !c.rotationZDeg);
    expect(findOverlaps(solid)).toEqual([]);
    expect(r.model.components.every((c) => c.size.x > 0 && c.size.y > 0 && c.size.z > 0)).toBe(true);
    expect(r.quote?.issues ?? ['no quote']).toEqual([]);
    expect(r.report.exportBlocked).toBe(false);
    expect(r.assembly.length).toBeGreaterThan(0);
    // Reference items (mattress, bar) are never cut or priced.
    expect(r.model.parts.flatMap((pt) => pt.componentIds)).not.toContain('mattress');
  });

  it('every ordered part is in whole centimetres', () => {
    for (const [, p] of PRESETS) {
      for (const part of runDesign(p).model.parts) {
        expect(part.lengthMm % 10, `${p.template} ${part.name} ${part.lengthMm}`).toBe(0);
        expect(part.widthMm % 10, `${p.template} ${part.name} ${part.widthMm}`).toBe(0);
      }
    }
  });

  it('the mattress always fits inside the bed frame', () => {
    for (const w of [600, 700, 800, 900, 1400, 1600]) {
      const lay = bedLayout({ ...DEFAULT_SINGLE_BED, mattressWidthMm: w, mattressLengthMm: 1905 });
      expect(lay.gapWidthSide).toBeGreaterThanOrEqual(DEFAULT_SINGLE_BED.mattressGapMm);
      expect(lay.gapLengthSide).toBeGreaterThanOrEqual(DEFAULT_SINGLE_BED.mattressGapMm);
    }
  });

  it('bed slats are loaded and checked as beams', () => {
    const r = runDesign(DEFAULT_SINGLE_BED);
    const slat = r.report.checks.find((c) => c.id.startsWith('structure.deflection.slat_'));
    expect(slat).toBeDefined();
    expect(slat!.calculation).toBeDefined();
    expect(slat!.assumptions.join(' ')).toContain('600');
  });

  it('a floor-bed entry opening inside the head-entrapment range blocks the order', () => {
    const bad: BedParams = { ...DEFAULT_FLOOR_BED, entryOpeningMm: 150 };
    const r = runDesign(bad);
    const check = r.report.checks.find((c) => c.id === 'safety.entrapment_opening')!;
    expect(check.status).toBe('RED');
    expect(r.report.exportBlocked).toBe(true);
    const fixed = runDesign(applyChange(bad, check.fixes[0].change));
    expect(fixed.report.checks.find((c) => c.id === 'safety.entrapment_opening')!.status).toBe('GREEN');
  });

  it('a mattress raised to high-bed height is flagged', () => {
    const r = runDesign({ ...DEFAULT_FLOOR_BED, deckHeightMm: 500, railHeightMm: 600, mattressThicknessMm: 150 });
    expect(r.report.checks.find((c) => c.id === 'safety.fall_height')!.status).toBe('RED');
  });

  it('adult beds skip the child rules', () => {
    const ids = runDesign(DEFAULT_DOUBLE_BED).report.checks.map((c) => c.id);
    expect(ids).not.toContain('safety.entrapment_opening');
    expect(ids).toContain('safety.bed');
  });

  it('the pull-up station is always blocked pending an engineer', () => {
    const r = runDesign(DEFAULT_PULLUP);
    expect(r.report.checks.find((c) => c.id === 'structure.life_safety')!.status).toBe('RED');
    expect(r.report.exportBlocked).toBe(true);
  });

  it('a table without a back rail warns about racking and offers the fix', () => {
    const r = runDesign({ ...DEFAULT_DESK, hasApron: false });
    const c = r.report.checks.find((x) => x.id === 'stability.racking')!;
    expect(c.status).toBe('YELLOW');
    expect(c.fixes[0].change.set).toEqual({ hasApron: true });
  });

  it('an unsupported bench top fails and the fix search offers a middle panel', () => {
    const r = runDesign({ ...DEFAULT_BENCH, middleSupport: false });
    const top = r.report.checks.find((c) => c.id === 'structure.deflection.top')!;
    expect(top.status).toBe('RED');
    expect(top.fixes.some((f) => f.change.set.middleSupport === true)).toBe(true);
  });

  it('hinged doors add hinges by door height and hinge-cup drilling notes', () => {
    const r = runDesign({ ...DEFAULT_OPEN_SHELF, heightMm: 1000, depthMm: 350, doors: 'hinged' });
    const doors = r.model.components.filter((c) => c.role === 'door');
    expect(doors.length).toBe(2);
    expect(r.model.hardware.find((h) => h.id === 'hinge')!.quantity).toBe(doors.reduce((a, d) => a + hingesForDoor(d.size.y), 0));
    expect(r.model.parts.find((pt) => pt.name === 'דלת')!.machining![0]).toContain('35');
    expect(r.model.overall.z).toBeLessThanOrEqual(350);
  });

  it('withDefaults restores missing fields and rejects unknown templates', () => {
    expect(withDefaults({ template: 'bed', mattressWidthMm: 800 })).toMatchObject({ template: 'bed', mattressWidthMm: 800, slatGapMm: DEFAULT_SINGLE_BED.slatGapMm });
    expect(withDefaults({ template: 'rocket' })).toBeNull();
    expect(withDefaults({ ...DEFAULT_OPEN_SHELF, doors: undefined })).toMatchObject({ doors: 'none' });
  });
});

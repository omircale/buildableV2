import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DEFAULT_OPEN_SHELF, SUPPLIERS, applyChange, buildOpenShelf, changeImpact, cutListCsv, getMaterial, runDesign } from './index';
import { quotePart } from './suppliers/quote';
import type { OpenShelfParams, Part } from './types';
import { deflectionSimplePointCenter, deflectionSimpleUdl, rectInertia } from './structural/beam';
import { nestParts } from './manufacturing/nesting';
import { analyseHorizontal, governingShelf } from './validation/validate';

const shelf = (over: Partial<OpenShelfParams>): OpenShelfParams => ({ ...DEFAULT_OPEN_SHELF, ...over });
/** Reference (non-supplier) materials: exact millimetre geometry, no order-step snapping. */
const ref = (over: Partial<OpenShelfParams>): OpenShelfParams =>
  shelf({ materialId: 'birch_plywood', thicknessMm: 18, finishId: 'natural', backMaterialId: 'birch_plywood', backThicknessMm: 6.5, ...over });

describe('beam formulas', () => {
  it('simply supported UDL: 5wL⁴/384EI', () => {
    expect(deflectionSimpleUdl(1, 1000, 10000, 1e6)).toBeCloseTo(1.30208, 4);
  });
  it('simply supported central point load: PL³/48EI', () => {
    expect(deflectionSimplePointCenter(1000, 1000, 10000, 1e6)).toBeCloseTo(2.0833, 3);
  });
  it('rectangular inertia', () => {
    expect(rectInertia(300, 18)).toBeCloseTo(145800, 6);
  });
});

describe('structural validation', () => {
  it('birch plywood 18 mm, 764 mm span, 20 kg books → GREEN with hand-checked deflection', () => {
    const model = buildOpenShelf(ref({ widthMm: 800, depthMm: 300, materialId: 'birch_plywood', thicknessMm: 18, loadPerShelf: { label: 'x', massKg: 20, distribution: 'uniform' } }));
    const s1 = model.components.find((c) => c.id === 'shelf_1')!;
    expect(s1.spanMm).toBe(764);
    expect(s1.size.z).toBe(293.5);
    const a = analyseHorizontal(s1, DEFAULT_CONFIG);
    // Hand calculation: I = 293.5·18³/12 = 142 641 mm⁴; w = 0.25672 + 0.03523 N/mm; E = 10 048 MPa
    expect(a.instMm!).toBeCloseTo(0.9036, 2);
    expect(a.finalMm!).toBeCloseTo(0.9036 * 1.8, 2); // kdef plywood SC1 = 0.8
    expect(a.stressRatio!).toBeLessThan(0.1);
    expect(a.status).toBe('GREEN');
  });

  it('MDF 18 mm, 1164 mm span, 30 kg → RED (long-term deflection far beyond L/150)', () => {
    const r = runDesign(ref({ widthMm: 1200, materialId: 'mdf', thicknessMm: 18, loadPerShelf: { label: 'x', massKg: 30, distribution: 'uniform' } }));
    expect(r.report.coverage.structure).toBe('RED');
    expect(r.report.exportBlocked).toBe(true);
    const g = governingShelf(r.model.params, DEFAULT_CONFIG)!;
    expect(g.instMm!).toBeCloseTo(22.41, 1);
    expect(g.finalMm!).toBeCloseTo(22.41 * 3.25, 0);
  });

  it('never guesses: a thickness without published properties is GREY, not computed', () => {
    const model = buildOpenShelf(ref({ thicknessMm: 12 }));
    const a = analyseHorizontal(model.components.find((c) => c.role === 'shelf')!, DEFAULT_CONFIG);
    expect(a.status).toBe('GREY');
    expect(a.instMm).toBeNull();
  });

  it('materials outside Eurocode 5 are capped at YELLOW even when within limits', () => {
    const r = runDesign(ref({ widthMm: 400, materialId: 'mdf', thicknessMm: 18, loadPerShelf: { label: 'x', massKg: 2, distribution: 'uniform' } }));
    const deflectionChecks = r.report.checks.filter((c) => c.id.startsWith('structure.deflection'));
    expect(deflectionChecks.every((c) => c.status === 'YELLOW')).toBe(true);
  });

  it('every offered fix actually passes when re-validated', () => {
    const p = ref({ widthMm: 1200, materialId: 'mdf', thicknessMm: 18, loadPerShelf: { label: 'x', massKg: 30, distribution: 'uniform' } });
    const r = runDesign(p);
    const fixes = r.report.checks.flatMap((c) => (c.category === 'structure' ? c.fixes : []));
    expect(fixes.length).toBeGreaterThan(0);
    for (const f of fixes) {
      const g = governingShelf(applyChange(p, f.change), DEFAULT_CONFIG)!;
      expect(g.passesLimits, f.change.label).toBe(true);
    }
  });

  it('point load is more severe than the same mass distributed', () => {
    const base = { widthMm: 900, loadPerShelf: { label: 'x', massKg: 20, distribution: 'uniform' as const } };
    const u = governingShelf(ref(base), DEFAULT_CONFIG)!;
    const pt = governingShelf(ref({ ...base, loadPerShelf: { ...base.loadPerShelf, distribution: 'point_center' } }), DEFAULT_CONFIG)!;
    expect(pt.instMm!).toBeGreaterThan(u.instMm!);
  });
});

describe('geometry and single source of truth', () => {
  it('cut list quantities equal component count and dimensions match geometry', () => {
    const model = buildOpenShelf(ref({ shelfCount: 4, dividerCount: 1, plinthHeightMm: 80 }));
    expect(model.parts.reduce((a, p) => a + p.quantity, 0)).toBe(model.components.length);
    for (const part of model.parts) {
      for (const id of part.componentIds) {
        const c = model.components.find((x) => x.id === id)!;
        const extents = [c.size.x, c.size.y, c.size.z];
        extents.splice(extents.indexOf(c.thicknessMm), 1);
        expect([part.lengthMm, part.widthMm].sort((a, b) => a - b)).toEqual(extents.map((v) => Math.round(v * 10) / 10).sort((a, b) => a - b));
      }
    }
  });

  it('shelves are evenly spaced and never overlap', () => {
    const model = buildOpenShelf(ref({ shelfCount: 5 }));
    const levels = model.components.filter((c) => ['bottom', 'shelf', 'top'].includes(c.role)).sort((a, b) => a.origin.y - b.origin.y);
    const gaps = levels.slice(1).map((c, i) => c.origin.y - (levels[i].origin.y + levels[i].size.y));
    gaps.forEach((g) => expect(g).toBeCloseTo(gaps[0], 6));
    expect(levels.at(-1)!.origin.y + levels.at(-1)!.size.y).toBeCloseTo(DEFAULT_OPEN_SHELF.heightMm, 6);
  });

  it('too many shelves for the height is reported as a geometry failure', () => {
    const r = runDesign(ref({ heightMm: 200, shelfCount: 12 }));
    expect(r.report.coverage.geometry).toBe('RED');
    expect(r.report.checks.some((c) => c.id === 'geometry.overlap')).toBe(true);
  });

  it('change impact lists resized horizontals when width changes', () => {
    const before = runDesign(ref({ widthMm: 800 }));
    const after = runDesign(ref({ widthMm: 1000 }));
    const impact = changeImpact(before, after);
    expect(impact.changedParams).toEqual(['widthMm']);
    expect(impact.resizedComponents).toContain('shelf_1');
    expect(impact.resizedComponents).toContain('side_r');
    expect(impact.cutListChanged).toBe(true);
  });
});

describe('nesting', () => {
  const part = (over: Partial<Part>): Part => ({
    id: 'P', componentIds: [], name: 'p', materialId: 'mdf', thicknessMm: 18, lengthMm: 1000, widthMm: 500, quantity: 1, grainLocked: false,
    edges: { long1: false, long2: false, short1: false, short2: false }, finishId: 'x', ...over,
  });

  it('grain-locked part wider than usable sheet width is not rotated and stays unplaced', () => {
    const r = nestParts([part({ id: 'G', materialId: 'birch_plywood', lengthMm: 1210, widthMm: 1240, grainLocked: true })], getMaterial);
    expect(r[0].unplaced.map((u) => u.partId)).toContain('G');
  });

  it('same part without grain lock may rotate to fit', () => {
    const r = nestParts([part({ id: 'R', materialId: 'mdf', lengthMm: 1000, widthMm: 2100, grainLocked: false })], getMaterial);
    expect(r[0].unplaced).toHaveLength(0);
    expect(r[0].sheets[0].placements[0].rotated).toBe(true);
  });

  it('placements never overlap, keep kerf spacing and stay inside the trim line', () => {
    const kerf = 4;
    const trim = 10;
    const parts = [part({ id: 'A', lengthMm: 1164, widthMm: 293.5, quantity: 9 }), part({ id: 'B', lengthMm: 1800, widthMm: 300, quantity: 2 }), part({ id: 'C', lengthMm: 600, widthMm: 420, quantity: 5 })];
    const res = nestParts(parts, getMaterial, { kerfMm: kerf, trimMarginMm: trim })[0];
    expect(res.unplaced).toHaveLength(0);
    expect(res.sheets.flatMap((s) => s.placements)).toHaveLength(16);
    for (const s of res.sheets) {
      for (const pl of s.placements) {
        expect(pl.x).toBeGreaterThanOrEqual(trim);
        expect(pl.y).toBeGreaterThanOrEqual(trim);
        expect(pl.x + pl.lengthMm).toBeLessThanOrEqual(s.stock.lengthMm - trim + 1e-6);
        expect(pl.y + pl.widthMm).toBeLessThanOrEqual(s.stock.widthMm - trim + 1e-6);
      }
      for (let i = 0; i < s.placements.length; i++) {
        for (let j = i + 1; j < s.placements.length; j++) {
          const a = s.placements[i];
          const b = s.placements[j];
          const separated =
            a.x + a.lengthMm + kerf <= b.x + 1e-6 || b.x + b.lengthMm + kerf <= a.x + 1e-6 || a.y + a.widthMm + kerf <= b.y + 1e-6 || b.y + b.widthMm + kerf <= a.y + 1e-6;
          expect(separated).toBe(true);
        }
      }
    }
  });
});

describe('exports', () => {
  it('CSV has a header and one row per part', () => {
    const model = buildOpenShelf(DEFAULT_OPEN_SHELF);
    const lines = cutListCsv(model.parts, getMaterial).trim().split('\r\n');
    expect(lines[0].replace('﻿', '')).toMatch(/^Part_ID,Description,Material/);
    expect(lines).toHaveLength(model.parts.length + 1);
  });

  it('default design runs end to end without blocking export', () => {
    const r = runDesign(DEFAULT_OPEN_SHELF);
    expect(r.report.exportBlocked).toBe(false);
    expect(r.bom.sheets.length).toBeGreaterThan(0);
    expect(r.assembly.length).toBeGreaterThan(3);
    expect(r.report.physicalVerificationRequired).toBe(true);
  });
});

describe('nesting efficiency', () => {
  it('default 800×1830 plywood unit body fits on a single 2500×1250 sheet', () => {
    const model = buildOpenShelf(ref({ widthMm: 800, heightMm: 1830, shelfCount: 4 }));
    const body = nestParts(model.parts, getMaterial).find((g) => g.thicknessMm === 18)!;
    expect(body.unplaced).toHaveLength(0);
    expect(body.sheets).toHaveLength(1);
  });
});

describe('supplier: hayozrim', () => {
  it('default design snaps every ordered part to whole centimetres and is orderable', () => {
    const r = runDesign(DEFAULT_OPEN_SHELF);
    expect(r.model.orderStepMm).toBe(10);
    // 800 − 2×18 = 764 → ordered shelf 760 → built width 796; depth 300 − 5.5 back = 294.5 → 290 → 295.5
    expect(r.model.overall).toEqual({ x: 796, y: 1800, z: 295.5 });
    for (const pt of r.model.parts) {
      expect(pt.lengthMm % 10, pt.id).toBe(0);
      expect(pt.widthMm % 10, pt.id).toBe(0);
    }
    expect(r.quote).not.toBeNull();
    expect(r.quote!.issues).toEqual([]);
    expect(r.report.exportBlocked).toBe(false);
  });

  it('pricing matches the live configurator: sandwich 17 mm, 80×30 cm, edges all round = ₪80.20', () => {
    const product = SUPPLIERS[0].products.find((x) => x.handle === 'shelf-sandwich-17mm')!;
    const line = quotePart(
      { id: 'T', componentIds: [], name: 't', materialId: 'hayozrim:shelf-sandwich-17mm', thicknessMm: 17, lengthMm: 800, widthMm: 300, quantity: 1, grainLocked: true, edges: { long1: true, long2: true, short1: true, short2: true }, finishId: 'לבן מט' },
      product,
    );
    expect(line.unitMaterialIls).toBe(64.8);
    expect(line.unitEdgeIls).toBe(15.4);
    expect(line.unitIls).toBe(80.2);
    expect(line.edgeOption?.id).toBe('all');
  });

  it('minimum price per piece applies (10×10 cm birch = ₪50)', () => {
    const product = SUPPLIERS[0].products.find((x) => x.handle === 'birch-18mm')!;
    const line = quotePart({ id: 'T', componentIds: [], name: 't', materialId: 'hayozrim:birch-18mm', thicknessMm: 18, lengthMm: 100, widthMm: 100, quantity: 1, grainLocked: true, edges: { long1: false, long2: false, short1: false, short2: false }, finishId: 'ליבנה גלוי' }, product);
    expect(line.unitIls).toBe(50);
  });

  it('edge banding on a product that does not offer it blocks the order and offers "no edge"', () => {
    const r = runDesign(shelf({ edgeOption: 'front' }));
    const check = r.report.checks.find((c) => c.id === 'manufacturing.supplier')!;
    expect(check.status).toBe('RED');
    expect(check.fixes.map((f) => f.change.set)).toContainEqual({ edgeOption: 'none' });
    expect(runDesign(shelf({ materialId: 'hayozrim:shelf-sandwich-17mm', thicknessMm: 17, finishId: 'לבן מט', edgeOption: 'front' })).report.checks.find((c) => c.id === 'manufacturing.supplier')!.status).toBe('GREEN');
  });

  it('front edge maps to the supplier option "one edge along width (long side)"', () => {
    const r = runDesign(shelf({ materialId: 'hayozrim:shelf-sandwich-17mm', thicknessMm: 17, finishId: 'לבן מט', edgeOption: 'front' }));
    const boardLines = r.quote!.lines.filter((l) => l.partName !== 'גב');
    expect(boardLines.every((l) => l.edgeOption?.id === 'one_length')).toBe(true);
  });

  it('a plinth lower than the supplier minimum (10 cm) is not orderable', () => {
    const r = runDesign(shelf({ plinthHeightMm: 80 }));
    expect(r.report.coverage.manufacturing).toBe('RED');
  });

  it('borrowed engineering data is capped at YELLOW and says what to ask the supplier', () => {
    const r = runDesign(DEFAULT_OPEN_SHELF);
    expect(r.report.checks.find((c) => c.id === 'materials.equivalence')?.status).toBe('YELLOW');
    expect(r.report.coverage.structure).toBe('YELLOW');
  });

  it('a product without engineering data is GREY and fixes suggest orderable products that pass', () => {
    const p = shelf({ materialId: 'hayozrim:shelf-sandwich-17mm', thicknessMm: 17, finishId: 'לבן מט' });
    const r = runDesign(p);
    expect(r.report.coverage.structure).toBe('GREY');
    const fixes = r.report.checks.filter((c) => c.category === 'structure').flatMap((c) => c.fixes);
    expect(fixes.length).toBeGreaterThan(0);
    for (const f of fixes) {
      const next = applyChange(p, f.change);
      expect(getMaterial(next.materialId)?.supplier, f.change.label).toBeDefined();
      expect(governingShelf(next, DEFAULT_CONFIG)!.passesLimits, f.change.label).toBe(true);
    }
  });

  it('"lock actual dimensions" fix is stable under re-snapping', () => {
    const r = runDesign(DEFAULT_OPEN_SHELF);
    const fix = r.report.checks.find((c) => c.id === 'geometry.order_step')!.fixes[0];
    const r2 = runDesign(applyChange(DEFAULT_OPEN_SHELF, fix.change));
    expect(r2.report.checks.some((c) => c.id === 'geometry.order_step')).toBe(false);
  });
});

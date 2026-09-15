import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DEFAULT_OPEN_SHELF, applyChange, buildOpenShelf, changeImpact, cutListCsv, getMaterial, runDesign } from './index';
import type { OpenShelfParams, Part } from './types';
import { deflectionSimplePointCenter, deflectionSimpleUdl, rectInertia } from './structural/beam';
import { nestParts } from './manufacturing/nesting';
import { analyseHorizontal, governingShelf } from './validation/validate';

const shelf = (over: Partial<OpenShelfParams>): OpenShelfParams => ({ ...DEFAULT_OPEN_SHELF, ...over });

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
    const model = buildOpenShelf(shelf({ widthMm: 800, depthMm: 300, materialId: 'birch_plywood', thicknessMm: 18, loadPerShelf: { label: 'x', massKg: 20, distribution: 'uniform' } }));
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
    const r = runDesign(shelf({ widthMm: 1200, materialId: 'mdf', thicknessMm: 18, loadPerShelf: { label: 'x', massKg: 30, distribution: 'uniform' } }));
    expect(r.report.coverage.structure).toBe('RED');
    expect(r.report.exportBlocked).toBe(true);
    const g = governingShelf(r.model.params, DEFAULT_CONFIG)!;
    expect(g.instMm!).toBeCloseTo(22.41, 1);
    expect(g.finalMm!).toBeCloseTo(22.41 * 3.25, 0);
  });

  it('never guesses: a thickness without published properties is GREY, not computed', () => {
    const model = buildOpenShelf(shelf({ materialId: 'birch_plywood', thicknessMm: 12 }));
    const a = analyseHorizontal(model.components.find((c) => c.role === 'shelf')!, DEFAULT_CONFIG);
    expect(a.status).toBe('GREY');
    expect(a.instMm).toBeNull();
  });

  it('materials outside Eurocode 5 are capped at YELLOW even when within limits', () => {
    const r = runDesign(shelf({ widthMm: 400, materialId: 'mdf', thicknessMm: 18, loadPerShelf: { label: 'x', massKg: 2, distribution: 'uniform' } }));
    const deflectionChecks = r.report.checks.filter((c) => c.id.startsWith('structure.deflection'));
    expect(deflectionChecks.every((c) => c.status === 'YELLOW')).toBe(true);
  });

  it('every offered fix actually passes when re-validated', () => {
    const p = shelf({ widthMm: 1200, materialId: 'mdf', thicknessMm: 18, loadPerShelf: { label: 'x', massKg: 30, distribution: 'uniform' } });
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
    const u = governingShelf(shelf(base), DEFAULT_CONFIG)!;
    const pt = governingShelf(shelf({ ...base, loadPerShelf: { ...base.loadPerShelf, distribution: 'point_center' } }), DEFAULT_CONFIG)!;
    expect(pt.instMm!).toBeGreaterThan(u.instMm!);
  });
});

describe('geometry and single source of truth', () => {
  it('cut list quantities equal component count and dimensions match geometry', () => {
    const model = buildOpenShelf(shelf({ shelfCount: 4, dividerCount: 1, plinthHeightMm: 80 }));
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
    const model = buildOpenShelf(shelf({ shelfCount: 5 }));
    const levels = model.components.filter((c) => ['bottom', 'shelf', 'top'].includes(c.role)).sort((a, b) => a.origin.y - b.origin.y);
    const gaps = levels.slice(1).map((c, i) => c.origin.y - (levels[i].origin.y + levels[i].size.y));
    gaps.forEach((g) => expect(g).toBeCloseTo(gaps[0], 6));
    expect(levels.at(-1)!.origin.y + levels.at(-1)!.size.y).toBeCloseTo(DEFAULT_OPEN_SHELF.heightMm, 6);
  });

  it('too many shelves for the height is reported as a geometry failure', () => {
    const r = runDesign(shelf({ heightMm: 200, shelfCount: 12 }));
    expect(r.report.coverage.geometry).toBe('RED');
    expect(r.report.checks.some((c) => c.id === 'geometry.overlap')).toBe(true);
  });

  it('change impact lists resized horizontals when width changes', () => {
    const before = runDesign(shelf({ widthMm: 800 }));
    const after = runDesign(shelf({ widthMm: 1000 }));
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
    edgeBanding: { length1: 0, length2: 0, width1: 0, width2: 0 }, ...over,
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
    const model = buildOpenShelf(shelf({ widthMm: 800, heightMm: 1830, shelfCount: 4 }));
    const body = nestParts(model.parts, getMaterial).find((g) => g.thicknessMm === 18)!;
    expect(body.unplaced).toHaveLength(0);
    expect(body.sheets).toHaveLength(1);
  });
});

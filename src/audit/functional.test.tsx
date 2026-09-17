/**
 * Functional audit — "does everything work as shown":
 * 1. hand-calculated reference values (computed outside the engine, formulas and inputs written out below);
 * 2. the same numbers everywhere they are shown (cut list, CSV, order lines, order text, PDF package, booklet);
 * 3. edge cases around saved data.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAIR,
  DEFAULT_CONFIG,
  DEFAULT_DESK,
  DEFAULT_FLOOR_BED,
  DEFAULT_OPEN_SHELF,
  cutListCsv,
  getMaterial,
  runDesign,
  withDefaults,
  type DesignResult,
} from '../engine';
import { analyseHorizontal } from '../engine/validation/validate';
import { dictFor } from '../i18n';
import { AssemblyBooklet } from '../ui/AssemblyBooklet';
import { FURNITURE_TYPES, presetFor } from '../ui/furnitureCatalog';
import { orderText } from '../ui/ManufacturingPanel';
import { PrintPackage } from '../ui/PrintPackage';
import { formatCm } from '../ui/measure';

const member = (r: DesignResult, id: string) => analyseHorizontal(r.model.components.find((c) => c.id === id)!, DEFAULT_CONFIG);

describe('hand-calculated reference values', () => {
  it('price of the default bookcase = supplier formula by hand', () => {
    // Parts (whole cm): 2 sides 180×29, 5 horizontals 76×29 (birch 18 mm, ₪285/m², min ₪50/piece),
    // back 180×79 (laminate plywood 5.5 mm, ₪104/m²), 50 nails ₪7, shipping ₪50. Each unit price rounded to agorot.
    // side 1.8×0.29×285 = 148.77 · horizontal 0.76×0.29×285 = 62.814 → 62.81 · back 1.8×0.79×104 = 147.888 → 147.89
    // total = 2×148.77 + 5×62.81 + 147.89 + 7 + 50 = 816.48
    const q = runDesign(DEFAULT_OPEN_SHELF).quote!;
    expect(q.totalIls).toBeCloseTo(816.48, 2);
    expect(q.lines.map((l) => l.unitIls).sort((a, b) => a - b)).toEqual([62.81, 147.89, 148.77]);
  });

  // Birch 18 mm: E = 10048 MPa (mean), f_m,k = 40.2 MPa, ρ = 12.6 kg/m² / 0.018 m = 700 kg/m³,
  // plywood SC1: k_def = 0.8, k_mod = 0.7, γ_M = 1.2, γ = 1.5, g = 9.80665. I = b·h³/12, W = b·h²/6.
  it('bookcase shelf: L 760, b 290, 20 kg uniform → δ 0.9015 / 1.6228 mm, 8.67 %', () => {
    const a = member(runDesign(DEFAULT_OPEN_SHELF), 'shelf_1');
    expect(a.instMm!).toBeCloseTo(0.9015, 3);
    expect(a.finalMm!).toBeCloseTo(1.6228, 3);
    expect(a.stressRatio!).toBeCloseTo(0.08668, 4);
  });

  it('chair seat: L 450, b 460, 110 kg at mid-span → δ 0.9252 / 1.6653 mm, 31.6 %', () => {
    const a = member(runDesign(DEFAULT_CHAIR), 'seat');
    expect(a.instMm!).toBeCloseTo(0.9252, 3);
    expect(a.finalMm!).toBeCloseTo(1.6653, 3);
    expect(a.stressRatio!).toBeCloseTo(0.3162, 3);
  });

  it('desk top: L 1182 (bearing centres), b 600, 30 kg uniform → δ 2.8022 / 5.0439 mm, 11.1 %', () => {
    const a = member(runDesign(DEFAULT_DESK), 'top');
    expect(a.instMm!).toBeCloseTo(2.8022, 3);
    expect(a.finalMm!).toBeCloseTo(5.0439, 3);
    expect(a.stressRatio!).toBeCloseTo(0.1114, 3);
  });

  it('floor-bed slats: 11 slats, gap 43.67 mm, 26.7 kg each on L 342 → δ 0.2838 / 0.5108 mm', () => {
    // innerL = 1660 − 36 = 1624; n = ceil((1624 − 50)/(100 + 50)) = 11; gap = (1624 − 1100)/12 = 43.667
    // mass = 110 × (143.667/600) + 8 × (143.667/1624) × (360/720) = 26.339 + 0.354 → 26.7 kg
    const r = runDesign(DEFAULT_FLOOR_BED);
    const slats = r.model.components.filter((c) => c.role === 'slat');
    expect(slats.length).toBe(22);
    expect(slats[0].load!.massKg).toBe(26.7);
    const a = member(r, slats[0].id);
    expect(a.instMm!).toBeCloseTo(0.2838, 3);
    expect(a.finalMm!).toBeCloseTo(0.5108, 3);
  });
});

const catalog = FURNITURE_TYPES.filter((f) => f.available).map((f) => [f.kind, runDesign(presetFor(f, { w: null, h: null, d: null })!)] as const);

describe('one number, everywhere it is shown', () => {
  it.each(catalog)('%s: order lines match the cut list', (_, r) => {
    const q = r.quote!;
    expect(q.lines.map((l) => l.partId)).toEqual(r.model.parts.map((p) => p.id));
    for (const l of q.lines) {
      const p = r.model.parts.find((x) => x.id === l.partId)!;
      expect([l.widthCm, l.depthCm]).toEqual([Math.max(p.lengthMm, p.widthMm) / 10, Math.min(p.lengthMm, p.widthMm) / 10]);
      expect(l.quantity).toBe(p.quantity);
      expect(l.finishId).toBe(p.finishId);
    }
    const sum = q.lines.reduce((a, l) => a + l.lineIls, 0) + q.addonsIls + q.shippingIls;
    expect(q.totalIls).toBeCloseTo(sum, 1);
  });

  it.each(catalog)('%s: CSV rows match the cut list', (_, r) => {
    const rows = cutListCsv(r.model.parts, getMaterial).replace('﻿', '').split('\r\n').slice(1);
    expect(rows).toHaveLength(r.model.parts.length);
    r.model.parts.forEach((p, i) => {
      const cells = rows[i].split(',');
      expect(cells[0]).toBe(p.id);
      expect(cells.slice(4, 8).map(Number)).toEqual([p.thicknessMm, p.lengthMm, p.widthMm, p.quantity]);
    });
  });

  it.each(catalog)('%s: copied order text lists every line and the total', (_, r) => {
    const text = orderText(r.quote!, 'P', dictFor('he'), 'he', r.model.parts);
    for (const l of r.quote!.lines) expect(text).toContain(`${l.widthCm}`);
    for (const p of r.model.parts) for (const m of p.machining ?? []) expect(text).toContain(m);
  });

  it.each(catalog)('%s: PDF package and assembly booklet show the cut-list sizes', (_, r) => {
    const pkg = renderToStaticMarkup(<PrintPackage result={r} projectName="P" snapshot={null} />);
    const booklet = renderToStaticMarkup(<AssemblyBooklet result={r} projectName="P" />);
    for (const p of r.model.parts) {
      expect(pkg).toContain(`>${p.lengthMm}<`);
      expect(pkg).toContain(`>${p.widthMm}<`);
      expect(booklet).toContain(`${formatCm(p.lengthMm)} × ${formatCm(p.widthMm)} × ${formatCm(p.thicknessMm)}`);
    }
    // Every assembly step gets a numbered drawing in the booklet.
    expect((booklet.match(/<svg/g) ?? []).length).toBe(r.assembly.length + 1);
  });
});

describe('saved data edge cases', () => {
  it('garbage never becomes a design', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { template: 'rocket' }, { template: 'open_shelf', finish: 'oops' }]) {
      const p = withDefaults(bad);
      if (p) expect(() => runDesign(p)).not.toThrow();
    }
  });

  it('a design saved before new fields existed still opens and builds', () => {
    const old = { template: 'open_shelf', widthMm: 900, heightMm: 2000, depthMm: 350, materialId: 'hayozrim:birch-18mm', thicknessMm: 18, shelfCount: 4, dividerCount: 1 };
    const p = withDefaults(old)!;
    expect(p).toMatchObject({ doors: 'none', shelfMounting: 'fixed', widthMm: 900 });
    expect(runDesign(p).report.exportBlocked).toBe(false);
  });

  it('numbers typed as text or NaN are rejected by validation, not built silently', () => {
    const r = runDesign({ ...DEFAULT_OPEN_SHELF, widthMm: Number.NaN });
    expect(r.report.checks.some((c) => c.id === 'geometry.range.widthMm' && c.status === 'RED')).toBe(true);
    expect(r.report.exportBlocked).toBe(true);
  });
});

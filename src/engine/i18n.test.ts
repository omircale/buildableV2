import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPEN_SHELF,
  SUPPLIERS,
  allMaterials,
  cutListCsv,
  finishDisplayName,
  getEngineLocale,
  getMaterial,
  materialName,
  productTitle,
  runDesign,
  setEngineLocale,
  tr,
  withEngineLocale,
  type DesignResult,
  type OpenShelfParams,
} from './index';

const HEBREW = /[֐-׿]/;

const shelf = (over: Partial<OpenShelfParams>): OpenShelfParams => ({ ...DEFAULT_OPEN_SHELF, ...over });
const failingMdf = shelf({
  widthMm: 1200,
  materialId: 'mdf',
  thicknessMm: 18,
  finishId: 'natural',
  backMaterialId: 'birch_plywood',
  backThicknessMm: 6.5,
  loadPerShelf: { label: 'x', massKg: 30, distribution: 'uniform' },
});
const orderIssues = shelf({ edgeOption: 'front', plinthHeightMm: 80 });
const noEngineering = shelf({ materialId: 'hayozrim:shelf-sandwich-17mm', thicknessMm: 17, finishId: 'לבן מט', edgeOption: 'front' });
const badFinish = shelf({ finishId: 'not-a-finish', backFinishId: 'nope', dividerCount: 2 });

/** Human-readable strings of a run. Finish ids, material ids and user-entered load labels are data, not engine text. */
function engineText(r: DesignResult): string[] {
  const out: string[] = [];
  for (const c of r.report.checks) {
    out.push(c.title, c.explanation, ...c.assumptions);
    if (c.requiredVerification) out.push(c.requiredVerification);
    for (const f of c.fixes) out.push(f.change.label, f.projectedDetail);
    if (c.calculation) out.push(c.calculation.formula, c.calculation.result, ...Object.keys(c.calculation.inputs), ...Object.values(c.calculation.inputs));
    for (const s of c.sources) out.push(s.title, s.reference);
  }
  for (const c of r.model.components) out.push(c.name);
  for (const p of r.model.parts) out.push(p.name);
  for (const h of r.model.hardware) out.push(h.name, h.spec, h.basis);
  for (const s of r.assembly) out.push(s.title, ...(s.warning ? [s.warning] : []));
  for (const g of r.nesting) for (const u of g.unplaced) out.push(u.reason);
  for (const s of r.bom.sheets) out.push(s.materialName);
  for (const e of r.bom.edgeBanding) out.push(e.basis);
  if (r.quote) {
    out.push(...r.quote.issues, ...r.quote.assumptions);
    for (const l of r.quote.lines) out.push(l.partName, l.productTitle, ...l.issues);
    for (const a of r.quote.addons) out.push(a.name, a.productTitle);
  }
  return out;
}

const cases: [string, OpenShelfParams][] = [
  ['default design', DEFAULT_OPEN_SHELF],
  ['failing MDF shelf', failingMdf],
  ['supplier order issues', orderIssues],
  ['product without engineering data', noEngineering],
  ['unknown finish with dividers', badFinish],
];

describe('engine i18n', () => {
  it.each(cases)('English run of %s contains no Hebrew engine text', (_name, params) => {
    const r = runDesign(params, undefined, 'en');
    const hebrew = engineText(r).filter((s) => HEBREW.test(s));
    expect(hebrew).toEqual([]);
  });

  it.each(cases)('Hebrew and English runs of %s differ only in language', (_name, params) => {
    const he = runDesign(params);
    const en = runDesign(params, undefined, 'en');
    const shape = (r: DesignResult) => ({
      checks: r.report.checks.map((c) => [c.id, c.status, c.componentIds, c.fixes.map((f) => [f.change.set, f.projectedStatus]), c.calculation?.formula]),
      coverage: r.report.coverage,
      overall: r.report.overall,
      exportBlocked: r.report.exportBlocked,
      components: r.model.components.map(({ name: _n, ...rest }) => rest),
      parts: r.model.parts.map(({ name: _n, ...rest }) => rest),
      hardware: r.model.hardware.map((h) => [h.id, h.quantity]),
      overall3: r.model.overall,
      assembly: r.assembly.map((s) => [s.n, s.componentIds, s.hardware, !!s.warning]),
      nesting: r.nesting.map((g) => [g.materialId, g.sheets, g.unplaced.map((u) => [u.partId, u.instance])]),
      mass: r.bom.totalMassKg,
      quote: r.quote && { total: r.quote.totalIls, lines: r.quote.lines.map((l) => [l.partId, l.unitIls, l.edgeOption?.id, l.issueCodes]), issues: r.quote.issues.length },
    });
    expect(shape(en)).toEqual(shape(he));
  });

  it('Hebrew remains the default and keeps the original text', () => {
    const r = runDesign(DEFAULT_OPEN_SHELF);
    expect(r.model.components.find((c) => c.id === 'back')!.name).toBe('גב');
    expect(r.assembly.at(-1)!.title).toBe('העמדה ועיגון לקיר');
    expect(r.report.checks.find((c) => c.id === 'safety.physical')!.title).toBe('נדרש אימות פיזי');
    const s1 = runDesign(failingMdf).report.checks.find((c) => c.id.startsWith('structure.deflection'))!;
    expect(Object.keys(s1.calculation!.inputs)).toContain('מפתח L');
  });

  it('English run produces English text and localized calculation keys', () => {
    const r = runDesign(failingMdf, undefined, 'en');
    const s1 = r.report.checks.find((c) => c.id.startsWith('structure.deflection'))!;
    expect(s1.title).toMatch(/does not carry the requested load/);
    expect(Object.keys(s1.calculation!.inputs)).toContain('Span L');
    expect(r.model.components.find((c) => c.id === 'side_l')!.name).toBe('Left side panel');
  });

  it('bay names are grouped the same way in both languages', () => {
    const p = shelf({ dividerCount: 1 });
    const he = runDesign(p).report.checks.filter((c) => c.id.startsWith('structure.deflection'));
    const en = runDesign(p, undefined, 'en').report.checks.filter((c) => c.id.startsWith('structure.deflection'));
    expect(en.map((c) => c.id)).toEqual(he.map((c) => c.id));
    expect(en.every((c) => !/bay \d/.test(c.title))).toBe(true);
  });

  it('runDesign restores the previous locale, even when it throws', () => {
    expect(getEngineLocale()).toBe('he');
    runDesign(DEFAULT_OPEN_SHELF, undefined, 'en');
    expect(getEngineLocale()).toBe('he');
    expect(() => withEngineLocale('en', () => {
      throw new Error('x');
    })).toThrow();
    expect(getEngineLocale()).toBe('he');
    setEngineLocale('en');
    try {
      expect(tr('א', 'a')).toBe('a');
      runDesign(DEFAULT_OPEN_SHELF);
      expect(getEngineLocale()).toBe('en');
    } finally {
      setEngineLocale('he');
    }
  });

  it('every material, product, finish, edge option and nail option has an English name', () => {
    for (const m of allMaterials()) {
      expect(HEBREW.test(materialName(m, 'en')), m.id).toBe(false);
      if (m.descriptionHe) expect(m.descriptionEn, m.id).toBeTruthy();
      if (m.equivalence) expect(m.equivalence.noteEn, m.id).toBeTruthy();
    }
    for (const s of SUPPLIERS) {
      for (const p of s.products) {
        expect(HEBREW.test(productTitle(p, 'en')), p.handle).toBe(false);
        expect(p.descriptionEn, p.handle).toBeTruthy();
        if (p.engineering) expect(p.engineering.noteEn, p.handle).toBeTruthy();
        for (const f of p.finishes) {
          expect(f.nameEn, f.id).toBeTruthy();
          expect(finishDisplayName(f.id, 'en')).toBe(f.nameEn);
          expect(finishDisplayName(f.id)).toBe(f.id);
        }
        for (const o of p.edgeBanding?.options ?? []) expect(o.nameEn, o.id).toBeTruthy();
        for (const n of p.nails ?? []) expect(n.nameEn, n.id).toBeTruthy();
      }
    }
  });

  it('cut list CSV can use English material names', () => {
    const r = runDesign(DEFAULT_OPEN_SHELF, undefined, 'en');
    const csv = cutListCsv(r.model.parts, getMaterial, 'en');
    expect(HEBREW.test(csv.replace(/ליבנה גלוי|לבן מט/g, ''))).toBe(false);
  });
});

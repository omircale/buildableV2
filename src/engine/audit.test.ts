/**
 * Cross-template audit: invariants every furniture design must satisfy, checked on each catalog preset and on
 * each numeric parameter pushed to its minimum, middle and maximum. Failures here are real product bugs.
 */
import { describe, expect, it } from 'vitest';
import { FURNITURE_TYPES, presetFor } from '../ui/furnitureCatalog';
import { DEFAULT_DOUBLE_BED } from './index';
import { applyChange, runDesign, templateFor, type Check, type DesignParams, type DesignResult } from './index';
import { findOverlaps } from './validation/validate';
import { boundsOf, supportReport } from './geometry';

const SEVERITY = { GREEN: 0, YELLOW: 1, GREY: 2, RED: 3 } as const;
const HEBREW = /[֐-׿]/;

const basePresets: [string, DesignParams][] = FURNITURE_TYPES.filter((f) => f.available).map((f) => [f.kind, presetFor(f, { w: null, h: null, d: null })!]);
/** Construction options that are not numeric ranges get their own preset variants. */
const presets: [string, DesignParams][] = [
  ...basePresets,
  ...basePresets.flatMap(([k, p]): [string, DesignParams][] => (p.template === 'open_shelf' ? [[`${k} (adjustable shelves)`, { ...p, shelfMounting: 'pins' }]] : [])),
  // The catalog offers one bed; its two-sleeper build is still its own construction and gets swept.
  ...basePresets.flatMap(([k, p]): [string, DesignParams][] => (p.template === 'bed' && !p.childBed ? [[`${k} (two sleepers)`, DEFAULT_DOUBLE_BED]] : [])),
];

/** Every preset plus each ranged parameter at min / mid / max. */
function variants(): [string, DesignParams][] {
  const out: [string, DesignParams][] = [...presets];
  for (const [kind, p] of presets) {
    for (const l of templateFor(p).limits) {
      for (const v of [l.min, Math.round((l.min + l.max) / 2), l.max]) out.push([`${kind} ${l.key}=${v}`, { ...p, [l.key]: v } as DesignParams]);
    }
  }
  return out;
}

const ALL = variants();
const finite = (n: number) => Number.isFinite(n);

function geometryBroken(r: DesignResult) {
  return r.report.checks.some((c) => c.category === 'geometry' && c.status === 'RED');
}

describe('audit: every design is internally consistent', () => {
  it.each(ALL)('%s — runs, finite numbers, whole parts', (_, p) => {
    const r = runDesign(p);
    for (const c of r.model.components) for (const v of [c.origin.x, c.origin.y, c.origin.z, c.size.x, c.size.y, c.size.z]) expect(finite(v), c.id).toBe(true);
    for (const pt of r.model.parts) {
      expect(finite(pt.lengthMm) && finite(pt.widthMm) && pt.quantity >= 1, pt.id).toBe(true);
    }
    for (const h of r.model.hardware) expect(Number.isInteger(h.quantity) && h.quantity >= 0, h.id).toBe(true);
    if (r.quote) expect(finite(r.quote.totalIls), 'quote total').toBe(true);
    // Every manufactured component appears in exactly one part; reference items in none.
    const counted = r.model.parts.flatMap((pt) => pt.componentIds);
    const manufactured = r.model.components.filter((c) => !c.reference).map((c) => c.id);
    expect([...counted].sort()).toEqual([...manufactured].sort());
    expect(r.model.parts.reduce((a, pt) => a + pt.quantity, 0)).toBe(manufactured.length);
  });

  it.each(ALL)('%s — broken geometry is reported, never silently built', (_, p) => {
    const r = runDesign(p);
    const bad = r.model.components.some((c) => c.size.x <= 0 || c.size.y <= 0 || c.size.z <= 0);
    const overlaps = findOverlaps(r.model.components.filter((c) => !c.reference));
    if (bad || overlaps.length) {
      expect(geometryBroken(r), `${bad ? 'non-positive part' : `overlap ${overlaps[0]}`} without a RED geometry check`).toBe(true);
      expect(r.report.exportBlocked).toBe(true);
    }
  });

  it.each(ALL)('%s — the overall size is the real footprint', (_, p) => {
    const r = runDesign(p);
    if (geometryBroken(r)) return;
    const solid = r.model.components.filter((c) => !c.reference);
    // Bounds honour rotation and angled ends, so an angled member cannot poke outside the stated size.
    const b = boundsOf(solid);
    for (const k of ['x', 'z'] as const) expect(b.max[k] - b.min[k], `${k} footprint`).toBeLessThanOrEqual(r.model.overall[k] + 0.5);
  });

  /**
   * Every board in every catalog item has to be held up by something. Before the geometry engine knew
   * how to measure contact, a part could hang in mid-air — the Montessori ridge board did — and pass
   * every check in the system, because each structural check starts from a member already assumed
   * to be in place.
   */
  /** A board nobody is told how to fit is a board that does not get built. */
  it.each(ALL)('%s — every board appears in the assembly sequence', (_, p) => {
    const r = runDesign(p);
    if (geometryBroken(r) || !r.assembly.length) return;
    const assembled = new Set(r.assembly.flatMap((s) => s.componentIds));
    const missing = r.model.components.filter((c) => !c.reference && !assembled.has(c.id)).map((c) => c.id);
    expect(missing, `missing from the booklet: ${missing.join(', ')}`).toEqual([]);
  });

  it.each(ALL)('%s — no part hangs in mid-air', (_, p) => {
    const r = runDesign(p);
    if (geometryBroken(r)) return;
    const floating = supportReport(r.model.components, { gapMm: r.model.orderStepMm / 2 + 0.6 }).floating;
    expect(floating, `floating: ${floating.join(', ')}`).toEqual([]);
  });

  it.each(ALL)('%s — export is blocked exactly when a blocking category is RED', (_, p) => {
    const r = runDesign(p);
    const blockingRed = r.report.checks.some((c) => c.status === 'RED' && ['geometry', 'materials', 'structure', 'manufacturing', 'safety'].includes(c.category));
    expect(r.report.exportBlocked).toBe(blockingRed);
  });

  it.each(ALL)('%s — assembly steps only reference real parts and hardware', (_, p) => {
    const r = runDesign(p);
    const ids = new Set(r.model.components.map((c) => c.id));
    const hw = new Set(r.model.hardware.map((h) => h.id));
    for (const s of r.assembly) {
      for (const id of s.componentIds) expect(ids.has(id), `step ${s.n} → ${id}`).toBe(true);
      for (const h of s.hardware) expect(hw.has(h), `step ${s.n} → hardware ${h}`).toBe(true);
    }
  });

  it.each(presets)('%s — English output has no Hebrew left in it', (_, p) => {
    const r = runDesign(p, undefined, 'en');
    const texts = [
      ...r.report.checks.flatMap((c: Check) => [c.title, c.explanation, ...c.assumptions, c.requiredVerification ?? '', ...c.fixes.map((f) => f.change.label + f.projectedDetail), ...c.sources.map((s) => `${s.title} ${s.reference}`)]),
      ...r.model.components.map((c) => c.name),
      ...r.model.parts.flatMap((pt) => [pt.name, ...(pt.machining ?? [])]),
      ...r.model.hardware.flatMap((h) => [h.name, h.spec, h.basis]),
      ...r.assembly.flatMap((s) => [s.title, s.warning ?? '']),
    ];
    // Supplier decor names are proper names shown as published (e.g. "ליבנה גלוי") — allowed only in finish ids.
    const offenders = texts.filter((t) => HEBREW.test(t.replaceAll(p.finishId, '')));
    expect(offenders).toEqual([]);
  });
});

describe('audit: every offered fix does what it says', () => {
  const offered = ALL.flatMap(([name, p]) => {
    const r = runDesign(p);
    return r.report.checks.filter((c) => c.status === 'RED').flatMap((c) => c.fixes.map((f) => [`${name} · ${c.id} · ${f.change.label}`, p, c, f] as const));
  });

  it('there are RED fixes to audit', () => expect(offered.length).toBeGreaterThan(5));

  it.each(offered)('%s', (_, p, check, fix) => {
    const after = runDesign(applyChange(p, fix.change));
    const same = after.report.checks.filter((c) => c.id === check.id);
    const worstAfter = same.reduce<number>((w, c) => Math.max(w, SEVERITY[c.status]), -1);
    // The offending check must no longer be RED (or must disappear) after applying its own fix.
    expect(worstAfter, `still ${same.map((c) => c.status)}`).toBeLessThan(SEVERITY.RED);
  });
});

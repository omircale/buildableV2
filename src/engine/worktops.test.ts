import { describe, expect, it } from 'vitest';
import { allMaterials, getMaterial } from './materials';

const WORKTOPS = ['granite_worktop', 'quartz_worktop', 'stainless_304_skin', 'stainless_304_solid', 'solid_surface_corian'];

describe('worktop materials', () => {
  it.each(WORKTOPS)('%s exists and carries a density from a source', (id) => {
    const m = getMaterial(id);
    expect(m, id).toBeDefined();
    expect(m!.densityKgM3.value, `${id} density`).toBeGreaterThan(0);
    expect(m!.densityKgM3.sources.length, `${id} has no source`).toBeGreaterThan(0);
    for (const s of m!.densityKgM3.sources) expect(s.url ?? s.reference, `${id} source is empty`).toBeTruthy();
  });

  it.each(WORKTOPS)('%s says plainly that its strength is not calculated', (id) => {
    const m = getMaterial(id)!;
    // Stone and metal have their own codes, which this engine does not implement. That has to be a
    // stated gap, not an unstated one, and not a refusal either.
    expect(m.outsideEngineScope, `${id} claims to be in scope`).toBeDefined();
    expect(m.outsideEngineScope!.reasonHe.length).toBeGreaterThan(0);
    expect(m.outsideEngineScope!.reasonEn.length).toBeGreaterThan(0);
    expect(m.ec5Class).toBe('not_covered');
    expect(m.properties, `${id} should carry no bending data`).toEqual([]);
  });

  it.each(WORKTOPS)('%s is never offered as a carcass board', (id) => {
    // structuralUse gates the board pickers; a worktop is a surface, not a shelf.
    expect(getMaterial(id)!.structuralUse).toBe(false);
  });
});

describe('what the sources actually said', () => {
  it('granite keeps the range Eurocode gives instead of a midpoint', () => {
    const d = getMaterial('granite_worktop')!.densityKgM3;
    // EN 1991-1-1 Table A.2 gives 27.0–30.0 kN/m³; a single figure would state a precision the
    // standard itself declines to state.
    expect(d.value).toBe(2752);
    expect(d.valueMax).toBe(3058);
    expect(d.note).toContain('9.81');
  });

  it('quartz separates the published minimum from the derived upper end', () => {
    const d = getMaterial('quartz_worktop')!.densityKgM3;
    expect(d.value).toBe(2100);
    expect(d.valueMax).toBe(2390);
    expect(d.noteEn).toContain('derived');
  });

  it('stainless uses the figure two maker datasheets agree on', () => {
    for (const id of ['stainless_304_skin', 'stainless_304_solid']) {
      expect(getMaterial(id)!.densityKgM3.value, id).toBe(8000);
      expect(getMaterial(id)!.densityKgM3.sources.length, id).toBe(2);
    }
  });
});

describe('a stainless worktop is two items, not one', () => {
  it('the skin declares that it needs a substrate under it', () => {
    // Quantifying a 1.2 mm skin as solid metal would overstate weight and cost by roughly the ratio
    // of the two thicknesses. The bill has to carry the carrier board as its own line.
    const skin = getMaterial('stainless_304_skin')!;
    expect(skin.requiresSubstrate).toBeDefined();
    expect(skin.requiresSubstrate!.sources.length).toBeGreaterThan(0);
    expect(skin.thicknessesMm.every((t) => t <= 2.5)).toBe(true);
  });

  it('the solid plate is a different product and needs no carrier', () => {
    const solid = getMaterial('stainless_304_solid')!;
    expect(solid.requiresSubstrate).toBeUndefined();
    expect(solid.thicknessesMm).toEqual([4]);
  });
});

describe('the library as a whole', () => {
  it('a density is either sourced, or declared an assumption with its reason', () => {
    // The two are not the same and both are honest; what is not allowed is a bare number. Several
    // board standards genuinely do not specify density, and those entries say so in the value itself.
    for (const m of allMaterials()) {
      const d = m.densityKgM3;
      if (d.value == null) continue;
      if (d.kind === 'assumption') {
        expect(d.note?.length, `${m.id} assumes a density without saying why`).toBeGreaterThan(0);
      } else {
        expect(d.sources.length, `${m.id} density has no source`).toBeGreaterThan(0);
      }
    }
  });

  it('a range never runs backwards', () => {
    for (const m of allMaterials()) {
      const d = m.densityKgM3;
      if (d.valueMax == null || d.value == null) continue;
      expect(d.valueMax, `${m.id}`).toBeGreaterThan(d.value);
    }
  });
});

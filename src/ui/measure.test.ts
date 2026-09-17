import { describe, expect, it } from 'vitest';
import { runDesign } from '../engine';
import { FURNITURE_TYPES, presetFor } from './furnitureCatalog';
import { componentDims, formatCm, partMeasureLabels } from './measure';

describe('part dimensions shown when a part is isolated', () => {
  it('formats exact centimetres without hiding millimetres', () => {
    expect(formatCm(343.5)).toBe('34.35');
    expect(formatCm(760)).toBe('76');
    expect(formatCm(5.5)).toBe('0.55');
    expect(formatCm(18)).toBe('1.8');
  });

  it('for every component of every catalog item, the drawn size equals its cut-list size', () => {
    for (const type of FURNITURE_TYPES.filter((f) => f.available)) {
      const { model } = runDesign(presetFor(type, { w: null, h: null, d: null })!);
      for (const c of model.components) {
        const d = componentDims(model, c);
        if (c.reference) {
          expect(d.cut, `${type.kind} ${c.id}`).toBeUndefined();
          continue;
        }
        expect(d.cut, `${type.kind} ${c.id} has no part`).toBeDefined();
        const drawn = [d.x, d.y, d.z].sort((a, b) => a - b);
        const cut = [d.cut!.thicknessMm, d.cut!.widthMm, d.cut!.lengthMm].sort((a, b) => a - b);
        for (let i = 0; i < 3; i++) expect(drawn[i], `${type.kind} ${c.id}`).toBeCloseTo(cut[i], 6);
      }
    }
  });

  it('the texts drawn on an isolated part are exactly its own sizes and cut-list size', () => {
    const words = { width: 'W', height: 'H', depth: 'D', thickness: 'T', part: 'Cut', cm: 'cm' };
    for (const type of FURNITURE_TYPES.filter((f) => f.available)) {
      const { model } = runDesign(presetFor(type, { w: null, h: null, d: null })!);
      for (const c of model.components) {
        const l = partMeasureLabels(model, c, words);
        expect(l.x).toMatch(new RegExp(` ${formatCm(c.size.x).replace('.', '\\.')} cm$`));
        expect(l.y).toMatch(new RegExp(` ${formatCm(c.size.y).replace('.', '\\.')} cm$`));
        expect(l.z).toMatch(new RegExp(` ${formatCm(c.size.z).replace('.', '\\.')} cm$`));
        // Exactly one axis is labelled as the board thickness for manufactured boards.
        if (!c.reference) expect([l.x, l.y, l.z].filter((t) => t.startsWith('T ')).length, `${type.kind} ${c.id}`).toBeGreaterThanOrEqual(1);
        const part = model.parts.find((p) => p.componentIds.includes(c.id));
        expect(l.cut).toBe(part ? `${part.id} · Cut: ${formatCm(part.lengthMm)} × ${formatCm(part.widthMm)} × ${formatCm(part.thicknessMm)} cm` : undefined);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_OPEN_SHELF, applyChange, finishFor, runDesign, supplierProductFor, getMaterial } from './index';

const sandwich = { ...DEFAULT_OPEN_SHELF, materialId: 'hayozrim:shelf-sandwich-17mm', thicknessMm: 17 };
const decors = supplierProductFor(getMaterial(sandwich.materialId))!.product.finishes.map((f) => f.id);
const base = { ...sandwich, finishId: decors[0] };

describe('decor per part type and per part', () => {
  it('the board has at least two decors to test with', () => expect(decors.length).toBeGreaterThan(1));

  it('resolution order: part override → part type → body', () => {
    const p = { ...base, roleFinishes: { shelf: decors[1] }, partFinishes: { shelf_2: decors[0] } };
    expect(finishFor({ id: 'side_l', role: 'side' }, p)).toBe(decors[0]);
    expect(finishFor({ id: 'shelf_1', role: 'shelf' }, p)).toBe(decors[1]);
    expect(finishFor({ id: 'shelf_2', role: 'shelf' }, p)).toBe(decors[0]);
  });

  it('a different decor per type splits the cut list and the order lines, geometry unchanged', () => {
    const plain = runDesign(base);
    const colored = runDesign({ ...base, roleFinishes: { side: decors[1] } });
    expect(colored.model.components).toEqual(plain.model.components);
    const sides = colored.model.parts.find((pt) => pt.componentIds.includes('side_l'))!;
    expect(sides.finishId).toBe(decors[1]);
    expect(colored.quote!.lines.some((l) => l.finishId === decors[1])).toBe(true);
    expect(colored.quote!.issues).toEqual([]);
  });

  it('one single shelf in another decor becomes its own part', () => {
    const r = runDesign({ ...base, partFinishes: { shelf_2: decors[1] } });
    const part = r.model.parts.find((pt) => pt.componentIds.includes('shelf_2'))!;
    expect(part.componentIds).toEqual(['shelf_2']);
    expect(part.finishId).toBe(decors[1]);
  });

  it('a decor the board does not come in is RED, and the offered fix clears it', () => {
    const bad = { ...base, roleFinishes: { side: 'no-such-decor' } };
    const check = runDesign(bad).report.checks.find((c) => c.id === 'materials.part_finish')!;
    expect(check.status).toBe('RED');
    const fixed = runDesign(applyChange(bad, check.fixes[0].change));
    expect(fixed.report.checks.find((c) => c.id === 'materials.part_finish')).toBeUndefined();
  });
});

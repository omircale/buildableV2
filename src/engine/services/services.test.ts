import { describe, expect, it } from 'vitest';
import { equipmentById } from '../equipment/catalog';
import { ISRAEL_SUPPLY, serviceDemand, W_PER_BTU_H, type SpaceProgram } from './demand';
import { POOL_BAR_EXAMPLE, SLUSH_KIOSK_EXAMPLE } from './programs';
import { PRODUCTS, productById } from './products';
import { blankSpec, fact, specProblems, unknown, type ProductSpec } from './spec';

const SHEET = { title: 'test sheet', reference: 'table 1' };
const ids = (r: { findings: { id: string }[] }) => r.findings.map((f) => f.id);

/** A model with everything known, for checking the arithmetic. */
function fullSpec(id: string, over: (s: ProductSpec) => void = () => undefined): ProductSpec {
  const s = blankSpec(id, 'slush_machine', 'Test', id, SHEET);
  s.water.required = fact(false, SHEET);
  s.drain.required = fact(false, SHEET);
  s.electrical = {
    voltageV: fact(230, SHEET),
    frequencyHz: fact(50, SHEET),
    phases: fact(1, SHEET),
    powerW: fact(800, SHEET),
    currentA: fact(4, SHEET),
    dedicatedCircuit: fact(true, SHEET),
  };
  s.heat = { condenser: fact('air', SHEET), toRoomW: fact(1200, SHEET) };
  over(s);
  return s;
}
const only = (...specs: ProductSpec[]) => (id: string) => specs.find((s) => s.id === id);
const kiosk = (lines: SpaceProgram['lines'], enclosed: boolean | null = true): SpaceProgram => ({ name: 'test', enclosed, lines });

describe('a model’s data', () => {
  it('every model on file is well formed and belongs to an item in the catalog', () => {
    for (const p of PRODUCTS) {
      expect(specProblems(p), p.id).toEqual([]);
      expect(equipmentById(p.equipmentId), p.id).toBeDefined();
    }
  });

  it('a value without a source, a negative size or three-and-a-half phases is refused', () => {
    const s = fullSpec('x');
    s.size.widthMm = { value: 400, source: null };
    s.massKg = fact(-3, SHEET);
    s.electrical.phases = fact(2 as 1, SHEET);
    expect(specProblems(s)).toEqual(['size.widthMm: a value without a source', 'massKg: not a non-negative number', 'electrical.phases: must be 1 or 3']);
  });

  it('what a sheet does not say stays unknown — not zero, not "none"', () => {
    const ng = productById('ugolini_ng_10_2')!;
    expect(ng.electrical.powerW.value).toBe(740);
    expect(ng.electrical.currentA.value).toBeNull();
    expect(ng.water.required.value).toBeNull();
    expect(ng.drain.required.value).toBeNull();
    expect(ng.heat.toRoomW.value).toBeNull();
  });
});

describe('the arithmetic', () => {
  it('adds connected load, current and heat by count, and converts heat to BTU/h by the NIST factor', () => {
    const r = serviceDemand(kiosk([{ equipmentId: 'slush_machine', count: 3, productId: 'a' }]), ISRAEL_SUPPLY, only(fullSpec('a')));
    expect(r.electrical).toEqual({ connectedW: 2400, complete: true, currentA: 12, dedicatedCircuits: 3 });
    expect(r.heat.toRoomW).toBe(3600);
    expect(r.heat.complete).toBe(true);
    // 3600 W / 0.2930711 W per Btu/h = 12283.7…
    expect(W_PER_BTU_H.value).toBe(0.2930711);
    expect(r.heat.btuPerHour).toBe(12284);
    expect(r.boq.find((b) => b.en === 'Dedicated circuit')?.quantity).toBe(3);
  });

  it('counts the catalog’s points by item and count', () => {
    const r = serviceDemand(POOL_BAR_EXAMPLE);
    const pts = Object.fromEntries(r.points.map((p) => [p.kind, p.quantity]));
    // 2 bar sinks (cold, hot, drain each) + hand basin (cold, hot, drain) + ice maker (cold, drain) + glasswasher's own points.
    const glass = equipmentById('glasswasher')!.services.filter((s) => (s.form ?? 'point') === 'point');
    const of = (kind: string) => glass.filter((s) => s.kind === kind).reduce((a, s) => a + s.quantity, 0);
    expect(pts.water_cold).toBe(2 + 1 + 1 + of('water_cold'));
    expect(pts.drain).toBe(2 + 1 + 1 + of('drain'));
    expect(pts.water_hot).toBe(2 + 1 + of('water_hot'));
  });

  it('a model that needs water the catalog item did not ask for adds the point, once per unit', () => {
    const wet = fullSpec('wet', (s) => {
      s.water.required = fact(true, SHEET);
      s.water.scaleFilter = fact(true, SHEET);
    });
    const r = serviceDemand(kiosk([{ equipmentId: 'slush_machine', count: 2, productId: 'wet' }]), ISRAEL_SUPPLY, only(wet));
    expect(r.points.find((p) => p.kind === 'water_cold')?.quantity).toBe(2);
    expect(r.boq.find((b) => b.en === 'Scale filter')?.quantity).toBe(2);
  });
});

describe('what is not known is said, never guessed', () => {
  it('a model with no published power leaves the load a floor, and says which', () => {
    const half = fullSpec('half', (s) => (s.electrical.powerW = unknown()));
    const r = serviceDemand(
      kiosk([
        { equipmentId: 'slush_machine', count: 1, productId: 'a' },
        { equipmentId: 'slush_machine', count: 1, productId: 'half' },
      ]),
      ISRAEL_SUPPLY,
      only(fullSpec('a'), half),
    );
    expect(r.electrical.connectedW).toBe(800);
    expect(r.electrical.complete).toBe(false);
    expect(ids(r)).toContain('power_unknown_1');
  });

  it('current is never made up from power: one unknown current and there is no total', () => {
    const r = serviceDemand(kiosk([{ equipmentId: 'slush_machine', count: 1, productId: 'ugolini_ng_10_2' }]));
    expect(r.electrical.connectedW).toBe(740);
    expect(r.electrical.currentA).toBeNull();
    expect(r.electrical.dedicatedCircuits).toBeNull();
    expect(r.boq.find((b) => b.en === 'Dedicated circuit')?.quantity).toBeNull();
  });

  it('no model chosen: the item is counted, its power and heat are not', () => {
    const r = serviceDemand(kiosk([{ equipmentId: 'slush_machine', count: 1 }]));
    expect(r.lines[0].product).toBeNull();
    expect(r.electrical.complete).toBe(false);
    expect(r.heat.complete).toBe(false);
    expect(ids(r)).toContain('no_model_0');
    expect(r.boq[0]).toMatchObject({ quantity: 1, noteEn: 'model not chosen' });
  });

  it('a sheet silent on water and drain asks for confirmation instead of assuming none', () => {
    const r = serviceDemand(SLUSH_KIOSK_EXAMPLE);
    expect(ids(r)).toEqual(expect.arrayContaining(['water_unconfirmed_0', 'drain_unconfirmed_0']));
    expect(r.points.find((p) => p.kind === 'water_cold')?.quantity).toBe(1); // the hand basin's, nothing invented
  });

  it('in a closed room, unknown heat means ventilation cannot be checked yet', () => {
    const r = serviceDemand(SLUSH_KIOSK_EXAMPLE);
    expect(r.findings.find((f) => f.id === 'ventilation_design')).toMatchObject({ severity: 'warning', discipline: 'hvac' });
    const known = serviceDemand(kiosk([{ equipmentId: 'slush_machine', count: 1, productId: 'a' }]), ISRAEL_SUPPLY, only(fullSpec('a')));
    expect(known.findings.find((f) => f.id === 'ventilation_design')).toMatchObject({ severity: 'info' });
    expect(known.findings.find((f) => f.id === 'ventilation_design')?.en).toContain('1200 W');
  });

  it('the electrical design is always left to a licensed electrician', () => {
    expect(ids(serviceDemand(POOL_BAR_EXAMPLE))).toContain('electrical_design');
  });
});

describe('what is wrong blocks', () => {
  it('a model built for another supply blocks, citing the site supply', () => {
    const us = fullSpec('us', (s) => {
      s.electrical.voltageV = fact(115, SHEET);
      s.electrical.frequencyHz = fact(60, SHEET);
    });
    const r = serviceDemand(kiosk([{ equipmentId: 'slush_machine', count: 1, productId: 'us' }]), ISRAEL_SUPPLY, only(us));
    expect(r.findings.filter((f) => f.severity === 'blocking').map((f) => f.id)).toEqual(['supply_V_0', 'supply_Hz_0']);
    expect(ISRAEL_SUPPLY.voltageV.source?.url).toContain('iec.ch');
  });

  it('an unknown item, a bad count, an unknown model or one for another item blocks', () => {
    const r = serviceDemand(
      kiosk([
        { equipmentId: 'flux_capacitor', count: 1 },
        { equipmentId: 'slush_machine', count: 0 },
        { equipmentId: 'slush_machine', count: 1, productId: 'nope' },
        { equipmentId: 'ice_maker', count: 1, productId: 'ugolini_ng_6_1' },
      ]),
    );
    expect(r.findings.filter((f) => f.severity === 'blocking').map((f) => f.id)).toEqual(['unknown_item_0', 'bad_count_1', 'unknown_product_2', 'wrong_product_3']);
  });

  it('a model with bad data is not used', () => {
    const bad = fullSpec('bad', (s) => (s.electrical.powerW = { value: 500, source: null }));
    const r = serviceDemand(kiosk([{ equipmentId: 'slush_machine', count: 1, productId: 'bad' }]), ISRAEL_SUPPLY, only(bad));
    expect(ids(r)).toContain('bad_spec_0');
    expect(r.electrical.connectedW).toBe(0);
    expect(r.lines[0].product).toBeNull();
  });
});

describe('the pool bar example, end to end', () => {
  it('runs clean of blocking findings and accounts for every line', () => {
    const r = serviceDemand(POOL_BAR_EXAMPLE);
    expect(r.findings.filter((f) => f.severity === 'blocking')).toEqual([]);
    expect(r.lines).toHaveLength(POOL_BAR_EXAMPLE.lines.length);
    expect(r.electrical.connectedW).toBe(740);
    expect(r.electrical.complete).toBe(false);
    // An open deck: no ventilation finding for heat.
    expect(ids(r)).not.toContain('ventilation_design');
  });
});

describe('the workbook', () => {
  it('carries the bill and every finding, most serious first, and never prints an unknown as a number', async () => {
    const { demandSheets } = await import('./sheet');
    const r = serviceDemand(SLUSH_KIOSK_EXAMPLE);
    const [summary, bill, findings] = demandSheets(SLUSH_KIOSK_EXAMPLE, r, 'he');
    // The totals first, and a partial one says so.
    const row = (label: string) => summary.rows.find((x) => x[0] === label);
    expect(row('עומס חשמל מחובר')?.[1]).toBe('לפחות 1792 W');
    expect(row('זרם נקוב')?.[1]).toBe('לא ידוע');
    expect(row('חום לחדר')?.[1]).toBe('לא ידוע');
    expect(bill.rows[0][0]).toBe('כתב כמויות — עמדת ברד בקיוסק');
    expect(bill.rows.find((row) => row[1] === 'מעגל חשמל ייעודי')?.[3]).toBe('לא ידוע');
    expect(findings.rows).toHaveLength(r.findings.length + 1);
    const levels = findings.rows.slice(1).map((row) => row[0]);
    expect(levels.indexOf('מידע')).toBeGreaterThan(levels.lastIndexOf('לבדיקה'));
  });
});

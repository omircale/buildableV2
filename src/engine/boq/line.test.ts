import { describe, expect, it } from 'vitest';
import { SERVICE_TRADE } from '../equipment/catalog';
import { emptySpace, type Space } from '../space/space';
import { TRADE_LABEL, UNIT_LABEL, byLevel, byLocation, byTrade, locationKey, totals, type BoqLine, type Trade } from './line';
import { billProblems, serviceTradesCovered, unknownTrades, type Project } from './validate';

const POOL_BAR = { levelId: '0', spaceId: 'pool_bar', buildingId: 'main' };
const KITCHEN = { levelId: '-1', spaceId: 'kitchen', buildingId: 'main' };

function line(over: Partial<BoqLine> & Pick<BoqLine, 'id'>): BoqLine {
  return {
    trade: 'plumbing',
    section: 'water_points',
    descriptionHe: 'נקודת מים קרים',
    descriptionEn: 'Cold water point',
    unit: 'unit',
    quantity: 1,
    location: POOL_BAR,
    origin: { kind: 'service_point', ref: 'wc_new_1' },
    unitPriceIls: null,
    sources: [],
    ...over,
  };
}

function project(): Project {
  const bar: Space = { ...emptySpace('pool_bar', 'בר בריכה', 'Pool bar'), zones: [{ id: 'front', nameHe: 'חזית', nameEn: 'Front' }] };
  return { levelIds: ['-1', '0'], spaces: [bar, emptySpace('kitchen', 'מטבח', 'Kitchen')], buildingIds: ['main'] };
}

describe('location is not optional', () => {
  it('a line carries a building, a level, a room and optionally a zone', () => {
    const l = line({ id: 'l1' });
    expect(l.location.levelId).toBe('0');
    expect(l.location.spaceId).toBe('pool_bar');
    expect(locationKey(l.location)).toBe('main/0/pool_bar/-');
    expect(locationKey({ ...POOL_BAR, zoneId: 'front' })).toBe('main/0/pool_bar/front');
  });

  it('keeps the level as the hotel spells it, not as a number', () => {
    // A hotel has a basement at −1, a lobby level and often no thirteenth floor. Storing a number
    // would lose the name and force a translation at every edge.
    const levels = ['-1', '0', 'lobby', 'pool_deck', '12', '14'];
    for (const levelId of levels) {
      expect(byLevel([line({ id: `l_${levelId}`, location: { ...POOL_BAR, levelId } })])[0].key).toBe(levelId);
    }
  });
});

describe('the document by trade, the work by location', () => {
  const lines = [
    line({ id: 'p1', trade: 'plumbing', section: 'water_points', location: POOL_BAR }),
    line({ id: 'p2', trade: 'plumbing', section: 'drains', location: KITCHEN }),
    line({ id: 'e1', trade: 'electrical', section: 'circuits', location: POOL_BAR }),
    line({ id: 'j1', trade: 'joinery', section: 'carcasses', location: POOL_BAR }),
  ];

  it('the same lines read by trade for the tender', () => {
    const groups = byTrade(lines);
    expect(groups.map((g) => g.key)).toEqual(['joinery', 'plumbing', 'electrical']);
    expect(groups.find((g) => g.key === 'plumbing')!.lines).toHaveLength(2);
    // Chapters come out in the bill's own order, not alphabetically or by how many lines they hold.
    expect(groups.map((g) => g.key)).toEqual((Object.keys(TRADE_LABEL) as Trade[]).filter((t) => groups.some((g) => g.key === t)));
  });

  it('and by location for the site', () => {
    const groups = byLocation(lines);
    expect(groups).toHaveLength(2);
    const bar = groups.find((g) => g.key === 'main/0/pool_bar/-')!;
    expect(bar.lines.map((l) => l.id)).toEqual(['p1', 'e1', 'j1']);
    // Three trades in one room — which is what makes the work view worth having.
    expect(bar.extra.trades).toEqual(['plumbing', 'electrical', 'joinery']);
  });

  it('no line is lost or duplicated between the two views', () => {
    const viaTrade = byTrade(lines).flatMap((g) => g.lines.map((l) => l.id)).sort();
    const viaLocation = byLocation(lines).flatMap((g) => g.lines.map((l) => l.id)).sort();
    expect(viaTrade).toEqual(viaLocation);
    expect(viaTrade).toEqual(['e1', 'j1', 'p1', 'p2']);
  });

  it('subdivides a chapter into its sections for subtotals', () => {
    const plumbing = byTrade(lines).find((g) => g.key === 'plumbing')!;
    expect(plumbing.extra.sections.map((s) => s.section)).toEqual(['drains', 'water_points']);
  });

  it('groups by level, which is what a haulage allowance is built from', () => {
    const levels = byLevel(lines);
    expect(levels.map((g) => g.key)).toEqual(['-1', '0']);
    expect(levels.find((g) => g.key === '0')!.lines).toHaveLength(3);
  });

  it('a zone splits a room without splitting the bill', () => {
    const zoned = [
      line({ id: 'z1', location: { ...POOL_BAR, zoneId: 'front' } }),
      line({ id: 'z2', location: { ...POOL_BAR, zoneId: 'back' } }),
    ];
    expect(byLocation(zoned)).toHaveLength(2);
    expect(byLevel(zoned)).toHaveLength(1);
    expect(byTrade(zoned)[0].lines).toHaveLength(2);
  });
});

describe('a total never pretends to be complete', () => {
  it('adds up only the lines that are both quantified and priced, and counts the rest', () => {
    const t = totals([
      line({ id: 'a', quantity: 3, unitPriceIls: 250, sources: [] }),
      line({ id: 'b', quantity: 2, unitPriceIls: 100, sources: [] }),
      line({ id: 'c', quantity: 5, unitPriceIls: null }),
      line({ id: 'd', quantity: null, unknownReasonHe: 'חסר', unknownReasonEn: 'missing', unitPriceIls: 400 }),
    ]);
    expect(t.pricedIls).toBe(950);
    expect(t.pricedLines).toBe(2);
    expect(t.missingPrice).toBe(1);
    expect(t.missingQuantity).toBe(1);
    expect(t.complete).toBe(false);
  });

  it('a line with no quantity is never priced, even when a unit price is known', () => {
    // 400 ILS × unknown is not 400, and it is not zero either.
    const t = totals([line({ id: 'd', quantity: null, unknownReasonHe: 'חסר', unknownReasonEn: 'missing', unitPriceIls: 400 })]);
    expect(t.pricedIls).toBe(0);
    expect(t.pricedLines).toBe(0);
    expect(t.missingQuantity).toBe(1);
  });

  it('says complete only when every line is quantified and priced', () => {
    const t = totals([line({ id: 'a', quantity: 3, unitPriceIls: 250 }), line({ id: 'b', quantity: 1, unitPriceIls: 50 })]);
    expect(t.pricedIls).toBe(800);
    expect(t.complete).toBe(true);
  });

  it('an empty bill is not a complete bill', () => {
    expect(totals([])).toMatchObject({ lines: 0, pricedIls: 0, complete: false });
  });

  it('the two views produce the same money from the same lines', () => {
    const lines = [
      line({ id: 'a', trade: 'plumbing', location: POOL_BAR, quantity: 3, unitPriceIls: 250 }),
      line({ id: 'b', trade: 'joinery', location: KITCHEN, quantity: 2, unitPriceIls: 900 }),
    ];
    const sum = (gs: { totals: { pricedIls: number } }[]) => gs.reduce((a, g) => a + g.totals.pricedIls, 0);
    expect(sum(byTrade(lines))).toBe(2550);
    expect(sum(byLocation(lines))).toBe(2550);
    expect(sum(byLevel(lines))).toBe(2550);
  });
});

describe('the bill checks itself', () => {
  it('a clean bill reports nothing', () => {
    expect(billProblems([line({ id: 'l1', location: { ...POOL_BAR, zoneId: 'front' } })], project())).toEqual([]);
  });

  it('a line in a room that is not in the project is a red', () => {
    const problems = billProblems([line({ id: 'l1', location: { ...POOL_BAR, spaceId: 'spa' } })], project());
    expect(problems.map((p) => p.code)).toEqual(['line_in_unknown_space']);
    expect(problems[0].severity).toBe('red');
  });

  it('a floor spelled two ways in one bill is caught', () => {
    // "0" and "קרקע" for the same level silently splits the work view in half, and nothing about the
    // printed document looks wrong.
    const problems = billProblems([line({ id: 'l1', location: { ...POOL_BAR, levelId: 'קרקע' } })], project());
    expect(problems.map((p) => p.code)).toEqual(['line_on_unknown_level']);
  });

  it('a zone that the room does not define is a yellow, not a red', () => {
    // The work still happens in a known room; only the sub-location is loose.
    const problems = billProblems([line({ id: 'l1', location: { ...POOL_BAR, zoneId: 'cellar' } })], project());
    expect(problems.map((p) => p.code)).toEqual(['line_in_unknown_zone']);
    expect(problems[0].severity).toBe('yellow');
  });

  it('an unquantified line with no reason cannot be chased', () => {
    const problems = billProblems([line({ id: 'l1', quantity: null })], project());
    expect(problems.map((p) => p.code)).toEqual(['unknown_quantity_without_reason']);
  });

  it('an unquantified line that says what is missing is accepted', () => {
    const ok = line({ id: 'l1', quantity: null, unknownReasonHe: 'טרם נבחר דגם כיור', unknownReasonEn: 'No sink model chosen yet' });
    expect(billProblems([ok], project())).toEqual([]);
  });

  it('a price with no source is refused', () => {
    const problems = billProblems([line({ id: 'l1', unitPriceIls: 480, sources: [] })], project());
    expect(problems.map((p) => p.code)).toEqual(['price_without_source']);
  });

  it('a duplicate line id is caught before it doubles a total', () => {
    const problems = billProblems([line({ id: 'l1' }), line({ id: 'l1' })], project());
    expect(problems.map((p) => p.code)).toEqual(['duplicate_line_id']);
  });

  it('a negative quantity is caught', () => {
    const problems = billProblems([line({ id: 'l1', quantity: -2 })], project());
    expect(problems.map((p) => p.code)).toContain('negative_quantity');
  });

  it('a building not in the project is caught, and an unnamed building is not', () => {
    expect(billProblems([line({ id: 'l1', location: { ...POOL_BAR, buildingId: 'annexe' } })], project()).map((p) => p.code)).toEqual([
      'line_in_unknown_building',
    ]);
    const noBuilding = line({ id: 'l2', location: { levelId: '0', spaceId: 'pool_bar' } });
    expect(billProblems([noBuilding], project())).toEqual([]);
  });

  it('every problem is written in both languages and names its line', () => {
    const problems = billProblems([line({ id: 'l1', quantity: null, location: { levelId: 'x', spaceId: 'y' } })], project());
    expect(problems.length).toBeGreaterThan(1);
    for (const p of problems) {
      expect(p.he.length, p.code).toBeGreaterThan(0);
      expect(p.en.length, p.code).toBeGreaterThan(0);
      expect(p.lineId).toBe('l1');
    }
  });
});

describe('the chapters and the rest of the engine stay in step', () => {
  it('every trade a service point lands in is a chapter of the bill', () => {
    // If these drift, a counted water point has nowhere to be printed and vanishes silently.
    expect(serviceTradesCovered()).toBe(true);
    for (const trade of Object.values(SERVICE_TRADE)) expect(TRADE_LABEL[trade], trade).toBeDefined();
  });

  it('every chapter and unit is named in both languages', () => {
    for (const [k, v] of Object.entries(TRADE_LABEL)) {
      expect(v.he.length, k).toBeGreaterThan(0);
      expect(v.en.length, k).toBeGreaterThan(0);
    }
    for (const [k, v] of Object.entries(UNIT_LABEL)) {
      expect(v.he.length, k).toBeGreaterThan(0);
      expect(v.en.length, k).toBeGreaterThan(0);
    }
  });

  it('reports a trade read in from outside that is not a chapter', () => {
    const rogue = { ...line({ id: 'l1' }), trade: 'landscaping' as Trade };
    expect(unknownTrades([rogue])).toEqual(['landscaping']);
    expect(unknownTrades([line({ id: 'l2' })])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { LICENSED_TRADES, SERVICE_TRADE } from '../equipment/catalog';
import { emptySpace, type Space } from '../space/space';
import type { ServiceSource } from '../space/supply';
import { byTrade, totals, type LineLocation } from './line';
import { mepLines, mepOpenQuestions, requiresLicensedDesign } from './mep';
import { billProblems, type Project } from './validate';

const AT: LineLocation = { buildingId: 'main', levelId: '0', spaceId: 'pool_bar' };
const BAR_EQUIPMENT = ['bar_sink_single', 'bar_tap', 'undercounter_fridge', 'ice_maker', 'waste_bin_unit'];

function poolBar(): Space {
  return {
    ...emptySpace('pool_bar', 'בר בריכה', 'Pool bar'),
    footprintMm: [
      { x: 0, y: 0 },
      { x: 7200, y: 0 },
      { x: 7200, y: 3600 },
      { x: 0, y: 3600 },
    ],
    heightMm: 2700,
    openEdges: [0],
    connections: [
      { id: 'wc1', kind: 'water_cold', atMm: { x: 6800, y: 600, z: 3400 }, existing: true, fedBy: 'main_w' },
      { id: 'dr1', kind: 'drain', atMm: { x: 6900, y: 0, z: 3500 }, existing: true, fedBy: 'stack_a' },
      { id: 'el1', kind: 'electrical', atMm: { x: 200, y: 1200, z: 3500 }, existing: true, fedBy: 'panel_bar' },
    ],
  };
}

const SOURCES: ServiceSource[] = [
  { id: 'main_w', kind: 'water_cold', nameHe: 'ראשי מים', nameEn: 'Water main', atMm: { x: 7100, y: 400, z: 3550 }, ratingHe: '1″', ratingEn: '1″', spareWays: null },
  { id: 'stack_a', kind: 'drain', nameHe: 'קולטן A', nameEn: 'Stack A', atMm: { x: 7000, y: 0, z: 3550 }, spareWays: null },
  { id: 'panel_bar', kind: 'electrical', nameHe: 'לוח משנה בר', nameEn: 'Bar sub-panel', atMm: { x: 200, y: 1400, z: 3500 }, ratingHe: '3×25A', ratingEn: '3×25A', spareWays: 3 },
];

function lines() {
  return mepLines({ space: poolBar(), sources: SOURCES, equipmentIds: BAR_EQUIPMENT, location: AT, atMm: { x: 1200, y: 900, z: 500 } });
}

describe('points are counted', () => {
  it('a point line carries a real quantity', () => {
    const cold = lines().find((l) => l.id === 'mep_water_cold_points')!;
    expect(cold.quantity).toBe(1);
    expect(cold.unit).toBe('point');
    expect(cold.trade).toBe('plumbing');
  });

  it('a service the room already covers produces no line at all', () => {
    // Nothing needs gas in this bar, and an empty chapter is not a chapter.
    expect(lines().some((l) => l.trade === 'gas')).toBe(false);
  });

  it('the point counts across the bill match what the room is short of', () => {
    const points = lines().filter((l) => l.section === 'points');
    expect(points.reduce((a, l) => a + (l.quantity ?? 0), 0)).toBe(4);
  });
});

describe('what the counting is too coarse to see', () => {
  it('counts any existing point of a kind against a need, and a socket is not a dedicated circuit', () => {
    // Recorded rather than hidden, like the fridge's ventilation clearance. matchServices counts
    // points by kind, so a general-purpose socket in the corner offsets a fridge's need for a
    // dedicated circuit — which it does not actually satisfy. The count therefore understates the
    // electrical work by up to one point per existing socket. Making this right needs the point to
    // carry what it is (dedicated, general, switched), which waits on a real bill's vocabulary.
    const bar = poolBar();
    const socketOnly: Space = { ...bar, connections: bar.connections.filter((c) => c.kind === 'electrical') };
    const generated = mepLines({ space: socketOnly, sources: SOURCES, equipmentIds: BAR_EQUIPMENT, location: AT });
    const power = generated.find((l) => l.id === 'mep_electrical_points')!;
    // Two dedicated circuits are wanted; one existing point offsets one of them.
    expect(power.quantity).toBe(1);
    // The description still sends the reader to the electrician, which is the mitigation that exists today.
    expect(power.descriptionHe).toContain('בעל מקצוע מוסמך');
  });
});

describe('a clearance reaches the joiner without becoming a point', () => {
  it('lands in the joinery chapter, not in hvac', () => {
    // It is the joinery that has to leave the gap, so it is the joinery that has to be told.
    const clearance = lines().find((l) => l.id === 'clearance_ventilation')!;
    expect(clearance.trade).toBe('joinery');
    expect(clearance.section).toBe('clearances');
  });

  it('names the item it is for and says it is not something installed', () => {
    const clearance = lines().find((l) => l.id === 'clearance_ventilation')!;
    expect(clearance.descriptionHe).toContain('מקרר תת-דלפקי');
    expect(clearance.descriptionHe).toContain('לא נקודה שמותקנת');
    expect(clearance.descriptionEn).toContain('not a point that gets installed');
    expect(clearance.origin).toEqual({ kind: 'equipment', ref: 'undercounter_fridge' });
  });

  it('has no dimension, because the dimension is the maker’s', () => {
    const clearance = lines().find((l) => l.id === 'clearance_ventilation')!;
    expect(clearance.quantity).toBeNull();
    expect(clearance.unknownReasonHe).toContain('היצרן');
    expect(clearance.unknownReasonEn).toContain("maker's figure");
  });

  it('two of the same item are named once, with a count', () => {
    const two = mepLines({ space: poolBar(), sources: SOURCES, equipmentIds: ['undercounter_fridge', 'undercounter_fridge'], location: AT });
    const clearance = two.find((l) => l.id === 'clearance_ventilation')!;
    expect(clearance.descriptionHe).toContain('מקרר תת-דלפקי ×2');
    expect(clearance.descriptionHe.match(/מקרר תת-דלפקי/g)).toHaveLength(1);
  });

  it('is absent when nothing in the room asks for one', () => {
    const generated = mepLines({ space: poolBar(), sources: SOURCES, equipmentIds: ['bar_sink_single'], location: AT });
    expect(generated.some((l) => l.section === 'clearances')).toBe(false);
  });
});

describe('a point includes its own feed, the way an Israeli bill prices one', () => {
  it('is counted in points, not in items', () => {
    // A published bill prices "נקודת מאור … וקווי הזנתם עד הלוח" per נק'. The unit is the convention.
    for (const l of lines().filter((x) => x.section === 'points')) expect(l.unit, l.id).toBe('point');
  });

  it('says the feed is inside the point', () => {
    const drain = lines().find((l) => l.id === 'mep_drain_points')!;
    expect(drain.descriptionHe).toContain('כולל קו ההזנה עד המקור');
    expect(drain.descriptionEn).toContain('including the run that feeds it');
  });

  it('there is no line for a length of pipe or cable anywhere', () => {
    // The length is the output of a licensed design and lives inside the point's price. A separate
    // metre line would need a number nobody has, and would not match how the trade is tendered.
    expect(lines().some((l) => l.unit === 'm')).toBe(false);
  });

  it('reports the straight-line distance and says in the same breath that it is not a pipe length', () => {
    // The distance is a genuinely useful fact about the room. Calling it a length of pipe would not be.
    const drain = lines().find((l) => l.id === 'mep_drain_points')!;
    expect(drain.assumptionHe).toMatch(/מרחק אווירי של \d+\.\d מ'/);
    expect(drain.assumptionHe).toContain('מרחק אווירי אינו אורך צינור');
    expect(drain.assumptionEn).toContain('not a length of pipe');
  });

  it('omits the distance rather than guessing when the source was never located', () => {
    const unlocated = SOURCES.map((s) => ({ ...s, atMm: null }));
    const drain = mepLines({ space: poolBar(), sources: unlocated, equipmentIds: BAR_EQUIPMENT, location: AT, atMm: { x: 0, y: 0, z: 0 } }).find((l) => l.id === 'mep_drain_points')!;
    expect(drain.assumptionHe).not.toContain('מרחק');
    expect(drain.quantity).toBeGreaterThan(0);
  });

  it('says which equipment the points are for', () => {
    const drain = lines().find((l) => l.id === 'mep_drain_points')!;
    expect(drain.assumptionHe).toContain('עבור: כיור בר חד-תא, מכונת קרח');
    expect(drain.assumptionEn).toContain('For: ');
  });

  it('omits the distance when nobody has placed the equipment yet', () => {
    const drain = mepLines({ space: poolBar(), sources: SOURCES, equipmentIds: BAR_EQUIPMENT, location: AT }).find((l) => l.id === 'mep_drain_points')!;
    expect(drain.assumptionEn).not.toContain('straight line');
  });
});

describe('a service the room does not have at all', () => {
  it('becomes a lump with no quantity, not a point count', () => {
    // No hot water source reaches this bar. "One hot water point" would badly understate the job.
    const bring = lines().find((l) => l.id === 'mep_water_hot_bring_supply')!;
    expect(bring.unit).toBe('lump');
    expect(bring.quantity).toBeNull();
  });

  it('does not say there is none until somebody has looked', () => {
    // Nobody wrote a source down. That is not the same as there being none, and the line says which.
    const bring = lines().find((l) => l.id === 'mep_water_hot_bring_supply')!;
    expect(bring.unknownReasonHe).toContain('לא נרשם מקור');
    expect(bring.unknownReasonHe).toContain('לבדוק בשטח');
    expect(bring.unknownReasonEn).toContain('nobody has confirmed');
    expect(bring.descriptionHe).toContain('אם יתברר');
  });

  it('says there is none once a person who checked has said so', () => {
    const bring = mepLines({ space: poolBar(), sources: SOURCES, equipmentIds: BAR_EQUIPMENT, location: AT, confirmedAbsent: ['water_hot'] }).find((l) => l.id === 'mep_water_hot_bring_supply')!;
    expect(bring.unknownReasonHe).toContain('אין מקור');
    expect(bring.unknownReasonEn).toContain('cannot establish');
    expect(bring.descriptionHe).not.toContain('אם יתברר');
  });

  it('is never raised for a service the room demonstrably has, even untraced', () => {
    const withDrain: Space = { ...poolBar(), connections: [{ id: 'dr_x', kind: 'drain', atMm: null, existing: true }] };
    const generated = mepLines({ space: withDrain, sources: [], equipmentIds: BAR_EQUIPMENT, location: AT });
    expect(generated.some((l) => l.id === 'mep_drain_bring_supply')).toBe(false);
  });

  it('and the point line for it still exists, because the point is still a point', () => {
    const point = lines().find((l) => l.id === 'mep_water_hot_points')!;
    expect(point.quantity).toBe(1);
  });
});

describe('every MEP line flags the licensed trade', () => {
  it('every line that counts a service point sits in a licensed trade', () => {
    for (const l of lines().filter((x) => x.section !== 'clearances')) expect(LICENSED_TRADES.has(l.trade), l.id).toBe(true);
    // And the one line that is not a service point is deliberately not in a licensed trade.
    expect(LICENSED_TRADES.has(lines().find((l) => l.section === 'clearances')!.trade)).toBe(false);
  });

  it('the flag is derived from the trade so it cannot drift from the line', () => {
    for (const trade of Object.values(SERVICE_TRADE)) expect(requiresLicensedDesign(trade), trade).toBe(trade !== 'communications');
    expect(requiresLicensedDesign('joinery')).toBe(false);
    expect(requiresLicensedDesign('finishes')).toBe(false);
  });

  it('every description says out loud that it is a quantity and not a design', () => {
    for (const l of lines().filter((x) => x.section !== 'clearances')) {
      expect(l.descriptionHe, l.id).toContain('בעל מקצוע מוסמך');
      expect(l.descriptionEn, l.id).toContain('licensed professional');
    }
  });
});

describe('the bill this produces holds together', () => {
  it('passes the bill validator', () => {
    const project: Project = { levelIds: ['0'], spaces: [poolBar()], buildingIds: ['main'] };
    expect(billProblems(lines(), project)).toEqual([]);
  });

  it('carries no price anywhere, and therefore no total', () => {
    const t = totals(lines());
    expect(t.pricedIls).toBe(0);
    expect(t.pricedLines).toBe(0);
    expect(t.complete).toBe(false);
    // Most of the bill is waiting on a licensed design, and the count says so rather than hiding it.
    expect(t.missingQuantity).toBeGreaterThan(0);
  });

  it('reads as the chapters the work actually falls in, with no hvac chapter for a gap', () => {
    // An hvac chapter whose only line was a clearance was a chapter that should not have existed. The
    // clearance is joinery, because the joiner is who leaves the gap.
    expect(byTrade(lines()).map((g) => g.key)).toEqual(['joinery', 'plumbing', 'electrical']);
  });

  it('every line lands in the room it was generated for', () => {
    for (const l of lines()) expect(l.location).toEqual(AT);
  });
});

describe('the questions the bill is waiting on', () => {
  it('are a separate list, not bill lines', () => {
    const questions = mepOpenQuestions({ space: poolBar(), sources: SOURCES, equipmentIds: BAR_EQUIPMENT });
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q.he.length, q.kind).toBeGreaterThan(0);
      expect(q.en.length, q.kind).toBeGreaterThan(0);
    }
  });

  it('do not include the one service whose capacity an electrician actually stated', () => {
    const kinds = mepOpenQuestions({ space: poolBar(), sources: SOURCES, equipmentIds: BAR_EQUIPMENT }).map((q) => q.kind);
    expect(kinds).not.toContain('electrical');
    expect(kinds).toContain('water_hot');
  });

  it('an unsurveyed room is all questions and still emits its point counts', () => {
    const blank = emptySpace('pool_bar', 'בר', 'Bar');
    const generated = mepLines({ space: blank, sources: [], equipmentIds: BAR_EQUIPMENT, location: AT });
    expect(generated.filter((l) => l.section === 'points').every((l) => l.quantity! > 0)).toBe(true);
    expect(mepOpenQuestions({ space: blank, sources: [], equipmentIds: BAR_EQUIPMENT }).length).toBe(4);
  });
});

describe('an office: data points are counted, filed under communications, and not called licensed', () => {
  // A measured room with nothing in it yet, so every point the desks need is a new one.
  const office = () => mepLines({ space: { ...poolBar(), connections: [] }, sources: [], equipmentIds: ['workstation', 'workstation', 'workstation', 'wifi_access_point'], location: AT });

  it('three desks and an access point are four data points', () => {
    const data = office().find((l) => l.id === 'mep_data_points')!;
    expect(data.quantity).toBe(4);
    expect(data.unit).toBe('point');
    expect(data.trade).toBe('communications');
  });

  it('the data line speaks of the communications design and makes no claim about a licence', () => {
    const data = office().find((l) => l.id === 'mep_data_points')!;
    expect(data.descriptionHe).toContain('תכנון התקשורת');
    expect(data.descriptionHe).not.toContain('מוסמך');
    expect(data.descriptionEn).not.toContain('licensed');
  });

  it('the power line beside it still does', () => {
    const power = office().find((l) => l.id === 'mep_electrical_points')!;
    expect(power.quantity).toBe(3);
    expect(power.descriptionEn).toContain('licensed professional');
  });
});

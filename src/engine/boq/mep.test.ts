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
    expect(cold.unit).toBe('unit');
    expect(cold.trade).toBe('plumbing');
  });

  it('a service the room already covers produces no line at all', () => {
    // Nothing needs gas in this bar, and an empty chapter is not a chapter.
    expect(lines().some((l) => l.trade === 'gas')).toBe(false);
  });

  it('the point counts across the bill match what the room is short of', () => {
    const points = lines().filter((l) => l.section.endsWith('_points'));
    expect(points.reduce((a, l) => a + (l.quantity ?? 0), 0)).toBe(5);
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

describe('a length is never counted, because a length is a design', () => {
  it('every run line has no quantity and says why', () => {
    const runs = lines().filter((l) => l.section.endsWith('_runs'));
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) {
      expect(r.quantity, r.id).toBeNull();
      expect(r.unit).toBe('m');
      expect(r.unknownReasonHe, r.id).toBeTruthy();
      expect(r.unknownReasonEn, r.id).toBeTruthy();
    }
  });

  it('the reason names the licensed trade rather than blaming missing data', () => {
    const run = lines().find((l) => l.id === 'mep_drain_run')!;
    expect(run.unknownReasonHe).toContain('אינסטלציה');
    expect(run.unknownReasonEn).toContain('licensed plumbing design');
  });

  it('reports the straight-line distance and says in the same breath that it is not a pipe length', () => {
    // The distance is a genuinely useful fact about the room. Calling it a length of pipe would not be.
    const run = lines().find((l) => l.id === 'mep_drain_run')!;
    expect(run.descriptionHe).toMatch(/מרחק אווירי של \d+\.\d מ'/);
    expect(run.descriptionEn).toMatch(/\d+\.\d m away in a straight line/);
    expect(run.unknownReasonHe).toContain('המרחק האווירי אינו אורך צינור');
    expect(run.unknownReasonEn).toContain('not a length of pipe');
  });

  it('omits the distance rather than guessing when the source was never located', () => {
    const unlocated = SOURCES.map((s) => ({ ...s, atMm: null }));
    const run = mepLines({ space: poolBar(), sources: unlocated, equipmentIds: BAR_EQUIPMENT, location: AT, atMm: { x: 0, y: 0, z: 0 } }).find(
      (l) => l.id === 'mep_drain_run',
    )!;
    expect(run.descriptionHe).not.toContain('מרחק');
    expect(run.quantity).toBeNull();
  });

  it('omits the distance when nobody has placed the equipment yet', () => {
    const run = mepLines({ space: poolBar(), sources: SOURCES, equipmentIds: BAR_EQUIPMENT, location: AT }).find((l) => l.id === 'mep_drain_run')!;
    expect(run.descriptionEn).not.toContain('straight line');
  });
});

describe('a service the room does not have at all', () => {
  it('becomes a lump with no quantity, not a point count', () => {
    // No hot water source reaches this bar. "One hot water point" would badly understate the job.
    const bring = lines().find((l) => l.id === 'mep_water_hot_bring_supply')!;
    expect(bring.unit).toBe('lump');
    expect(bring.quantity).toBeNull();
    expect(bring.unknownReasonHe).toContain('אין מקור');
    expect(bring.unknownReasonEn).toContain('cannot establish');
  });

  it('and the point line for it still exists, because the point is still a point', () => {
    const point = lines().find((l) => l.id === 'mep_water_hot_points')!;
    expect(point.quantity).toBe(1);
  });
});

describe('every MEP line flags the licensed trade', () => {
  it('the trade of every line generated here is a licensed one', () => {
    for (const l of lines()) expect(LICENSED_TRADES.has(l.trade), l.id).toBe(true);
  });

  it('the flag is derived from the trade so it cannot drift from the line', () => {
    for (const trade of Object.values(SERVICE_TRADE)) expect(requiresLicensedDesign(trade), trade).toBe(true);
    expect(requiresLicensedDesign('joinery')).toBe(false);
    expect(requiresLicensedDesign('finishes')).toBe(false);
  });

  it('every description says out loud that it is a quantity and not a design', () => {
    for (const l of lines().filter((x) => !x.section.endsWith('_runs'))) {
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

  it('reads as three trade chapters', () => {
    expect(byTrade(lines()).map((g) => g.key)).toEqual(['plumbing', 'electrical', 'hvac']);
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
    expect(generated.filter((l) => l.section.endsWith('_points')).every((l) => l.quantity! > 0)).toBe(true);
    expect(mepOpenQuestions({ space: blank, sources: [], equipmentIds: BAR_EQUIPMENT }).length).toBe(5);
  });
});

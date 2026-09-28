import { describe, expect, it } from 'vitest';
import { servicesFor } from '../equipment/catalog';
import { emptySpace, matchServices, type Space } from './space';
import { BLOCKING_SUPPLY_STATUSES, danglingFeeds, mismatchedFeeds, supplyReport, type ServiceSource } from './supply';

function room(): Space {
  return {
    ...emptySpace('r1', 'בר', 'Bar'),
    footprintMm: [
      { x: 0, y: 0 },
      { x: 7200, y: 0 },
      { x: 7200, y: 3600 },
      { x: 0, y: 3600 },
    ],
    heightMm: 2700,
  };
}

const PANEL: ServiceSource = {
  id: 'panel_bar',
  kind: 'electrical',
  nameHe: 'לוח משנה בר',
  nameEn: 'Bar sub-panel',
  atMm: { x: 200, y: 1400, z: 3500 },
  ratingHe: '3×25A',
  ratingEn: '3×25A',
  spareWays: null,
};

describe('a new point cannot be quantified without knowing what feeds it', () => {
  it('a room with a point but no traced source says exactly that', () => {
    const bar = room();
    bar.connections = [{ id: 'wc1', kind: 'water_cold', atMm: { x: 6800, y: 600, z: 3400 }, existing: true }];
    const [line] = supplyReport(bar, [{ ...PANEL, id: 'main_w', kind: 'water_cold', nameHe: 'ראשי מים', nameEn: 'Water main' }], [
      { kind: 'water_cold', toCreate: 1 },
    ]);
    expect(line.status).toBe('source_unknown');
    expect(line.untracedPointIds).toEqual(['wc1']);
    expect(line.he).toContain('לא נרשם ממה');
  });

  it('once the point names its source the question becomes capacity', () => {
    const bar = room();
    bar.connections = [{ id: 'wc1', kind: 'water_cold', atMm: { x: 6800, y: 600, z: 3400 }, existing: true, fedBy: 'main_w' }];
    const main: ServiceSource = { ...PANEL, id: 'main_w', kind: 'water_cold', nameHe: 'ראשי מים', nameEn: 'Water main', spareWays: null };
    const [line] = supplyReport(bar, [main], [{ kind: 'water_cold', toCreate: 1 }]);
    expect(line.status).toBe('capacity_unstated');
    expect(line.statedSpareWays).toBeNull();
  });

  it('no source of that kind at all is a different and larger job', () => {
    const bar = room();
    const [line] = supplyReport(bar, [PANEL], [{ kind: 'gas', toCreate: 1 }]);
    expect(line.status).toBe('no_source');
    expect(line.sourceIds).toEqual([]);
    expect(line.en).toContain('separate work');
  });
});

describe('capacity is reported as stated, never as adequate', () => {
  it('a stated figure that covers the new points says so, and says on whose word', () => {
    const bar = room();
    bar.connections = [{ id: 'el1', kind: 'electrical', atMm: { x: 200, y: 1200, z: 3500 }, existing: true, fedBy: 'panel_bar' }];
    const [line] = supplyReport(bar, [{ ...PANEL, spareWays: 4 }], [{ kind: 'electrical', toCreate: 2 }]);
    expect(line.status).toBe('within_stated_capacity');
    expect(line.statedSpareWays).toBe(4);
    // The best status this engine returns still points at the person who stated it.
    expect(line.he).toContain('לפי מה שנמסר בלבד');
    expect(line.en).toContain('on the strength of that statement alone');
  });

  it('a stated figure smaller than the new points sends it to a licensed professional', () => {
    const bar = room();
    bar.connections = [{ id: 'el1', kind: 'electrical', atMm: null, existing: true, fedBy: 'panel_bar' }];
    const [line] = supplyReport(bar, [{ ...PANEL, spareWays: 1 }], [{ kind: 'electrical', toCreate: 3 }]);
    expect(line.status).toBe('over_stated_capacity');
    expect(line.he).toContain('בעל מקצוע מוסמך');
    expect(line.en).toContain('licensed professional');
  });

  it('adds up spare ways across two sources of the same kind', () => {
    const bar = room();
    bar.connections = [{ id: 'el1', kind: 'electrical', atMm: null, existing: true, fedBy: 'panel_bar' }];
    const second: ServiceSource = { ...PANEL, id: 'panel_kitchen', nameHe: 'לוח מטבח', nameEn: 'Kitchen panel', spareWays: 2 };
    const [line] = supplyReport(bar, [{ ...PANEL, spareWays: 1 }, second], [{ kind: 'electrical', toCreate: 3 }]);
    expect(line.statedSpareWays).toBe(3);
    expect(line.status).toBe('within_stated_capacity');
  });

  it('a source that states nothing does not dilute one that does', () => {
    // Summing a stated 2 with an unstated source as 0 would understate; ignoring it is the honest read.
    const bar = room();
    bar.connections = [{ id: 'el1', kind: 'electrical', atMm: null, existing: true, fedBy: 'panel_bar' }];
    const [line] = supplyReport(bar, [{ ...PANEL, spareWays: 2 }, { ...PANEL, id: 'panel_x', spareWays: null }], [
      { kind: 'electrical', toCreate: 2 },
    ]);
    expect(line.statedSpareWays).toBe(2);
  });

  it('never returns a status that means the supply was checked', () => {
    const bar = room();
    bar.connections = [{ id: 'el1', kind: 'electrical', atMm: null, existing: true, fedBy: 'panel_bar' }];
    const lines = supplyReport(bar, [{ ...PANEL, spareWays: 99 }], [{ kind: 'electrical', toCreate: 1 }]);
    for (const l of lines) expect(['no_source', 'source_unknown', 'capacity_unstated', 'over_stated_capacity', 'within_stated_capacity']).toContain(l.status);
  });
});

describe('what the report leaves out', () => {
  it('says nothing about a service the project does not add points to', () => {
    const bar = room();
    expect(supplyReport(bar, [PANEL], [{ kind: 'electrical', toCreate: 0 }])).toEqual([]);
  });

  it('measures the straight line to the nearest measured source', () => {
    const bar = room();
    bar.connections = [{ id: 'el1', kind: 'electrical', atMm: null, existing: true, fedBy: 'panel_bar' }];
    const far: ServiceSource = { ...PANEL, id: 'panel_far', atMm: { x: 7000, y: 1400, z: 3500 }, spareWays: 2 };
    const [line] = supplyReport(bar, [{ ...PANEL, spareWays: 2 }, far], [{ kind: 'electrical', toCreate: 1 }], { x: 1000, y: 900, z: 500 });
    expect(line.nearestSourceMm).toBeCloseTo(Math.hypot(200 - 1000, 1400 - 900, 3500 - 500), 6);
  });

  it('gives no distance when the source was never located', () => {
    const bar = room();
    bar.connections = [{ id: 'el1', kind: 'electrical', atMm: null, existing: true, fedBy: 'panel_bar' }];
    const [line] = supplyReport(bar, [{ ...PANEL, atMm: null, spareWays: 2 }], [{ kind: 'electrical', toCreate: 1 }], { x: 0, y: 0, z: 0 });
    expect(line.nearestSourceMm).toBeNull();
    // The source is still known to exist, which is a different fact from knowing where it is.
    expect(line.sourceIds).toEqual(['panel_bar']);
  });

  it('names which statuses stop a bill being priced', () => {
    expect([...BLOCKING_SUPPLY_STATUSES].sort()).toEqual(['capacity_unstated', 'no_source', 'source_unknown']);
  });
});

describe('a survey that contradicts itself', () => {
  it('a point fed from a source nobody registered is reported', () => {
    const bar = room();
    bar.connections = [{ id: 'el1', kind: 'electrical', atMm: null, existing: true, fedBy: 'panel_ghost' }];
    const dangling = danglingFeeds(bar, [PANEL]);
    expect(dangling).toHaveLength(1);
    expect(dangling[0]).toMatchObject({ pointId: 'el1', fedBy: 'panel_ghost' });
    expect(dangling[0].he.length).toBeGreaterThan(0);
    expect(dangling[0].en.length).toBeGreaterThan(0);
  });

  it('a drain fed from an electrical panel is reported', () => {
    const bar = room();
    bar.connections = [{ id: 'dr1', kind: 'drain', atMm: null, existing: true, fedBy: 'panel_bar' }];
    const bad = mismatchedFeeds(bar, [PANEL]);
    expect(bad).toHaveLength(1);
    expect(bad[0].he).toContain('ניקוז');
    expect(bad[0].en).toContain('drain');
  });

  it('a consistent survey reports neither', () => {
    const bar = room();
    bar.connections = [{ id: 'el1', kind: 'electrical', atMm: null, existing: true, fedBy: 'panel_bar' }];
    expect(danglingFeeds(bar, [PANEL])).toEqual([]);
    expect(mismatchedFeeds(bar, [PANEL])).toEqual([]);
  });
});

describe('the pool bar, with its supply traced', () => {
  it('turns the five new points into five supply questions, each with a named state', () => {
    const bar = room();
    bar.connections = [
      { id: 'wc1', kind: 'water_cold', atMm: { x: 6800, y: 600, z: 3400 }, existing: true, fedBy: 'main_w' },
      { id: 'dr1', kind: 'drain', atMm: { x: 6900, y: 0, z: 3500 }, existing: true, fedBy: 'stack_a' },
      { id: 'el1', kind: 'electrical', atMm: { x: 200, y: 1200, z: 3500 }, existing: true, fedBy: 'panel_bar' },
    ];
    const sources: ServiceSource[] = [
      { id: 'main_w', kind: 'water_cold', nameHe: 'ראשי מים', nameEn: 'Water main', atMm: { x: 7100, y: 400, z: 3550 }, ratingHe: '1″', ratingEn: '1″', spareWays: null },
      { id: 'stack_a', kind: 'drain', nameHe: 'קולטן A', nameEn: 'Stack A', atMm: { x: 7000, y: 0, z: 3550 }, spareWays: null },
      { ...PANEL, spareWays: 3 },
    ];
    const needs = matchServices(bar, servicesFor(['bar_sink_single', 'bar_tap', 'undercounter_fridge', 'ice_maker', 'waste_bin_unit']));
    const lines = supplyReport(bar, sources, needs.map((m) => ({ kind: m.kind, toCreate: m.toCreate })), { x: 1200, y: 900, z: 500 });

    const by = (k: string) => lines.find((l) => l.kind === k)!;
    // A cold point exists and is traced, but nobody said whether the 1″ main has room.
    expect(by('water_cold').status).toBe('capacity_unstated');
    // No hot water source reaches the room at all — the biggest item on this list.
    expect(by('water_hot').status).toBe('no_source');
    expect(by('drain').status).toBe('capacity_unstated');
    // The panel's three spare ways cover the one new circuit, on the electrician's word.
    expect(by('electrical').status).toBe('within_stated_capacity');

    // Four of the five are blocked on something a person has to go and establish.
    expect(lines.filter((l) => BLOCKING_SUPPLY_STATUSES.has(l.status))).toHaveLength(4);
  });
});

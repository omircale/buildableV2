import { describe, expect, it } from 'vitest';
import { equipmentById, servicesFor } from '../equipment/catalog';
import { builtPerimeterM, emptySpace, floorAreaM2, matchServices, obstaclesHitBy, spaceProblems, wallAreaM2, whatIsMissing, type Space } from './space';

/**
 * The first project the space model has to survive: a pool bar.
 *
 * It is the awkward case on purpose — open on the pool side, a structural column in the middle of the
 * run, and a room whose existing services are nothing like what a bar needs. Every number below is a
 * plausible survey of a room, not a measurement of a real one, which is exactly why the test asserts
 * the *reasoning* — how many points the project has to create, how far the nearest drain is, what is
 * still unmeasured — rather than treating any of these figures as fact.
 */
function poolBar(): Space {
  return {
    ...emptySpace('pool_bar', 'בר בריכה', 'Pool bar'),
    // 7.20 × 3.60 m, open along the long pool side (edge 0).
    footprintMm: [
      { x: 0, y: 0 },
      { x: 7200, y: 0 },
      { x: 7200, y: 3600 },
      { x: 0, y: 3600 },
    ],
    heightMm: 2700,
    openEdges: [0],
    apertures: [
      { id: 'door_store', kind: 'door', wallId: 'wall_3', offsetMm: 400, widthMm: 900, heightMm: 2100, sillMm: 0 },
      { id: 'hatch', kind: 'pass_through', wallId: 'wall_2', offsetMm: 2000, widthMm: 1200, heightMm: 900, sillMm: 1000 },
    ],
    obstacles: [
      {
        id: 'col_mid',
        nameHe: 'עמוד קונסטרוקטיבי',
        nameEn: 'Structural column',
        originMm: { x: 3400, y: 0, z: 1600 },
        sizeMm: { x: 400, y: 2700, z: 400 },
        noteHe: 'לא להיסמך עליו ולא לקדוח בו — קונסטרוקציה',
        noteEn: 'Not to be loaded or drilled — structure',
      },
    ],
    connections: [
      { id: 'wc_existing', kind: 'water_cold', atMm: { x: 6800, y: 600, z: 3400 }, existing: true, fedBy: 'main_w', noteHe: 'קו מים קיים בפינה', noteEn: 'Existing cold line in the corner' },
      { id: 'dr_existing', kind: 'drain', atMm: { x: 6900, y: 0, z: 3500 }, existing: true, fedBy: 'stack_a', noteHe: 'ניקוז רצפה', noteEn: 'Floor drain' },
      { id: 'el_existing', kind: 'electrical', atMm: { x: 200, y: 1200, z: 3500 }, existing: true, fedBy: 'panel_bar', noteHe: 'לוח משנה', noteEn: 'Sub-panel' },
    ],
    zones: [
      { id: 'front', nameHe: 'חזית הגשה', nameEn: 'Service front' },
      { id: 'back', nameHe: 'אחורי בר', nameEn: 'Back bar' },
    ],
  };
}

const BAR_EQUIPMENT = ['bar_sink_single', 'bar_tap', 'undercounter_fridge', 'ice_maker', 'waste_bin_unit'];

describe('a pool bar, end to end', () => {
  it('the survey holds together', () => {
    expect(spaceProblems(poolBar())).toEqual([]);
  });

  it('the open pool side is not counted as wall to finish', () => {
    const bar = poolBar();
    // 7.2 + 3.6 + 3.6 = 14.4 m of built wall, not 21.6.
    expect(builtPerimeterM(bar)).toBeCloseTo(14.4, 6);
    expect(floorAreaM2(bar)).toBeCloseTo(25.92, 6);
    const gross = (14400 * 2700) / 1e6;
    const holes = (900 * 2100 + 1200 * 900) / 1e6;
    expect(wallAreaM2(bar)).toBeCloseTo(gross - holes, 6);
  });

  it('says how many service points the project has to create', () => {
    const bar = poolBar();
    const matches = matchServices(bar, servicesFor(BAR_EQUIPMENT));
    const by = (kind: string) => matches.find((m) => m.kind === kind)!;

    // Sink and ice maker both want cold; the room has one point.
    expect(by('water_cold')).toMatchObject({ required: 2, existing: 1, toCreate: 1 });
    // No hot water reaches this room at all.
    expect(by('water_hot')).toMatchObject({ required: 1, existing: 0, toCreate: 1 });
    // Sink and ice maker both want a drain; the room has a floor drain.
    expect(by('drain')).toMatchObject({ required: 2, existing: 1, toCreate: 1 });
    // Fridge and ice maker each want a dedicated circuit; the sub-panel counts as one point.
    expect(by('electrical')).toMatchObject({ required: 2, existing: 1, toCreate: 1 });

    // Five new points in total — and every one of them is a bill line somebody has to price.
    expect(matches.reduce((a, m) => a + m.toCreate, 0)).toBe(5);
  });

  it('counts the fridge’s heat as a point, which overstates what it actually needs', () => {
    // A known coarseness, recorded rather than hidden. The fridge's ventilation requirement is a
    // *clearance* — leave a gap so the condenser can breathe — not a duct somebody runs and bills.
    // matchServices counts it alongside water and power because the catalogue declares it a service,
    // so the hvac tally reads one point too many. The requirement's own note says what it really is.
    const bar = poolBar();
    const vent = matchServices(bar, servicesFor(BAR_EQUIPMENT)).find((m) => m.kind === 'ventilation')!;
    expect(vent).toMatchObject({ required: 1, existing: 0, toCreate: 1 });
    const note = equipmentById('undercounter_fridge')!.services.find((s) => s.kind === 'ventilation')!;
    expect(note.noteHe).toContain('מרווח');
    expect(note.noteEn).toContain('clearance');
  });

  it('says how far the nearest drain is from where the sink is going', () => {
    const bar = poolBar();
    // Sink planned at the far end of the run from the existing floor drain.
    const sinkAt = { x: 1200, y: 900, z: 500 };
    const drain = matchServices(bar, [{ kind: 'drain', quantity: 1 }], sinkAt)[0];
    expect(drain.nearestMm).toBeGreaterThan(6000);
    // This is a straight line, and the engine says nothing about how a pipe would get there.
    expect(drain.nearestMm).toBeCloseTo(Math.hypot(6900 - 1200, 0 - 900, 3500 - 500), 6);
  });

  it('the column stops a bar run that would have been drawn straight through it', () => {
    const bar = poolBar();
    // A 5.0 m back-bar counter along the wall, 600 deep, 900 high.
    const hits = obstaclesHitBy(bar, { x: 1000, y: 0, z: 1400 }, { x: 5000, y: 900, z: 600 });
    expect(hits.map((o) => o.id)).toEqual(['col_mid']);
    // And it says why it cannot simply be built around.
    expect(hits[0].noteHe).toBeTruthy();
  });

  it('nothing is left unmeasured in this survey', () => {
    expect(whatIsMissing(poolBar())).toEqual([]);
  });

  it('a survey that located the points but never traced them is still incomplete', () => {
    // The commonest half-done survey: somebody measured where the drain is and nobody asked what it
    // runs into. It reads as complete on a plan and cannot be priced.
    const bar = poolBar();
    bar.connections = bar.connections.map(({ fedBy: _fedBy, ...rest }) => rest);
    expect(whatIsMissing(bar).map((g) => g.field)).toEqual(['feed:wc_existing', 'feed:dr_existing', 'feed:el_existing']);
  });

  it('a bar counted before anyone surveyed the room is honest about it', () => {
    const blank = emptySpace('pool_bar', 'בר בריכה', 'Pool bar');
    const matches = matchServices(blank, servicesFor(BAR_EQUIPMENT));
    // Every point becomes a new one, because nothing is known to exist.
    expect(matches.every((m) => m.toCreate === m.required)).toBe(true);
    expect(matches.every((m) => m.nearestMm === null)).toBe(true);
    // And the gaps say what to go and do about it.
    expect(whatIsMissing(blank).map((g) => g.field)).toContain('connections');
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DEFAULT_OPEN_SHELF, runDesign, type Addon, type DesignParams } from '../index';
import { findOverlaps, supportReport } from '../geometry';
import { ADDONS, openingsFor } from './registry';

/** A bookcase with room to put things in: three bays, three shelves. */
const HOST: DesignParams = { ...DEFAULT_OPEN_SHELF, widthMm: 1200, heightMm: 1800, depthMm: 400, shelfCount: 3, dividerCount: 2 };

function withAddons(...addons: Addon[]): DesignParams {
  return { ...HOST, addons };
}

describe('openings', () => {
  it('a carcass offers one opening per bay per level', () => {
    const { model } = runDesign(HOST, DEFAULT_CONFIG);
    // 3 bays x 4 levels (bottom, three shelves, top → four voids).
    expect(model.openings).toHaveLength(12);
    for (const o of model.openings) {
      expect(o.size.x).toBeGreaterThan(0);
      expect(o.size.y).toBeGreaterThan(0);
      expect(o.size.z).toBeGreaterThan(0);
    }
  });

  it('an opening is empty space — nothing the template built is inside it', () => {
    const { model } = runDesign(HOST, DEFAULT_CONFIG);
    for (const o of model.openings) {
      const inside = model.components.filter(
        (c) =>
          !c.reference &&
          c.origin.x + c.size.x > o.origin.x + 1 &&
          c.origin.x < o.origin.x + o.size.x - 1 &&
          c.origin.y + c.size.y > o.origin.y + 1 &&
          c.origin.y < o.origin.y + o.size.y - 1 &&
          c.origin.z + c.size.z > o.origin.z + 1 &&
          c.origin.z < o.origin.z + o.size.z - 1,
      );
      expect(inside.map((c) => c.id), o.id).toEqual([]);
    }
  });

  it('only openings a component actually fits are offered', () => {
    // A shallow carcass has room for another shelf but not for a drawer box behind a front.
    const { model } = runDesign({ ...HOST, depthMm: 200 }, DEFAULT_CONFIG);
    expect(openingsFor('shelf', model.openings).length).toBe(model.openings.length);
    expect(openingsFor('drawer', model.openings)).toEqual([]);
  });

  it('an opening too short for a drawer still takes a shelf', () => {
    const { model } = runDesign({ ...HOST, heightMm: 900, shelfCount: 7 }, DEFAULT_CONFIG);
    expect(openingsFor('drawer', model.openings).length).toBeLessThan(openingsFor('shelf', model.openings).length);
  });
});

describe('added components are built like any other board', () => {
  const KINDS = ['shelf', 'bedding_box', 'drawer', 'door'] as const;

  it.each(KINDS)('%s: builds, is cut, is priced and blocks nothing', (kind) => {
    const base = runDesign(HOST, DEFAULT_CONFIG);
    const opening = openingsFor(kind, base.model.openings)[0];
    expect(opening, `no opening fits a ${kind}`).toBeDefined();

    const r = runDesign(withAddons({ id: `a1`, kind, openingId: opening.id }), DEFAULT_CONFIG);
    const added = r.model.components.filter((c) => !base.model.components.some((b) => b.id === c.id));
    expect(added.length, 'nothing was added').toBeGreaterThan(0);

    // Every added board reaches the cut list, like every board the template makes.
    for (const c of added) expect(r.model.parts.some((p) => p.componentIds.includes(c.id)), `${c.id} is not cut`).toBe(true);
    // And it costs money.
    expect(r.quote?.totalIls ?? 0).toBeGreaterThan(base.quote?.totalIls ?? 0);
    expect(r.quote?.issues ?? ['no quote']).toEqual([]);
    expect(r.report.exportBlocked).toBe(false);
  });

  it.each(KINDS)('%s: sits in its opening without clashing or floating', (kind) => {
    const base = runDesign(HOST, DEFAULT_CONFIG);
    const opening = openingsFor(kind, base.model.openings)[0];
    const r = runDesign(withAddons({ id: 'a1', kind, openingId: opening.id }), DEFAULT_CONFIG);

    expect(findOverlaps(r.model.components.filter((c) => !c.reference))).toEqual([]);
    expect(supportReport(r.model.components, { gapMm: r.model.orderStepMm / 2 + 0.6 }).floating).toEqual([]);
  });

  it('several components in different openings all build', () => {
    const base = runDesign(HOST, DEFAULT_CONFIG);
    const spots = openingsFor('drawer', base.model.openings);
    const r = runDesign(
      withAddons(
        { id: 'd1', kind: 'drawer', openingId: spots[0].id },
        { id: 'd2', kind: 'drawer', openingId: spots[1].id },
        { id: 'b1', kind: 'bedding_box', openingId: spots[2].id },
      ),
      DEFAULT_CONFIG,
    );
    expect(findOverlaps(r.model.components.filter((c) => !c.reference))).toEqual([]);
    expect(r.report.exportBlocked).toBe(false);
    // Screws for the boxes are added to the line the carcass already uses, not listed twice.
    expect(r.model.hardware.filter((h) => h.id === 'joint_screw')).toHaveLength(1);
  });

  it('an addon whose opening no longer exists is dropped, not drawn in mid-air', () => {
    const base = runDesign(HOST, DEFAULT_CONFIG);
    const opening = openingsFor('drawer', base.model.openings).at(-1)!;
    // Removing the shelves removes the levels, so that opening id is gone.
    const r = runDesign({ ...HOST, shelfCount: 0, addons: [{ id: 'd1', kind: 'drawer', openingId: opening.id }] }, DEFAULT_CONFIG);
    expect(r.model.components.some((c) => c.id.startsWith('d1'))).toBe(false);
    expect(r.report.exportBlocked).toBe(false);
  });
});

describe('what a drawer does not know', () => {
  it('says the runners are unchosen instead of implying they are verified', () => {
    const base = runDesign(HOST, DEFAULT_CONFIG);
    const opening = openingsFor('drawer', base.model.openings)[0];
    const r = runDesign(withAddons({ id: 'd1', kind: 'drawer', openingId: opening.id }), DEFAULT_CONFIG);

    const check = r.report.checks.find((c) => c.id.startsWith('connections.drawer_runner'));
    expect(check).toBeDefined();
    expect(check!.status).toBe('GREY');
    expect(check!.assumptions.length).toBeGreaterThan(0);
    expect(check!.requiredVerification).toBeTruthy();
    // A GREY is not a blocker: the drawer can still be drawn, cut and priced in wood.
    expect(r.report.exportBlocked).toBe(false);
  });

  it('the runner line names the box depth it has to suit', () => {
    const base = runDesign(HOST, DEFAULT_CONFIG);
    const opening = openingsFor('drawer', base.model.openings)[0];
    const r = runDesign(withAddons({ id: 'd1', kind: 'drawer', openingId: opening.id }), DEFAULT_CONFIG);
    const runner = r.model.hardware.find((h) => h.id === 'd1_runner');
    expect(runner?.spec).toMatch(/\d+/);
  });
});

describe('every component kind is offerable', () => {
  it('each kind in the registry has a minimum opening and builds', () => {
    for (const [kind, def] of Object.entries(ADDONS)) {
      expect(def.kind, kind).toBe(kind);
      expect(def.minOpeningMm.x).toBeGreaterThan(0);
      expect(def.minOpeningMm.y).toBeGreaterThan(0);
      expect(def.minOpeningMm.z).toBeGreaterThan(0);
    }
  });
});

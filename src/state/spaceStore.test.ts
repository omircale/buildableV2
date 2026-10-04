import { beforeEach, describe, expect, it, vi } from 'vitest';
import { floorAreaM2, matchServices, servicesFor, wallsOf, whatIsMissing } from '../engine';
import { countOf, projectRooms, rectangleSize, type SurveyState } from './spaceStore';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

/** The store reads storage when its module first loads, so each test gets a fresh module. */
let useSurvey: { getState: () => SurveyState };

beforeEach(async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.resetModules();
  useSurvey = (await import('./spaceStore')).useSurvey;
});

describe('a room measured with a tape', () => {
  it('two dimensions make a rectangle with four walls', () => {
    useSurvey.getState().setRectangle(7200, 3600);
    const { space } = useSurvey.getState();
    expect(wallsOf(space)).toHaveLength(4);
    expect(floorAreaM2(space)).toBeCloseTo(25.92, 6);
    expect(rectangleSize(space)).toEqual({ widthMm: 7200, depthMm: 3600 });
  });

  it('a missing or zero dimension leaves the room unmeasured rather than half-measured', () => {
    // Half a rectangle is not a smaller room, it is no room. The engine then reports null areas.
    for (const [w, d] of [[7200, null], [null, 3600], [7200, 0], [-1, 3600]] as [number | null, number | null][]) {
      useSurvey.getState().setRectangle(w, d);
      expect(useSurvey.getState().space.footprintMm, `${w}×${d}`).toEqual([]);
      expect(floorAreaM2(useSurvey.getState().space)).toBeNull();
    }
  });

  it('the first dimension typed survives long enough for the second to complete it', () => {
    // The bug this replaced: each field read the other back out of a footprint that did not exist
    // yet, so the first number was discarded on the spot and a rectangle could never be entered.
    const s = useSurvey.getState();
    s.setRectangle(7200, null);
    expect(useSurvey.getState().widthMm).toBe(7200);
    expect(useSurvey.getState().space.footprintMm).toEqual([]);

    s.setRectangle(useSurvey.getState().widthMm, 3600);
    expect(floorAreaM2(useSurvey.getState().space)).toBeCloseTo(25.92, 6);
  });

  it('clearing one dimension keeps the other on screen and takes the room back to unmeasured', () => {
    const s = useSurvey.getState();
    s.setRectangle(7200, 3600);
    s.setRectangle(7200, null);
    expect(useSurvey.getState().widthMm).toBe(7200);
    expect(useSurvey.getState().depthMm).toBeNull();
    expect(floorAreaM2(useSurvey.getState().space)).toBeNull();
  });

  it('the typed dimensions survive a refresh too', () => {
    useSurvey.getState().setRectangle(7200, null);
    const raw = JSON.parse(localStorage.getItem('buildable.survey.v1')!);
    expect(raw.widthMm).toBe(7200);
    expect(raw.depthMm).toBeNull();
  });

  it('height is null until somebody types one, so wall areas stay unknown', () => {
    expect(useSurvey.getState().space.heightMm).toBeNull();
    useSurvey.getState().setHeight(2700);
    expect(useSurvey.getState().space.heightMm).toBe(2700);
    useSurvey.getState().setHeight(0);
    expect(useSurvey.getState().space.heightMm).toBeNull();
  });

  it('an open side can be marked and unmarked', () => {
    useSurvey.getState().setRectangle(7200, 3600);
    useSurvey.getState().toggleOpenEdge(0);
    expect(wallsOf(useSurvey.getState().space)[0].built).toBe(false);
    useSurvey.getState().toggleOpenEdge(0);
    expect(wallsOf(useSurvey.getState().space)[0].built).toBe(true);
  });
});

describe('what is going in the room', () => {
  it('equipment toggles, and the shortfall follows from it', () => {
    const s = useSurvey.getState();
    s.setRectangle(7200, 3600);
    s.toggleEquipment('bar_sink_single');
    expect(useSurvey.getState().equipmentIds).toEqual(['bar_sink_single']);

    const needs = matchServices(useSurvey.getState().space, servicesFor(useSurvey.getState().equipmentIds));
    // Nothing exists in the room yet, so every point the sink needs is a new one.
    expect(needs.every((n) => n.toCreate === n.required)).toBe(true);

    s.toggleEquipment('bar_sink_single');
    expect(useSurvey.getState().equipmentIds).toEqual([]);
  });
});

describe('connection points and what feeds them', () => {
  it('a new point starts unlocated and untraced, which is what a survey actually knows first', () => {
    useSurvey.getState().addConnection('drain');
    const [point] = useSurvey.getState().space.connections;
    expect(point).toMatchObject({ kind: 'drain', existing: true, atMm: null });
    expect(point.fedBy).toBeUndefined();
    // And the engine immediately says what is still to be established about it.
    expect(whatIsMissing(useSurvey.getState().space).map((g) => g.field)).toContain(`feed:${point.id}`);
  });

  it('a point can be traced to a source', () => {
    const s = useSurvey.getState();
    s.addSource('drain');
    const source = useSurvey.getState().sources[0];
    s.addConnection('drain');
    const point = useSurvey.getState().space.connections[0];
    s.updateConnection(point.id, { fedBy: source.id });
    expect(useSurvey.getState().space.connections[0].fedBy).toBe(source.id);
  });

  it('deleting a source clears the feed instead of leaving a dead id behind', () => {
    // A point pointing at a source that no longer exists reads as traced when it is not.
    const s = useSurvey.getState();
    s.addSource('drain');
    const source = useSurvey.getState().sources[0];
    s.addConnection('drain');
    const point = useSurvey.getState().space.connections[0];
    s.updateConnection(point.id, { fedBy: source.id });

    s.removeSource(source.id);
    expect(useSurvey.getState().sources).toEqual([]);
    expect(useSurvey.getState().space.connections[0].fedBy).toBeUndefined();
  });

  it('points and sources get distinct ids even when added in the same millisecond', () => {
    const s = useSurvey.getState();
    s.addConnection('drain');
    s.addConnection('drain');
    s.addConnection('water_cold');
    const ids = useSurvey.getState().space.connections.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('a point can be removed', () => {
    useSurvey.getState().addConnection('gas');
    const [point] = useSurvey.getState().space.connections;
    useSurvey.getState().removeConnection(point.id);
    expect(useSurvey.getState().space.connections).toEqual([]);
  });
});

describe('the survey survives a refresh', () => {
  it('is written to storage and read back', () => {
    const s = useSurvey.getState();
    s.setRectangle(7200, 3600);
    s.setHeight(2700);
    s.toggleEquipment('ice_maker');
    s.setPlace('annexe', '-1');

    const raw = JSON.parse(localStorage.getItem('buildable.survey.v1')!);
    expect(raw.space.heightMm).toBe(2700);
    expect(raw.equipmentIds).toEqual(['ice_maker']);
    expect(raw.levelId).toBe('-1');
    expect(raw.updatedAt).toBeGreaterThan(0);
  });

  it('a floor is kept as the hotel spells it', () => {
    useSurvey.getState().setPlace('main', 'קרקע');
    expect(useSurvey.getState().levelId).toBe('קרקע');
  });

  it('reset clears both the screen and the storage', () => {
    useSurvey.getState().setRectangle(7200, 3600);
    useSurvey.getState().reset();
    expect(useSurvey.getState().space.footprintMm).toEqual([]);
    expect(localStorage.getItem('buildable.survey.v1')).toBeNull();
  });
});

describe('the example room', () => {
  it('loads a full room and says it is an example', () => {
    useSurvey.getState().loadSample();
    const s = useSurvey.getState();
    expect(s.sample).toBe(true);
    expect(floorAreaM2(s.space)).toBeCloseTo(25.92, 6);
    expect(s.space.heightMm).toBe(2700);
    expect(wallsOf(s.space)[0].built).toBe(false);
    expect(s.space.nameHe).toContain('לדוגמה');
  });

  it('stops being an example the moment someone types a floor dimension', () => {
    useSurvey.getState().loadSample();
    useSurvey.getState().setRectangle(5000, useSurvey.getState().depthMm);
    expect(useSurvey.getState().sample).toBe(false);
  });

  it('a ceiling height alone does not make an invented floor real', () => {
    useSurvey.getState().loadSample();
    useSurvey.getState().setHeight(3000);
    expect(useSurvey.getState().sample).toBe(true);
  });

  it('clearing the example takes out every invented measurement, not just the flag', () => {
    useSurvey.getState().loadSample();
    useSurvey.getState().clearSample();
    const s = useSurvey.getState();
    expect(s.sample).toBe(false);
    expect(s.space.footprintMm).toEqual([]);
    expect(s.space.heightMm).toBeNull();
    expect(s.widthMm).toBeNull();
    expect(s.space.openEdges).toEqual([]);
  });

  it('clearing when there is no example touches nothing', () => {
    useSurvey.getState().setRectangle(5000, 4000);
    useSurvey.getState().clearSample();
    expect(floorAreaM2(useSurvey.getState().space)).toBeCloseTo(20, 6);
  });

  it('survives a refresh as an example', () => {
    useSurvey.getState().loadSample();
    expect(JSON.parse(localStorage.getItem('buildable.survey.v1')!).sample).toBe(true);
  });
});

describe('two of the same item', () => {
  it('counts each unit, and the service points follow the count', () => {
    const s = useSurvey.getState();
    s.setEquipmentCount('undercounter_fridge', 2);
    expect(countOf(useSurvey.getState().equipmentIds, 'undercounter_fridge')).toBe(2);
    // Two fridges need two dedicated circuits, not one.
    const power = servicesFor(useSurvey.getState().equipmentIds).find((x) => x.kind === 'electrical')!;
    expect(power.quantity).toBe(2);
  });

  it('a count of zero takes the item out', () => {
    useSurvey.getState().setEquipmentCount('ice_maker', 3);
    useSurvey.getState().setEquipmentCount('ice_maker', 0);
    expect(useSurvey.getState().equipmentIds).toEqual([]);
  });

  it('toggling an item that is there twice takes both out', () => {
    useSurvey.getState().setEquipmentCount('undercounter_fridge', 2);
    useSurvey.getState().toggleEquipment('undercounter_fridge');
    expect(useSurvey.getState().equipmentIds).toEqual([]);
  });
});

describe('answers and new ids', () => {
  it('adding a source and a point hands back their ids so they can be linked', () => {
    const s = useSurvey.getState();
    const src = s.addSource('drain', { nameHe: 'קולטן A' });
    const pt = s.addConnection('drain', { fedBy: src });
    expect(useSurvey.getState().sources[0]).toMatchObject({ id: src, nameHe: 'קולטן A' });
    expect(useSurvey.getState().space.connections[0]).toMatchObject({ id: pt, fedBy: src, existing: true });
  });

  it('an answer is kept and can be withdrawn', () => {
    useSurvey.getState().answer('supply:gas', 'לא יודע — לשאול בשטח');
    expect(useSurvey.getState().answers['supply:gas']).toBe('לא יודע — לשאול בשטח');
    useSurvey.getState().clearAnswer('supply:gas');
    expect(useSurvey.getState().answers).toEqual({});
  });

  it('the designed piece is left out of the bill until someone includes it', () => {
    expect(useSurvey.getState().includeDesign).toBe(false);
    useSurvey.getState().setIncludeDesign(true);
    expect(useSurvey.getState().includeDesign).toBe(true);
  });
});

describe('a project is several rooms', () => {
  const rooms = () => projectRooms(useSurvey.getState() as never).map((r) => r.space.id);

  it('starts as one room', () => {
    expect(rooms()).toEqual(['room_1']);
  });

  it('adding a room opens it, empty, on the same floor', () => {
    useSurvey.getState().setPlace('main', '-1');
    useSurvey.getState().setRectangle(7200, 3600);
    useSurvey.getState().addRoom();
    const s = useSurvey.getState();
    expect(s.space.id).toBe('room_2');
    expect(s.space.footprintMm).toEqual([]);
    expect(s.levelId).toBe('-1');
    expect(rooms()).toEqual(['room_1', 'room_2']);
  });

  it('opening another room brings its own measurements back', () => {
    const s = useSurvey.getState();
    s.setRectangle(7200, 3600);
    s.toggleEquipment('bar_sink_single');
    s.addRoom();
    useSurvey.getState().setRectangle(4000, 3000);
    useSurvey.getState().openRoom('room_1');
    expect(floorAreaM2(useSurvey.getState().space)).toBeCloseTo(25.92, 6);
    expect(useSurvey.getState().equipmentIds).toEqual(['bar_sink_single']);
    useSurvey.getState().openRoom('room_2');
    expect(floorAreaM2(useSurvey.getState().space)).toBeCloseTo(12, 6);
    expect(useSurvey.getState().equipmentIds).toEqual([]);
  });

  it('the order of rooms does not shuffle when a different one is opened', () => {
    // A room's place in the order is its structure number in the bill.
    useSurvey.getState().addRoom();
    useSurvey.getState().addRoom();
    useSurvey.getState().openRoom('room_1');
    expect(rooms()).toEqual(['room_1', 'room_2', 'room_3']);
    useSurvey.getState().openRoom('room_3');
    expect(rooms()).toEqual(['room_1', 'room_2', 'room_3']);
  });

  it('forty identical rooms are one room, measured once', () => {
    const s = useSurvey.getState();
    s.setRectangle(5000, 4000);
    s.setHeight(2700);
    s.toggleEquipment('bar_sink_single');
    s.duplicateRoom(39);
    const all = projectRooms(useSurvey.getState() as never);
    expect(all).toHaveLength(40);
    expect(new Set(all.map((r) => r.space.id)).size).toBe(40);
    for (const r of all) {
      expect(floorAreaM2(r.space)).toBeCloseTo(20, 6);
      expect(r.equipmentIds).toEqual(['bar_sink_single']);
    }
    expect(all[1].space.nameHe).toContain('(2)');
  });

  it('a copy carries the finishes of the room it was copied from', () => {
    const s = useSurvey.getState();
    s.upsertFinish({ code: 'WD-2', category: 'wood', itemNameEn: 'Timber floor', surface: 'floor', product: { type: null, color: null, finish: null, sizeMm: null, thicknessMm: null, wearLayerMm: null }, areas: ['room_1'], scope: 'unknown', sources: [] });
    s.duplicateRoom(2);
    expect(useSurvey.getState().finishes[0].areas).toEqual(['room_1', 'room_2', 'room_3']);
  });

  it('removing a room takes it out of every finish that named it', () => {
    const s = useSurvey.getState();
    s.addRoom();
    useSurvey.getState().upsertFinish({ code: 'WD-2', category: 'wood', itemNameEn: 'x', surface: 'floor', product: { type: null, color: null, finish: null, sizeMm: null, thicknessMm: null, wearLayerMm: null }, areas: ['room_1', 'room_2'], scope: 'unknown', sources: [] });
    useSurvey.getState().removeRoom('room_2');
    expect(rooms()).toEqual(['room_1']);
    expect(useSurvey.getState().space.id).toBe('room_1');
    expect(useSurvey.getState().finishes[0].areas).toEqual(['room_1']);
  });

  it('removing the last room empties it rather than leaving a project with none', () => {
    useSurvey.getState().setRectangle(5000, 4000);
    useSurvey.getState().removeRoom('room_1');
    expect(rooms()).toHaveLength(1);
    expect(useSurvey.getState().space.footprintMm).toEqual([]);
  });

  it('the whole project survives a refresh, not just the open room', () => {
    useSurvey.getState().setRectangle(5000, 4000);
    useSurvey.getState().addRoom();
    const raw = JSON.parse(localStorage.getItem('buildable.survey.v1')!);
    expect(raw.others).toHaveLength(1);
    expect(raw.order).toEqual(['room_1', 'room_2']);
  });
});

describe('the finish schedule', () => {
  const spec = (code: string) => ({ code, category: 'wood' as const, itemNameEn: code, surface: 'floor' as const, product: { type: null, color: null, finish: null, sizeMm: null, thicknessMm: null, wearLayerMm: null }, areas: [], scope: 'unknown' as const, sources: [] });

  it('keeps finishes in code order, numerically', () => {
    for (const c of ['WD-10', 'WD-2', 'ST-1']) useSurvey.getState().upsertFinish(spec(c));
    expect(useSurvey.getState().finishes.map((f) => f.code)).toEqual(['ST-1', 'WD-2', 'WD-10']);
  });

  it('an imported schedule replaces the codes it carries and leaves the rest', () => {
    useSurvey.getState().upsertFinish({ ...spec('WD-2'), pattern: 'old' });
    useSurvey.getState().upsertFinish(spec('ST-1'));
    useSurvey.getState().importFinishes([{ ...spec('WD-2'), pattern: 'new' }, spec('WD-3')]);
    const f = useSurvey.getState().finishes;
    expect(f.map((x) => x.code)).toEqual(['ST-1', 'WD-2', 'WD-3']);
    expect(f.find((x) => x.code === 'WD-2')!.pattern).toBe('new');
  });

  it('a finish is put in a room and taken out again', () => {
    useSurvey.getState().upsertFinish(spec('WD-2'));
    useSurvey.getState().toggleFinishRoom('WD-2', 'room_1');
    expect(useSurvey.getState().finishes[0].areas).toEqual(['room_1']);
    useSurvey.getState().toggleFinishRoom('WD-2', 'room_1');
    expect(useSurvey.getState().finishes[0].areas).toEqual([]);
  });
});

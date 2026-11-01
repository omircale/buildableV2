import { describe, expect, it } from 'vitest';
import { emptySpace, type ServiceSource, type Space } from '../../engine';
import { refinementQuestions, type QuestionInput } from './questions';

function measured(): Space {
  return {
    ...emptySpace('r', 'בר', 'Bar'),
    footprintMm: [
      { x: 0, y: 0 },
      { x: 7200, y: 0 },
      { x: 7200, y: 3600 },
      { x: 0, y: 3600 },
    ],
    heightMm: 2700,
  };
}

const base = (over: Partial<QuestionInput> = {}): QuestionInput => ({
  space: measured(),
  sources: [],
  equipmentIds: [],
  widthMm: 7200,
  depthMm: 3600,
  answers: { open_sides: 'כל הקירות בנויים' },
  ...over,
});

const ids = (input: QuestionInput) => refinementQuestions(input).map((q) => q.id);

describe('the questions come from what blocks a quantity', () => {
  it('an empty room asks for its size and height first', () => {
    const input = base({ space: { ...emptySpace('r', 'x', 'x'), heightMm: null }, widthMm: null, depthMm: null, answers: {} });
    expect(ids(input).slice(0, 2)).toEqual(['size', 'height']);
  });

  it('a fully measured room with nothing in it has nothing to ask', () => {
    expect(ids(base())).toEqual([]);
  });

  it('a sink in a room with no services asks about each service it needs', () => {
    expect(ids(base({ equipmentIds: ['bar_sink_single'] })).sort()).toEqual(['supply:drain', 'supply:water_cold', 'supply:water_hot']);
  });

  it('a clearance is never asked about as a supply', () => {
    // The fridge's ventilation is a gap behind it, not a service somebody brings.
    expect(ids(base({ equipmentIds: ['undercounter_fridge'] }))).toEqual(['supply:electrical']);
  });

  it('an existing point nobody traced asks what feeds it, not whether a supply exists', () => {
    const space = { ...measured(), connections: [{ id: 'd1', kind: 'drain' as const, atMm: null, existing: true }] };
    // A sink and an ice maker want two drains; the room has one, so one more has to be created.
    const q = refinementQuestions(base({ space, equipmentIds: ['bar_sink_single', 'ice_maker'] })).find((x) => x.id === 'supply:drain');
    expect(q).toMatchObject({ type: 'supply', status: 'source_unknown', toCreate: 1 });
  });

  it('a room that already has every point it needs is not asked about that service', () => {
    const space = { ...measured(), connections: [{ id: 'd1', kind: 'drain' as const, atMm: null, existing: true }] };
    expect(ids(base({ space, equipmentIds: ['grease_trap'] }))).toEqual([]);
  });
});

describe('the conversation goes one level deeper as it is answered', () => {
  it('naming a source turns the supply question into a capacity question', () => {
    const sources: ServiceSource[] = [{ id: 's1', kind: 'electrical', nameHe: 'לוח בר', nameEn: '', atMm: null, spareWays: null }];
    const space = { ...measured(), connections: [{ id: 'e1', kind: 'electrical' as const, atMm: null, existing: true, fedBy: 's1' }] };
    const [q] = refinementQuestions(base({ space, sources, equipmentIds: ['undercounter_fridge', 'undercounter_fridge'] }));
    expect(q).toMatchObject({ id: 'capacity:electrical', type: 'capacity', sourceName: 'לוח בר', toCreate: 1 });
  });

  it('a stated capacity closes the question', () => {
    const sources: ServiceSource[] = [{ id: 's1', kind: 'electrical', nameHe: 'לוח בר', nameEn: '', atMm: null, spareWays: 3 }];
    const space = { ...measured(), connections: [{ id: 'e1', kind: 'electrical' as const, atMm: null, existing: true, fedBy: 's1' }] };
    expect(ids(base({ space, sources, equipmentIds: ['undercounter_fridge', 'undercounter_fridge'] }))).toEqual([]);
  });
});

describe('"I don\'t know" is an answer', () => {
  it('closes the question without pretending the gap is filled', () => {
    const input = base({ equipmentIds: ['bar_sink_single'], answers: { open_sides: 'x', 'supply:water_hot': 'לשאול בשטח' } });
    expect(ids(input)).not.toContain('supply:water_hot');
  });

  it('a question asked once about the walls is not asked again', () => {
    expect(ids(base({ answers: {} }))).toEqual(['open_sides']);
    expect(ids(base({ answers: { open_sides: 'קיר 1 פתוח' } }))).toEqual([]);
  });
});

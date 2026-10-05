import { describe, expect, it } from 'vitest';
import { emptySpace } from '../../engine';
import { dictFor } from '../../i18n';
import type { Survey } from '../../state/spaceStore';
import { askedBy, siteList, siteListText, siteQuestions } from './siteQuestions';

const dict = dictFor('he');

const room = (over: Partial<Survey> = {}): Survey =>
  ({
    space: { ...emptySpace('room_1', 'מטבח', '') },
    widthMm: null,
    depthMm: null,
    sample: false,
    buildingId: '',
    levelId: '0',
    sector: 'restaurant',
    equipmentIds: ['range_gas', 'dishwasher_commercial'],
    sources: [],
    answers: {},
    piece: null,
    updatedAt: 0,
    ...over,
  }) as Survey;

describe('the list a person takes to the site', () => {
  it('holds everything the model cannot answer yet', () => {
    const ids = siteQuestions(room()).map((q) => q.id);
    expect(ids).toContain('size');
    expect(ids).toContain('height');
    expect(ids).toContain('supply:gas');
  });

  it('keeps a question that was only put off', () => {
    // "Ask on site" stops the screen repeating the question. It is exactly the question the list is for.
    const ids = siteQuestions(room({ answers: { size: 'ask_on_site', 'supply:gas': 'ask_on_site' } })).map((q) => q.id);
    expect(ids).toContain('size');
    expect(ids).toContain('supply:gas');
  });

  it('drops a question that was really answered', () => {
    const ids = siteQuestions(room({ answers: { 'supply:gas': 'none' } })).map((q) => q.id);
    expect(ids).not.toContain('supply:gas');
  });

  it('says what each service is wanted for', () => {
    expect(askedBy(['range_gas', 'range_gas'], 'gas', true)).toBe('כיריים גז ×2');
    expect(askedBy(['workstation'], 'gas', true)).toBe('');
  });

  it('is written per room, with a box to tick, and leaves out a room with nothing open', () => {
    const settled = room({ space: { ...emptySpace('room_2', 'מחסן', ''), heightMm: 2700 }, widthMm: 3000, depthMm: 2000, equipmentIds: [], answers: { open_sides: 'all_built' } });
    const list = siteList([room(), settled], dict, true);
    expect(list.map((r) => r.name)).toEqual(['מטבח']);
    const text = siteListText(list, dict);
    expect(text).toContain('מטבח');
    expect(text).toContain('[ ] מה המידות של החדר?');
    expect(text).toMatch(/\[ \] .*גז.*\(עבור כיריים גז\)/);
  });
});

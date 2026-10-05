import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignState } from './designStore';
import type { SurveyState } from './spaceStore';

const KEY = 'buildable.survey.v1';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

/** The stores read storage when their modules first load, so each test gets fresh modules. */
let useSurvey: { getState: () => SurveyState };
let useDesign: { getState: () => DesignState };
let setOwner: (id: string | null) => void;

beforeEach(async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.resetModules();
  setOwner = (await import('./owner')).setOwner;
  useSurvey = (await import('./spaceStore')).useSurvey;
  useDesign = (await import('./designStore')).useDesign;
});

describe('two accounts on one browser', () => {
  it('each sees its own rooms and not the other’s', () => {
    setOwner('alice');
    useSurvey.getState().setName('המטבח של אליס');
    setOwner('bob');
    expect(useSurvey.getState().space.nameHe).not.toBe('המטבח של אליס');
    useSurvey.getState().setName('החנות של בוב');
    setOwner('alice');
    expect(useSurvey.getState().space.nameHe).toBe('המטבח של אליס');
    setOwner('bob');
    expect(useSurvey.getState().space.nameHe).toBe('החנות של בוב');
  });

  it('signing out leaves nothing of the account on the screen', () => {
    setOwner('alice');
    useSurvey.getState().setName('המטבח של אליס');
    setOwner(null);
    expect(useSurvey.getState().space.nameHe).not.toBe('המטבח של אליס');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('work done before signing in becomes the account’s, and stops being anybody’s', () => {
    useSurvey.getState().setName('חדר בלי שם של בעלים');
    setOwner('alice');
    expect(useSurvey.getState().space.nameHe).toBe('חדר בלי שם של בעלים');
    expect(localStorage.getItem(KEY)).toBeNull();
    setOwner('bob');
    expect(useSurvey.getState().space.nameHe).not.toBe('חדר בלי שם של בעלים');
  });

  it('an account that already has work here is not overwritten, and the unnamed work is kept', () => {
    setOwner('alice');
    useSurvey.getState().setName('המטבח של אליס');
    setOwner(null);
    useSurvey.getState().setName('עבודה בלי חשבון');
    setOwner('alice');
    expect(useSurvey.getState().space.nameHe).toBe('המטבח של אליס');
    setOwner(null);
    expect(useSurvey.getState().space.nameHe).toBe('עבודה בלי חשבון');
  });

  it('the furniture designs are kept apart the same way', () => {
    setOwner('alice');
    useDesign.getState().setProjectName('המדף של אליס');
    setOwner('bob');
    expect(useDesign.getState().projectName).not.toBe('המדף של אליס');
    expect(useDesign.getState().projects.some((p) => p.name === 'המדף של אליס')).toBe(false);
    setOwner('alice');
    expect(useDesign.getState().projectName).toBe('המדף של אליס');
  });
});

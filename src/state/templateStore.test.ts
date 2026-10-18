import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EQUIPMENT } from '../engine';

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), clear: () => data.clear() };
}

let mod: typeof import('./templateStore');
let owner: typeof import('./owner');

beforeEach(async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.resetModules();
  owner = await import('./owner');
  mod = await import('./templateStore');
});

describe('branch templates', () => {
  it('the example is always offered, last, and says it is an example', () => {
    const all = mod.allTemplates(mod.useTemplates.getState().templates);
    expect(all.at(-1)!.example).toBe(true);
    expect(all.at(-1)!.name).toContain('דוגמה');
  });

  it('the example holds only equipment the catalogue knows', () => {
    for (const id of mod.EXAMPLE_TEMPLATE.equipmentIds) expect(EQUIPMENT.some((e) => e.id === id), id).toBe(true);
  });

  it('a saved template comes first, survives a refresh, and saving the same name replaces it', async () => {
    mod.useTemplates.getState().saveTemplate({ name: 'סניף רגיל', sector: 'restaurant', equipmentIds: ['range_gas'] });
    mod.useTemplates.getState().saveTemplate({ name: 'סניף רגיל', sector: 'restaurant', equipmentIds: ['range_gas', 'fryer_gas'] });
    vi.resetModules();
    const again = await import('./templateStore');
    const own = again.useTemplates.getState().templates;
    expect(own).toHaveLength(1);
    expect(own[0].equipmentIds).toEqual(['range_gas', 'fryer_gas']);
    expect(again.allTemplates(own)[0].name).toBe('סניף רגיל');
  });

  it('belongs to the account that saved it', () => {
    owner.setOwner('alice');
    mod.useTemplates.getState().saveTemplate({ name: 'של אליס', sector: 'office', equipmentIds: [] });
    owner.setOwner('bob');
    expect(mod.useTemplates.getState().templates).toEqual([]);
    owner.setOwner('alice');
    expect(mod.useTemplates.getState().templates[0].name).toBe('של אליס');
  });
});

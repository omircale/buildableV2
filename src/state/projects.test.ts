import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHAIR, DEFAULT_FLOOR_BED } from '../engine';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

async function freshStore() {
  vi.resetModules();
  return (await import('./designStore')).useDesign;
}

describe('My projects (local, on this device)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('starting a new design keeps the previous one in the list', async () => {
    const store = await freshStore();
    store.getState().startNew(DEFAULT_FLOOR_BED, 'מיטה לנועה');
    store.getState().update({ mattressWidthMm: 800 });
    store.getState().startNew(DEFAULT_CHAIR, 'כיסא');
    const { projects } = store.getState();
    expect(projects.map((p) => p.name)).toEqual(['כיסא', 'מיטה לנועה']);
    expect(projects.find((p) => p.name === 'מיטה לנועה')!.params).toMatchObject({ template: 'bed', mattressWidthMm: 800 });
  });

  it('opening a project restores it and clears undo history', async () => {
    const store = await freshStore();
    store.getState().startNew(DEFAULT_FLOOR_BED, 'bed');
    const bedId = store.getState().projectId;
    store.getState().startNew(DEFAULT_CHAIR, 'chair');
    store.getState().update({ seatWidthMm: 400 });
    store.getState().openProject(bedId);
    expect(store.getState().params.template).toBe('bed');
    expect(store.getState().past).toEqual([]);
    store.getState().undo();
    expect(store.getState().params.template).toBe('bed');
  });

  it('survives a reload', async () => {
    let store = await freshStore();
    store.getState().startNew(DEFAULT_FLOOR_BED, 'bed');
    store.getState().startNew(DEFAULT_CHAIR, 'chair');
    store = await freshStore();
    expect(store.getState().projects.map((p) => p.name)).toEqual(['chair', 'bed']);
    expect(store.getState().projectName).toBe('chair');
  });

  it('rename, duplicate and delete', async () => {
    const store = await freshStore();
    store.getState().startNew(DEFAULT_FLOOR_BED, 'bed');
    const bedId = store.getState().projectId;
    store.getState().startNew(DEFAULT_CHAIR, 'chair');
    store.getState().renameProject(bedId, 'bed 2');
    store.getState().duplicateProject(bedId, '(copy)');
    expect(store.getState().projects.map((p) => p.name).sort()).toEqual(['bed 2', 'bed 2 (copy)', 'chair']);
    // Deleting the open project moves the editor to the most recent remaining one.
    store.getState().deleteProject(store.getState().projectId);
    expect(store.getState().projects.map((p) => p.name)).not.toContain('chair');
    expect(store.getState().params.template).toBe('bed');
  });
});

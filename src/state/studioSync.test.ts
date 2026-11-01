import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudioRow } from '../cloud/api';

/**
 * The account, as the Worker keeps it: versions that go up on every save, and a save on top of a
 * version that is no longer the latest refused with the one that is.
 */
const server = vi.hoisted(() => {
  const s = {
    rows: new Map<string, { row: StudioRow; data: unknown }>(),
    offline: false,
    puts: [] as { baseVersion: number; force?: boolean }[],
    reset() {
      s.rows.clear();
      s.offline = false;
      s.puts = [];
    },
    error(status: number | undefined, body?: unknown) {
      return Object.assign(new Error('x'), { status, body });
    },
  };
  return s;
});

vi.mock('../cloud/api', () => {
  let n = 0;
  const reach = () => {
    if (server.offline) throw server.error(undefined);
  };
  return {
    createStudio: async (name: string, data: unknown) => {
      reach();
      const row = { id: `p${++n}`, name, version: 1, updated_at: `t${n}`, access: 'owner' as const, owner_email: 'me@x.com' };
      server.rows.set(row.id, { row, data: structuredClone(data) });
      return row;
    },
    loadStudio: async (id: string) => {
      reach();
      const r = server.rows.get(id);
      if (!r) throw server.error(404);
      return structuredClone(r);
    },
    saveStudio: async (id: string, input: { name: string; data: unknown; baseVersion: number; force?: boolean }) => {
      reach();
      server.puts.push({ baseVersion: input.baseVersion, force: input.force });
      const r = server.rows.get(id);
      if (!r) throw server.error(404);
      if (!input.force && input.baseVersion !== r.row.version) throw server.error(409, { error: 'stale', row: r.row });
      r.row = { ...r.row, name: input.name, version: r.row.version + 1 };
      r.data = structuredClone(input.data);
      return r.row;
    },
  };
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

type Store = typeof import('./studioStore');
type Sync = typeof import('./studioSync');
let store: Store;
let sync: Sync;
const studio = () => store.useStudio.getState();
const status = () => sync.useStudioSync.getState().status;

beforeEach(async () => {
  server.reset();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.resetModules();
  store = await import('./studioStore');
  sync = await import('./studioSync');
});

describe('a studio project kept in the account', () => {
  it('is put in the account once, then each change is saved on top of the version before it', async () => {
    studio().setName('מסעדה');
    await sync.putInCloud();
    const id = studio().cloud!.id;
    expect(server.rows.get(id)!.data).toMatchObject({ name: 'מסעדה' });
    expect(store.hasUnsaved(studio())).toBe(false);

    studio().addMark({ at: { x: 1, y: 2 }, category: 'obstacle', note: 'צינור קיים' });
    expect(store.hasUnsaved(studio())).toBe(true);
    await sync.syncNow();
    expect(server.puts).toEqual([{ baseVersion: 1, force: false }]);
    expect(studio().cloud!.version).toBe(2);
    expect((server.rows.get(id)!.data as { marks: unknown[] }).marks).toHaveLength(1);
    expect(status()).toBe('saved');
  });

  it('opens on another device exactly as it was saved, with nothing waiting to be sent', async () => {
    studio().setName('דירה');
    studio().setCeiling(2700);
    await sync.putInCloud();
    const id = studio().cloud!.id;

    // The phone: a fresh device with its own storage.
    vi.stubGlobal('localStorage', memoryStorage());
    vi.resetModules();
    const phone = await import('./studioStore');
    const phoneSync = await import('./studioSync');
    expect(phone.useStudio.getState().name).toBe('');
    expect(await phoneSync.openFromCloud(id)).toBe(true);
    expect(phone.useStudio.getState()).toMatchObject({ name: 'דירה', design: { ceilingMm: 2700 }, cloud: { id, version: 1 } });
    expect(phone.hasUnsaved(phone.useStudio.getState())).toBe(false);
  });

  it('keeps changes made offline on the device and sends them when the connection returns', async () => {
    await sync.putInCloud();
    server.offline = true;
    studio().setName('בשטח');
    await sync.syncNow();
    expect(status()).toBe('offline');
    expect(store.hasUnsaved(studio())).toBe(true);
    expect(JSON.parse(localStorage.getItem('buildable.studio.v1')!).name).toBe('בשטח');

    server.offline = false;
    await sync.syncNow();
    expect(status()).toBe('saved');
    expect(server.rows.get(studio().cloud!.id)!.data).toMatchObject({ name: 'בשטח' });
  });

  it('does not overwrite a version saved from another device; the person chooses', async () => {
    studio().setName('משרד');
    await sync.putInCloud();
    const id = studio().cloud!.id;
    // Another device saves version 2.
    const r = server.rows.get(id)!;
    r.row = { ...r.row, version: 2 };
    r.data = { ...(r.data as object), name: 'מהטלפון' };

    studio().setName('מהמחשב');
    await sync.syncNow();
    expect(status()).toBe('conflict');
    expect(sync.useStudioSync.getState().theirs).toMatchObject({ version: 2 });
    expect(server.rows.get(id)!.data).toMatchObject({ name: 'מהטלפון' });

    // While undecided, further changes are not pushed over it.
    studio().setCity('חיפה');
    await sync.syncNow();
    expect(server.rows.get(id)!.data).toMatchObject({ name: 'מהטלפון' });

    await sync.takeTheirs();
    expect(studio()).toMatchObject({ name: 'מהטלפון', cloud: { version: 2 } });
    expect(status()).toBe('saved');
  });

  it('keeping this device’s version over the other one is a deliberate overwrite', async () => {
    await sync.putInCloud();
    const id = studio().cloud!.id;
    server.rows.get(id)!.row.version = 5;
    studio().setName('שלי');
    await sync.syncNow();
    expect(status()).toBe('conflict');
    await sync.keepMine();
    expect(server.puts.at(-1)).toMatchObject({ force: true });
    expect(server.rows.get(id)!.data).toMatchObject({ name: 'שלי' });
    expect(studio().cloud!.version).toBe(6);
  });

  it('a change made while a save is on its way is sent after it, not dropped', async () => {
    await sync.putInCloud();
    studio().setName('א');
    const first = sync.syncNow();
    studio().setName('ב');
    void sync.syncNow();
    await first;
    await vi.waitFor(() => expect(server.rows.get(studio().cloud!.id)!.data).toMatchObject({ name: 'ב' }));
    await vi.waitFor(() => expect(store.hasUnsaved(studio())).toBe(false));
  });

  it('a new plan is a new project, no longer tied to the one in the account', async () => {
    await sync.putInCloud();
    studio().loadSpaces([], 'other.dxf');
    expect(studio().cloud).toBeNull();
  });

  it('brings in what a teammate saved, when nothing here is waiting to be sent', async () => {
    studio().setName('בר');
    await sync.putInCloud();
    const id = studio().cloud!.id;
    const r = server.rows.get(id)!;
    r.row = { ...r.row, version: 2 };
    r.data = { ...(r.data as object), name: 'בר — מהשטח' };

    await sync.pullLatest();
    expect(studio()).toMatchObject({ name: 'בר — מהשטח', cloud: { version: 2 } });
    expect(store.hasUnsaved(studio())).toBe(false);
  });

  it('with changes here too, a teammate’s newer version is a choice, not an overwrite either way', async () => {
    await sync.putInCloud();
    const id = studio().cloud!.id;
    server.rows.get(id)!.row.version = 2;
    studio().setName('שלי');
    await sync.pullLatest();
    expect(status()).toBe('conflict');
    expect(studio().name).toBe('שלי');
  });

  it('a project shared to look at only is never sent, whatever changes here', async () => {
    await sync.putInCloud();
    const link = studio().cloud!;
    studio().linkCloud({ ...link, access: 'view' });
    studio().setName('ניסיון');
    await sync.syncNow();
    expect(status()).toBe('viewOnly');
    expect(server.puts).toEqual([]);
  });

  it('is listed under its name, or its file when it has none', () => {
    expect(sync.cloudName({ name: '  ', fileName: 'plan.dxf' }, 'ללא שם')).toBe('plan.dxf');
    expect(sync.cloudName({ name: '', fileName: null }, 'ללא שם')).toBe('ללא שם');
    expect(sync.cloudName({ name: ' מלון ', fileName: 'plan.dxf' }, 'ללא שם')).toBe('מלון');
  });
});

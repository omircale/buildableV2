import { create } from 'zustand';
import { createStudio, loadStudio, saveStudio, type ApiError, type StudioRow } from '../cloud/api';
import type { StudioProject } from '../engine/studio/model';
import { hasUnsaved, studioSnapshot, useStudio } from './studioStore';

/**
 * Keeps the studio project on this device in step with the account, so the office and the phone on
 * site work on the same project.
 *
 * The device's copy is always the one being worked on, and it is saved there first, so nothing waits
 * for the network and nothing is lost without it. Once a project is in the account, every change is sent
 * shortly after it is made, and whatever piled up offline is sent when the connection returns.
 *
 * Each save names the account's version it started from. If another device saved in between, the
 * account refuses, and the person chooses: open the other version, or keep this one over it. Nothing is
 * overwritten without that choice.
 */

export type SyncStatus =
  /** Not in the account, or nothing has happened yet. */
  | 'idle'
  | 'saving'
  | 'saved'
  /** No connection: the changes are on this device and will be sent when it returns. */
  | 'offline'
  /** Another device saved a version this one has not seen. */
  | 'conflict'
  /** The account no longer has this project (deleted from another device). */
  | 'gone'
  /** Signed out, or not admitted: the project stays on this device. */
  | 'signedOut'
  /** Shared with this account to look only: changes made here stay on this device. */
  | 'viewOnly'
  | 'tooLarge'
  | 'failed';

interface SyncState {
  status: SyncStatus;
  /** The version another device saved, while `status` is 'conflict'. */
  theirs: StudioRow | null;
}

export const useStudioSync = create<SyncState>(() => ({ status: 'idle', theirs: null }));

const DEBOUNCE_MS = 1500;

/** The name the account lists the project under; a project without one goes by its file. */
export function cloudName(p: Pick<StudioProject, 'name' | 'fileName'>, untitled: string): string {
  return p.name.trim() || p.fileName?.trim() || untitled;
}

let untitledName = 'Studio project';
let running: Promise<void> | null = null;
let again = false;

function statusFor(e: unknown): SyncStatus {
  const { status, code } = e as ApiError;
  if (status === undefined) return 'offline'; // the request never reached the server
  if (code === 'view_only') return 'viewOnly';
  if (status === 401 || status === 403) return 'signedOut';
  if (status === 404) return 'gone';
  if (status === 413) return 'tooLarge';
  return 'failed';
}

async function send(force: boolean): Promise<void> {
  const s = useStudio.getState();
  if (!s.cloud) return;
  if (s.cloud.access === 'view') {
    useStudioSync.setState({ status: 'viewOnly' });
    return;
  }
  if (!force && !hasUnsaved(s)) {
    useStudioSync.setState({ status: 'saved' });
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    useStudioSync.setState({ status: 'offline' });
    return;
  }
  const edits = s.edits;
  const id = s.cloud.id;
  useStudioSync.setState({ status: 'saving' });
  try {
    const row = await saveStudio(id, { name: cloudName(s, untitledName), data: studioSnapshot(s), baseVersion: s.cloud.version, force });
    // Only if the device is still on the same project: a new plan or an opened one replaced it meanwhile.
    if (useStudio.getState().cloud?.id !== id) return;
    useStudio.getState().linkCloud({ id, access: row.access, version: row.version, savedAt: row.updated_at, syncedEdits: edits });
    useStudioSync.setState({ status: 'saved', theirs: null });
  } catch (e) {
    if ((e as ApiError).status === 409) {
      useStudioSync.setState({ status: 'conflict', theirs: ((e as ApiError).body as { row?: StudioRow })?.row ?? null });
      return;
    }
    useStudioSync.setState({ status: statusFor(e) });
  }
}

/**
 * Sends this device's changes to the account now. One save runs at a time; a call made while one is
 * running is folded into a second one afterwards, so the last change is never left behind.
 */
export async function syncNow(opts: { force?: boolean } = {}): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  if (useStudioSync.getState().status === 'conflict' && !opts.force) return;
  running = send(opts.force ?? false).finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

/** Puts the project on this device into the account. From then on it is kept in step. */
export async function putInCloud(): Promise<void> {
  const s = useStudio.getState();
  if (s.cloud) return syncNow();
  const edits = s.edits;
  useStudioSync.setState({ status: 'saving' });
  try {
    const row = await createStudio(cloudName(s, untitledName), studioSnapshot(s));
    useStudio.getState().linkCloud({ id: row.id, access: row.access, version: row.version, savedAt: row.updated_at, syncedEdits: edits });
    useStudioSync.setState({ status: 'saved', theirs: null });
    // Anything changed while the first save was on its way.
    if (hasUnsaved(useStudio.getState())) await syncNow();
  } catch (e) {
    useStudioSync.setState({ status: statusFor(e) });
  }
}

/** Opens a project from the account on this device, in place of whatever was here. */
export async function openFromCloud(id: string): Promise<boolean> {
  try {
    const { row, data } = await loadStudio(id);
    useStudio.getState().openCloud(data as Partial<StudioProject>, { id: row.id, access: row.access, version: row.version, savedAt: row.updated_at });
    useStudioSync.setState({ status: row.access === 'view' ? 'viewOnly' : 'saved', theirs: null });
    return true;
  } catch (e) {
    useStudioSync.setState({ status: statusFor(e) });
    return false;
  }
}

/**
 * Brings in what someone else saved since this device last saw the project. With nothing unsaved here
 * it simply opens the newer version; with changes here too, the person chooses, as with a refused save.
 */
export async function pullLatest(): Promise<void> {
  const s = useStudio.getState();
  if (!s.cloud || running || useStudioSync.getState().status === 'conflict') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const { id, version } = s.cloud;
  try {
    const { row, data } = await loadStudio(id);
    const now = useStudio.getState();
    if (now.cloud?.id !== id) return;
    if (row.version === version) {
      // Same version; the owner may have changed what this account may do with it.
      if (row.access !== now.cloud.access) now.linkCloud({ ...now.cloud, access: row.access });
      return;
    }
    if (!hasUnsaved(now)) {
      now.openCloud(data as Partial<StudioProject>, { id, access: row.access, version: row.version, savedAt: row.updated_at });
      useStudioSync.setState({ status: row.access === 'view' ? 'viewOnly' : 'saved', theirs: null });
    } else {
      useStudioSync.setState({ status: 'conflict', theirs: row });
    }
  } catch (e) {
    const status = statusFor(e);
    if (status !== 'offline') useStudioSync.setState({ status });
  }
}

/** After a conflict: this device's version replaces the one another device saved. */
export const keepMine = () => syncNow({ force: true });

/** After a conflict: the version another device saved replaces this device's. */
export async function takeTheirs(): Promise<void> {
  const id = useStudio.getState().cloud?.id;
  if (id) await openFromCloud(id);
}

/** The project left the account: keep working on it here only. */
export function keepLocalOnly(): void {
  useStudio.getState().linkCloud(null);
  useStudioSync.setState({ status: 'idle', theirs: null });
}

/**
 * Starts keeping the project in step while the studio is open: each change is sent shortly after it is
 * made, and what piled up offline is sent when the connection returns. Returns the way to stop.
 */
export function startStudioSync(untitled: string): () => void {
  untitledName = untitled;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), DEBOUNCE_MS);
  };
  // Changes here go out; with none, what others saved comes in.
  const refresh = () => {
    if (!useStudio.getState().cloud) return;
    if (hasUnsaved(useStudio.getState())) void syncNow();
    else void pullLatest();
  };
  const stopWatching = useStudio.subscribe((s, prev) => {
    if (s.cloud?.id !== prev.cloud?.id) {
      useStudioSync.setState({ status: s.cloud ? 'saved' : 'idle', theirs: null });
      // Another project on screen — opened, or the signed-in person's own once they are known, which on
      // a fresh page is after the studio started — so it is checked against the account now.
      refresh();
    }
    if (s.cloud && s.edits !== prev.edits) later();
  });
  const visible = () => document.visibilityState === 'visible' && refresh();
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', visible);
  refresh();
  return () => {
    clearTimeout(timer);
    stopWatching();
    window.removeEventListener('online', refresh);
    document.removeEventListener('visibilitychange', visible);
  };
}

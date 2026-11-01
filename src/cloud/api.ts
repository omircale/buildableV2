import { useEffect, useState } from 'react';

/**
 * The app's account: who is signed in, and their folders and bills, kept by the site's own Worker
 * (worker/api.ts) on Cloudflare D1.
 *
 * Signing in is with an address and a password, or with Google, both through the Worker. The session
 * is an HttpOnly cookie the page never sees; this module only asks the Worker who it is talking to.
 * Nothing here decides who may see what — the Worker checks that on every request.
 */

export const cloudConfigured = true;

export type Role = 'admin' | 'member' | null;

export interface Session {
  user: { id: string; email: string };
}

export interface AuthState {
  session: Session | null;
  role: Role;
  loading: boolean;
  /**
   * The server could not be reached, so this is who was signed in on this device the last time it
   * could. Their work stays on screen; anything that needs the server waits for the connection.
   */
  offline: boolean;
  /** Kept for the screens that still ask; a Google account has no password to recover. */
  recovery: boolean;
}

/** Where a person goes to sign in with Google, and where they come back to afterwards. */
export function signInUrl(returnTo: string): string {
  return `/api/auth/google?return=${encodeURIComponent(returnTo)}`;
}

const listeners = new Set<() => void>();

/**
 * The last answer to "who is signed in" on this device. Only the screen uses it, to keep showing a
 * person's own work when there is no connection; the server never trusts it and still checks the
 * session cookie on every request.
 */
const LAST_KEY = 'buildable.auth.last';

function rememberAuth(who: { user: Session['user']; role: Role } | null): void {
  try {
    if (who) localStorage.setItem(LAST_KEY, JSON.stringify(who));
    else localStorage.removeItem(LAST_KEY);
  } catch {
    // Storage refused: offline, the person shows as signed out, as before.
  }
}

function lastAuth(): { user: Session['user']; role: Role } | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    const v = raw ? (JSON.parse(raw) as { user?: Session['user']; role?: Role }) : null;
    return v?.user?.id && v.user.email ? { user: v.user, role: v.role ?? null } : null;
  } catch {
    return null;
  }
}

/** Asks every screen holding the account to read it again — after signing out, say. */
export function refreshAuth(): void {
  for (const l of listeners) l();
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ session: null, role: null, loading: true, recovery: false, offline: false });
  useEffect(() => {
    let active = true;
    const load = async () => {
      let next: AuthState = { session: null, role: null, loading: false, recovery: false, offline: false };
      try {
        const res = await fetch('/api/me', { credentials: 'same-origin' });
        if (res.ok) {
          const body = (await res.json()) as { user: Session['user']; role: Role };
          next = { session: { user: body.user }, role: body.role ?? null, loading: false, recovery: false, offline: false };
          rememberAuth({ user: body.user, role: body.role ?? null });
        } else if (res.status === 401) {
          rememberAuth(null);
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch {
        // No server: no connection on site, or the dev server. Whoever was signed in here last is still
        // the person at this device, so their work stays theirs; with nobody remembered, nobody is.
        const last = lastAuth();
        if (last) next = { session: { user: last.user }, role: last.role, loading: false, recovery: false, offline: true };
      }
      if (active) setState(next);
    };
    void load();
    listeners.add(load);
    // Back online: ask again, so the screen learns whether the session is still good.
    window.addEventListener('online', load);
    return () => {
      active = false;
      listeners.delete(load);
      window.removeEventListener('online', load);
    };
  }, []);
  return state;
}

export async function signOut(): Promise<void> {
  rememberAuth(null);
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
  } finally {
    refreshAuth();
  }
}

/** Which ways of signing in the site offers. Anything but a clear yes counts as no. */
export async function enabledProviders(): Promise<{ google: boolean; password: boolean }> {
  try {
    const res = await fetch('/api/auth/providers');
    const body = (await res.json()) as { google?: boolean; password?: boolean };
    return { google: body.google === true, password: body.password === true };
  } catch {
    return { google: false, password: false };
  }
}

export interface ApiError extends Error {
  code?: string;
  status?: number;
  /** The whole answer, when the server said more than an error code. */
  body?: unknown;
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    let code: string | undefined;
    let body: unknown;
    try {
      body = await res.json();
      code = (body as { error?: string }).error;
    } catch {
      // Not JSON: the status says enough.
    }
    const error: ApiError = new Error(code ?? `HTTP ${res.status}`);
    error.code = code;
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return (await res.json()) as T;
}

/* ---------------------------------------------------------------- passwords */

/** The server's rule, repeated here only to say it before the server has to. */
export const PASSWORD_MIN = 10;

export async function passwordSignIn(email: string, password: string): Promise<void> {
  await call('/api/auth/password/login', { method: 'POST', body: { email, password } });
  refreshAuth();
}

/** The address a password link is for, or null when the link no longer works. */
export async function checkPasswordLink(token: string): Promise<{ email: string; purpose: 'invite' | 'reset' } | null> {
  try {
    return await call<{ email: string; purpose: 'invite' | 'reset' }>('/api/auth/password/link', { method: 'POST', body: { token } });
  } catch (e) {
    if ((e as ApiError).status === 404) return null;
    throw e;
  }
}

/** Sets the password through the link and signs this browser in. */
export async function setPasswordWithLink(token: string, password: string): Promise<void> {
  await call('/api/auth/password/set', { method: 'POST', body: { token, password } });
  refreshAuth();
}

/** Where a password link takes its person. The token rides after the #, so it is never sent to a server. */
export const passwordLinkUrl = (token: string) => `${window.location.origin}/#/login/password?t=${encodeURIComponent(token)}`;

/* ---------------------------------------------------------------- folders and bills */

/** A folder: a site the account works on — a hotel, a branch, an office floor. */
export interface PlaceRow {
  id: string;
  name: string;
  updated_at: string;
}

/** A surveyed project saved to the account. Its contents are loaded separately, when opened. */
export interface BillRow {
  id: string;
  place_id: string | null;
  name: string;
  rooms: number;
  updated_at: string;
}

export const listPlaces = () => call<PlaceRow[]>('/api/places');
export const createPlace = (name: string) => call<PlaceRow>('/api/places', { method: 'POST', body: { name } });
export const renamePlace = async (id: string, name: string) => void (await call(`/api/places/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } }));
export const deletePlace = async (id: string) => void (await call(`/api/places/${encodeURIComponent(id)}`, { method: 'DELETE' }));

export const listBills = () => call<BillRow[]>('/api/bills');
export const createBill = (input: { name: string; placeId: string | null; data: unknown; rooms: number }) => call<BillRow>('/api/bills', { method: 'POST', body: input });
export const updateBill = (id: string, patch: { name?: string; placeId?: string | null; data?: unknown; rooms?: number }) =>
  call<BillRow>(`/api/bills/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
export const deleteBill = async (id: string) => void (await call(`/api/bills/${encodeURIComponent(id)}`, { method: 'DELETE' }));

export async function loadBill(id: string): Promise<{ row: BillRow; data: unknown } | null> {
  try {
    return await call<{ row: BillRow; data: unknown }>(`/api/bills/${encodeURIComponent(id)}`);
  } catch (e) {
    if ((e as ApiError).status === 404) return null;
    throw e;
  }
}

/* ---------------------------------------------------------------- design-studio projects */

/** What this account may do with a studio project: it is theirs, or shared with them to edit or to look. */
export type StudioAccess = 'owner' | 'edit' | 'view';

/** A studio project saved to the account. `version` goes up with every save, from any device, by anyone. */
export interface StudioRow {
  id: string;
  name: string;
  version: number;
  updated_at: string;
  access: StudioAccess;
  owner_email: string;
}

export interface TeamMember {
  email: string;
  access: 'edit' | 'view';
  title: string | null;
  created_at: string;
}

export const listStudio = () => call<StudioRow[]>('/api/studio');
export const createStudio = (name: string, data: unknown) => call<StudioRow>('/api/studio', { method: 'POST', body: { name, data } });
export const loadStudio = (id: string) => call<{ row: StudioRow; data: unknown }>(`/api/studio/${encodeURIComponent(id)}`);
export const deleteStudio = async (id: string) => void (await call(`/api/studio/${encodeURIComponent(id)}`, { method: 'DELETE' }));

/** The team of a project: its owner and the people it is shared with. */
export const studioTeam = (id: string) => call<{ owner: string; members: TeamMember[] }>(`/api/studio/${encodeURIComponent(id)}/members`);
/** Adds someone to the team, or changes what they may do. Only the owner may. */
export const shareStudio = async (id: string, member: { email: string; access: 'edit' | 'view'; title: string | null }) =>
  void (await call(`/api/studio/${encodeURIComponent(id)}/members`, { method: 'POST', body: member }));
/** Takes someone off the team; anyone may take themselves off. */
export const unshareStudio = async (id: string, email: string) =>
  void (await call(`/api/studio/${encodeURIComponent(id)}/members/${encodeURIComponent(email)}`, { method: 'DELETE' }));

/**
 * Saves on top of `baseVersion`. If another device saved since, the server refuses: the error has
 * status 409 and `body.row` is the version there now. `force` overwrites it, and is only for a person
 * who chose to keep this device's version.
 */
export const saveStudio = (id: string, input: { name: string; data: unknown; baseVersion: number; force?: boolean }) =>
  call<StudioRow>(`/api/studio/${encodeURIComponent(id)}`, { method: 'PUT', body: input });

/* ---------------------------------------------------------------- the admin's screen */

export interface MemberRow {
  user_id: string;
  email: string;
  role: 'admin' | 'member';
  created_at: string;
  /** 1 when the account has a password (it may also sign in with Google). */
  has_password: number;
}

export interface Usage {
  members: number;
  invited: number;
  places: number;
  bills: number;
  studio: number;
  shared: number;
}

export const listMembers = () => call<MemberRow[]>('/api/admin/members');
export const removeMember = async (userId: string) => void (await call(`/api/admin/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }));
export const listInvited = () => call<{ email: string; created_at: string }[]>('/api/admin/invites');
export const invite = async (email: string) => void (await call('/api/admin/invites', { method: 'POST', body: { email } }));
export const uninvite = async (email: string) => void (await call(`/api/admin/invites/${encodeURIComponent(email)}`, { method: 'DELETE' }));
export const adminUsage = () => call<Usage>('/api/admin/usage');

/** A one-time link for the address: an invitation to choose a password, or a reset of one. */
export const createPasswordLink = (email: string) =>
  call<{ token: string; purpose: 'invite' | 'reset'; expires_at: string }>('/api/admin/password-links', { method: 'POST', body: { email } });

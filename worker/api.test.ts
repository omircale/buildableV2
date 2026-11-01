import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { handleApi } from './api';
import { identityFromIdToken, safeReturn, sha256 } from './auth';
import type { Db, Env, Stmt } from './db';

/** D1's interface over Node's SQLite, so the API runs here exactly as it runs on Cloudflare. */
function sqliteDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('pragma foreign_keys = on;');
  sqlite.exec(readFileSync(new URL('../migrations/0001_accounts.sql', import.meta.url), 'utf8'));
  const stmt = (sql: string, values: unknown[] = []): Stmt => {
    const args = values.map((v) => (v === undefined ? null : v)) as never[];
    return {
      bind: (...v: unknown[]) => stmt(sql, v),
      first: async <T,>() => (sqlite.prepare(sql).get(...args) as T) ?? null,
      all: async <T,>() => ({ results: sqlite.prepare(sql).all(...args) as T[] }),
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
    };
  };
  return { prepare: (sql) => stmt(sql), batch: async (s) => Promise.all(s.map((x) => x.run())) };
}

let env: Env;
const ORIGIN = 'https://buildable.example';

beforeEach(() => {
  env = { DB: sqliteDb(), ASSETS: { fetch: async () => new Response('app') }, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'secret', BOOTSTRAP_ADMIN_EMAIL: 'Boss@Example.com' };
});
afterEach(() => vi.unstubAllGlobals());

/** A signed-in browser for an account, with or without a role. */
async function signIn(id: string, email: string, role: 'admin' | 'member' | null): Promise<string> {
  await env.DB.prepare('insert into users (id, email) values (?, ?)').bind(id, email).run();
  if (role) await env.DB.prepare('insert into app_users (user_id, role) values (?, ?)').bind(id, role).run();
  const token = `tok-${id}`;
  await env.DB.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').bind(await sha256(token), id, '2999-01-01T00:00:00Z').run();
  return token;
}

function call(path: string, token: string | null, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `bsid=${token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return handleApi(new Request(`${ORIGIN}${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }), env);
}

/** An unsigned ID token, as Google's token endpoint returns it. */
function idToken(claims: Record<string, unknown>): string {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'RS256' })}.${b(claims)}.sig`;
}

describe('who is signed in', () => {
  test('nobody: 401', async () => {
    expect((await call('/api/me', null)).status).toBe(401);
    expect((await call('/api/places', null)).status).toBe(401);
  });

  test('a signed-in person nobody invited is known but admitted to nothing', async () => {
    const t = await signIn('u1', 'a@x.com', null);
    expect(await (await call('/api/me', t)).json()).toEqual({ user: { id: 'u1', email: 'a@x.com' }, role: null });
    expect((await call('/api/places', t)).status).toBe(403);
  });

  test('an expired session is no session', async () => {
    await env.DB.prepare('insert into users (id, email) values (?, ?)').bind('u1', 'a@x.com').run();
    await env.DB.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').bind(await sha256('old'), 'u1', '2000-01-01T00:00:00Z').run();
    expect((await call('/api/me', 'old')).status).toBe(401);
  });
});

describe('signing in with Google', () => {
  const claims = (email: string, extra: Record<string, unknown> = {}) => ({ iss: 'https://accounts.google.com', aud: 'cid', exp: 4_000_000_000, sub: `g-${email}`, email, email_verified: true, ...extra });

  test('the ID token is checked: issuer, audience, expiry and a verified address', () => {
    expect(identityFromIdToken(idToken(claims('a@x.com')), 'cid', 1)).toEqual({ sub: 'g-a@x.com', email: 'a@x.com', name: null });
    expect(identityFromIdToken(idToken(claims('a@x.com', { aud: 'other' })), 'cid', 1)).toBeNull();
    expect(identityFromIdToken(idToken(claims('a@x.com', { email_verified: false })), 'cid', 1)).toBeNull();
    expect(identityFromIdToken(idToken(claims('a@x.com', { iss: 'evil' })), 'cid', 1)).toBeNull();
    expect(identityFromIdToken(idToken(claims('a@x.com', { exp: 10 })), 'cid', 100)).toBeNull();
  });

  test('only an in-app route is returned to', () => {
    expect(safeReturn('#/studio/plan')).toBe('#/studio/plan');
    expect(safeReturn('https://evil.example')).toBe('#/');
    expect(safeReturn('#/x?y=<script>')).toBe('#/');
  });

  async function completeSignIn(email: string): Promise<Response> {
    const start = await call('/api/auth/google?return=%23%2Fspace', null);
    expect(start.status).toBe(302);
    const location = new URL(start.headers.get('location')!);
    expect(location.host).toBe('accounts.google.com');
    expect(location.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback`);
    const stateCookie = start.headers.get('set-cookie')!.split(';')[0];
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ id_token: idToken(claims(email)) })));
    return handleApi(
      new Request(`${ORIGIN}/api/auth/callback?code=c&state=${location.searchParams.get('state')}`, { headers: { cookie: stateCookie } }),
      env,
    );
  }

  test('the bootstrap address becomes the admin, once, and lands where it was going', async () => {
    const res = await completeSignIn('boss@example.com');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/#/space`);
    const session = res.headers.get('set-cookie')!.match(/bsid=([^;]+)/)![1];
    expect((await (await call('/api/me', session)).json()).role).toBe('admin');
  });

  test('an invited address becomes a member; an uninvited one becomes nothing', async () => {
    const admin = await signIn('adm', 'adm@x.com', 'admin');
    await call('/api/admin/invites', admin, { method: 'POST', body: { email: 'Guest@X.com' } });
    const invited = (await completeSignIn('guest@x.com')).headers.get('set-cookie')!.match(/bsid=([^;]+)/)![1];
    expect((await (await call('/api/me', invited)).json()).role).toBe('member');
    const stranger = (await completeSignIn('who@x.com')).headers.get('set-cookie')!.match(/bsid=([^;]+)/)![1];
    expect((await (await call('/api/me', stranger)).json()).role).toBeNull();
  });

  test('a callback whose state does not match is refused', async () => {
    const res = await handleApi(new Request(`${ORIGIN}/api/auth/callback?code=c&state=forged`, { headers: { cookie: 'boauth=real.v.%23%2F' } }), env);
    expect(res.headers.get('location')).toContain('error=state');
  });

  test('signing out ends the session', async () => {
    const t = await signIn('u1', 'a@x.com', 'member');
    await call('/api/auth/logout', t, { method: 'POST' });
    expect((await call('/api/me', t)).status).toBe(401);
  });
});

describe('a member’s own work', () => {
  test('folders and bills: create, list, rename, move, delete', async () => {
    const t = await signIn('u1', 'a@x.com', 'member');
    const place = await (await call('/api/places', t, { method: 'POST', body: { name: ' מלון דן ' } })).json();
    expect(place.name).toBe('מלון דן');
    const bill = await (await call('/api/bills', t, { method: 'POST', body: { name: 'קומה 3', placeId: place.id, data: { rooms: [1, 2] }, rooms: 2 } })).json();
    expect(bill.place_id).toBe(place.id);
    expect((await (await call(`/api/bills/${bill.id}`, t)).json()).data).toEqual({ rooms: [1, 2] });
    await call(`/api/bills/${bill.id}`, t, { method: 'PATCH', body: { name: 'קומה 4' } });
    expect((await (await call('/api/bills', t)).json())[0].name).toBe('קומה 4');
    await call(`/api/places/${place.id}`, t, { method: 'DELETE' });
    expect((await (await call('/api/bills', t)).json())[0].place_id).toBeNull();
    expect((await call(`/api/bills/${bill.id}`, t, { method: 'DELETE' })).status).toBe(200);
    expect(await (await call('/api/bills', t)).json()).toEqual([]);
  });

  test('one account never sees, changes or files into another’s', async () => {
    const a = await signIn('a', 'a@x.com', 'member');
    const b = await signIn('b', 'b@x.com', 'member');
    const place = await (await call('/api/places', a, { method: 'POST', body: { name: 'של א' } })).json();
    const bill = await (await call('/api/bills', a, { method: 'POST', body: { name: 'של א', data: {} } })).json();
    expect(await (await call('/api/bills', b)).json()).toEqual([]);
    expect((await call(`/api/bills/${bill.id}`, b)).status).toBe(404);
    expect((await call(`/api/bills/${bill.id}`, b, { method: 'PATCH', body: { name: 'גנוב' } })).status).toBe(404);
    expect((await call(`/api/bills/${bill.id}`, b, { method: 'DELETE' })).status).toBe(404);
    expect((await call('/api/bills', b, { method: 'POST', body: { name: 'x', placeId: place.id, data: {} } })).status).toBe(403);
  });

  test('the admin sees members and counts, not bills', async () => {
    const admin = await signIn('adm', 'adm@x.com', 'admin');
    const m = await signIn('m', 'm@x.com', 'member');
    await call('/api/bills', m, { method: 'POST', body: { name: 'פרטי', data: { secret: 1 } } });
    expect(await (await call('/api/bills', admin)).json()).toEqual([]);
    expect((await (await call('/api/admin/members', admin)).json()).map((r: { email: string }) => r.email)).toEqual(['adm@x.com', 'm@x.com']);
    expect((await (await call('/api/admin/usage', admin)).json()).bills).toBe(1);
    expect((await call('/api/admin/members', m)).status).toBe(403);
  });

  test('a mutation that is not JSON is refused, and an oversized bill too', async () => {
    const t = await signIn('u1', 'a@x.com', 'member');
    const form = await handleApi(new Request(`${ORIGIN}/api/places`, { method: 'POST', headers: { cookie: `bsid=${t}`, 'content-type': 'application/x-www-form-urlencoded' }, body: 'name=x' }), env);
    expect(form.status).toBe(400);
    const big = 'x'.repeat(5 * 1024 * 1024 + 10);
    expect((await call('/api/bills', t, { method: 'POST', body: { name: 'גדול', data: big } })).status).toBe(413);
  });
});


import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { handleApi } from './api';
import { DUMMY_HASH, hashPassword, identityFromIdToken, safeReturn, sha256, verifyPassword } from './auth';
import type { Db, Env, Stmt } from './db';

/** D1's interface over Node's SQLite, so the API runs here exactly as it runs on Cloudflare. */
function sqliteDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('pragma foreign_keys = on;');
  // Every migration, in order, exactly as `wrangler d1 migrations apply` runs them.
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(f, dir), 'utf8'));
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
    expect(identityFromIdToken(idToken(claims('a@x.com')), 'cid', 1)).toEqual({ sub: 'g-a@x.com', email: 'a@x.com' });
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


describe('design-studio projects', () => {
  const project = (name: string) => ({ name, spaces: [], marks: [], revision: 1 });

  test('saved from one device, opened on another, saved again on top of what it opened', async () => {
    const t = await signIn('u1', 'a@x.com', 'member');
    const created = await (await call('/api/studio', t, { method: 'POST', body: { name: 'מסעדה', data: project('מסעדה') } })).json();
    expect(created).toMatchObject({ name: 'מסעדה', version: 1 });

    // The phone lists and opens it.
    expect((await (await call('/api/studio', t)).json()).map((r: { id: string }) => r.id)).toEqual([created.id]);
    const opened = await (await call(`/api/studio/${created.id}`, t)).json();
    expect(opened.data).toEqual(project('מסעדה'));

    // A mark added on site, saved on top of version 1.
    const saved = await call(`/api/studio/${created.id}`, t, { method: 'PUT', body: { name: 'מסעדה', data: { ...project('מסעדה'), marks: [1] }, baseVersion: 1 } });
    expect(saved.status).toBe(200);
    expect((await saved.json()).version).toBe(2);
    expect((await (await call(`/api/studio/${created.id}`, t)).json()).data.marks).toEqual([1]);
  });

  test('a save from a device that has not seen the latest version is refused, not lost', async () => {
    const t = await signIn('u1', 'a@x.com', 'member');
    const { id } = await (await call('/api/studio', t, { method: 'POST', body: { name: 'א', data: project('א') } })).json();
    await call(`/api/studio/${id}`, t, { method: 'PUT', body: { name: 'א', data: project('office'), baseVersion: 1 } });

    const stale = await call(`/api/studio/${id}`, t, { method: 'PUT', body: { name: 'א', data: project('phone'), baseVersion: 1 } });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: 'stale', row: { id, version: 2 } });
    expect((await (await call(`/api/studio/${id}`, t)).json()).data.name).toBe('office');

    // Keeping this device's version is a deliberate choice.
    const forced = await call(`/api/studio/${id}`, t, { method: 'PUT', body: { name: 'א', data: project('phone'), force: true } });
    expect((await forced.json()).version).toBe(3);
    expect((await (await call(`/api/studio/${id}`, t)).json()).data.name).toBe('phone');
  });

  test("another account's project does not exist for you, the admin included", async () => {
    const a = await signIn('u1', 'a@x.com', 'member');
    const boss = await signIn('u2', 'boss@example.com', 'admin');
    const { id } = await (await call('/api/studio', a, { method: 'POST', body: { name: 'א', data: project('א') } })).json();
    expect(await (await call('/api/studio', boss)).json()).toEqual([]);
    expect((await call(`/api/studio/${id}`, boss)).status).toBe(404);
    expect((await call(`/api/studio/${id}`, boss, { method: 'PUT', body: { name: 'x', data: {}, force: true } })).status).toBe(404);
    expect((await call(`/api/studio/${id}`, boss, { method: 'DELETE' })).status).toBe(404);
    expect((await (await call('/api/admin/usage', boss)).json()).studio).toBe(1);
    expect((await call(`/api/studio/${id}`, a, { method: 'DELETE' })).status).toBe(200);
  });

  test('not admitted, unnamed, or too large is refused', async () => {
    const pending = await signIn('u0', 'p@x.com', null);
    expect((await call('/api/studio', pending)).status).toBe(403);
    const t = await signIn('u1', 'a@x.com', 'member');
    expect((await call('/api/studio', t, { method: 'POST', body: { name: '  ', data: {} } })).status).toBe(400);
    expect((await call('/api/studio', t, { method: 'POST', body: { name: 'א', data: 'x'.repeat(5 * 1024 * 1024 + 1) } })).status).toBe(413);
    const { id } = await (await call('/api/studio', t, { method: 'POST', body: { name: 'א', data: {} } })).json();
    expect((await call(`/api/studio/${id}`, t, { method: 'PUT', body: { name: 'א', data: {} } })).status).toBe(400);
  });
});

describe('signing in with an address and a password', () => {
  const session = (res: Response) => res.headers.get('set-cookie')?.match(/bsid=([^;]+)/)?.[1] ?? null;
  const login = (email: string, password: string) => call('/api/auth/password/login', null, { method: 'POST', body: { email, password } });
  const linkFor = async (admin: string, email: string) => (await call('/api/admin/password-links', admin, { method: 'POST', body: { email } })).json();
  const setPassword = (token: string, password: string) => call('/api/auth/password/set', null, { method: 'POST', body: { token, password } });

  test('a password is kept only as a salted hash, and checked against it', async () => {
    const a = await hashPassword('סיסמה ארוכה 123');
    const b = await hashPassword('סיסמה ארוכה 123');
    expect(a).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('סיסמה');
    expect(await verifyPassword('סיסמה ארוכה 123', a)).toBe(true);
    expect(await verifyPassword('סיסמה ארוכה 124', a)).toBe(false);
    expect(await verifyPassword('anything', DUMMY_HASH)).toBe(false);
  });

  test('invited, the person sets a password through the admin’s link and is a member at once', async () => {
    const admin = await signIn('adm', 'adm@x.com', 'admin');
    await call('/api/admin/invites', admin, { method: 'POST', body: { email: 'site@x.com' } });
    const link = await linkFor(admin, 'Site@X.com');
    expect(link.purpose).toBe('invite');
    // The token itself is never stored.
    expect(await env.DB.prepare('select 1 from password_links where token_hash = ?').bind(link.token).first()).toBeNull();

    expect(await (await call('/api/auth/password/link', null, { method: 'POST', body: { token: link.token } })).json()).toEqual({ email: 'site@x.com', purpose: 'invite' });
    expect((await setPassword(link.token, 'short')).status).toBe(400);
    const set = await setPassword(link.token, 'a long enough one');
    expect(set.status).toBe(200);
    expect((await (await call('/api/me', session(set))).json()).role).toBe('member');

    // The link is used up.
    expect((await setPassword(link.token, 'another long one')).status).toBe(404);

    const ok = await login(' SITE@x.com ', 'a long enough one');
    expect(ok.status).toBe(200);
    expect((await (await call('/api/me', session(ok))).json()).user.email).toBe('site@x.com');
    expect((await (await call('/api/admin/members', admin)).json()).find((m: { email: string }) => m.email === 'site@x.com').has_password).toBe(1);
  });

  test('a wrong address and a wrong password get the same answer; repeated guesses lock the account', async () => {
    const admin = await signIn('adm', 'adm@x.com', 'admin');
    await call('/api/admin/invites', admin, { method: 'POST', body: { email: 'site@x.com' } });
    await setPassword((await linkFor(admin, 'site@x.com')).token, 'the right password');

    expect(await (await login('nobody@x.com', 'whatever it is')).json()).toEqual({ error: 'bad_credentials' });
    for (let i = 0; i < 4; i++) expect((await login('site@x.com', 'a wrong password')).status).toBe(401);
    expect(await (await login('site@x.com', 'a wrong password')).json()).toEqual({ error: 'locked' });
    // Locked even for the right password, until the time is up.
    expect((await login('site@x.com', 'the right password')).status).toBe(429);
    await env.DB.prepare("update users set locked_until = '2000-01-01T00:00:00Z' where email = 'site@x.com'").run();
    expect((await login('site@x.com', 'the right password')).status).toBe(200);
  });

  test('a reset link replaces the password and ends the sessions that used the old one', async () => {
    const admin = await signIn('adm', 'adm@x.com', 'admin');
    await call('/api/admin/invites', admin, { method: 'POST', body: { email: 'site@x.com' } });
    await setPassword((await linkFor(admin, 'site@x.com')).token, 'the first password');
    const phone = session(await login('site@x.com', 'the first password'));

    const reset = await linkFor(admin, 'site@x.com');
    expect(reset.purpose).toBe('reset');
    const fresh = session(await setPassword(reset.token, 'the second password'));
    expect((await call('/api/me', phone)).status).toBe(401);
    expect((await call('/api/me', fresh)).status).toBe(200);
    expect((await login('site@x.com', 'the first password')).status).toBe(401);
    expect((await login('site@x.com', 'the second password')).status).toBe(200);
  });

  test('links are the admin’s, for invited addresses only, and withdrawing the invitation withdraws the link', async () => {
    const admin = await signIn('adm', 'adm@x.com', 'admin');
    const member = await signIn('m1', 'm@x.com', 'member');
    expect((await call('/api/admin/password-links', member, { method: 'POST', body: { email: 'm@x.com' } })).status).toBe(403);
    expect(await (await call('/api/admin/password-links', admin, { method: 'POST', body: { email: 'stranger@x.com' } })).json()).toEqual({ error: 'not_invited' });

    await call('/api/admin/invites', admin, { method: 'POST', body: { email: 'site@x.com' } });
    const { token } = await linkFor(admin, 'site@x.com');
    await call('/api/admin/invites/site%40x.com', admin, { method: 'DELETE' });
    expect((await setPassword(token, 'a long enough one')).status).toBe(404);
  });

  test('Google and a password with the same address are one account', async () => {
    const admin = await signIn('adm', 'adm@x.com', 'admin');
    await call('/api/admin/invites', admin, { method: 'POST', body: { email: 'site@x.com' } });
    const viaPassword = session(await setPassword((await linkFor(admin, 'site@x.com')).token, 'a long enough one'));
    const passwordId = (await (await call('/api/me', viaPassword)).json()).user.id;

    const start = await call('/api/auth/google?return=%23%2F', null);
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    const claims = { iss: 'https://accounts.google.com', aud: 'cid', exp: 4_000_000_000, sub: 'google-site', email: 'site@x.com', email_verified: true };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ id_token: idToken(claims) })));
    const res = await handleApi(new Request(`${ORIGIN}/api/auth/callback?code=c&state=${state}`, { headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } }), env);
    const viaGoogle = await (await call('/api/me', session(res))).json();
    expect(viaGoogle).toEqual({ user: { id: passwordId, email: 'site@x.com' }, role: 'member' });
  });
});

describe('a studio project shared with the team', () => {
  const project = (name: string) => ({ name, spaces: [], marks: [], revision: 1 });
  async function setUp() {
    const admin = await signIn('adm', 'adm@x.com', 'admin');
    const pm = await signIn('pm', 'pm@x.com', 'member');
    const trade = await signIn('tr', 'trade@x.com', 'member');
    const client = await signIn('cl', 'client@x.com', 'member');
    const stranger = await signIn('st', 'stranger@x.com', 'member');
    const { id } = await (await call('/api/studio', pm, { method: 'POST', body: { name: 'בר בריכה', data: project('בר בריכה') } })).json();
    return { admin, pm, trade, client, stranger, id };
  }
  const share = (token: string, id: string, email: string, access: string, title?: string) => call(`/api/studio/${id}/members`, token, { method: 'POST', body: { email, access, title } });

  test('someone the owner adds to edit sees it, opens it and saves on top of the latest version', async () => {
    const { pm, trade, id } = await setUp();
    expect((await share(pm, id, 'Trade@X.com', 'edit', 'אינסטלטור')).status).toBe(200);

    const listed = await (await call('/api/studio', trade)).json();
    expect(listed).toEqual([expect.objectContaining({ id, access: 'edit', owner_email: 'pm@x.com' })]);
    const opened = await (await call(`/api/studio/${id}`, trade)).json();
    expect(opened.row.access).toBe('edit');

    const saved = await call(`/api/studio/${id}`, trade, { method: 'PUT', body: { name: 'בר בריכה', data: { ...project('בר בריכה'), marks: [1] }, baseVersion: 1 } });
    expect((await saved.json()).version).toBe(2);
    // The owner's next save, from the version they had, is refused: nothing the trade saved is lost.
    expect((await call(`/api/studio/${id}`, pm, { method: 'PUT', body: { name: 'x', data: project('x'), baseVersion: 1 } })).status).toBe(409);
  });

  test('someone added to look reads it but cannot save; the team is visible to all on it', async () => {
    const { pm, client, id } = await setUp();
    await share(pm, id, 'client@x.com', 'view', 'לקוח');
    expect((await call(`/api/studio/${id}`, client)).status).toBe(200);
    expect(await (await call(`/api/studio/${id}`, client, { method: 'PUT', body: { name: 'x', data: {}, force: true } })).json()).toEqual({ error: 'view_only' });
    expect(await (await call(`/api/studio/${id}/members`, client)).json()).toEqual({
      owner: 'pm@x.com',
      members: [expect.objectContaining({ email: 'client@x.com', access: 'view', title: 'לקוח' })],
    });
  });

  test('only the owner changes the team or deletes the project; a member may leave', async () => {
    const { pm, trade, client, id } = await setUp();
    await share(pm, id, 'trade@x.com', 'edit');
    expect((await share(trade, id, 'client@x.com', 'edit')).status).toBe(403);
    expect((await call(`/api/studio/${id}/members/pm%40x.com`, trade, { method: 'DELETE' })).status).toBe(403);
    expect((await call(`/api/studio/${id}`, trade, { method: 'DELETE' })).status).toBe(404);

    expect((await call(`/api/studio/${id}/members/trade%40x.com`, trade, { method: 'DELETE' })).status).toBe(200);
    expect((await call(`/api/studio/${id}`, trade)).status).toBe(404);
    expect(await (await call('/api/studio', client)).json()).toEqual([]);
  });

  test('to anyone not on the team, the admin included, the project does not exist', async () => {
    const { admin, stranger, id } = await setUp();
    for (const who of [admin, stranger]) {
      expect((await call(`/api/studio/${id}`, who)).status).toBe(404);
      expect((await call(`/api/studio/${id}/members`, who)).status).toBe(404);
      expect((await share(who, id, 'stranger@x.com', 'edit')).status).toBe(404);
    }
  });

  test('a project is shared only with someone the admin let in; deleting it ends the sharing', async () => {
    const { pm, id } = await setUp();
    expect(await (await share(pm, id, 'outsider@x.com', 'edit')).json()).toEqual({ error: 'not_invited' });
    expect(await (await share(pm, id, 'pm@x.com', 'edit')).json()).toEqual({ error: 'is_owner' });
    expect((await share(pm, id, 'trade@x.com', 'admin')).status).toBe(400);

    await share(pm, id, 'trade@x.com', 'edit');
    await call(`/api/studio/${id}`, pm, { method: 'DELETE' });
    expect(await env.DB.prepare('select count(*) as n from studio_members').first()).toEqual({ n: 0 });
  });
});

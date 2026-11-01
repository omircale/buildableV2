import {
  SESSION_COOKIE,
  SESSION_DAYS,
  STATE_COOKIE,
  cookie,
  exchangeCode,
  googleAuthUrl,
  identityFromIdToken,
  randomToken,
  readCookie,
  safeReturn,
  sha256,
} from './auth';
import type { Db, Env } from './db';

/**
 * The app's API: who is signed in, their folders and bills, and the admin's member list.
 *
 * Every data query carries the account it acts for. A folder or a bill is visible to the account that
 * owns it and to nobody else — the admin included; the admin sees who is a member, never their work.
 * A signed-in person nobody invited is known but admitted to nothing.
 */

type Role = 'admin' | 'member';
interface Me {
  id: string;
  email: string;
  role: Role | null;
}

const MAX_BILL_BYTES = 5 * 1024 * 1024;
const now = () => new Date().toISOString();

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const fail = (status: number, error: string) => json({ error }, status);

async function me(request: Request, db: Db): Promise<Me | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await db
    .prepare(
      `select u.id, u.email, a.role from sessions s join users u on u.id = s.user_id
       left join app_users a on a.user_id = u.id where s.token_hash = ? and s.expires_at > ?`,
    )
    .bind(await sha256(token), now())
    .first<{ id: string; email: string; role: Role | null }>();
  return row ? { id: row.id, email: row.email, role: row.role ?? null } : null;
}

/** On sign-in: the bootstrap address becomes the admin while there is none; an invited one becomes a member. */
async function admit(db: Db, user: { id: string; email: string }, bootstrap: string | undefined): Promise<void> {
  const has = await db.prepare('select role from app_users where user_id = ?').bind(user.id).first();
  if (has) return;
  const anyAdmin = await db.prepare("select 1 from app_users where role = 'admin' limit 1").first();
  if (!anyAdmin && bootstrap && bootstrap.trim().toLowerCase() === user.email) {
    await db.prepare("insert into app_users (user_id, role) values (?, 'admin')").bind(user.id).run();
    return;
  }
  const invited = await db.prepare('select 1 from invited_emails where email = ?').bind(user.email).first();
  if (invited) await db.prepare("insert into app_users (user_id, role) values (?, 'member')").bind(user.id).run();
}

/**
 * Work brought over from the old accounts service waits under a placeholder account, `legacy:<address>`,
 * because nobody's Google id is known until they sign in. The first time that address signs in with
 * Google, its folders, bills and role move to the real account, in one transaction, and the
 * placeholder is gone.
 */
export async function claimImported(db: Db, userId: string, email: string): Promise<void> {
  const legacy = await db.prepare("select id from users where email = ? and id like 'legacy:%'").bind(email).first<{ id: string }>();
  if (!legacy) return;
  await db.batch([
    // Free the address first: it is unique, and the real account is about to take it.
    db.prepare('update users set email = id where id = ?').bind(legacy.id),
    db.prepare('insert into users (id, email) values (?, ?) on conflict (id) do update set email = excluded.email').bind(userId, email),
    db.prepare('update places set owner_id = ? where owner_id = ?').bind(userId, legacy.id),
    db.prepare('update bills set owner_id = ? where owner_id = ?').bind(userId, legacy.id),
    db.prepare('insert into app_users (user_id, role) select ?, role from app_users where user_id = ? on conflict (user_id) do nothing').bind(userId, legacy.id),
    db.prepare('delete from users where id = ?').bind(legacy.id),
  ]);
}

async function body<T>(request: Request): Promise<T | null> {
  // A mutation must say it is JSON: a form posted from another site cannot, so it never gets here.
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return null;
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

const cleanName = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max ? v.trim() : null);

async function ownsPlace(db: Db, owner: string, placeId: string | null | undefined): Promise<boolean> {
  if (placeId == null) return true;
  return Boolean(await db.prepare('select 1 from places where id = ? and owner_id = ?').bind(placeId, owner).first());
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;
  const db = env.DB;
  const redirectUri = `${url.origin}/api/auth/callback`;

  /* ---------------------------------------------------------------- signing in */

  if (path === '/api/auth/google' && method === 'GET') {
    if (!env.GOOGLE_CLIENT_ID) return fail(503, 'not_configured');
    const state = randomToken(16);
    const verifier = randomToken(32);
    const back = encodeURIComponent(safeReturn(url.searchParams.get('return')));
    return new Response(null, {
      status: 302,
      headers: {
        location: await googleAuthUrl(env.GOOGLE_CLIENT_ID, redirectUri, state, verifier),
        'set-cookie': cookie(STATE_COOKIE, `${state}.${verifier}.${back}`, 600),
      },
    });
  }

  if (path === '/api/auth/callback' && method === 'GET') {
    const [state, verifier, back] = (readCookie(request, STATE_COOKIE) ?? '').split('.');
    const code = url.searchParams.get('code');
    const home = `${url.origin}/${safeReturn(decodeURIComponent(back ?? ''))}`;
    const clear = cookie(STATE_COOKIE, '', 0);
    if (!state || !verifier || !code || url.searchParams.get('state') !== state) {
      return new Response(null, { status: 302, headers: { location: `${url.origin}/#/login?error=state`, 'set-cookie': clear } });
    }
    const idToken = await exchangeCode({ code, verifier, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri });
    const who = idToken && identityFromIdToken(idToken, env.GOOGLE_CLIENT_ID, Math.floor(Date.now() / 1000));
    if (!who) return new Response(null, { status: 302, headers: { location: `${url.origin}/#/login?error=google`, 'set-cookie': clear } });

    await claimImported(db, who.sub, who.email);
    await db
      .prepare('insert into users (id, email, name) values (?, ?, ?) on conflict (id) do update set email = excluded.email, name = excluded.name')
      .bind(who.sub, who.email, who.name)
      .run();
    await admit(db, { id: who.sub, email: who.email }, env.BOOTSTRAP_ADMIN_EMAIL);
    const token = randomToken(32);
    const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
    await db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').bind(await sha256(token), who.sub, expires).run();
    const headers = new Headers({ location: home });
    headers.append('set-cookie', clear);
    headers.append('set-cookie', cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400));
    return new Response(null, { status: 302, headers });
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) await db.prepare('delete from sessions where token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION_COOKIE, '', 0) });
  }

  if (path === '/api/auth/providers' && method === 'GET') {
    return json({ google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) });
  }

  /* ---------------------------------------------------------------- everything else needs a person */

  const user = await me(request, db);
  if (path === '/api/me' && method === 'GET') {
    return user ? json({ user: { id: user.id, email: user.email }, role: user.role }) : fail(401, 'signed_out');
  }
  if (!user) return fail(401, 'signed_out');

  /* ---------------------------------------------------------------- admin */

  if (path.startsWith('/api/admin/')) {
    if (user.role !== 'admin') return fail(403, 'not_admin');
    if (path === '/api/admin/members' && method === 'GET') {
      const { results } = await db.prepare('select a.user_id, u.email, a.role, a.created_at from app_users a join users u on u.id = a.user_id order by a.created_at').all();
      return json(results);
    }
    const memberId = path.match(/^\/api\/admin\/members\/([^/]+)$/)?.[1];
    if (memberId && method === 'DELETE') {
      if (memberId === user.id) return fail(400, 'cannot_remove_self');
      await db.prepare('delete from app_users where user_id = ?').bind(decodeURIComponent(memberId)).run();
      await db.prepare('delete from sessions where user_id = ?').bind(decodeURIComponent(memberId)).run();
      return json({ ok: true });
    }
    if (path === '/api/admin/invites' && method === 'GET') {
      const { results } = await db.prepare('select email, created_at from invited_emails order by created_at desc').all();
      return json(results);
    }
    if (path === '/api/admin/invites' && method === 'POST') {
      const b = await body<{ email?: string }>(request);
      const email = typeof b?.email === 'string' ? b.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return fail(400, 'bad_email');
      await db.prepare('insert into invited_emails (email, invited_by) values (?, ?) on conflict (email) do nothing').bind(email, user.id).run();
      // Someone who already signed in with this address is admitted at once.
      await db.prepare("insert into app_users (user_id, role) select id, 'member' from users where email = ? on conflict (user_id) do nothing").bind(email).run();
      return json({ ok: true });
    }
    const inviteEmail = path.match(/^\/api\/admin\/invites\/([^/]+)$/)?.[1];
    if (inviteEmail && method === 'DELETE') {
      await db.prepare('delete from invited_emails where email = ?').bind(decodeURIComponent(inviteEmail).toLowerCase()).run();
      return json({ ok: true });
    }
    if (path === '/api/admin/usage' && method === 'GET') {
      // Counts only. The admin learns how much is kept, never what.
      const count = async (table: string) => ((await db.prepare(`select count(*) as n from ${table}`).first<{ n: number }>())?.n ?? 0);
      return json({ members: await count('app_users'), invited: await count('invited_emails'), places: await count('places'), bills: await count('bills') });
    }
    return fail(404, 'not_found');
  }

  /* ---------------------------------------------------------------- a member's own work */

  if (!user.role) return fail(403, 'not_admitted');

  if (path === '/api/places' && method === 'GET') {
    const { results } = await db.prepare('select id, name, updated_at from places where owner_id = ? order by name').bind(user.id).all();
    return json(results);
  }
  if (path === '/api/places' && method === 'POST') {
    const name = cleanName((await body<{ name?: string }>(request))?.name, 120);
    if (!name) return fail(400, 'bad_name');
    const id = crypto.randomUUID();
    await db.prepare('insert into places (id, owner_id, name) values (?, ?, ?)').bind(id, user.id, name).run();
    return json(await db.prepare('select id, name, updated_at from places where id = ?').bind(id).first(), 201);
  }
  const placeId = path.match(/^\/api\/places\/([^/]+)$/)?.[1];
  if (placeId && method === 'PATCH') {
    const name = cleanName((await body<{ name?: string }>(request))?.name, 120);
    if (!name) return fail(400, 'bad_name');
    const r = await db.prepare('update places set name = ?, updated_at = ? where id = ? and owner_id = ?').bind(name, now(), placeId, user.id).run();
    return r.meta.changes ? json({ ok: true }) : fail(404, 'not_found');
  }
  if (placeId && method === 'DELETE') {
    // Its bills stay, out of any folder.
    await db.prepare('update bills set place_id = null where place_id = ? and owner_id = ?').bind(placeId, user.id).run();
    const r = await db.prepare('delete from places where id = ? and owner_id = ?').bind(placeId, user.id).run();
    return r.meta.changes ? json({ ok: true }) : fail(404, 'not_found');
  }

  const BILL = 'id, place_id, name, rooms, updated_at';
  if (path === '/api/bills' && method === 'GET') {
    const { results } = await db.prepare(`select ${BILL} from bills where owner_id = ? order by updated_at desc`).bind(user.id).all();
    return json(results);
  }
  if (path === '/api/bills' && method === 'POST') {
    const b = await body<{ name?: string; placeId?: string | null; data?: unknown; rooms?: number }>(request);
    const name = cleanName(b?.name, 200);
    const data = b?.data === undefined ? null : JSON.stringify(b.data);
    if (!name || data == null) return fail(400, 'bad_bill');
    if (new TextEncoder().encode(data).length > MAX_BILL_BYTES) return fail(413, 'too_large');
    if (!(await ownsPlace(db, user.id, b?.placeId))) return fail(403, 'not_your_place');
    const id = crypto.randomUUID();
    const rooms = Number.isInteger(b?.rooms) && (b!.rooms as number) >= 0 ? (b!.rooms as number) : 0;
    await db.prepare('insert into bills (id, owner_id, place_id, name, data, rooms) values (?, ?, ?, ?, ?, ?)').bind(id, user.id, b?.placeId ?? null, name, data, rooms).run();
    return json(await db.prepare(`select ${BILL} from bills where id = ?`).bind(id).first(), 201);
  }
  const billId = path.match(/^\/api\/bills\/([^/]+)$/)?.[1];
  if (billId && method === 'GET') {
    const row = await db.prepare(`select ${BILL}, data from bills where id = ? and owner_id = ?`).bind(billId, user.id).first<Record<string, unknown> & { data: string }>();
    if (!row) return fail(404, 'not_found');
    const { data, ...rest } = row;
    return json({ row: rest, data: JSON.parse(data) });
  }
  if (billId && method === 'PATCH') {
    const b = await body<{ name?: string; placeId?: string | null; data?: unknown; rooms?: number }>(request);
    if (!b) return fail(400, 'bad_bill');
    const sets: string[] = [];
    const values: unknown[] = [];
    if (b.name !== undefined) {
      const name = cleanName(b.name, 200);
      if (!name) return fail(400, 'bad_name');
      sets.push('name = ?');
      values.push(name);
    }
    if (b.placeId !== undefined) {
      if (!(await ownsPlace(db, user.id, b.placeId))) return fail(403, 'not_your_place');
      sets.push('place_id = ?');
      values.push(b.placeId);
    }
    if (b.data !== undefined) {
      const data = JSON.stringify(b.data);
      if (new TextEncoder().encode(data).length > MAX_BILL_BYTES) return fail(413, 'too_large');
      sets.push('data = ?');
      values.push(data);
    }
    if (b.rooms !== undefined) {
      if (!Number.isInteger(b.rooms) || b.rooms < 0) return fail(400, 'bad_rooms');
      sets.push('rooms = ?');
      values.push(b.rooms);
    }
    sets.push('updated_at = ?');
    values.push(now());
    const r = await db.prepare(`update bills set ${sets.join(', ')} where id = ? and owner_id = ?`).bind(...values, billId, user.id).run();
    if (!r.meta.changes) return fail(404, 'not_found');
    return json(await db.prepare(`select ${BILL} from bills where id = ?`).bind(billId).first());
  }
  if (billId && method === 'DELETE') {
    const r = await db.prepare('delete from bills where id = ? and owner_id = ?').bind(billId, user.id).run();
    return r.meta.changes ? json({ ok: true }) : fail(404, 'not_found');
  }

  return fail(404, 'not_found');
}

import {
  DUMMY_HASH,
  SESSION_COOKIE,
  SESSION_DAYS,
  STATE_COOKIE,
  cookie,
  exchangeCode,
  googleAuthUrl,
  hashPassword,
  identityFromIdToken,
  passwordAcceptable,
  randomToken,
  readCookie,
  safeReturn,
  sha256,
  verifyPassword,
} from './auth';
import type { Db, Env } from './db';

/**
 * The app's API: who is signed in, their folders and bills, and the admin's member list.
 *
 * A person signs in with Google or with an address and a password; either way they are the same
 * account, found by the address, and get the same kind of session.
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
/** Wrong passwords in a row before an account stops accepting them for a while. */
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
/** How long a password link works: an invitation waits a week for its person, a reset a day. */
const LINK_HOURS = { invite: 7 * 24, reset: 24 } as const;
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

/** A new session for an account: the cookie that carries it. */
async function startSession(db: Db, userId: string): Promise<string> {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').bind(await sha256(token), userId, expires).run();
  return cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400);
}

const cleanEmail = (v: unknown) => {
  const email = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320 ? email : null;
};

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

    // Google has confirmed the address, so an account that already has it — one made with a password —
    // is this person's. Otherwise the account is keyed by Google's id.
    const known = await db.prepare('select id from users where id = ? or email = ? order by id = ? desc limit 1').bind(who.sub, who.email, who.sub).first<{ id: string }>();
    const userId = known?.id ?? who.sub;
    if (!known) await db.prepare('insert into users (id, email) values (?, ?)').bind(userId, who.email).run();
    else await db.prepare('update users set email = ? where id = ? and not exists (select 1 from users where email = ? and id <> ?)').bind(who.email, userId, who.email, userId).run();
    await admit(db, { id: userId, email: who.email }, env.BOOTSTRAP_ADMIN_EMAIL);
    const headers = new Headers({ location: home });
    headers.append('set-cookie', clear);
    headers.append('set-cookie', await startSession(db, userId));
    return new Response(null, { status: 302, headers });
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) await db.prepare('delete from sessions where token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION_COOKIE, '', 0) });
  }

  if (path === '/api/auth/providers' && method === 'GET') {
    return json({ google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), password: true });
  }

  // An address and a password. A wrong address and a wrong password get the same answer, in the same
  // time; after repeated wrong passwords the account rests for a while.
  if (path === '/api/auth/password/login' && method === 'POST') {
    const b = await body<{ email?: string; password?: string }>(request);
    const email = cleanEmail(b?.email);
    const password = typeof b?.password === 'string' ? b.password : '';
    const row = email
      ? await db.prepare('select id, email, password_hash, failed_logins, locked_until from users where email = ?').bind(email).first<{ id: string; email: string; password_hash: string | null; failed_logins: number; locked_until: string | null }>()
      : null;
    if (!row?.password_hash) {
      await verifyPassword(password, DUMMY_HASH);
      return fail(401, 'bad_credentials');
    }
    if (row.locked_until && row.locked_until > now()) return fail(429, 'locked');
    if (!(await verifyPassword(password, row.password_hash))) {
      const failed = row.failed_logins + 1;
      const lock = failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
      await db.prepare('update users set failed_logins = ?, locked_until = ? where id = ?').bind(lock ? 0 : failed, lock, row.id).run();
      return fail(lock ? 429 : 401, lock ? 'locked' : 'bad_credentials');
    }
    await db.prepare('update users set failed_logins = 0, locked_until = null where id = ?').bind(row.id).run();
    await admit(db, { id: row.id, email: row.email }, env.BOOTSTRAP_ADMIN_EMAIL);
    return json({ ok: true }, 200, { 'set-cookie': await startSession(db, row.id) });
  }

  // A link from the admin: which address it is for, so the page can say so before a password is chosen.
  const link = async (token: unknown) =>
    typeof token === 'string' && token
      ? await db.prepare('select token_hash, email, purpose from password_links where token_hash = ? and expires_at > ?').bind(await sha256(token), now()).first<{ token_hash: string; email: string; purpose: 'invite' | 'reset' }>()
      : null;
  if (path === '/api/auth/password/link' && method === 'POST') {
    const found = await link((await body<{ token?: string }>(request))?.token);
    return found ? json({ email: found.email, purpose: found.purpose }) : fail(404, 'link_expired');
  }

  // Setting the password through the link. The link is used up, every other session of the account
  // ends (a reset is often because someone else may know the old one), and this browser is signed in.
  if (path === '/api/auth/password/set' && method === 'POST') {
    const b = await body<{ token?: string; password?: string }>(request);
    const found = await link(b?.token);
    if (!found) return fail(404, 'link_expired');
    if (!passwordAcceptable(b?.password)) return fail(400, 'weak_password');
    const hash = await hashPassword(b.password);
    const existing = await db.prepare('select id from users where email = ?').bind(found.email).first<{ id: string }>();
    const userId = existing?.id ?? crypto.randomUUID();
    if (existing) await db.prepare('update users set password_hash = ?, failed_logins = 0, locked_until = null where id = ?').bind(hash, userId).run();
    else await db.prepare('insert into users (id, email, password_hash) values (?, ?, ?)').bind(userId, found.email, hash).run();
    await db.prepare('delete from password_links where email = ?').bind(found.email).run();
    await db.prepare('delete from sessions where user_id = ?').bind(userId).run();
    await admit(db, { id: userId, email: found.email }, env.BOOTSTRAP_ADMIN_EMAIL);
    return json({ ok: true, email: found.email }, 200, { 'set-cookie': await startSession(db, userId) });
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
      const { results } = await db
        .prepare('select a.user_id, u.email, a.role, a.created_at, u.password_hash is not null as has_password from app_users a join users u on u.id = a.user_id order by a.created_at')
        .all();
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
      const email = decodeURIComponent(inviteEmail).toLowerCase();
      await db.prepare('delete from invited_emails where email = ?').bind(email).run();
      await db.prepare('delete from password_links where email = ?').bind(email).run();
      return json({ ok: true });
    }
    // A one-time link for setting a password: an invitation for someone without one, a reset for
    // someone who has one. Only for an address the admin invited or a working account. The admin passes
    // the link on; whoever opens it chooses the password, so it goes to that person only.
    if (path === '/api/admin/password-links' && method === 'POST') {
      const email = cleanEmail((await body<{ email?: string }>(request))?.email);
      if (!email) return fail(400, 'bad_email');
      const account = await db.prepare('select u.password_hash is not null as has_password, a.role from users u left join app_users a on a.user_id = u.id where u.email = ?').bind(email).first<{ has_password: number; role: Role | null }>();
      const invited = await db.prepare('select 1 from invited_emails where email = ?').bind(email).first();
      if (!invited && !account?.role) return fail(400, 'not_invited');
      const purpose = account?.has_password ? 'reset' : 'invite';
      const token = randomToken(32);
      const expires = new Date(Date.now() + LINK_HOURS[purpose] * 3600_000).toISOString();
      // A new link replaces any earlier one for the address.
      await db.prepare('delete from password_links where email = ?').bind(email).run();
      await db.prepare('insert into password_links (token_hash, email, purpose, created_by, expires_at) values (?, ?, ?, ?, ?)').bind(await sha256(token), email, purpose, user.id, expires).run();
      return json({ token, purpose, expires_at: expires }, 201);
    }
    if (path === '/api/admin/usage' && method === 'GET') {
      // Counts only. The admin learns how much is kept, never what.
      const count = async (table: string) => ((await db.prepare(`select count(*) as n from ${table}`).first<{ n: number }>())?.n ?? 0);
      return json({
        members: await count('app_users'),
        invited: await count('invited_emails'),
        places: await count('places'),
        bills: await count('bills'),
        studio: await count('studio_projects'),
        shared: await count('studio_members'),
      });
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

  /* -------------------------------------------------- design-studio projects */

  // A save carries the version it started from. If another device or another person saved in between,
  // the save is refused with the version that is there now, and the person chooses which one to keep.
  //
  // A project is its owner's, and also of the people the owner shared it with: those who may edit save
  // to it, those who may only look read it. To anyone else it does not exist.
  const STUDIO = 'p.id, p.name, p.version, p.updated_at, owner.email as owner_email';
  const studioRow = (id: string) =>
    db
      .prepare(
        `select ${STUDIO}, case when p.owner_id = ? then 'owner' else m.access end as access
         from studio_projects p join users owner on owner.id = p.owner_id
         left join studio_members m on m.project_id = p.id and m.email = ?
         where p.id = ? and (p.owner_id = ? or m.email is not null)`,
      )
      .bind(user.id, user.email, id, user.id)
      .first<{ id: string; access: 'owner' | 'edit' | 'view' }>();

  if (path === '/api/studio' && method === 'GET') {
    const { results } = await db
      .prepare(
        `select ${STUDIO}, case when p.owner_id = ? then 'owner' else m.access end as access
         from studio_projects p join users owner on owner.id = p.owner_id
         left join studio_members m on m.project_id = p.id and m.email = ?
         where p.owner_id = ? or m.email is not null order by p.updated_at desc`,
      )
      .bind(user.id, user.email, user.id)
      .all();
    return json(results);
  }
  if (path === '/api/studio' && method === 'POST') {
    const b = await body<{ name?: string; data?: unknown }>(request);
    const name = cleanName(b?.name, 200);
    const data = b?.data == null ? null : JSON.stringify(b.data);
    if (!name || data == null) return fail(400, 'bad_project');
    if (new TextEncoder().encode(data).length > MAX_BILL_BYTES) return fail(413, 'too_large');
    const id = crypto.randomUUID();
    await db.prepare('insert into studio_projects (id, owner_id, name, data) values (?, ?, ?, ?)').bind(id, user.id, name, data).run();
    return json(await studioRow(id), 201);
  }
  const studioId = path.match(/^\/api\/studio\/([^/]+)$/)?.[1];
  if (studioId && method === 'GET') {
    const row = await studioRow(studioId);
    if (!row) return fail(404, 'not_found');
    const data = await db.prepare('select data from studio_projects where id = ?').bind(studioId).first<{ data: string }>();
    return json({ row, data: JSON.parse(data!.data) });
  }
  if (studioId && method === 'PUT') {
    const row = await studioRow(studioId);
    if (!row) return fail(404, 'not_found');
    if (row.access === 'view') return fail(403, 'view_only');
    const b = await body<{ name?: string; data?: unknown; baseVersion?: number; force?: boolean }>(request);
    const name = cleanName(b?.name, 200);
    const data = b?.data == null ? null : JSON.stringify(b.data);
    if (!name || data == null || (!b?.force && !Number.isInteger(b?.baseVersion))) return fail(400, 'bad_project');
    if (new TextEncoder().encode(data).length > MAX_BILL_BYTES) return fail(413, 'too_large');
    const r = await db
      .prepare('update studio_projects set name = ?, data = ?, version = version + 1, updated_at = ? where id = ? and (? or version = ?)')
      .bind(name, data, now(), studioId, b?.force ? 1 : 0, b?.baseVersion ?? 0)
      .run();
    const after = await studioRow(studioId);
    return r.meta.changes ? json(after) : json({ error: 'stale', row: after }, 409);
  }
  if (studioId && method === 'DELETE') {
    const r = await db.prepare('delete from studio_projects where id = ? and owner_id = ?').bind(studioId, user.id).run();
    return r.meta.changes ? json({ ok: true }) : fail(404, 'not_found');
  }

  // The team of a project: everyone on it sees who else is; only the owner changes it.
  const team = path.match(/^\/api\/studio\/([^/]+)\/members(?:\/([^/]+))?$/);
  if (team) {
    const [, projectId, memberEmail] = team;
    const row = await studioRow(projectId);
    if (!row) return fail(404, 'not_found');
    if (!memberEmail && method === 'GET') {
      const { results } = await db.prepare('select email, access, title, created_at from studio_members where project_id = ? order by created_at').bind(projectId).all();
      return json({ owner: (row as unknown as { owner_email: string }).owner_email, members: results });
    }
    if (!memberEmail && method === 'POST') {
      if (row.access !== 'owner') return fail(403, 'not_owner');
      const b = await body<{ email?: string; access?: string; title?: string | null }>(request);
      const email = cleanEmail(b?.email);
      if (!email) return fail(400, 'bad_email');
      if (b?.access !== 'edit' && b?.access !== 'view') return fail(400, 'bad_access');
      const title = b?.title == null || b.title === '' ? null : cleanName(b.title, 60);
      if (b?.title && !title) return fail(400, 'bad_title');
      if (email === user.email) return fail(400, 'is_owner');
      // The site stays invite-only: a project is shared only with someone the admin let in.
      const known = await db
        .prepare("select 1 from invited_emails where email = ? union select 1 from users u join app_users a on a.user_id = u.id where u.email = ?")
        .bind(email, email)
        .first();
      if (!known) return fail(400, 'not_invited');
      await db
        .prepare('insert into studio_members (project_id, email, access, title, added_by) values (?, ?, ?, ?, ?) on conflict (project_id, email) do update set access = excluded.access, title = excluded.title')
        .bind(projectId, email, b.access, title, user.id)
        .run();
      return json({ ok: true });
    }
    if (memberEmail && method === 'DELETE') {
      const email = decodeURIComponent(memberEmail).toLowerCase();
      // The owner removes anyone; anyone else may only leave.
      if (row.access !== 'owner' && email !== user.email) return fail(403, 'not_owner');
      const r = await db.prepare('delete from studio_members where project_id = ? and email = ?').bind(projectId, email).run();
      return r.meta.changes ? json({ ok: true }) : fail(404, 'not_found');
    }
  }

  return fail(404, 'not_found');
}

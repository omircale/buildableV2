/**
 * Signing in — with Google, or with an address and a password — and the session that follows.
 *
 * The flow is OAuth's authorization code with PKCE. The ID token is taken straight from Google's
 * token endpoint over TLS, in exchange for the code and the client secret, so its claims are checked
 * (issuer, audience, expiry, a verified address) but its signature does not have to be: Google's own
 * documentation says a token obtained that way can be trusted.
 *
 * A session is a random token in an HttpOnly cookie. Only its SHA-256 is stored.
 */

export const SESSION_COOKIE = 'bsid';
export const STATE_COOKIE = 'boauth';
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

/* ---------------------------------------------------------------- passwords */

/**
 * PBKDF2-SHA256 with a random salt per password. 100,000 rounds is the most the Workers runtime's
 * Web Crypto accepts — fewer than OWASP's 600,000 for this hash — so a password is also required to be
 * long, and an account locks for a while after repeated wrong guesses. The rounds are stored with each
 * hash, so they can be raised later without breaking old passwords.
 */
const PBKDF2_ROUNDS = 100_000;

/** Longer than the 8-character floor of NIST SP 800-63B and OWASP ASVS; no rules about which characters. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

export const passwordAcceptable = (p: unknown): p is string => typeof p === 'string' && [...p].length >= PASSWORD_MIN && [...p].length <= PASSWORD_MAX;

function unbase64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, rounds: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${PBKDF2_ROUNDS}$${base64url(salt)}$${base64url(await pbkdf2(password, salt, PBKDF2_ROUNDS))}`;
}

/** Whether `password` is the one `stored` was made from. Compares every byte, so timing says nothing. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, rounds, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !rounds || !salt || !hash) return false;
  const want = unbase64url(hash);
  const got = await pbkdf2(password, unbase64url(salt), Number(rounds));
  let diff = want.length ^ got.length;
  for (let i = 0; i < want.length; i++) diff |= want[i] ^ (got[i] ?? 0);
  return diff === 0;
}

/** Spends the same time as checking a real password, for an address that has none. */
export const DUMMY_HASH = 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}

export function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

/** Only an in-app hash route may be returned to after signing in — never another site. */
export function safeReturn(raw: string | null): string {
  return raw && /^#\/[\w\-/]*$/.test(raw) ? raw : '#/';
}

export async function googleAuthUrl(clientId: string, redirectUri: string, state: string, verifier: string): Promise<string> {
  const challenge = await sha256(verifier);
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // The address and the account id are all the site needs; the name and picture are not asked for.
    scope: 'openid email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
}

/** The claims of an ID token received directly from Google, checked. Null when anything is off. */
export function identityFromIdToken(idToken: string, clientId: string, nowSeconds: number): GoogleIdentity | null {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  let claims: Record<string, unknown>;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(json, (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
  const iss = claims.iss;
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') return null;
  if (claims.aud !== clientId) return null;
  if (typeof claims.exp !== 'number' || claims.exp < nowSeconds) return null;
  if (claims.email_verified !== true || typeof claims.email !== 'string' || typeof claims.sub !== 'string') return null;
  return { sub: claims.sub, email: claims.email.toLowerCase() };
}

/** Exchanges the code for tokens at Google's token endpoint. */
export async function exchangeCode(input: { code: string; verifier: string; clientId: string; clientSecret: string; redirectUri: string }): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      code_verifier: input.verifier,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { id_token?: string };
  return body.id_token ?? null;
}

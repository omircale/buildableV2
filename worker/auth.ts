/**
 * Signing in with Google, and the session that follows.
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

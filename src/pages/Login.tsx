import { useEffect, useState, type ReactNode } from 'react';
import { checkPasswordLink, PASSWORD_MIN, passwordSignIn, setPasswordWithLink, signInUrl, signOut, type ApiError, type AuthState } from '../cloud/api';
import { EDITION, workHome } from '../edition';
import { useT } from '../i18n';
import { AppHeader } from '../ui/AppHeader';
import { Button, buttonClass, inputClass } from '../ui/common';

/**
 * What the sign-in came back with, read from the route: the Worker sends a failed sign-in to
 * `#/login?error=…`. Null when there is nothing to report.
 */
export function loginError(hash: string): 'state' | 'google' | null {
  const error = new URLSearchParams(hash.split('?')[1] ?? '').get('error');
  return error === 'state' || error === 'google' ? error : null;
}

/** The token of a password link, when the route is one: `#/login/password?t=…`. */
export function passwordLinkToken(hash: string): string | null {
  if (!hash.startsWith('#/login/password')) return null;
  return new URLSearchParams(hash.split('?')[1] ?? '').get('t') || null;
}

/** What the server said, as words for the person. */
function useProblem() {
  const e = useT().account.errors;
  return (err: unknown): string => {
    const { code, status } = err as ApiError;
    if (status === undefined) return e.network;
    if (code === 'bad_credentials') return e.invalid;
    if (code === 'locked') return e.locked;
    if (code === 'weak_password') return e.weak(PASSWORD_MIN);
    return e.other;
  };
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

/** A password field with a show/hide switch beside it, big enough to hit on a phone. */
function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  shown,
  onToggle,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  shown: boolean;
  onToggle?: () => void;
  hint?: string;
}) {
  const a = useT().account;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-small font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          className={`${inputClass} flex-1`}
          type={shown ? 'text' : 'password'}
          dir="ltr"
          required
          autoComplete={autoComplete}
          value={value}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {onToggle && (
          <Button variant="ghost" onClick={onToggle} ariaLabel={shown ? a.hide : a.show} className="w-11 shrink-0 px-0">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
              {shown && <path d="M4 4l16 16" />}
            </svg>
          </Button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-caption text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

function Shell({ auth, children }: { auth: AuthState; children: ReactNode }) {
  const a = useT().account;
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <AppHeader auth={auth} />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        {children}
        <p className="mt-4 flex justify-center gap-4 text-small text-muted">
          <a href="/privacy" className="underline underline-offset-2">
            {a.privacy}
          </a>
          <a href="/terms" className="underline underline-offset-2">
            {a.terms}
          </a>
        </p>
      </main>
    </div>
  );
}

function Problem({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-small text-bad">
      {text}
    </p>
  );
}

/** An address and a password, and Google beside them. */
function SignInCard() {
  const a = useT().account;
  const problem = useProblem();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => (loginError(window.location.hash) ? a.googleFailed : null));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await passwordSignIn(email, password);
      window.location.hash = workHome();
    } catch (e) {
      setError(problem(e));
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-panel p-6">
      <h1 className="text-xl font-semibold">{a.signInTitle}</h1>
      <p className="text-small leading-relaxed text-muted">{a.gateNote}</p>
      <Problem text={error} />
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label htmlFor="login-email" className="mb-1 block text-small font-medium">
            {a.email}
          </label>
          <input id="login-email" className={inputClass} type="email" dir="ltr" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <PasswordInput id="login-password" label={a.password} value={password} onChange={setPassword} autoComplete="current-password" shown={shown} onToggle={() => setShown(!shown)} />
        <Button variant="primary" size="lg" type="submit" disabled={busy} className="w-full">
          {busy ? a.signingIn : a.signIn}
        </Button>
      </form>
      <p className="text-caption text-muted">{a.noPassword}</p>
      <div className="flex items-center gap-3 text-caption text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        {a.or}
        <span className="h-px flex-1 bg-line" />
      </div>
      <a href={signInUrl(workHome())} className={`${buttonClass('secondary', 'lg')} w-full gap-2`}>
        <span className="rounded bg-white p-0.5">
          <GoogleMark />
        </span>
        {a.google}
      </a>
      <p className="border-t border-line pt-3 text-small text-muted">
        {a.localNote}{' '}
        <a href="#/" className="underline underline-offset-2">
          {a.back}
        </a>
      </p>
    </section>
  );
}

/**
 * Choosing a password through the link the admin sent. The token is read once and taken out of the
 * address bar, so it is not left in the history or in a screenshot of the page.
 */
function SetPasswordCard({ token }: { token: string }) {
  const a = useT().account;
  const problem = useProblem();
  const [link, setLink] = useState<{ email: string; purpose: 'invite' | 'reset' } | null | 'checking'>('checking');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    history.replaceState(null, '', '#/login/password');
    let live = true;
    checkPasswordLink(token).then(
      (found) => live && setLink(found),
      (e) => live && (setLink(null), setError(problem(e))),
    );
    return () => {
      live = false;
    };
    // The token is read once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (link === 'checking') return <p className="text-body text-muted">{a.checkingLink}</p>;
  if (!link) {
    return (
      <section className="space-y-4 rounded-2xl border border-line bg-panel p-6">
        <h1 className="text-xl font-semibold">{a.setTitle}</h1>
        <Problem text={error ?? a.linkExpired} />
        <a href="#/login" className={buttonClass('secondary', 'md')}>
          {a.signIn}
        </a>
      </section>
    );
  }

  const submit = async () => {
    setError(null);
    if ([...password].length < PASSWORD_MIN) return setError(a.errors.weak(PASSWORD_MIN));
    if (password !== again) return setError(a.errors.mismatch);
    setBusy(true);
    try {
      await setPasswordWithLink(token, password);
      window.location.hash = workHome();
    } catch (e) {
      setError((e as ApiError).code === 'link_expired' ? a.linkExpired : problem(e));
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-panel p-6">
      <h1 className="text-xl font-semibold">{link.purpose === 'reset' ? a.resetTitle : a.setTitle}</h1>
      <p className="text-small text-muted">
        {a.setFor}{' '}
        <span dir="ltr" className="font-medium text-ink">
          {link.email}
        </span>
      </p>
      {link.purpose === 'reset' && <p className="text-small text-muted">{a.resetNote}</p>}
      <Problem text={error} />
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {/* For password managers: the account the new password belongs to. */}
        <input type="email" autoComplete="username" value={link.email} readOnly className="sr-only" tabIndex={-1} aria-hidden />
        <PasswordInput
          id="new-password"
          label={a.newPassword}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          shown={shown}
          onToggle={() => setShown(!shown)}
          hint={a.passwordHint(PASSWORD_MIN)}
        />
        <PasswordInput id="new-password-again" label={a.repeatPassword} value={again} onChange={setAgain} autoComplete="new-password" shown={shown} />
        <Button variant="primary" size="lg" type="submit" disabled={busy} className="w-full">
          {busy ? a.signingIn : a.savePassword}
        </Button>
      </form>
    </section>
  );
}

/**
 * Signing in: an address and a password, or Google. Signing in admits nobody by itself: an address
 * works once the admin has invited it. A password is chosen through a link from the admin.
 */
export function LoginPage({ auth }: { auth: AuthState }) {
  const t = useT();
  const a = t.account;
  const [busy, setBusy] = useState(false);
  const [token] = useState(() => passwordLinkToken(window.location.hash));

  if (token) {
    return (
      <Shell auth={auth}>
        <SetPasswordCard token={token} />
      </Shell>
    );
  }

  if (auth.loading)
    return (
      <Shell auth={auth}>
        <p className="text-body text-muted">{t.common.loading}</p>
      </Shell>
    );

  if (auth.session) {
    const role = auth.role === 'admin' ? a.roleAdmin : auth.role === 'member' ? a.roleMember : a.rolePending;
    return (
      <Shell auth={auth}>
        <section className="space-y-4 rounded-2xl border border-line bg-panel p-6">
          <h1 className="text-xl font-semibold">{a.signedIn}</h1>
          <div>
            <p className="text-body" dir="ltr">
              {auth.session.user.email}
            </p>
            <p className={`mt-1 inline-block rounded-full px-3 py-0.5 text-small font-medium ${auth.role ? 'bg-ok-soft' : 'bg-warn-soft'}`}>{role}</p>
          </div>
          {!auth.role && <p className="text-small leading-relaxed text-muted">{a.pendingBody}</p>}
          <div className="flex flex-wrap gap-2">
            <a href={workHome()} className={buttonClass('primary', 'md')}>
              {EDITION === 'contractors' ? a.toWork : a.toProjects}
            </a>
            {auth.role === 'admin' && (
              <a href="#/admin" className={buttonClass('secondary', 'md')}>
                {a.toAdmin}
              </a>
            )}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void signOut().finally(() => setBusy(false));
              }}
            >
              {a.signOut}
            </Button>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell auth={auth}>
      <SignInCard />
    </Shell>
  );
}

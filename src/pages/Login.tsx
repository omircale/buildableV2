import { useState } from 'react';
import { signInUrl, signOut, type AuthState } from '../cloud/api';
import { EDITION, workHome } from '../edition';
import { useT } from '../i18n';
import { AppHeader } from '../ui/AppHeader';
import { Button, buttonClass } from '../ui/common';

/**
 * What the sign-in came back with, read from the route: the Worker sends a failed sign-in to
 * `#/login?error=…`. Null when there is nothing to report.
 */
export function loginError(hash: string): 'state' | 'google' | null {
  const error = new URLSearchParams(hash.split('?')[1] ?? '').get('error');
  return error === 'state' || error === 'google' ? error : null;
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

/**
 * Signing in, with Google only. Google has already confirmed the address is theirs, so there is no
 * password to keep and no e-mail to wait for. Signing in admits nobody by itself: an address works
 * once the admin has invited it.
 */
export function LoginPage({ auth }: { auth: AuthState }) {
  const t = useT();
  const a = t.account;
  const [busy, setBusy] = useState(false);
  const error = loginError(window.location.hash);
  const shell = (children: React.ReactNode) => (
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

  if (auth.loading) return shell(<p className="text-body text-muted">{t.common.loading}</p>);

  if (auth.session) {
    const role = auth.role === 'admin' ? a.roleAdmin : auth.role === 'member' ? a.roleMember : a.rolePending;
    return shell(
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
      </section>,
    );
  }

  return shell(
    <section className="space-y-4 rounded-2xl border border-line bg-panel p-6">
      <h1 className="text-xl font-semibold">{a.signInTitle}</h1>
      <p className="text-small leading-relaxed text-muted">{a.gateNote}</p>
      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-small text-bad">
          {a.googleFailed}
        </p>
      )}
      <a href={signInUrl(workHome())} className={`${buttonClass('primary', 'lg')} w-full gap-2`}>
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
    </section>,
  );
}

import { useState } from 'react';
import { supabase, type AuthState } from '../cloud/supabase';
import { useT, type Dict } from '../i18n';
import { AppHeader } from '../ui/AppHeader';
import { Button, Field, buttonClass, inputClass } from '../ui/common';

type Mode = 'signin' | 'signup' | 'reset';
type ErrorKey = keyof Dict['account']['errors'];

/**
 * What went wrong, in words a person can act on.
 *
 * The auth service answers in English and in its own terms. Each answer it is known to give is mapped
 * to a sentence here; anything else is reported as a failure without pretending to know the cause.
 */
export function authErrorKey(error: { message?: string; status?: number; code?: string }): ErrorKey {
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (error.status === 429 || /rate limit|too many/.test(text)) return 'rate';
  if (/invalid login credentials|invalid_credentials/.test(text)) return 'invalid';
  if (/email not confirmed|email_not_confirmed/.test(text)) return 'unconfirmed';
  if (/already registered|user_already_exists|already been registered/.test(text)) return 'exists';
  if (/weak_password|password should|password is too/.test(text)) return 'weak';
  if (/failed to fetch|network|load failed/.test(text)) return 'network';
  return 'other';
}

function PasswordField({ label, value, onChange, autoComplete, hint }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string }) {
  const a = useT().account;
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <span className="flex gap-2">
        <input className={inputClass} type={shown ? 'text' : 'password'} autoComplete={autoComplete} minLength={10} required value={value} onChange={(e) => onChange(e.target.value)} dir="ltr" />
        <button type="button" className={`${buttonClass('ghost', 'md')} shrink-0`} aria-pressed={shown} onClick={() => setShown((s) => !s)}>
          {shown ? a.hide : a.show}
        </button>
      </span>
    </Field>
  );
}

export function LoginPage({ auth }: { auth: AuthState }) {
  const a = useT().account;
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const client = supabase;
  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <AppHeader auth={auth} />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">{children}</main>
    </div>
  );
  const note = message && (
    <p role={message.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-small ${message.kind === 'ok' ? 'bg-ok-soft' : 'bg-bad-soft text-bad'}`}>
      {message.text}
    </p>
  );

  if (!client) return shell(<p className="text-body text-muted">{a.notConfigured}</p>);

  const run = async (work: () => Promise<{ error: { message?: string; status?: number; code?: string } | null }>, ok?: string, then?: () => void) => {
    setBusy(true);
    setMessage(null);
    let error: { message?: string; status?: number; code?: string } | null;
    try {
      ({ error } = await work());
    } catch (e) {
      error = { message: e instanceof Error ? e.message : 'failed to fetch' };
    }
    setBusy(false);
    if (error) return setMessage({ kind: 'error', text: a.errors[authErrorKey(error)] });
    if (ok) setMessage({ kind: 'ok', text: ok });
    then?.();
  };

  // Arrived from a reset e-mail: the only thing to do here is choose the new password.
  if (auth.recovery && auth.session) {
    return shell(
      <form
        className="space-y-4 rounded-2xl border border-line bg-panel p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () => client.auth.updateUser({ password }),
            a.passwordSaved,
            () => setPassword(''),
          );
        }}
      >
        <h1 className="text-xl font-semibold">{a.newPasswordTitle}</h1>
        <p className="text-small text-muted" dir="ltr">
          {auth.session.user.email}
        </p>
        <PasswordField label={a.newPassword} hint={a.passwordHint} value={password} onChange={setPassword} autoComplete="new-password" />
        {note}
        <Button variant="primary" type="submit" disabled={busy}>
          {a.saveNewPassword}
        </Button>
      </form>,
    );
  }

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
        {!auth.role && !auth.loading && <p className="text-small leading-relaxed text-muted">{a.pendingBody}</p>}
        {note}
        <div className="flex flex-wrap gap-2">
          <a href="#/projects" className={buttonClass('primary', 'md')}>
            {a.toProjects}
          </a>
          {auth.role === 'admin' && (
            <a href="#/admin" className={buttonClass('secondary', 'md')}>
              {a.toAdmin}
            </a>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => void run(() => client.auth.signOut())}>
            {a.signOut}
          </Button>
        </div>
      </section>,
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') {
      void run(
        () => client.auth.signInWithPassword({ email, password }),
        undefined,
        () => {
          setPassword('');
          window.location.hash = '#/projects';
        },
      );
    } else if (mode === 'signup') {
      void run(
        () => client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } }),
        a.confirmSent,
        () => setPassword(''),
      );
    } else {
      // The same answer whether or not the address exists, so the form cannot be used to find out who has an account.
      void run(() => client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }), a.resetSent);
    }
  };

  const title = mode === 'signin' ? a.signInTitle : mode === 'signup' ? a.signUpTitle : a.resetTitle;
  const go = (next: Mode) => {
    setMode(next);
    setMessage(null);
  };

  return shell(
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-panel p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-small leading-relaxed text-muted">{a.gateNote}</p>
      <Field label={a.email}>
        <input className={inputClass} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
      </Field>
      {mode !== 'reset' && (
        <PasswordField label={a.password} hint={mode === 'signup' ? a.passwordHint : undefined} value={password} onChange={setPassword} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
      )}
      {note}
      <Button variant="primary" type="submit" disabled={busy} className="w-full">
        {mode === 'signin' ? a.signIn : mode === 'signup' ? a.signUp : a.sendReset}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-small">
        <button type="button" className="text-accent-ink underline underline-offset-2" onClick={() => go(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? a.toSignUp : a.toSignIn}
        </button>
        {mode === 'signin' && (
          <button type="button" className="text-accent-ink underline underline-offset-2" onClick={() => go('reset')}>
            {a.forgot}
          </button>
        )}
      </div>
      <p className="border-t border-line pt-3 text-small text-muted">
        {a.localNote}{' '}
        <a href="#/" className="underline underline-offset-2">
          {a.back}
        </a>
      </p>
    </form>,
  );
}

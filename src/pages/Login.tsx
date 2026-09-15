import { useState } from 'react';
import { supabase, type AuthState } from '../cloud/supabase';
import { Button, Field, inputClass } from '../ui/common';

export function LoginPage({ auth }: { auth: AuthState }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const client = supabase;
  if (!client) return <p className="p-8">הענן לא מוגדר.</p>;

  if (auth.session) {
    return (
      <div className="mx-auto max-w-sm space-y-3 p-8">
        <h1 className="text-lg font-bold">מחובר</h1>
        <p className="text-sm">{auth.session.user.email}</p>
        <p className="text-sm">הרשאה: {auth.role === 'admin' ? 'מנהל' : auth.role === 'member' ? 'משתמש' : 'אין הרשאת גישה לנתונים'}</p>
        <div className="flex gap-2">
          <a href="#/" className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
            לעורך
          </a>
          {auth.role === 'admin' && (
            <a href="#/admin" className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-line">
              ממשק ניהול
            </a>
          )}
          <Button variant="ghost" onClick={() => void client.auth.signOut()}>
            התנתקות
          </Button>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } =
      mode === 'signin'
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) setMessage({ kind: 'error', text: error.message });
    else if (mode === 'signup') setMessage({ kind: 'ok', text: 'נשלח מייל אימות. לאחר האימות אפשר להתחבר.' });
    else window.location.hash = '#/';
  };

  return (
    <form onSubmit={submit} className="mx-auto mt-16 max-w-sm space-y-3 rounded-xl bg-white p-6 ring-1 ring-line">
      <h1 className="text-lg font-bold">{mode === 'signin' ? 'התחברות' : 'יצירת חשבון'}</h1>
      <p className="text-xs text-muted">גישה לנתונים ניתנת רק לחשבונות מאושרים. הרשמה לבדה אינה נותנת גישה.</p>
      <Field label="אימייל">
        <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
      </Field>
      <Field label="סיסמה">
        <input className={inputClass} type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
      </Field>
      {message && <p className={`rounded px-2 py-1 text-xs ${message.kind === 'ok' ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>{message.text}</p>}
      <div className="flex items-center justify-between">
        <Button variant="primary" type="submit" disabled={busy}>
          {mode === 'signin' ? 'כניסה' : 'הרשמה'}
        </Button>
        <button type="button" className="text-xs text-accent underline" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'אין חשבון? הרשמה' : 'יש חשבון? התחברות'}
        </button>
      </div>
      <a href="#/" className="block text-xs text-muted underline">
        חזרה לעורך (עבודה מקומית ללא חשבון)
      </a>
    </form>
  );
}

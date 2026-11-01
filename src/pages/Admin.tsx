import { useCallback, useEffect, useState } from 'react';
import { adminUsage, createPasswordLink, invite, listInvited, listMembers, passwordLinkUrl, removeMember, uninvite, type AuthState, type MemberRow, type Usage } from '../cloud/api';
import { Button, inputClass } from '../ui/common';

type Tab = 'members' | 'usage';


export function AdminPage({ auth }: { auth: AuthState }) {
  const [tab, setTab] = useState<Tab>('members');
  if (auth.loading) return <p className="p-8 text-sm">טוען…</p>;
  if (!auth.session) {
    return (
      <p className="p-8 text-sm">
        נדרשת <a href="#/login" className="text-accent underline">התחברות</a>.
      </p>
    );
  }
  // A guard for the screen only; the server refuses the same requests to anyone but the admin.
  if (auth.role !== 'admin') return <p className="p-8 text-sm text-bad">אין הרשאת מנהל לחשבון זה.</p>;

  return (
    <div className="min-h-full">
      <header className="flex items-center justify-between border-b border-line bg-panel px-5 py-3">
        <div className="flex items-center gap-3">
          <a href="#/" className="font-bold">
            Buildable
          </a>
          <span className="rounded bg-accent-soft px-2 py-0.5 text-xs text-accent">ניהול</span>
        </div>
        <nav className="flex gap-1">
          {(
            [
              ['members', 'חשבונות'],
              ['usage', 'שימוש'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`rounded-md px-3 py-1.5 text-sm ${tab === id ? 'bg-accent text-on-accent' : 'hover:bg-black/5'}`}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-5">
        {tab === 'members' && <MembersTab selfId={auth.session.user.id} />}
        {tab === 'usage' && <UsageTab />}
      </main>
    </div>
  );
}

/**
 * A one-time link for choosing a password, made on request and shown once. The site sends no e-mail,
 * so the admin passes it on — by WhatsApp, a message, in person — and whoever opens it chooses the
 * password. It is shown here only; closing the box does not cancel it, a newer link does.
 */
function PasswordLink({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [link, setLink] = useState<{ url: string; until: string; reset: boolean } | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'copied' | 'failed'>('idle');

  if (!link) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={state === 'busy'}
        onClick={() => {
          if (hasPassword && !confirm(`ליצור קישור לאיפוס הסיסמה של ${email}? הסיסמה הנוכחית תמשיך לעבוד עד שישתמשו בקישור.`)) return;
          setState('busy');
          createPasswordLink(email).then(
            (r) => {
              setLink({ url: passwordLinkUrl(r.token), until: new Date(r.expires_at).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), reset: r.purpose === 'reset' });
              setState('idle');
            },
            () => setState('failed'),
          );
        }}
      >
        {state === 'failed' ? 'יצירת הקישור נכשלה — לנסות שוב' : hasPassword ? 'קישור לאיפוס סיסמה' : 'קישור לבחירת סיסמה'}
      </Button>
    );
  }
  return (
    <div className="basis-full space-y-2 rounded-lg bg-sunken p-3">
      <p className="text-xs text-muted">
        {link.reset ? 'קישור לאיפוס הסיסמה' : 'קישור לבחירת סיסמה'} עבור <span dir="ltr">{email}</span>. עובד פעם אחת, עד {link.until}. שלחו אותו לאדם עצמו בלבד: מי שפותח אותו בוחר את הסיסמה.
      </p>
      <div className="flex flex-wrap gap-2">
        <input className={`${inputClass} min-w-0 flex-1 text-xs`} dir="ltr" readOnly value={link.url} aria-label="הקישור" onFocus={(e) => e.target.select()} />
        <Button
          size="sm"
          variant="primary"
          onClick={() => navigator.clipboard.writeText(link.url).then(() => setState('copied'), () => setState('failed'))}
        >
          {state === 'copied' ? 'הועתק' : 'העתקה'}
        </Button>
        {/* The phone's own share sheet: the link goes inside the message, not into another site's address. */}
        {typeof navigator.share === 'function' && (
          <Button size="sm" onClick={() => void navigator.share({ text: `קישור לבחירת סיסמה ב-Buildable: ${link.url}` }).catch(() => undefined)}>
            שיתוף
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Who may work here. Signing in grants nothing by itself: an address becomes a working account once it
 * is on this list. The admin sees who the accounts are — not what is in them; a customer's bills are
 * closed to the admin by the server, not by this screen.
 */
function MembersTab({ selfId }: { selfId: string }) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invited, setInvited] = useState<{ email: string; created_at: string }[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    Promise.all([listMembers(), listInvited()]).then(
      ([m, i]) => {
        setMembers(m);
        setInvited(i);
        setError(null);
      },
      (e: { message?: string }) => setError(e.message ?? 'הטעינה נכשלה'),
    );
  }, []);
  useEffect(refresh, [refresh]);

  const act = (work: Promise<void>) => void work.then(refresh, (e: { message?: string; code?: string }) => setError(e.code === 'bad_email' ? 'זו לא נראית כתובת אימייל.' : (e.message ?? 'הפעולה נכשלה')));
  const joined = new Set(members.map((m) => m.email.toLowerCase()));
  const waiting = invited.filter((i) => !joined.has(i.email));

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-semibold">הזמנת חשבון</h2>
        <p className="max-w-prose text-sm text-muted">
          מזינים את כתובת האימייל של האדם. אחרי ההזמנה הוא יכול להיכנס בשתי דרכים: עם Google בכתובת הזו, או עם סיסמה שהוא בוחר דרך קישור שיוצרים כאן ושולחים לו. בכל דרך הוא רואה רק את הפרויקטים של עצמו.
        </p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(invite(email).then(() => setEmail('')));
          }}
        >
          <input className={`${inputClass} max-w-sm`} type="email" required dir="ltr" placeholder="name@company.co.il" aria-label="אימייל להזמנה" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button variant="primary" type="submit">
            הזמנה
          </Button>
        </form>
        {error && <p className="text-sm text-bad">{error}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">חשבונות פעילים · {members.length}</h2>
        <ul className="divide-y divide-line rounded-xl bg-panel ring-1 ring-line">
          {members.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span dir="ltr" className="min-w-0 flex-1 truncate">
                {m.email}
              </span>
              <span className="rounded-full bg-sunken px-2 py-0.5 text-xs">{m.role === 'admin' ? 'מנהל' : 'חשבון'}</span>
              <span className="text-xs text-muted">{m.has_password ? 'סיסמה · Google' : 'Google'}</span>
              <PasswordLink email={m.email} hasPassword={!!m.has_password} />
              {m.user_id !== selfId && m.role !== 'admin' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    // Closing an account also takes its invitation back, or the next sign-in would reopen it.
                    if (confirm(`לסגור את הגישה של ${m.email}? הפרויקטים שלו נשארים שמורים, אבל הוא לא יוכל לפתוח אותם.`)) act(removeMember(m.user_id).then(() => uninvite(m.email.toLowerCase())));
                  }}
                >
                  סגירת גישה
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {waiting.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">הוזמנו ועוד לא נרשמו · {waiting.length}</h2>
          <ul className="divide-y divide-line rounded-xl bg-panel ring-1 ring-line">
            {waiting.map((i) => (
              <li key={i.email} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span dir="ltr" className="min-w-0 flex-1 truncate">
                  {i.email}
                </span>
                <PasswordLink email={i.email} hasPassword={false} />
                <Button size="sm" variant="ghost" onClick={() => act(uninvite(i.email))}>
                  ביטול הזמנה
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function UsageTab() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    adminUsage().then(setUsage, (e: { message?: string }) => setError(e.message ?? 'הטעינה נכשלה'));
  }, []);
  return (
    <div className="space-y-4">
      {error && <p className="rounded bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[
          ['חשבונות פעילים', usage?.members],
          ['הוזמנו', usage?.invited],
          ['תיקיות', usage?.places],
          ['כתבי כמויות שמורים', usage?.bills],
          ['פרויקטים בסטודיו', usage?.studio],
          ['שיתופים בצוותים', usage?.shared],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg bg-panel p-4 ring-1 ring-line">
            <div className="text-xs text-muted">{label}</div>
            <div className="num mt-1 text-2xl font-bold">{value ?? '—'}</div>
          </div>
        ))}
      </div>
      <p className="max-w-prose text-xs text-muted">
        מספרים בלבד. המנהל רואה כמה נשמר, לא מה נשמר: כתבי הכמויות ופרויקטי הסטודיו של כל חשבון סגורים בפניו בשרת. החישובים רצים בדפדפן של המשתמש, והשרת והמסד הם של Cloudflare.
      </p>
    </div>
  );
}

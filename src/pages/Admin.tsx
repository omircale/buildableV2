import { useCallback, useEffect, useState } from 'react';
import { adminUsage, invite, listInvited, listMembers, removeMember, uninvite, type AuthState, type MemberRow, type Usage } from '../cloud/api';
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
          מזינים את כתובת ה-Gmail או חשבון Google של האדם. מי שנכנס עם Google בכתובת הזו מקבל חשבון פעיל, ורואה רק את הפרויקטים של עצמו. אם כבר נכנס פעם, החשבון נפתח מיד.
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
              <li key={i.email} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span dir="ltr" className="min-w-0 flex-1 truncate">
                  {i.email}
                </span>
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['חשבונות פעילים', usage?.members],
          ['הוזמנו', usage?.invited],
          ['תיקיות', usage?.places],
          ['כתבי כמויות שמורים', usage?.bills],
          ['פרויקטים בסטודיו', usage?.studio],
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

import { useCallback, useEffect, useState } from 'react';
import { invite, listInvited, listMembers, removeMember, supabase, uninvite, type AuthState, type MemberRow } from '../cloud/supabase';
import { Button, Field, Section, inputClass } from '../ui/common';

type Tab = 'members' | 'usage';

interface StorageRow {
  user_id: string;
  projects: number;
  versions: number;
  bytes: number;
}

export function AdminPage({ auth }: { auth: AuthState }) {
  const [tab, setTab] = useState<Tab>('members');
  if (auth.loading) return <p className="p-8 text-sm">טוען…</p>;
  if (!supabase || !auth.session) {
    return (
      <p className="p-8 text-sm">
        נדרשת <a href="#/login" className="text-accent underline">התחברות</a>.
      </p>
    );
  }
  // UI guard only; the database enforces the same rule through RLS.
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
              ['usage', 'שימוש ועלויות'],
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
 * Who may work here. Signing up grants nothing by itself: an address becomes a working account once it
 * is on this list and its owner has confirmed the mailbox. The admin sees who the accounts are — not
 * what is in them; a customer's bills are closed to the admin by the database, not by this screen.
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

  const act = (work: Promise<void>) => void work.then(refresh, (e: { message?: string; code?: string }) => setError(e.code === '23505' ? 'הכתובת כבר הוזמנה.' : (e.message ?? 'הפעולה נכשלה')));
  const joined = new Set(members.map((m) => m.email.toLowerCase()));
  const waiting = invited.filter((i) => !joined.has(i.email));

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-semibold">הזמנת חשבון</h2>
        <p className="max-w-prose text-sm text-muted">
          מזינים כתובת אימייל. מי שנרשם עם הכתובת הזו ומאמת אותה מקבל חשבון פעיל — ורואה רק את הפרויקטים של עצמו. אם כבר נרשם ואימת, החשבון נפתח מיד.
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
  const [rows, setRows] = useState<StorageRow[]>([]);
  const [projectsCount, setProjectsCount] = useState(0);
  const [events, setEvents] = useState<Record<string, number>>({});
  const [monthlyPlanUsd, setMonthlyPlanUsd] = useState(0);
  const [includedMb, setIncludedMb] = useState(500);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [storage, projects, usage] = await Promise.all([
        supabase!.from('admin_storage_by_user').select('*'),
        supabase!.from('projects').select('id', { count: 'exact', head: true }),
        supabase!.from('usage_events').select('kind'),
      ]);
      if (storage.error) return setError(storage.error.message);
      setRows((storage.data ?? []) as StorageRow[]);
      setProjectsCount(projects.count ?? 0);
      const counts: Record<string, number> = {};
      for (const e of usage.data ?? []) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      setEvents(counts);
    })();
  }, []);

  const totalBytes = rows.reduce((a, r) => a + Number(r.bytes), 0);
  const users = Math.max(rows.length, 1);
  const perUser = monthlyPlanUsd / users;
  const perFurniture = projectsCount ? monthlyPlanUsd / projectsCount : 0;

  return (
    <div className="space-y-4">
      {error && <p className="rounded bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['משתמשים עם נתונים', rows.length],
          ['רהיטים (פרויקטים)', projectsCount],
          ['גרסאות שמורות', rows.reduce((a, r) => a + Number(r.versions), 0)],
          ['נפח נתוני עיצוב', `${(totalBytes / 1024).toFixed(1)} KB`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-panel p-4 ring-1 ring-line">
            <div className="text-xs text-muted">{label}</div>
            <div className="num mt-1 text-2xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-panel ring-1 ring-line">
        <Section title="הערכת עלות תפעול">
          <p className="text-xs text-muted">
            החישוב הוא עלות התוכנית החודשית חלקי מספר המשתמשים/הרהיטים. המחירים אינם קבועים במערכת — יש להזין את המחיר העדכני מדפי התמחור של Supabase ו-Cloudflare. כרגע הפרויקט על תוכנית חינמית.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="עלות חודשית כוללת של התשתית (USD)">
              <input type="number" min={0} step={1} className={inputClass} value={monthlyPlanUsd} onChange={(e) => setMonthlyPlanUsd(Number(e.target.value))} />
            </Field>
            <Field label='נפח DB כלול בתוכנית (MB) — לאמת מול המחירון'>
              <input type="number" min={1} className={inputClass} value={includedMb} onChange={(e) => setIncludedMb(Number(e.target.value))} />
            </Field>
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <div>
              עלות למשתמש: <span className="num font-semibold">${perUser.toFixed(2)}</span>
            </div>
            <div>
              עלות לרהיט: <span className="num font-semibold">${perFurniture.toFixed(2)}</span>
            </div>
            <div>
              ניצול נפח נתוני עיצוב: <span className="num font-semibold">{((totalBytes / (includedMb * 1024 * 1024)) * 100).toFixed(4)}%</span>
            </div>
          </div>
        </Section>
      </div>

      <div className="rounded-lg bg-panel p-4 ring-1 ring-line">
        <h3 className="mb-2 text-sm font-semibold">לפי משתמש</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="text-right">משתמש</th>
              <th className="text-right">פרויקטים</th>
              <th className="text-right">גרסאות</th>
              <th className="text-right">נפח</th>
              <th className="text-right">נפח לרהיט</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-t border-line">
                <td className="py-1.5 font-mono text-xs">{r.user_id.slice(0, 8)}…</td>
                <td className="num">{r.projects}</td>
                <td className="num">{r.versions}</td>
                <td className="num">{(Number(r.bytes) / 1024).toFixed(1)} KB</td>
                <td className="num">{(Number(r.bytes) / 1024 / Math.max(Number(r.projects), 1)).toFixed(1)} KB</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="py-3 text-xs text-muted">
                  אין עדיין גרסאות שמורות.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">
          אירועים: {Object.entries(events).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'אין'}. חישובי ההנדסה וה-3D רצים בדפדפן של המשתמש ואינם צורכים משאבי שרת.
        </p>
      </div>
    </div>
  );
}

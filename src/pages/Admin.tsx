import { useEffect, useState } from 'react';
import { supabase, type AuthState } from '../cloud/supabase';
import { CONFIG_SOURCES, type EngineeringConfig } from '../engine/config';
import { MATERIAL_LIBRARY, propertiesFor } from '../engine';
import { useDesign } from '../state/designStore';
import { Button, Field, Section, inputClass } from '../ui/common';

type Tab = 'usage' | 'materials' | 'config';

interface StorageRow {
  user_id: string;
  projects: number;
  versions: number;
  bytes: number;
}

const KIND_LABEL: Record<string, string> = { mean: 'ממוצע', characteristic: 'אופייני', standard_minimum: 'מינימום תקן', manufacturer: 'יצרן', user_provided: 'משתמש', assumption: 'הנחה' };

export function AdminPage({ auth }: { auth: AuthState }) {
  const [tab, setTab] = useState<Tab>('usage');
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
      <header className="flex items-center justify-between border-b border-line bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <a href="#/" className="font-bold">
            Buildable
          </a>
          <span className="rounded bg-accent-soft px-2 py-0.5 text-xs text-accent">ניהול</span>
        </div>
        <nav className="flex gap-1">
          {(
            [
              ['usage', 'שימוש ועלויות'],
              ['materials', 'ספריית חומרים'],
              ['config', 'ספים הנדסיים'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`rounded-md px-3 py-1.5 text-sm ${tab === id ? 'bg-accent text-white' : 'hover:bg-black/5'}`}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-5">
        {tab === 'usage' && <UsageTab />}
        {tab === 'materials' && <MaterialsTab />}
        {tab === 'config' && <ConfigTab userId={auth.session.user.id} />}
      </main>
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
          <div key={label} className="rounded-lg bg-white p-4 ring-1 ring-line">
            <div className="text-xs text-muted">{label}</div>
            <div className="num mt-1 text-2xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-white ring-1 ring-line">
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

      <div className="rounded-lg bg-white p-4 ring-1 ring-line">
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

function MaterialsTab() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">ספריית החומרים המובנית. כל ערך נושא סוג ומקור; ערך ללא מקור מוצג כהנחה או כלא ידוע. שינוי ערכים מתבצע בקוד עם בדיקות, כדי שכל שינוי יעבור רגרסיה.</p>
      {MATERIAL_LIBRARY.map((m) => (
        <div key={m.id} className="rounded-lg bg-white p-4 ring-1 ring-line">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              {m.nameHe} <span className="text-xs font-normal text-muted">({m.nameEn})</span>
            </h3>
            <span className={`rounded px-2 py-0.5 text-xs ${m.verified ? 'bg-ok-soft text-ok' : 'bg-unknown-soft text-unknown'}`}>{m.verified ? 'נתונים ממקור' : 'לא מאומת'}</span>
          </div>
          <p className="mt-1 text-xs text-muted">{m.descriptionHe}</p>
          <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
            <div>
              צפיפות: <span className="num">{m.densityKgM3.value ?? '—'}</span> ק"ג/מ"ק ({KIND_LABEL[m.densityKgM3.kind]})
            </div>
            <div>עוביים: {m.thicknessesMm.join(', ')} מ"מ</div>
            <div>לוחות: {m.stock.map((s) => `${s.lengthMm}×${s.widthMm}`).join(', ')} (לא מאומת מול ספק)</div>
          </div>
          <table className="mt-2 w-full text-xs">
            <thead className="text-muted">
              <tr>
                <th className="text-right">טווח עובי</th>
                <th className="text-right">E</th>
                <th className="text-right">f_m</th>
                <th className="text-right">מקור</th>
              </tr>
            </thead>
            <tbody>
              {m.properties.map((p) => (
                <tr key={`${p.minMm}-${p.maxMm}`} className="border-t border-line align-top">
                  <td className="num py-1">
                    {'>'}
                    {p.minMm}–{p.maxMm}
                  </td>
                  <td>
                    <span className="num">{p.eBendingMpa.value}</span> MPa ({KIND_LABEL[p.eBendingMpa.kind]})
                  </td>
                  <td>
                    <span className="num">{p.fBendingMpa.value}</span> MPa ({KIND_LABEL[p.fBendingMpa.kind]})
                  </td>
                  <td dir="ltr" className="text-left">
                    {p.eBendingMpa.sources.map((s) => (
                      <a key={s.title} href={s.url} target="_blank" rel="noreferrer noopener" className="block text-accent underline">
                        {s.title} — {s.reference}
                      </a>
                    ))}
                  </td>
                </tr>
              ))}
              {!m.properties.length && (
                <tr>
                  <td colSpan={4} className="py-1 text-muted">
                    אין נתוני חוזק — לא משמש לרכיבים נושאים.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {m.thicknessesMm.some((t) => !propertiesFor(m, t)) && m.properties.length > 0 && (
            <p className="mt-1 text-[11px] text-warn">עוביים ללא נתוני חוזק (יוצגו כלא ידוע): {m.thicknessesMm.filter((t) => !propertiesFor(m, t)).join(', ')} מ"מ</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ConfigTab({ userId }: { userId: string }) {
  const config = useDesign((s) => s.config);
  const setConfig = useDesign((s) => s.setConfig);
  const [draft, setDraft] = useState<EngineeringConfig>(config);
  const [status, setStatus] = useState<string | null>(null);
  const num = (k: keyof EngineeringConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: Number(e.target.value) });

  const save = async () => {
    if (draft.deflectionRedRatio >= draft.deflectionGreenRatio) return setStatus('סף האדום (L/x) חייב להיות מקל יותר מסף הירוק — x קטן יותר.');
    const { error } = await supabase!.from('app_settings').upsert({ key: 'engineering_config', value: draft, updated_by: userId, updated_at: new Date().toISOString() });
    if (error) return setStatus(error.message);
    setConfig(draft);
    setStatus('נשמר. הספים חלים על כל החישובים מעכשיו.');
  };

  return (
    <div className="max-w-xl space-y-3 rounded-lg bg-white p-4 ring-1 ring-line">
      <p className="text-sm text-muted">אלה החלטות מוצר, לא עובדות פיזיקליות. טווח ההמלצה של Eurocode 5 לשקיעה סופית בקורה על שתי סמכות: L/150 עד L/300.</p>
      <p className="text-[11px] text-muted" dir="ltr">
        {CONFIG_SOURCES.deflection[0].title} — {CONFIG_SOURCES.deflection[0].reference}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ירוק: שקיעה סופית ≤ L/">
          <input type="number" min={100} max={1000} className={inputClass} value={draft.deflectionGreenRatio} onChange={num('deflectionGreenRatio')} />
        </Field>
        <Field label="אדום: שקיעה סופית > L/">
          <input type="number" min={50} max={1000} className={inputClass} value={draft.deflectionRedRatio} onChange={num('deflectionRedRatio')} />
        </Field>
        <Field label="מקדם עומס בבדיקת חוזק (γ)">
          <input type="number" min={1} max={3} step={0.05} className={inputClass} value={draft.loadPartialFactor} onChange={num('loadPartialFactor')} />
        </Field>
        <Field label='עובי מינימלי ללוח (מ"מ)'>
          <input type="number" min={6} max={40} className={inputClass} value={draft.minPanelThicknessMm} onChange={num('minPanelThicknessMm')} />
        </Field>
        <Field label='עובי להב (מ"מ)'>
          <input type="number" min={0} max={10} step={0.1} className={inputClass} value={draft.kerfMm} onChange={num('kerfMm')} />
        </Field>
        <Field label='שולי ניקוי לוח (מ"מ)'>
          <input type="number" min={0} max={50} className={inputClass} value={draft.trimMarginMm} onChange={num('trimMarginMm')} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={() => void save()}>
          שמירה
        </Button>
        {status && <span className="text-xs">{status}</span>}
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { Check, CheckCategory, DesignResult, Status } from '../engine';
import { useDesign } from '../state/designStore';
import { CATEGORY_LABEL, StatusBadge } from './common';

const ORDER: CheckCategory[] = ['geometry', 'materials', 'structure', 'connections', 'stability', 'manufacturing', 'assembly', 'safety'];
const SEVERITY: Record<Status, number> = { GREEN: 0, YELLOW: 1, GREY: 2, RED: 3 };

const KIND_LABEL: Record<string, string> = {
  mean: 'ממוצע',
  characteristic: 'אופייני (5%)',
  standard_minimum: 'מינימום לפי תקן',
  manufacturer: 'יצרן',
  user_provided: 'הוזן ע"י משתמש',
  assumption: 'הנחה',
};

function CheckCard({ check }: { check: Check }) {
  const [open, setOpen] = useState(check.status === 'RED');
  const applyChange = useDesign((s) => s.applyChange);
  const select = useDesign((s) => s.select);
  return (
    <div className="rounded-lg bg-white ring-1 ring-line">
      <button
        className="flex w-full items-start gap-2 px-3 py-2 text-right"
        onClick={() => {
          setOpen(!open);
          if (check.componentIds[0]) select(check.componentIds[0]);
        }}
      >
        <StatusBadge status={check.status} />
        <span className="flex-1 text-sm font-medium leading-snug">{check.title}</span>
        <span className="text-xs text-muted">{open ? '▾' : '◂'}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-3 py-2 text-[13px] leading-relaxed">
          <p>{check.explanation}</p>
          {check.calculation && (
            <div className="rounded-md bg-paper p-2 text-xs">
              <div className="num mb-1 text-left font-mono text-[11px] text-muted" dir="ltr">
                {check.calculation.formula}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {Object.entries(check.calculation.inputs).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className="num text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-1 font-semibold">{check.calculation.result}</div>
            </div>
          )}
          {check.assumptions.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted">הנחות ({check.assumptions.length})</summary>
              <ul className="mt-1 list-disc space-y-0.5 pr-4">
                {check.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          )}
          {check.sources.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted">מקורות ({check.sources.length})</summary>
              <ul className="mt-1 space-y-1">
                {check.sources.map((s) => (
                  <li key={s.title} dir="ltr" className="text-left">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-accent underline">
                        {s.title}
                      </a>
                    ) : (
                      s.title
                    )}
                    <span className="text-muted"> — {s.reference}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {check.requiredVerification && <p className="rounded bg-warn-soft px-2 py-1 text-xs text-warn">נדרש אימות: {check.requiredVerification}</p>}
          {check.fixes.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold">הצעות תיקון (כל הצעה נבדקה מחדש במנוע):</div>
              <div className="flex flex-col gap-1">
                {check.fixes.map((f) => (
                  <button key={f.change.label} onClick={() => applyChange(f.change)} className="flex items-center justify-between gap-2 rounded-md bg-accent-soft px-2 py-1.5 text-right text-xs hover:bg-accent/15">
                    <span>{f.change.label}</span>
                    <StatusBadge status={f.projectedStatus} label={f.projectedDetail} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BuildStatusPanel({ result }: { result: DesignResult }) {
  const { report } = result;
  const [showPassing, setShowPassing] = useState(false);
  const checks = [...report.checks].sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status] || ORDER.indexOf(a.category) - ORDER.indexOf(b.category));
  const visible = showPassing ? checks : checks.filter((c) => c.status !== 'GREEN');

  return (
    <div className="space-y-3 p-4">
      <div>
        <h2 className="text-base font-bold">אפשר לבנות את זה?</h2>
        <p className="mt-0.5 text-xs text-muted">
          {report.exportBlocked
            ? 'לא. יש כשל שחוסם ייצוא — ראו פירוט למטה.'
            : report.overall === 'GREEN'
              ? 'כל הבדיקות התוכנתיות המוגדרות עברו.'
              : 'אין כשל חוסם. יש אזהרות ונתונים שלא ניתן לאמת בתוכנה.'}{' '}
          המערכת לא טוענת ל"בטוח" או ל"עומד בתקן".
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {ORDER.map((cat) => (
          <div key={cat} className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 text-xs ring-1 ring-line">
            <span>{CATEGORY_LABEL[cat]}</span>
            <StatusBadge status={report.coverage[cat]} />
          </div>
        ))}
        <div className="col-span-2 flex items-center justify-between rounded-md bg-warn-soft px-2 py-1.5 text-xs text-warn">
          <span>אימות פיזי</span>
          <span className="font-semibold">נדרש</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">פירוט</h3>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={showPassing} onChange={(e) => setShowPassing(e.target.checked)} />
          הצג גם בדיקות שעברו
        </label>
      </div>
      <div className="space-y-2">
        {visible.map((c) => (
          <CheckCard key={c.id} check={c} />
        ))}
      </div>
      <p className="text-[11px] leading-snug text-muted">
        סוגי ערכים: {Object.values(KIND_LABEL).join(' · ')}. ערך שאין לו מקור מוצג כ"לא ידוע" ואינו מנוחש.
      </p>
    </div>
  );
}

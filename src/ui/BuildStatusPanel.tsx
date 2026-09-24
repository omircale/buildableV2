import { useEffect, useMemo, useRef, useState } from 'react';
import type { Check, CheckCategory, DesignResult, Status } from '../engine';
import { useT } from '../i18n';
import { useDesign } from '../state/designStore';
import { useUi } from '../state/uiStore';
import { STATUS_SEVERITY, SearchField, StatusBadge, StatusIcon, matchesQuery } from './common';
import { IconChevronDown } from './icons';
import { targetForCheck } from './checkTarget';

const ORDER: CheckCategory[] = ['geometry', 'materials', 'structure', 'connections', 'stability', 'manufacturing', 'assembly', 'safety'];

function CheckCard({ check }: { check: Check }) {
  const t = useT();
  const focusCheckId = useUi((s) => s.focusCheckId);
  const focused = focusCheckId === check.id;
  const [open, setOpen] = useState(check.status === 'RED' || focused);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focused) return;
    setOpen(true);
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focused]);
  const applyChange = useDesign((s) => s.applyChange);
  const select = useDesign((s) => s.select);
  const params = useDesign((s) => s.params);
  const revealControl = useUi((s) => s.revealControl);
  return (
    <div ref={ref} className={`rounded-xl bg-panel ${focused ? 'ring-2 ring-accent' : 'ring-1 ring-line'}`}>
      <button
        aria-expanded={open}
        className="flex min-h-11 w-full items-start gap-2 px-3 py-2.5 text-start"
        onClick={() => {
          setOpen(!open);
          // Show the part, then open the control that governs it — a finding should end at its fix.
          const target = targetForCheck(check, params);
          if (target) {
            select(null);
            revealControl(target.tab, target.sectionId, check.id);
          } else if (check.componentIds[0]) {
            select(check.componentIds[0]);
          }
        }}
      >
        <StatusBadge status={check.status} />
        <span className="flex-1 text-[15px] font-medium leading-snug">{check.title}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-3 py-2 text-sm leading-relaxed">
          <p>{check.explanation}</p>
          {check.calculation && (
            <div className="rounded-lg bg-sunken p-2.5 text-[13px]">
              <div className="mb-1.5 text-left font-mono text-[13px] text-muted" dir="ltr">
                {check.calculation.formula}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {Object.entries(check.calculation.inputs).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className="num text-end">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-1 font-semibold">{check.calculation.result}</div>
            </div>
          )}
          {check.assumptions.length > 0 && (
            <details className="text-[13px]">
              <summary className="cursor-pointer py-1 text-muted">{t.checks.assumptions(check.assumptions.length)}</summary>
              <ul className="mt-1 list-disc space-y-0.5 ps-4">
                {check.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          )}
          {check.sources.length > 0 && (
            <details className="text-[13px]">
              <summary className="cursor-pointer py-1 text-muted">{t.checks.sources(check.sources.length)}</summary>
              <ul className="mt-1 space-y-1">
                {check.sources.map((s) => (
                  <li key={s.title} dir="ltr" className="text-left">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-accent-ink underline">
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
          {check.requiredVerification && <p className="rounded-lg bg-warn-soft px-2.5 py-1.5 text-[13px] text-warn">
              {t.checks.verification} {check.requiredVerification}
            </p>}
          {check.fixes.length > 0 && (
            <div>
              <div className="mb-1.5 text-[13px] font-semibold">{t.checks.fixes}</div>
              <div className="flex flex-col gap-1">
                {check.fixes.map((f) => (
                  <button key={f.change.label} onClick={() => applyChange(f.change)} className="flex min-h-10 items-center justify-between gap-2 rounded-lg bg-accent-soft px-3 py-2 text-start text-[13px] hover:brightness-95">
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
  const t = useT();
  const { report } = result;
  const [showPassing, setShowPassing] = useState(false);
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState<Status | null>(null);
  const focusCheckId = useUi((s) => s.focusCheckId);
  const revealControl = useUi((s) => s.revealControl);
  const params = useDesign((s) => s.params);
  const [closed, setClosed] = useState<Partial<Record<CheckCategory, boolean>>>({});

  /** How many findings of each severity there are — the counts double as the filter, as in Onshape. */
  const counts = useMemo(() => {
    const c: Record<Status, number> = { RED: 0, YELLOW: 0, GREY: 0, GREEN: 0 };
    for (const check of report.checks) c[check.status] += 1;
    return c;
  }, [report.checks]);

  const groups = ORDER.map((cat) => {
    const all = report.checks.filter((c) => c.category === cat).sort((a, b) => STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status]);
    const visible = all.filter(
      (c) =>
        (only ? c.status === only : showPassing || query || c.status !== 'GREEN' || c.id === focusCheckId) &&
        matchesQuery(query, c.title, c.explanation, t.category[cat]),
    );
    return { cat, all, visible };
  }).filter((g) => g.visible.length > 0);

  /** Everything currently listed, in the order it is listed — what stepping walks through. */
  const listed = useMemo(() => groups.flatMap((g) => g.visible), [groups]);

  // F8 walks to the next finding and opens its control, the way a Problems panel steps through errors.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F8' || !listed.length) return;
      e.preventDefault();
      const at = listed.findIndex((c) => c.id === focusCheckId);
      const step = e.shiftKey ? -1 : 1;
      const next = listed[(at + step + listed.length) % listed.length];
      const target = targetForCheck(next, params);
      revealControl(target?.tab ?? 'structure', target?.sectionId ?? null, next.id);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [listed, focusCheckId, params, revealControl]);

  return (
    <div className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">{t.checks.title}</h2>
        <p className="mt-1 text-sm text-muted">
          {report.exportBlocked ? t.checks.blocked : report.overall === 'GREEN' ? t.checks.allGreen : t.checks.warnings} {t.checks.disclaimer}
        </p>
      </div>
      <div className="flex min-h-10 items-center justify-between rounded-lg bg-warn-soft px-3 py-1.5 text-sm text-warn">
        <span>{t.checks.physical}</span>
        <span className="font-semibold">{t.checks.required}</span>
      </div>
      <SearchField value={query} onChange={setQuery} placeholder={t.search.checks} />
      <div className="flex flex-wrap items-center gap-1.5">
        {(['RED', 'YELLOW', 'GREY', 'GREEN'] as const)
          .filter((st) => counts[st] > 0)
          .map((st) => (
            <button
              key={st}
              type="button"
              aria-pressed={only === st}
              onClick={() => setOnly(only === st ? null : st)}
              className={`flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] ring-1 transition ${
                only === st ? 'bg-sunken ring-accent' : 'ring-line hover:bg-sunken'
              }`}
            >
              <StatusIcon status={st} />
              <span className="num font-semibold">{counts[st]}</span>
              <span className="text-muted">{t.status[st]}</span>
            </button>
          ))}
        {only && (
          <button type="button" onClick={() => setOnly(null)} className="min-h-8 px-2 text-[13px] text-accent-ink underline underline-offset-2">
            {t.checks.clearFilter}
          </button>
        )}
      </div>
      {!only && (
        <label className="flex min-h-9 items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showPassing} onChange={(e) => setShowPassing(e.target.checked)} className="h-4 w-4" />
          {t.checks.showPassing}
        </label>
      )}
      {listed.length > 1 && <p className="text-[13px] text-muted">{t.checks.stepHint}</p>}
      {groups.length === 0 && <p className="text-sm text-muted">{t.search.noMatches}</p>}
      <div className="space-y-2">
        {groups.map(({ cat, all, visible }) => {
          const isFocused = visible.some((c) => c.id === focusCheckId);
          const open = query ? true : isFocused ? true : !(closed[cat] ?? false);
          return (
            <section key={cat} className="rounded-xl bg-panel ring-1 ring-line">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setClosed({ ...closed, [cat]: open })}
                className="flex min-h-12 w-full items-center gap-2 px-3 text-start"
              >
                <IconChevronDown size={16} className={`shrink-0 text-muted transition ${open ? '' : 'rtl:rotate-90 ltr:-rotate-90'}`} />
                <span className="flex-1 text-[15px] font-semibold">{t.category[cat]}</span>
                <span className="text-xs text-muted">{t.search.showing(visible.length, all.length)}</span>
                <StatusBadge status={report.coverage[cat]} />
              </button>
              {open && (
                <div className="space-y-2 border-t border-line p-2">
                  {visible.map((c) => (
                    <CheckCard key={c.id} check={c} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <p className="text-[13px] leading-snug text-muted">{t.checks.kinds}</p>
    </div>
  );
}

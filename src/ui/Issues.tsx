import { useEffect, useRef, useState } from 'react';
import type { Check, DesignResult } from '../engine';
import { useT } from '../i18n';
import { useDesign } from '../state/designStore';
import { useUi } from '../state/uiStore';
import { STATUS_SEVERITY, StatusBadge, StatusIcon } from './common';

const TONE = {
  RED: { bg: 'bg-bad-soft', fg: 'text-bad' },
  YELLOW: { bg: 'bg-warn-soft', fg: 'text-warn' },
  GREY: { bg: 'bg-unknown-soft', fg: 'text-unknown' },
  GREEN: { bg: 'bg-ok-soft', fg: 'text-ok' },
} as const;

/** Non-passing checks, worst first. */
export function openIssues(result: DesignResult): Check[] {
  return result.report.checks.filter((c) => c.status !== 'GREEN').sort((a, b) => STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status]);
}

/**
 * One problem with its ready-made fixes; every fix was re-validated by the engine before it is offered.
 * `muted` renders it as a calm, neutral card (used when nothing here blocks building — a note, not a warning
 * light) instead of the colored alert treatment reserved for a RED, build-blocking failure.
 */
export function IssueCard({ check, onApplied, muted }: { check: Check; onApplied?: () => void; muted?: boolean }) {
  const t = useT();
  const applyChange = useDesign((s) => s.applyChange);
  const select = useDesign((s) => s.select);
  const openAdvanced = useUi((s) => s.openAdvanced);
  const tone = TONE[check.status];
  return (
    <div className={`rounded-xl p-3 ${muted ? 'bg-panel ring-1 ring-line' : tone.bg}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 ${muted ? 'text-muted' : tone.fg}`}>
          <StatusIcon status={check.status} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] leading-snug font-semibold">{check.title}</div>
          {check.calculation ? <div className="mt-0.5 text-[13px]">{check.calculation.result}</div> : <div className="mt-0.5 line-clamp-3 text-[13px]">{check.explanation}</div>}
        </div>
      </div>
      {check.fixes.length > 0 ? (
        <div className="mt-2.5 flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">{t.issues.fixes}</span>
          {check.fixes.map((f) => (
            <button
              key={f.change.label}
              type="button"
              onClick={() => {
                applyChange(f.change);
                onApplied?.();
              }}
              className="flex min-h-10 items-center justify-between gap-2 rounded-lg bg-panel px-3 py-2 text-start text-[14px] ring-1 ring-line hover:ring-accent"
            >
              <span className="font-medium">{f.change.label}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
                {t.issues.after}
                <StatusBadge status={f.projectedStatus} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        check.status !== 'GREY' && check.requiredVerification && <p className="mt-2 text-[13px]">{check.requiredVerification}</p>
      )}
      {check.status === 'GREY' && <p className="mt-2 text-[13px] text-muted">{t.issues.notCheckedHint}</p>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <button type="button" onClick={() => openAdvanced('checks', check.id)} className="text-[13px] font-medium text-accent-ink underline underline-offset-2">
          {t.structure.howCalculated}
        </button>
        {check.componentIds[0] && (
          <button type="button" onClick={() => select(check.componentIds[0])} className="text-[13px] font-medium text-accent-ink underline underline-offset-2">
            {t.issues.showPart}
          </button>
        )}
      </div>
    </div>
  );
}

export function IssuesList({ checks, empty, muted }: { checks: Check[]; empty?: string; muted?: boolean }) {
  if (!checks.length) return empty ? <p className="text-[15px] text-muted">{empty}</p> : null;
  return (
    <div className="flex flex-col gap-2">
      {checks.map((c) => (
        <IssueCard key={c.id} check={c} muted={muted} />
      ))}
    </div>
  );
}

/** A single calm line for a notes-only situation (no RED) — states plainly that there are stability adjustments, without a wall of colored alerts. Click to see them anyway. */
export function NotesOnlySummary({ checks }: { checks: Check[] }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  if (!checks.length) return null;
  return (
    <div className="rounded-xl bg-sunken p-3">
      <button type="button" onClick={() => setExpanded(!expanded)} className="flex w-full items-center gap-2 text-start">
        <span className="text-muted">
          <StatusIcon status="GREY" size={18} />
        </span>
        <span className="flex-1 text-[15px]">{t.issues.notesOnlySummary}</span>
        <span className="text-[13px] font-medium text-accent-ink underline underline-offset-2">{expanded ? t.common.close : t.issues.showDetails}</span>
      </button>
      {expanded && (
        <div className="mt-3">
          <IssuesList checks={checks} muted />
        </div>
      )}
    </div>
  );
}

/** The "Can it be built?" pill; opens the issues with their fixes right on the canvas. */
export function BuildPill({ result }: { result: DesignResult }) {
  const t = useT();
  const openAdvanced = useUi((s) => s.openAdvanced);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const issues = openIssues(result);
  const reds = issues.filter((c) => c.status === 'RED').length;
  const actionable = issues.filter((c) => c.status !== 'GREY');
  const blocked = result.report.exportBlocked;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
        className={`flex h-11 items-center gap-2.5 rounded-full px-4 shadow-sm ring-1 backdrop-blur ${blocked ? 'bg-bad-soft ring-bad/40' : 'bg-panel/95 ring-line hover:bg-panel'}`}
      >
        <span className={blocked ? 'text-bad' : 'text-ok'}>
          <StatusIcon status={blocked ? 'RED' : 'GREEN'} size={18} />
        </span>
        <span className="text-[15px] font-semibold">{blocked ? t.viewport.cannotBuild : t.viewport.canBuild}</span>
        {actionable.length > 0 && (
          <>
            <span className="h-5 w-px bg-line-strong" aria-hidden />
            <span className="text-sm font-medium text-accent-ink">{reds > 0 ? t.viewport.fixes(reds) : t.viewport.notes(actionable.length)}</span>
          </>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label={t.issues.title} className="absolute start-0 top-12 z-30 flex max-h-[70vh] w-[400px] flex-col overflow-hidden rounded-2xl bg-panel shadow-xl ring-1 ring-line">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-base font-semibold">{t.issues.title}</span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openAdvanced('checks');
              }}
              className="text-[13px] font-medium text-accent-ink underline underline-offset-2"
            >
              {t.issues.allDetails}
            </button>
          </div>
          <div className="overflow-y-auto p-3">
            {issues.length === 0 ? (
              <p className="text-[15px] text-muted">{t.issues.none}</p>
            ) : reds > 0 ? (
              <IssuesList checks={issues} />
            ) : (
              <NotesOnlySummary checks={issues} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Always-visible entry to every problem and its ready fixes, from any step (footer button + side sheet),
 * so a design can be fixed where the user is instead of going back to the structure step.
 */
export function FixesButton({ result }: { result: DesignResult }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const issues = openIssues(result);
  const reds = issues.filter((c) => c.status === 'RED');
  const notes = issues.filter((c) => c.status === 'YELLOW');
  const others = issues.filter((c) => c.status === 'GREY');

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  if (!reds.length && !notes.length) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[15px] font-semibold ring-1 ${reds.length ? 'bg-bad-soft text-bad ring-bad/40 hover:bg-bad-soft/80' : 'bg-panel text-ink ring-line hover:bg-sunken'}`}
      >
        <StatusIcon status={reds.length ? 'RED' : 'YELLOW'} size={16} />
        {reds.length ? t.issues.fixButton(reds.length) : t.issues.notesButton(notes.length)}
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label={t.issues.drawerTitle}>
          <button type="button" aria-label={t.common.close} className="flex-1 bg-black/25" onClick={() => setOpen(false)} />
          <div className="flex h-full w-[440px] max-w-full flex-col bg-panel shadow-2xl ring-1 ring-line">
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-lg font-bold">{t.issues.drawerTitle}</h2>
                <p className="text-[13px] text-muted">{t.issues.drawerIntro}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg px-3 text-[15px] text-accent-ink hover:bg-sunken">
                {t.common.close}
              </button>
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto p-4">
              {reds.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-[13px] font-semibold text-bad">{t.issues.blockingTitle}</h3>
                  <IssuesList checks={reds} />
                </section>
              ) : (
                <p className="rounded-xl bg-ok-soft p-3 text-[15px] text-ok">{t.issues.allClear}</p>
              )}
              {notes.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-[13px] font-semibold text-muted">{t.issues.notesTitle}</h3>
                  <IssuesList checks={notes} muted />
                </section>
              )}
              {others.length > 0 && <p className="text-[13px] text-muted">{t.issues.notCheckedHint} ({others.length})</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

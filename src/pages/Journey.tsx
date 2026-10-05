import { lazy, Suspense } from 'react';
import type { AuthState } from '../cloud/supabase';
import { useT } from '../i18n';
import { useSurvey } from '../state/spaceStore';
import { useUi } from '../state/uiStore';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/common';
import { ArStage } from '../ui/journey/ArStage';
import { DescribeStage } from '../ui/journey/DescribeStage';
import { PriceStage } from '../ui/journey/PriceStage';
import { RefineStage } from '../ui/journey/RefineStage';
import { ScanStage } from '../ui/journey/ScanStage';
import { TenderStage } from '../ui/journey/TenderStage';
import { BillView } from '../ui/survey/BillView';
import { FinishSchedule } from '../ui/survey/FinishSchedule';
import { ProjectBackup } from '../ui/survey/ProjectBackup';
import { RoomSwitcher } from '../ui/survey/RoomSwitcher';
import { SampleBanner, SurveyEditor } from '../ui/survey/SurveyEditor';
import { UndoToast } from '../ui/survey/UndoToast';
import { useRoomBill } from '../ui/survey/useRoomBill';
import { STAGES, type Stage } from './journeyStages';

/** three.js is only paid for when someone opens the walkthrough. */
const RoomScene = lazy(() => import('../ui/survey/RoomScene'));


/**
 * Whether each step runs on the real engine or shows how it will work.
 *
 * A client walking through this is deciding whether to trust the product, so the line between what
 * works and what is imagined is drawn on every step rather than explained once at the start and
 * forgotten. "partial" means the step says inside itself which half is which.
 */
type Mode = 'live' | 'prototype' | 'partial';
const MODE: Record<Stage, Mode> = {
  scan: 'prototype',
  describe: 'live',
  refine: 'live',
  edit: 'live',
  walk: 'live',
  bill: 'live',
  price: 'prototype',
  tender: 'partial',
  ar: 'partial',
};

const MODE_STYLE: Record<Mode, { dot: string; pill: string }> = {
  live: { dot: 'bg-ok', pill: 'bg-ok-soft' },
  prototype: { dot: 'bg-unknown', pill: 'bg-unknown-soft' },
  partial: { dot: 'bg-warn', pill: 'bg-warn-soft' },
};

export function JourneyPage({ auth, stage }: { auth: AuthState; stage: Stage }) {
  const t = useT();
  const j = t.journey;
  const he = useUi((s) => s.locale) === 'he';
  const survey = useSurvey();
  const bill = useRoomBill();

  const index = STAGES.indexOf(stage);
  const next = STAGES[index + 1];
  const prev = STAGES[index - 1];
  const go = (s: Stage) => {
    window.location.assign(`#/journey/${s}`);
    window.scrollTo({ top: 0 });
  };
  const mode = MODE[stage];

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <AppHeader auth={auth} start={<h1 className="truncate text-control font-semibold">{j.title}</h1>} />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-6">
        <div className="space-y-3">
          <p className="max-w-3xl text-body leading-relaxed text-muted">{j.intro}</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-small text-muted">
            {(['live', 'prototype', 'partial'] as const).map((m) => (
              <li key={m} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${MODE_STYLE[m].dot}`} aria-hidden />
                <span className="font-medium text-ink">{j.modes[m]}</span> — {j.modeHints[m]}
              </li>
            ))}
          </ul>
        </div>

        {/* The steps are a real sequence, so they are numbered. */}
        <nav aria-label={j.title} className="-mx-4 overflow-x-auto px-4">
          <ol className="flex min-w-max gap-1.5">
            {STAGES.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => go(s)}
                  aria-current={s === stage ? 'step' : undefined}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-small transition ${s === stage ? 'border-ink bg-ink text-paper' : 'border-line bg-panel hover:bg-sunken'}`}
                >
                  <span className="tabular-nums opacity-70">{i + 1}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${MODE_STYLE[MODE[s]].dot}`} aria-hidden />
                  {j.stages[s].name}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <SampleBanner onReplace={stage === 'scan' ? undefined : () => go('scan')} />

        <article className="rounded-2xl border border-line bg-panel">
          <header className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-small text-muted">{j.stepOf(index + 1, STAGES.length)}</div>
              <h2 className="text-xl font-semibold text-balance">{j.stages[stage].title}</h2>
              <p className="mt-0.5 text-body text-muted">{j.stages[stage].purpose}</p>
            </div>
            <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-1 sm:text-end">
              <span className={`shrink-0 rounded-full px-3 py-1 text-small font-semibold ${MODE_STYLE[mode].pill}`}>{j.modes[mode]}</span>
              <span className="text-caption leading-snug text-muted sm:max-w-[30ch]">{j.modeHints[mode]}</span>
            </div>
          </header>

          <div className={stage === 'edit' || stage === 'bill' ? '' : 'px-5 py-5'}>
            {stage === 'scan' && <ScanStage onDone={() => go('describe')} />}
            {stage === 'describe' && <DescribeStage onDone={() => go('refine')} />}
            {stage === 'refine' && <RefineStage />}
            {stage === 'edit' && (
              <div className="space-y-5 p-5">
                <RoomSwitcher bill={bill} />
                <ProjectBackup />
                <div className="rounded-2xl border border-line">
                  <SurveyEditor bill={bill} />
                </div>
                <FinishSchedule bill={bill} />
              </div>
            )}
            {stage === 'walk' &&
              (survey.space.footprintMm.length < 3 ? (
                <div className="space-y-3 py-6 text-center">
                  <p className="text-body text-muted">{j.walk.needsRoom}</p>
                  <Button onClick={() => go('scan')}>{j.walk.toScan}</Button>
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="h-[62vh] min-h-[360px] overflow-hidden rounded-xl border border-line">
                    <Suspense fallback={<div className="flex h-full items-center justify-center text-muted">{t.common.loading}</div>}>
                      <RoomScene
                        space={survey.space}
                        equipmentIds={survey.equipmentIds}
                        design={bill.pieceOf(survey.space.id)?.result ?? null}
                        designName={survey.piece?.name ?? bill.designName}
                        he={he}
                        labels={j.walk.labels}
                      />
                    </Suspense>
                  </div>
                  <aside className="space-y-4 text-small">
                    <label className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                        checked={survey.piece != null}
                        onChange={(e) => survey.setPiece(e.target.checked ? { name: bill.designName, params: bill.design.model.params } : null)}
                      />
                      {j.walk.includePiece(survey.piece?.name ?? bill.designName)}
                    </label>
                    <section>
                      <h3 className="font-semibold">{j.walk.legendTitle}</h3>
                      <ul className="mt-1.5 space-y-1.5 leading-snug text-muted">
                        <li>{j.walk.legendPins}</li>
                        <li>{j.walk.legendOpen}</li>
                        <li>{j.walk.legendPiece}</li>
                      </ul>
                    </section>
                    <section>
                      <h3 className="font-semibold">{j.walk.vrTitle}</h3>
                      <p className="mt-1.5 leading-snug text-muted">{j.walk.vrBody}</p>
                      <p className="mt-1 leading-snug text-muted">{j.walk.vrLabelsNote}</p>
                    </section>
                  </aside>
                </div>
              ))}
            {stage === 'bill' && <BillView bill={bill} maxHeight="none" />}
            {stage === 'price' && <PriceStage lines={bill.lines} />}
            {stage === 'tender' && <TenderStage bill={bill} />}
            {stage === 'ar' && <ArStage design={bill.design} modeLabels={j.modes} />}
          </div>

          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            {prev && (
              <Button variant="ghost" onClick={() => go(prev)}>
                {j.back}
              </Button>
            )}
            <div className="ms-auto">
              {next ? (
                <Button variant="primary" onClick={() => go(next)}>
                  {j.next(j.stages[next].name)}
                </Button>
              ) : (
                <Button variant="primary" onClick={() => window.location.assign('#/space')}>
                  {j.finish}
                </Button>
              )}
            </div>
          </footer>
        </article>
      </main>
      <UndoToast />
    </div>
  );
}

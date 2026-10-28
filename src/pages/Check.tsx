import { useMemo, useState } from 'react';
import type { AuthState } from '../cloud/supabase';
import { EQUIPMENT, OWNERS, SERVICE_LABEL, billWorkbook, branchNeed, evaluateChecks, landlordRequirements, openQuestions, propertySummary, type CheckAnswer, type EvaluatedCheck, type Owner, type ServiceKind } from '../engine';
import { useT } from '../i18n';
import { projectRooms, useSurvey } from '../state/spaceStore';
import { allTemplates, useTemplates, type BranchTemplate } from '../state/templateStore';
import { useUi } from '../state/uiStore';
import { CloudSave } from '../ui/account/Bills';
import { AppHeader } from '../ui/AppHeader';
import { Button, buttonClass, downloadText, inputClass } from '../ui/common';
import { IconCheck } from '../ui/icons';
import { NullableCm } from '../ui/survey/SurveyEditor';
import { SurveyorImport } from '../ui/survey/SurveyorImport';
import { siteQuestions, questionText } from '../ui/survey/siteQuestions';
import { UndoToast } from '../ui/survey/UndoToast';
import { useRoomBill } from '../ui/survey/useRoomBill';
import { downloadWorkbook } from '../ui/xlsxFile';
import { CHECK_STEPS, type CheckStep } from './checkSteps';

/** Which room-level supply questions a property check answers once it is found fine. */
const SETTLES: Record<string, ServiceKind[]> = {
  electrical_supply: ['electrical'],
  gas_supply: ['gas'],
  water_supply: ['water_cold', 'water_hot'],
  drain_in_space: ['drain'],
  exhaust_route: ['ventilation'],
};

const STATUS_STYLE = { ok: 'bg-ok-soft', gap: 'bg-bad-soft text-bad', unknown: 'bg-unknown-soft' } as const;

/** The walk-through's state for the open property: what it needs, and every check with what was found. */
function useProperty() {
  const survey = useSurvey();
  const rooms = projectRooms(survey);
  const need = useMemo(() => branchNeed(rooms), [rooms]);
  const evaluated = useMemo(() => evaluateChecks(need, survey.siteChecks), [need, survey.siteChecks]);
  return { survey, rooms, need, evaluated, summary: propertySummary(evaluated) };
}

function StartStep({ onStarted }: { onStarted: () => void }) {
  const t = useT();
  const c = t.check;
  const he = useUi((s) => s.locale) === 'he';
  const { survey, rooms } = useProperty();
  const own = useTemplates((s) => s.templates);
  const removeTemplate = useTemplates((s) => s.removeTemplate);
  const [name, setName] = useState(survey.propertyName);
  const hasWork = survey.equipmentIds.length > 0 || rooms.length > 1;

  const start = (tpl: BranchTemplate) => {
    if (hasWork && !confirm(c.startConfirm(tpl.name))) return;
    survey.startFromTemplate({ sector: tpl.sector, equipmentIds: tpl.equipmentIds, roomName: tpl.roomName ?? (tpl.example ? 'מטבח' : tpl.name) }, name.trim());
    onStarted();
  };

  return (
    <div className="space-y-6">
      <label className="block max-w-xl">
        <span className="mb-1 block text-body font-semibold">{c.propertyName}</span>
        <span className="mb-1.5 block text-small text-muted">{c.propertyHint}</span>
        <input
          className={inputClass}
          value={name}
          placeholder={c.propertyPlaceholder}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== survey.propertyName && survey.setPropertyName(name.trim())}
        />
      </label>

      {hasWork && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-sunken px-4 py-3 text-small">
          <span>{c.currentIs(survey.propertyName || c.unnamedProperty, rooms.length)}</span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              if (name !== survey.propertyName) survey.setPropertyName(name.trim());
              onStarted();
            }}
          >
            {c.continueCurrent}
          </Button>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h3 className="text-body font-semibold">{c.templatesTitle}</h3>
          <p className="mt-0.5 max-w-prose text-small text-muted">{c.templatesHint}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {allTemplates(own).map((tpl) => {
            const names = [...new Set(tpl.equipmentIds)].map((id) => EQUIPMENT.find((e) => e.id === id)).filter(Boolean).map((e) => (he ? e!.nameHe : e!.nameEn));
            return (
              <li key={tpl.id} className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
                <div className="text-body font-semibold">{tpl.name}</div>
                <div className="text-small text-muted">
                  {t.survey.sectors[tpl.sector]} · {c.items(tpl.equipmentIds.length)}
                </div>
                {tpl.example && <div className="w-fit rounded-full bg-warn-soft px-2.5 py-0.5 text-caption">{c.exampleBadge}</div>}
                <p className="line-clamp-3 text-small leading-snug text-muted">{names.join(' · ')}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant={hasWork ? 'secondary' : 'primary'} onClick={() => start(tpl)}>
                    {c.startFrom}
                  </Button>
                  {!tpl.example && (
                    <Button size="sm" variant="ghost" onClick={() => removeTemplate(tpl.id)}>
                      {c.removeTemplate}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {hasWork && <SurveyorImport />}

      {hasWork && !survey.surveyFile && (
        <div className="max-w-xl">
          <h3 className="text-body font-semibold">{t.survey.roomSection}</h3>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <NullableCm label={t.survey.width} value={survey.widthMm} onChange={(v) => survey.setRectangle(v, survey.depthMm)} />
            <NullableCm label={t.survey.depth} value={survey.depthMm} onChange={(v) => survey.setRectangle(survey.widthMm, v)} />
            <NullableCm label={t.survey.height} value={survey.space.heightMm} onChange={(v) => survey.setHeight(v)} />
          </div>
        </div>
      )}
    </div>
  );
}

function CheckRow({ e }: { e: EvaluatedCheck }) {
  const t = useT();
  const c = t.check;
  const he = useUi((s) => s.locale) === 'he';
  const setCheck = useSurvey((s) => s.setCheck);
  const [noteOpen, setNoteOpen] = useState(e.note !== '');
  const state = useSurvey((s) => s.siteChecks[e.check.id]);
  const current: CheckAnswer = state?.answer ?? 'unknown';
  // Not answered and "don't know" count the same for the decision, but only one of them was said.
  const chosen = state != null;
  const options: { value: CheckAnswer; label: string }[] = [
    { value: 'yes', label: c.yes },
    { value: 'no', label: c.no },
    { value: 'unknown', label: c.unknown },
  ];

  return (
    <li className="rounded-xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="text-body font-semibold leading-snug">{he ? e.check.he : e.check.en}</div>
          <p className="mt-0.5 text-small leading-snug text-muted">{he ? e.check.hintHe : e.check.hintEn}</p>
        </div>
        {/* Three large targets: this is answered standing in a room with a phone in one hand. */}
        <div role="radiogroup" aria-label={he ? e.check.he : e.check.en} className="flex shrink-0 gap-1.5">
          {options.map((o) => {
            const on = chosen && current === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setCheck(e.check.id, { answer: o.value })}
                className={`h-11 min-w-16 rounded-lg px-3 text-body font-medium ring-1 transition ${on ? (o.value === 'unknown' ? 'bg-unknown-soft ring-ink' : o.value === e.check.good ? 'bg-ok-soft ring-ok' : 'bg-bad-soft ring-bad') : 'bg-panel ring-line hover:bg-sunken'}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      {e.check.sources.map((s) => (
        <p key={s.title} className="mt-2 text-caption leading-snug text-muted">
          {c.source}:{' '}
          {s.url ? (
            <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {he ? s.title : (s.titleEn ?? s.title)}
            </a>
          ) : he ? (
            s.title
          ) : (
            (s.titleEn ?? s.title)
          )}
          {s.reference && ` — ${he ? s.reference : (s.referenceEn ?? s.reference)}`}
        </p>
      ))}
      {noteOpen ? (
        <textarea
          rows={2}
          aria-label={c.note}
          className={`${inputClass} mt-2 h-auto py-2`}
          placeholder={c.notePlaceholder}
          defaultValue={e.note}
          onBlur={(ev) => ev.target.value !== e.note && setCheck(e.check.id, { note: ev.target.value, answer: current })}
        />
      ) : (
        <button type="button" className="mt-2 text-small text-accent-ink underline underline-offset-2" onClick={() => setNoteOpen(true)}>
          + {c.note}
        </button>
      )}
    </li>
  );
}

function TourStep() {
  const c = useT().check;
  const { evaluated } = useProperty();
  const siteChecks = useSurvey((s) => s.siteChecks);
  const answered = evaluated.filter((e) => siteChecks[e.check.id] != null).length;
  if (!evaluated.length) return <p className="text-body text-muted">{c.noChecks}</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="max-w-prose text-small text-muted">{c.tourIntro}</p>
        <span className="ms-auto text-small font-medium tabular-nums">{c.answered(answered, evaluated.length)}</span>
      </div>
      <ol className="space-y-3">
        {evaluated.map((e) => (
          <CheckRow key={e.check.id} e={e} />
        ))}
      </ol>
    </div>
  );
}

function GapsStep() {
  const t = useT();
  const c = t.check;
  const he = useUi((s) => s.locale) === 'he';
  const { evaluated, summary, need } = useProperty();
  const setCheck = useSurvey((s) => s.setCheck);
  const siteChecks = useSurvey((s) => s.siteChecks);

  return (
    <div className="space-y-6">
      <p className="max-w-prose text-small text-muted">{c.gapsIntro}</p>
      {/* The three numbers the decision rests on, each with its word — never colour alone. */}
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ['gap', summary.gaps, c.gap],
            ['unknown', summary.unknown, c.unknownStatus],
            ['ok', summary.ok, c.ok],
          ] as const
        ).map(([key, n, label]) => (
          <div key={key} className={`rounded-xl px-4 py-3 ${STATUS_STYLE[key]}`}>
            <div className="text-title font-bold tabular-nums">{n}</div>
            <div className="text-small font-medium">{label}</div>
          </div>
        ))}
      </div>

      {summary.gaps + summary.unknown === 0 && evaluated.length > 0 && <p className="rounded-xl bg-ok-soft px-4 py-3 text-body">{c.allFine}</p>}

      {OWNERS.map((owner) => {
        const items = summary.byOwner[owner];
        return (
          <section key={owner} className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h3 className="text-body font-semibold">
                {c.owners[owner]} <span className="font-normal text-muted">· {items.length}</span>
              </h3>
              <span className="text-small text-muted">{c.ownerHint[owner]}</span>
            </div>
            {items.length === 0 ? (
              <p className="text-small text-muted">{c.nothingOpen}</p>
            ) : (
              <ul className="space-y-2">
                {items.map((e) => (
                  <li key={e.check.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-panel px-3 py-2.5">
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold ${STATUS_STYLE[e.status]}`}>{e.status === 'gap' ? c.gap : c.unknownStatus}</span>
                    <span className="min-w-0 flex-1 basis-56 text-body leading-snug">
                      {he ? e.check.he : e.check.en}
                      {e.note && <span className="block text-small text-muted">{e.note}</span>}
                    </span>
                    <label className="flex items-center gap-2 text-small text-muted">
                      {c.moveTo}
                      <select
                        className="h-9 rounded-lg border border-field bg-panel px-2 text-body text-ink"
                        value={e.owner}
                        onChange={(ev) => setCheck(e.check.id, { owner: ev.target.value as Owner, answer: siteChecks[e.check.id]?.answer ?? 'unknown' })}
                      >
                        {OWNERS.map((o) => (
                          <option key={o} value={o}>
                            {c.owners[o]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section className="rounded-xl bg-sunken px-4 py-3">
        <h3 className="text-small font-semibold">{c.needsTitle}</h3>
        <p className="text-caption text-muted">{c.needsHint}</p>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-small tabular-nums">
          {(Object.entries(need.points) as [ServiceKind, number][])
            .filter(([, n]) => n > 0)
            .map(([kind, n]) => (
              <li key={kind}>{c.points(n, he ? SERVICE_LABEL[kind].he : SERVICE_LABEL[kind].en)}</li>
            ))}
        </ul>
      </section>
    </div>
  );
}

function DocsStep({ auth }: { auth: AuthState }) {
  const t = useT();
  const c = t.check;
  const locale = useUi((s) => s.locale);
  const he = locale === 'he';
  const { survey, rooms, need, evaluated } = useProperty();
  const bill = useRoomBill();
  const saveTemplate = useTemplates((s) => s.saveTemplate);
  const [tplName, setTplName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  const o = { locale, propertyName: survey.propertyName || c.unnamedProperty, date: new Date().toISOString().slice(0, 10) } as const;
  // The room-level questions (unmeasured height, a source nobody traced) belong on the same list.
  // A room asking "is there a gas source?" after the walk-through found one would contradict it, so a
  // supply question is left out once the property check for that service was answered yes.
  const settled = new Set(evaluated.filter((e) => e.status === 'ok').flatMap((e) => SETTLES[e.check.id] ?? []));
  const extra = rooms.flatMap((r) =>
    siteQuestions(r)
      .filter((q) => !(q.type === 'supply' && settled.has(q.service)))
      .map((q) => `${(he ? r.space.nameHe : r.space.nameEn) || r.space.nameHe}: ${questionText(q, t.journey.refine, he)}`),
  );
  const fileBase = (survey.propertyName || 'property').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'property';

  const doc = (title: string, hint: string, action: () => void) => (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-4">
      <div className="min-w-0 flex-1 basis-60">
        <div className="text-body font-semibold">{title}</div>
        <p className="text-small text-muted">{hint}</p>
      </div>
      <Button variant="primary" onClick={action}>
        {c.download}
      </Button>
    </li>
  );

  return (
    <div className="space-y-6">
      <p className="max-w-prose text-small text-muted">{c.docsIntro}</p>
      <ul className="space-y-3">
        {doc(c.docLandlord, c.docLandlordHint, () => downloadText(`${fileBase} - landlord.txt`, landlordRequirements(evaluated, need, o), 'text/plain;charset=utf-8'))}
        {doc(c.docQuestions, c.docQuestionsHint, () => downloadText(`${fileBase} - questions.txt`, openQuestions(evaluated, need, o, extra), 'text/plain;charset=utf-8'))}
        {doc(c.docBill, c.docBillHint, () => void downloadWorkbook(`${fileBase} - boq.xlsx`, billWorkbook(bill.lines, { locale, roomName: bill.roomName }), he))}
      </ul>

      <section className="rounded-xl border border-line bg-panel p-4">
        <CloudSave auth={auth} />
      </section>

      <section className="space-y-2 rounded-xl border border-line bg-panel p-4">
        <h3 className="text-body font-semibold">{c.saveTemplateTitle}</h3>
        <p className="text-small text-muted">{c.saveTemplateHint}</p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = tplName.trim();
            if (!name) return;
            saveTemplate({ name, sector: survey.sector, equipmentIds: survey.equipmentIds });
            setSaved(name);
            setTplName('');
          }}
        >
          <input className={`${inputClass} max-w-xs`} aria-label={c.templateName} placeholder={c.templateNamePlaceholder} value={tplName} maxLength={80} onChange={(e) => setTplName(e.target.value)} />
          <Button type="submit" disabled={!tplName.trim() || survey.equipmentIds.length === 0}>
            {c.saveTemplate}
          </Button>
        </form>
        {saved && (
          <p role="status" className="flex items-center gap-1.5 text-small text-ok">
            <IconCheck size={16} /> {c.templateSaved(saved)}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <a href="#/check/start" className={buttonClass('secondary', 'md')}>
          {c.nextProperty}
        </a>
        <a href="#/space" className="text-small text-muted underline underline-offset-2">
          {c.fullJourney}
        </a>
      </div>
      <p className="text-small text-muted">{c.compareHint}</p>
    </div>
  );
}

/**
 * The property check: is this property right for the branch, what is it missing, and who has to deal
 * with each gap — answered on the first walk-through, before the lease is signed.
 *
 * Four steps and nothing else. The full journey, with its walkthrough and its tender packages, is still
 * there for whoever wants it; this is the part a construction manager uses standing in the property.
 */
export function CheckPage({ auth, step }: { auth: AuthState; step: CheckStep }) {
  const t = useT();
  const c = t.check;
  const index = CHECK_STEPS.indexOf(step);
  const next = CHECK_STEPS[index + 1];
  const prev = CHECK_STEPS[index - 1];
  const propertyName = useSurvey((s) => s.propertyName);
  const go = (s: CheckStep) => {
    window.location.assign(`#/check/${s}`);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <AppHeader auth={auth} start={<h1 className="truncate text-control font-semibold">{c.title}</h1>} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-4 py-6">
        <div>
          <p className="max-w-3xl text-body leading-relaxed text-muted">{c.intro}</p>
          {/* Always there, so naming the property does not push the page down under a finger about to tap. */}
          <p className="mt-1 min-h-6 text-body font-semibold">{propertyName}</p>
        </div>

        <nav aria-label={c.title}>
          <ol className="flex flex-wrap gap-1.5">
            {CHECK_STEPS.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => go(s)}
                  aria-current={s === step ? 'step' : undefined}
                  className={`flex h-10 items-center gap-2 rounded-full border px-4 text-small ${s === step ? 'border-ink bg-ink text-paper' : 'border-line bg-panel hover:bg-sunken'}`}
                >
                  <span className="tabular-nums opacity-70">{i + 1}</span>
                  {c.steps[s]}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <article className="rounded-2xl border border-line bg-panel">
          <header className="border-b border-line px-5 py-4">
            <div className="text-small text-muted">{c.stepOf(index + 1, CHECK_STEPS.length)}</div>
            <h2 className="text-xl font-semibold">{c.steps[step]}</h2>
          </header>
          <div className="px-5 py-5">
            {step === 'start' && <StartStep onStarted={() => go('tour')} />}
            {step === 'tour' && <TourStep />}
            {step === 'gaps' && <GapsStep />}
            {step === 'docs' && <DocsStep auth={auth} />}
          </div>
          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            {prev && (
              <Button variant="ghost" onClick={() => go(prev)}>
                {c.back}
              </Button>
            )}
            {next && (
              <div className="ms-auto">
                <Button variant="primary" onClick={() => go(next)}>
                  {c.next(c.steps[next])}
                </Button>
              </div>
            )}
          </footer>
        </article>
      </main>
      <UndoToast />
    </div>
  );
}

export default CheckPage;

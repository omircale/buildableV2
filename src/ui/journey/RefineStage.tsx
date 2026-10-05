import { useState, type ReactNode } from 'react';
import { wallsOf, type ServiceKind } from '../../engine';
import { useT } from '../../i18n';
import { useSurvey, type AnswerCode } from '../../state/spaceStore';
import { useUi } from '../../state/uiStore';
import { Button, Chip, inputClass } from '../common';
import { NullableCm } from '../survey/SurveyEditor';
import { serviceName } from '../survey/services';
import { refinementQuestions, type Question } from '../survey/questions';

const metres = (mm: number) => (mm / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 });

/** The words for an answer in whichever language the screen is in now. */
function answerLabel(r: { askOnSite: string; none: string; notStated: string; openNone: string; openDone: string }, code: AnswerCode): string {
  return { ask_on_site: r.askOnSite, none: r.none, not_stated: r.notStated, all_built: r.openNone, open_marked: r.openDone }[code];
}

function Bubble({ from, children }: { from: 'system' | 'fact'; children: ReactNode }) {
  return (
    <div className={`max-w-[46ch] rounded-2xl px-4 py-2.5 text-[0.875rem] leading-relaxed ${from === 'system' ? 'rounded-ss-sm bg-accent-soft' : 'ms-auto rounded-se-sm bg-sunken text-muted'}`}>
      {children}
    </div>
  );
}

function QuestionForm({ q }: { q: Question }) {
  const t = useT();
  const r = t.journey.refine;
  const he = useUi((s) => s.locale) === 'he';
  const survey = useSurvey();
  const [text, setText] = useState('');
  const [w, setW] = useState<number | null>(null);
  const [d, setD] = useState<number | null>(null);
  const [h, setH] = useState<number | null>(null);

  const deferButton = (code: AnswerCode = 'ask_on_site') => (
    <Button variant="ghost" onClick={() => survey.answer(q.id, code)}>
      {answerLabel(r, code)}
    </Button>
  );

  switch (q.type) {
    case 'size':
      return (
        <div className="space-y-3">
          <Bubble from="system">{r.sizeQ}</Bubble>
          <div className="grid max-w-md grid-cols-2 gap-3">
            <NullableCm label={t.survey.width} value={w} onChange={setW} />
            <NullableCm label={t.survey.depth} value={d} onChange={setD} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={w == null || d == null} onClick={() => survey.setRectangle(w, d)}>
              {r.save}
            </Button>
            {deferButton()}
          </div>
        </div>
      );

    case 'height':
      return (
        <div className="space-y-3">
          <Bubble from="system">{r.heightQ}</Bubble>
          <div className="max-w-[14rem]">
            <NullableCm label={t.survey.height} value={h} onChange={setH} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={h == null} onClick={() => survey.setHeight(h)}>
              {r.save}
            </Button>
            {deferButton()}
          </div>
        </div>
      );

    case 'open_sides': {
      const walls = wallsOf(survey.space);
      const open = walls.map((wall, i) => (wall.built ? null : t.survey.wall(i + 1))).filter(Boolean) as string[];
      return (
        <div className="space-y-3">
          <Bubble from="system">{r.openQ}</Bubble>
          <div className="flex flex-wrap gap-2">
            {walls.map((wall, i) => (
              <Chip key={wall.id} selected={!wall.built} onClick={() => survey.toggleOpenEdge(i)}>
                {t.survey.wall(i + 1)}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={open.length === 0} onClick={() => survey.answer(q.id, 'open_marked')}>
              {r.openDone}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                // "Every wall is built" is an answer, and it has to leave the model saying so.
                walls.forEach((wall, i) => {
                  if (!wall.built) useSurvey.getState().toggleOpenEdge(i);
                });
                survey.answer(q.id, 'all_built');
              }}
            >
              {r.openNone}
            </Button>
          </div>
        </div>
      );
    }

    case 'supply': {
      const kind = serviceName(q.service, he);
      const name = text.trim();
      const save = () => {
        const st = useSurvey.getState();
        const source = st.addSource(q.service, he ? { nameHe: name } : { nameEn: name });
        // Existing points of this kind that nobody had traced are now traced to what was just named.
        if (q.status === 'source_unknown') {
          for (const c of st.space.connections) if (c.kind === q.service && c.existing && !c.fedBy) st.updateConnection(c.id, { fedBy: source });
        }
        setText('');
      };
      return (
        <div className="space-y-3">
          <Bubble from="system">{q.status === 'no_source' ? r.supplyNoSourceQ(kind, q.toCreate) : r.supplyUnknownQ(kind)}</Bubble>
          <input className={`${inputClass} max-w-md`} placeholder={r.sourcePlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!name} onClick={save}>
              {r.save}
            </Button>
            {q.status === 'no_source' && deferButton('none')}
            {deferButton()}
          </div>
        </div>
      );
    }

    case 'capacity': {
      const n = text.trim() === '' ? null : Number(text);
      return (
        <div className="space-y-3">
          <Bubble from="system">{r.capacityQ(q.sourceName, serviceName(q.service, he), q.toCreate)}</Bubble>
          <input type="number" inputMode="numeric" min={0} className={`${inputClass} max-w-[14rem]`} placeholder={r.capacityPlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={n == null || !Number.isFinite(n) || n < 0}
              onClick={() => {
                survey.updateSource(q.sourceId, { spareWays: n });
                setText('');
              }}
            >
              {r.save}
            </Button>
            {deferButton('not_stated')}
          </div>
        </div>
      );
    }
  }
}

export function RefineStage() {
  const t = useT();
  const r = t.journey.refine;
  const he = useUi((s) => s.locale) === 'he';
  const survey = useSurvey();
  const questions = refinementQuestions(survey);
  const current = questions[0];

  // What is settled is read back out of the model, so it can never disagree with it.
  const facts: string[] = [];
  if (survey.widthMm != null && survey.depthMm != null) facts.push(r.facts.size(metres(survey.widthMm), metres(survey.depthMm), survey.sample));
  if (survey.space.heightMm != null) facts.push(r.facts.height(metres(survey.space.heightMm)));
  const openWalls = wallsOf(survey.space)
    .map((w, i) => (w.built ? null : t.survey.wall(i + 1)))
    .filter(Boolean);
  if (openWalls.length) facts.push(r.facts.open(openWalls.join(', ')));
  for (const s of survey.sources) {
    const name = (he ? s.nameHe : s.nameEn) || s.nameHe || s.nameEn || s.id;
    facts.push(r.facts.source(serviceName(s.kind, he), name) + (s.spareWays != null ? r.facts.spare(s.spareWays) : ''));
  }
  const topic = (id: string) => {
    if (id === 'size' || id === 'height' || id === 'open_sides') return r.topics[id];
    const [type, kind] = id.split(':') as ['supply' | 'capacity', ServiceKind];
    return type === 'supply' ? r.topics.supply(serviceName(kind, he)) : r.topics.capacity(serviceName(kind, he));
  };
  for (const [id, code] of Object.entries(survey.answers)) {
    // Open walls are already read back from the model above; repeating the answer would say it twice.
    if (code === 'open_marked') continue;
    facts.push(r.facts.answer(topic(id), answerLabel(r, code)));
  }

  // Counted by what was answered, not by the words it was answered in.
  const deferred = Object.values(survey.answers).filter((code) => code === 'ask_on_site' || code === 'not_stated').length;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        {current ? (
          <>
            <QuestionForm key={current.id} q={current} />
            {questions.length > 1 && <p className="text-[0.7812rem] text-muted">{r.remaining(questions.length - 1)}</p>}
          </>
        ) : (
          <div className="rounded-xl bg-ok-soft px-4 py-3">
            <div className="text-[0.875rem] font-semibold">{r.doneTitle}</div>
            <p className="mt-1 text-[0.8125rem] text-muted">{r.doneBody(deferred)}</p>
          </div>
        )}
        <p className="max-w-prose text-[0.7812rem] leading-relaxed text-muted">{r.note}</p>
      </div>

      <aside className="space-y-2">
        <h3 className="text-[0.8438rem] font-semibold">{r.settled}</h3>
        {facts.length === 0 ? (
          <p className="text-[0.8125rem] text-muted">{r.nothingSettled}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {facts.map((f, i) => (
              <Bubble key={`${i}-${f}`} from="fact">
                {f}
              </Bubble>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

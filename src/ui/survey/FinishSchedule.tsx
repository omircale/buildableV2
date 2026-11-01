import { useRef, useState } from 'react';
import { FINISH_CODE_PREFIX, type FinishCategory, type FinishScheduleSpec, type FinishSurface } from '../../engine';
import { useT } from '../../i18n';
import { useSurvey } from '../../state/spaceStore';
import { useUi } from '../../state/uiStore';
import { Button, Chip, downloadText, inputClass } from '../common';
import { finishTemplate, parseFinishTable, type ImportProblem } from './finishImport';
import type { RoomBill } from './useRoomBill';

const SURFACES: FinishSurface[] = ['floor', 'wall', 'ceiling'];
/** Past this many rooms, a chip per room per finish is noise; a count and two bulk actions do the job. */
const ROOM_CHIPS_UP_TO = 10;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const EMPTY_PRODUCT = { type: null, color: null, finish: null, sizeMm: null, thicknessMm: null, wearLayerMm: null };

function categoryOf(code: string): FinishCategory | null {
  const prefix = code.split('-')[0]?.toUpperCase();
  const hit = (Object.entries(FINISH_CODE_PREFIX) as [FinishCategory, string][]).find(([, p]) => p === prefix);
  return hit ? hit[0] : null;
}

/**
 * The project's finish schedule: every finish once, with the rooms it is used in.
 *
 * In a conventional schedule a finish is a page, its rooms are a box on that page nobody fills in, and
 * its quantity is "to be verified by the contractor". Here the rooms are the link: tick a room and the
 * finish's area in it is measured from the survey and lands in the bill under that room.
 */
export function FinishSchedule({ bill }: { bill: RoomBill }) {
  const t = useT();
  const f = t.survey.finishes;
  const he = useUi((s) => s.locale) === 'he';
  const survey = useSurvey();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [surface, setSurface] = useState<FinishSurface>('floor');
  const [pasted, setPasted] = useState('');
  const [result, setResult] = useState<{ count: number; problems: ImportProblem[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const rooms = bill.rooms;
  const known = rooms.map((r) => ({ id: r.space.id, nameHe: r.space.nameHe, nameEn: r.space.nameEn }));
  const roomLabel = (id: string) => {
    const r = rooms.find((x) => x.space.id === id);
    return (r && (he ? r.space.nameHe : r.space.nameEn)) || t.survey.unnamed;
  };

  const normalised = code.trim().toUpperCase();
  const category = categoryOf(normalised);
  // Adding a code that is already in the schedule would replace it and empty its rooms without a word.
  const exists = survey.finishes.some((x) => x.code === normalised);
  const add = () => {
    if (!category || exists) return;
    survey.upsertFinish({ code: normalised, category, itemNameEn: name.trim() || normalised, itemNameHe: name.trim() || undefined, surface, product: EMPTY_PRODUCT, areas: [], scope: 'unknown', sources: [] });
    setCode('');
    setName('');
  };

  const runImport = (text: string) => {
    const parsed = parseFinishTable(text, known);
    if (parsed.specs.length) survey.importFinishes(parsed.specs);
    setResult({ count: parsed.specs.length, problems: parsed.problems });
    if (parsed.specs.length) setPasted('');
  };

  return (
    <div className="rounded-2xl border border-line bg-panel">
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-control font-semibold">
          {f.title} {survey.finishes.length > 0 && <span className="text-small font-normal text-muted">· {survey.finishes.length}</span>}
        </h2>
        <p className="mt-0.5 max-w-prose text-small leading-snug text-muted">{f.hint}</p>
      </div>

      <div className="space-y-4 px-5 py-4">
        {survey.finishes.length === 0 ? (
          <p className="text-small text-muted">{f.none}</p>
        ) : (
          <ul className="space-y-2">
            {survey.finishes.map((spec: FinishScheduleSpec) => (
              <li key={spec.code} className="rounded-lg border border-line px-3 py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className="text-body font-semibold" dir="ltr">
                    {spec.code}
                  </span>
                  <span className="text-body">{(he ? spec.itemNameHe : undefined) ?? spec.itemNameEn}</span>
                  <span className="rounded-full bg-sunken px-2 py-0.5 text-caption">{f.surface[spec.surface === 'other' ? 'floor' : spec.surface]}</span>
                  {spec.pattern && <span className="text-small text-muted">{spec.pattern}</span>}
                  <button type="button" className="ms-auto text-small text-muted underline" onClick={() => survey.removeFinish(spec.code)}>
                    {t.survey.remove}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {rooms.length <= ROOM_CHIPS_UP_TO ? (
                    rooms.map((r) => (
                      <Chip key={r.space.id} selected={spec.areas.includes(r.space.id)} onClick={() => survey.toggleFinishRoom(spec.code, r.space.id)}>
                        {roomLabel(r.space.id)}
                      </Chip>
                    ))
                  ) : (
                    <span className="text-small">{f.usedIn(spec.areas.length, rooms.length)}</span>
                  )}
                  {rooms.length > 1 && (
                    <>
                      <button type="button" className="text-small text-accent underline underline-offset-2" onClick={() => survey.upsertFinish({ ...spec, areas: rooms.map((r) => r.space.id) })}>
                        {f.allRooms}
                      </button>
                      <button type="button" className="text-small text-muted underline underline-offset-2" onClick={() => survey.upsertFinish({ ...spec, areas: [] })}>
                        {f.noRooms}
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto_auto] sm:items-end">
          <label className="block text-small text-muted">
            {f.code}
            <input className={`${inputClass} mt-1`} dir="ltr" placeholder="WD-2" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className="block text-small text-muted">
            {f.name}
            <input className={`${inputClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <select className="h-10 rounded-lg border border-field bg-panel px-2 text-body" value={surface} onChange={(e) => setSurface(e.target.value as FinishSurface)} aria-label={f.surfaceLabel}>
            {SURFACES.map((s) => (
              <option key={s} value={s}>
                {f.surface[s as 'floor' | 'wall' | 'ceiling']}
              </option>
            ))}
          </select>
          <Button disabled={!category || exists} onClick={add}>
            {f.add}
          </Button>
        </div>
        {normalised !== '' && !category && <p className="text-small text-warn">{f.unknownPrefix(Object.values(FINISH_CODE_PREFIX).join(', '))}</p>}
        {exists && <p className="text-small text-warn">{f.exists(normalised)}</p>}

        <details className="rounded-lg border border-line">
          <summary className="cursor-pointer px-3 py-2 text-small font-medium">{f.importTitle}</summary>
          <div className="space-y-2 px-3 pb-3">
            <p className="text-small leading-snug text-muted">{f.importHint}</p>
            <textarea rows={4} dir="ltr" aria-label={f.pasteLabel} className={`${inputClass} h-auto py-2 font-mono text-small`} placeholder={f.pastePlaceholder} value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={!pasted.trim()} onClick={() => runImport(pasted)}>
                {f.importPasted}
              </Button>
              <Button onClick={() => fileRef.current?.click()}>{f.importFile}</Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  // A schedule is kilobytes. Reading a huge file into the page would freeze it.
                  if (file.size > MAX_IMPORT_BYTES) return setResult({ count: 0, problems: [{ row: 0, he: f.fileTooBig, en: f.fileTooBig }] });
                  runImport(await file.text());
                }}
              />
              <button type="button" className="text-small text-accent underline underline-offset-2" onClick={() => downloadText('finish-schedule-template.csv', finishTemplate(he), 'text/csv;charset=utf-8')}>
                {f.template}
              </button>
            </div>
            {result && (
              <div role="status" className="rounded-lg bg-sunken px-3 py-2 text-small leading-snug">
                <div className="font-medium">{f.imported(result.count)}</div>
                {result.problems.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-muted">
                    {result.problems.map((p, i) => (
                      <li key={`${p.row}-${i}`}>{he ? p.he : p.en}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}

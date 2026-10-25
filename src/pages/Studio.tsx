import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthState } from '../cloud/supabase';
import { decodeDxf, layerSummary, likelyUnit, parseDxf, type DxfDrawing, type DxfUnit } from '../engine';
import type { Pt } from '../engine/geometry';
import { CITATIONS, type CitationId } from '../engine/studio/citations';
import {
  FIXTURES,
  KIND_LABEL,
  MARK_LABEL,
  STUDIO_DRAFT,
  approvalCheck,
  currentApproval,
  deriveIssues,
  openIssues,
  proposePlumbing,
  runLengthM,
  spacesFromDrawing,
  statusOf,
  studioBill,
  type Layer,
  type Manual,
  type MarkCategory,
  type SpaceUse,
  type StudioElement,
  type StudioIssue,
} from '../engine/studio/model';
import { useStudioT } from '../i18n/studio';
import { useStudio } from '../state/studioStore';
import { useUi } from '../state/uiStore';
import { AppHeader } from '../ui/AppHeader';
import { Button, buttonClass, downloadText, inputClass } from '../ui/common';

/** The shared field style without its full width, for a field that sits inline. */
const inlineInput = inputClass.replace('w-full', '');
import { LAYER_COLOR } from '../ui/studio/layers';
import { PlanCanvas, type Visible } from '../ui/studio/PlanCanvas';
import { downloadWorkbook } from '../ui/xlsxFile';
import { planDxf, planSheet } from '../engine/studio/drawing';
import { downloadSheetPdf } from '../ui/studio/sheetPdf';
import { STUDIO_STEPS, type StudioStep } from './studioSteps';

const go = (step: StudioStep) => (window.location.hash = `#/studio/${step}`);

/** The proposal and what is wrong with it, recomputed from the stored decisions. */
function useDesign() {
  const project = useStudio();
  const elements = useMemo(() => proposePlumbing(project), [project]);
  const issues = useMemo(() => deriveIssues(project, elements), [project, elements]);
  return { project, elements, issues };
}

/* ------------------------------------------------------------------ file */

type Unit = Exclude<DxfUnit, 'unknown'>;

function StartStep() {
  const t = useStudioT();
  const s = t.start;
  const studio = useStudio();
  const fileRef = useRef<HTMLInputElement>(null);
  const [drawing, setDrawing] = useState<DxfDrawing | null>(null);
  const [file, setFile] = useState('');
  const [layer, setLayer] = useState('');
  const [unit, setUnit] = useState<Unit>('mm');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(studio.name);
  const [city, setCity] = useState(studio.design.city);

  const layers = useMemo(() => (drawing ? layerSummary(drawing).filter((l) => l.closed > 0) : []), [drawing]);
  const spaces = useMemo(() => (drawing && layer ? spacesFromDrawing(drawing, layer, unit) : []), [drawing, layer, unit]);

  const read = (bytes: Uint8Array, fileName: string) => {
    const d = parseDxf(decodeDxf(bytes));
    const candidates = layerSummary(d).filter((l) => l.closed > 0);
    if (!candidates.length) throw new Error('none');
    setDrawing(d);
    setFile(fileName);
    setLayer(candidates[0].name);
    setUnit(d.units !== 'unknown' ? d.units : (likelyUnit(d, candidates[0].name) ?? 'mm'));
  };

  const pick = async (f: File) => {
    setError(null);
    if (/\.dwg$/i.test(f.name)) return setError(s.dwg);
    if (!/\.dxf$/i.test(f.name)) return setError(s.notDxf);
    setBusy(true);
    try {
      read(new Uint8Array(await f.arrayBuffer()), f.name);
    } catch {
      setError(s.notDxf);
    } finally {
      setBusy(false);
    }
  };

  const loadDemo = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}samples/restaurant-demo.dxf`);
      read(new Uint8Array(await res.arrayBuffer()), 'restaurant-demo.dxf');
      if (!name) setName('מסעדה — הדגמה');
      if (!city) setCity('תל אביב-יפו');
    } catch {
      setError(s.notDxf);
    } finally {
      setBusy(false);
    }
  };

  const use = () => {
    if (studio.spaces.length && !confirm(s.replace)) return;
    studio.loadSpaces(spaces, file);
    studio.setName(name.trim());
    studio.setCity(city.trim());
    go('building');
  };

  return (
    <div className="max-w-3xl space-y-5">
      <p className="text-body text-muted">{s.intro}</p>
      {studio.fileName && <p className="rounded-lg bg-ok-soft px-3 py-2 text-small">{s.loaded(studio.fileName)}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? s.reading : s.choose}
        </Button>
        <Button onClick={loadDemo} disabled={busy}>
          {s.demo}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".dxf,.dwg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void pick(f);
          }}
        />
      </div>
      <p className="text-caption text-muted">{s.demoNote}</p>
      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-small text-bad">
          {error}
        </p>
      )}
      {drawing && (
        <div className="space-y-4 rounded-xl border border-line bg-panel p-4">
          <p className="text-small text-muted" dir="ltr">
            {file}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-small font-medium">{s.layer}</span>
              <select className={inputClass} value={layer} onChange={(e) => setLayer(e.target.value)}>
                {layers.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name} ({l.closed})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-small font-medium">{s.unit}</span>
              <select className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                {(['mm', 'cm', 'm'] as const).map((u) => (
                  <option key={u} value={u}>
                    {s.units[u]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-small font-medium">{s.name}</span>
              <input className={inputClass} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-small font-medium">{s.city}</span>
              <input className={inputClass} value={city} maxLength={60} onChange={(e) => setCity(e.target.value)} />
              <span className="mt-1 block text-caption text-muted">{s.cityHint}</span>
            </label>
          </div>
          <p className="text-small font-medium">{spaces.length ? s.found(spaces.length) : s.none}</p>
          <Button variant="primary" disabled={!spaces.length} onClick={use}>
            {s.use}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ building */

function BuildingStep() {
  const t = useStudioT();
  const b = t.building;
  const he = useUi((st) => st.locale) === 'he';
  const studio = useStudio();
  const [ceiling, setCeiling] = useState(studio.design.ceilingMm != null ? String(studio.design.ceilingMm / 10) : '');
  if (!studio.spaces.length) return <p className="text-body text-muted">{b.empty}</p>;
  const fmt = (n: number) => n.toLocaleString(he ? 'he-IL' : 'en-GB', { maximumFractionDigits: 1 });

  return (
    <div className="max-w-3xl space-y-5">
      <p className="text-body text-muted">{b.intro}</p>
      <label className="block max-w-xs">
        <span className="mb-1 block text-small font-medium">{b.ceiling}</span>
        <input
          className={inputClass}
          inputMode="numeric"
          value={ceiling}
          placeholder={b.ceilingUnknown}
          onChange={(e) => setCeiling(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={() => studio.setCeiling(ceiling ? Number(ceiling) * 10 : null)}
        />
      </label>
      <ul className="space-y-2">
        {studio.spaces.map((sp) => (
          <li key={sp.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2">
            <input className={`${inlineInput} h-9 min-w-0 flex-1 basis-40`} aria-label={b.name} value={sp.name} maxLength={60} onChange={(e) => studio.patchSpace(sp.id, { name: e.target.value })} />
            <select className={`${inlineInput} h-9 w-36`} aria-label={b.use} value={sp.use} onChange={(e) => studio.patchSpace(sp.id, { use: e.target.value as SpaceUse })}>
              {(Object.keys(b.uses) as SpaceUse[]).map((u) => (
                <option key={u} value={u}>
                  {b.uses[u]}
                </option>
              ))}
            </select>
            <span className="text-small tabular-nums">{b.area(fmt(sp.areaM2))}</span>
            <span className="text-small text-muted">{b.fixtures(FIXTURES[sp.use].length)}</span>
          </li>
        ))}
      </ul>
      <Button variant="primary" onClick={() => go('plan')}>
        {b.next}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ the main screen */

function SourceChips({ ids }: { ids: CitationId[] }) {
  const s = useStudioT().plan;
  const he = useUi((st) => st.locale) === 'he';
  if (!ids.length) return <p className="text-small text-muted">{s.noSource}</p>;
  return (
    <ul className="space-y-2">
      {ids.map((id) => {
        const c = CITATIONS[id];
        return (
          <li key={id} className="rounded-lg border border-line p-2 text-small">
            <p>{he ? c.he : c.en}</p>
            <p className="mt-1 text-caption text-muted">{c.where}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-caption">
              <span className={`rounded px-1.5 py-0.5 ${c.status === 'verified' ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>{c.status === 'verified' ? s.verified : s.unverified}</span>
              {c.foreign && <span className="rounded bg-unknown-soft px-1.5 py-0.5">{s.foreign}</span>}
              {c.city && <span className="rounded bg-unknown-soft px-1.5 py-0.5">{s.city(c.city)}</span>}
              <a href={c.url} target="_blank" rel="noreferrer" className="text-accent-ink underline underline-offset-2">
                {s.openCard}
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ManualField({ label, unit, value, onSave }: { label: string; unit: string; value: Manual | null; onSave: (v: Manual | null) => void }) {
  const s = useStudioT().plan;
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(value ? String(value.value) : '');
  const [source, setSource] = useState(value?.source ?? '');
  const [error, setError] = useState(false);
  return (
    <div className="rounded-lg border border-line p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-small font-medium">{label}</span>
        {value ? (
          <span className="text-small tabular-nums">
            <bdi>
              {value.value} {unit}
            </bdi>
          </span>
        ) : (
          <span className="rounded bg-unknown-soft px-1.5 py-0.5 text-caption">{s.missing}</span>
        )}
      </div>
      {value && !editing && <p className="mt-1 text-caption text-muted">{value.source}</p>}
      {editing ? (
        <div className="mt-2 space-y-2">
          <input className={`${inputClass} h-9`} inputMode="decimal" aria-label={label} value={num} onChange={(e) => setNum(e.target.value.replace(/[^\d.]/g, ''))} />
          <input className={`${inputClass} h-9`} aria-label={s.source} placeholder={s.sourceHint} value={source} maxLength={120} onChange={(e) => (setSource(e.target.value), setError(false))} />
          {error && <p className="text-caption text-bad">{s.needSource}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const v = Number(num);
                if (!source.trim()) return setError(true);
                if (!Number.isFinite(v) || v <= 0) return;
                onSave({ value: v, source: source.trim() });
                setEditing(false);
              }}
            >
              {s.save}
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>
              {s.cancel}
            </Button>
            {value && (
              <Button size="sm" onClick={() => (onSave(null), setEditing(false), setNum(''), setSource(''))}>
                {s.clear}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <button type="button" className="mt-1 text-caption text-accent-ink underline underline-offset-2" onClick={() => setEditing(true)}>
          {s.enter}
        </button>
      )}
    </div>
  );
}

function DesignValues() {
  const s = useStudioT().plan;
  const studio = useStudio();
  return (
    <section className="space-y-2">
      <h3 className="text-small font-semibold">{s.design}</h3>
      <ManualField label={s.slope} unit="%" value={studio.design.slopePct} onSave={(v) => studio.setManual('slopePct', v)} />
      <ManualField label={s.diameter} unit={s.mm} value={studio.design.diameterMm} onSave={(v) => studio.setManual('diameterMm', v)} />
    </section>
  );
}

function Inspector({ selected, elements, issues, onPickConnection }: { selected: string | null; elements: StudioElement[]; issues: StudioIssue[]; onPickConnection: () => void }) {
  const dict = useStudioT();
  const s = dict.plan;
  const he = useUi((st) => st.locale) === 'he';
  const studio = useStudio();
  const issue = selected?.startsWith('issue:') ? issues.find((i) => `issue:${i.id}` === selected) : undefined;
  const el = !issue && selected ? elements.find((e) => e.id === selected) : undefined;
  const proposed = elements.filter((e) => statusOf(studio, e.id) === 'proposed').map((e) => e.id);

  if (issue) {
    const acked = studio.acknowledged.includes(issue.id);
    return (
      <div className="space-y-3">
        <p className="text-caption font-semibold text-muted">{s.severity[issue.severity]}</p>
        <p className="text-body font-semibold">{he ? issue.he : issue.en}</p>
        <p className="text-small">{he ? issue.fixHe : issue.fixEn}</p>
        {issue.citations.length > 0 && (
          <>
            <h3 className="text-small font-semibold">{s.sources}</h3>
            <SourceChips ids={issue.citations} />
          </>
        )}
        {issue.id === 'source_slope_diameter' && <DesignValues />}
        {issue.id === 'connection_assumed' && (
          <Button size="sm" onClick={onPickConnection}>
            {s.markConnection}
          </Button>
        )}
        {issue.severity !== 'blocking' &&
          (acked ? (
            <p className="text-small text-ok">{s.acknowledged}</p>
          ) : (
            <Button size="sm" onClick={() => studio.acknowledge(issue.id)}>
              {s.acknowledge}
            </Button>
          ))}
        {issue.kind === 'field' && (
          <Button size="sm" onClick={() => studio.removeMark(issue.id.replace(/^mark_/, ''))}>
            {dict.field.remove}
          </Button>
        )}
      </div>
    );
  }

  if (el) {
    const st = statusOf(studio, el.id);
    const space = studio.spaces.find((sp) => sp.id === el.spaceId);
    const isRun = el.kind === 'drain_run' || el.kind === 'water_run';
    return (
      <div className="space-y-3">
        <div>
          <p className="text-body font-semibold">{he ? KIND_LABEL[el.kind].he : KIND_LABEL[el.kind].en}</p>
          {space && <p className="text-small text-muted">{space.name}</p>}
        </div>
        <p className="text-small">
          <span className="rounded bg-sunken px-1.5 py-0.5">{s.status[st]}</span>
          {isRun && <span className="ms-2 tabular-nums">{s.length((Math.round(runLengthM(el.points) * 10) / 10).toString())}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {st !== 'accepted' && (
            <Button size="sm" variant="primary" onClick={() => studio.setStatus([el.id], 'accepted')}>
              {s.accept}
            </Button>
          )}
          {st !== 'rejected' && (
            <Button size="sm" onClick={() => studio.setStatus([el.id], 'rejected')}>
              {s.reject}
            </Button>
          )}
          {st !== 'proposed' && (
            <Button size="sm" onClick={() => studio.setStatus([el.id], 'proposed')}>
              {s.reopen}
            </Button>
          )}
        </div>
        {el.kind === 'drain_run' && <DesignValues />}
        {el.kind === 'sewer_connection' && (
          <div className="space-y-2">
            <p className="text-small">
              {s.connection}: {studio.design.connection ? s.marked : s.assumed}
            </p>
            <Button size="sm" onClick={onPickConnection}>
              {s.markConnection}
            </Button>
          </div>
        )}
        <h3 className="text-small font-semibold">{s.sources}</h3>
        <SourceChips ids={el.citations} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-small text-muted">{s.pick}</p>
      {proposed.length > 0 && (
        <Button size="sm" onClick={() => studio.setStatus(proposed, 'accepted')}>
          {s.acceptLayer(proposed.length)}
        </Button>
      )}
      <DesignValues />
    </div>
  );
}

function IssueList({ issues, selected, onSelect }: { issues: StudioIssue[]; selected: string | null; onSelect: (id: string) => void }) {
  const s = useStudioT().plan;
  const he = useUi((st) => st.locale) === 'he';
  const studio = useStudio();
  const order = { blocking: 0, warning: 1, info: 2 };
  const sorted = [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
  const tone = { blocking: 'border-bad text-bad', warning: 'border-warn', info: 'border-line' } as const;
  if (!issues.length) return <p className="text-small text-muted">{s.noIssues}</p>;
  return (
    <ul className="space-y-2">
      {sorted.map((i) => {
        const acked = i.severity !== 'blocking' && studio.acknowledged.includes(i.id);
        return (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => onSelect(`issue:${i.id}`)}
              className={`w-full rounded-lg border bg-panel p-2 text-start text-small hover:bg-sunken ${tone[i.severity]} ${selected === `issue:${i.id}` ? 'ring-2 ring-accent/40' : ''} ${acked ? 'opacity-60' : ''}`}
            >
              <span className="block text-caption font-semibold">
                {s.severity[i.severity]}
                {acked ? ` · ${s.acknowledged}` : ''}
              </span>
              <span className="block text-ink">{he ? i.he : i.en}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PlanStep({ auth }: { auth: AuthState }) {
  const t = useStudioT();
  const s = t.plan;
  const he = useUi((st) => st.locale) === 'he';
  const { project, elements, issues } = useDesign();
  const studio = useStudio();
  const [selected, setSelected] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [visible, setVisible] = useState<Visible>({ architecture: true, drainage: true, water: true, marks: true });
  const [approver, setApprover] = useState(auth.session?.user.email?.split('@')[0] ?? '');
  if (!project.spaces.length) return <p className="text-body text-muted">{t.building.empty}</p>;

  const check = approvalCheck(project, elements, issues);
  const approval = currentApproval(project);
  const open = openIssues(project, issues).length;
  const selIssue = selected?.startsWith('issue:') ? issues.find((i) => `issue:${i.id}` === selected) : undefined;
  const state = approval ? s.state.approved : project.approvals.length ? s.state.changed : s.state.proposed;
  const when = (ms: number) => new Date(ms).toLocaleString(he ? 'he-IL' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-small">
        <span className="text-muted">{s.disciplines}:</span>
        <span className={`rounded-lg px-2 py-1 ${approval ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
          {s.plumbing} · {state}
        </span>
        {[s.electrical, s.gas, s.hvac].map((d) => (
          <span key={d} className="rounded-lg bg-unknown-soft px-2 py-1 text-muted">
            {d} · {s.notInDemo}
          </span>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="order-2 space-y-2 lg:order-none" aria-label={s.issues}>
          <h2 className="text-body font-semibold">{s.issues}</h2>
          <IssueList issues={issues} selected={selected} onSelect={setSelected} />
        </aside>

        <div className="order-1 space-y-2 lg:order-none">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-small">
            <span className="text-muted">{s.layers}:</span>
            {(['architecture', 'drainage', 'water', 'marks'] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" className="h-5 w-5 accent-[var(--color-accent)]" checked={visible[k]} onChange={(e) => setVisible((v) => ({ ...v, [k]: e.target.checked }))} />
                {k === 'drainage' || k === 'water' ? <span className="inline-block h-1 w-5 rounded" style={{ background: LAYER_COLOR[k as Layer] }} aria-hidden /> : null}
                {s.layer[k]}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-caption text-muted">
            <span>— — {s.legend.proposed}</span>
            <span>——— {s.legend.accepted}</span>
            <span>· · · {s.legend.rejected}</span>
            <span>◯ {s.legend.issue}</span>
          </div>
          {picking && (
            <p role="status" className="flex items-center justify-between gap-2 rounded-lg bg-accent-soft px-3 py-2 text-small">
              {s.markingHint}
              <Button size="sm" onClick={() => setPicking(false)}>
                {s.cancel}
              </Button>
            </p>
          )}
          <PlanCanvas
            className="h-[52vh] min-h-[320px] lg:h-[calc(100vh-360px)]"
            project={project}
            elements={elements}
            issues={issues}
            marks={project.marks}
            visible={visible}
            selected={selected}
            highlighted={selIssue?.elementIds ?? []}
            picking={picking}
            onPick={(at: Pt) => {
              studio.setConnection(at);
              setPicking(false);
              setSelected('sewer_connection');
            }}
            onSelect={setSelected}
          />
        </div>

        <aside className="order-3 rounded-xl border border-line bg-panel p-3 lg:order-none" aria-label={s.inspector}>
          <h2 className="mb-2 text-body font-semibold">{s.inspector}</h2>
          <Inspector selected={selected} elements={elements} issues={issues} onPickConnection={() => setPicking(true)} />
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
        <span className="text-small">
          {s.plumbing}: {s.summary(elements.length, open, check.undecided)}
        </span>
        <span className="flex-1" />
        {approval ? (
          <span className="text-small text-ok">{s.approvedBy(approval.by, when(approval.at))}</span>
        ) : (
          <>
            {!check.ok && <span className="text-small text-muted">{s.blocked(check.blocking, check.unacknowledged, check.undecided)}</span>}
            <input className={`${inlineInput} h-9 w-40`} aria-label={s.approver} placeholder={s.approver} value={approver} maxLength={60} onChange={(e) => setApprover(e.target.value)} />
            <Button variant="primary" disabled={!check.ok || !approver.trim()} onClick={() => studio.approve(approver.trim())}>
              {s.approve}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ site */

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);
  return online;
}

function FieldStep() {
  const t = useStudioT();
  const f = t.field;
  const he = useUi((st) => st.locale) === 'he';
  const { project, elements } = useDesign();
  const studio = useStudio();
  const online = useOnline();
  const [placing, setPlacing] = useState(false);
  const [at, setAt] = useState<Pt | null>(null);
  const [category, setCategory] = useState<MarkCategory>('obstacle');
  const [note, setNote] = useState('');
  if (!elements.length) return <p className="text-body text-muted">{f.empty}</p>;

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{f.title}</h2>
        <p className="text-small text-muted">{f.intro}</p>
      </div>
      <p role="status" className={`rounded-lg px-3 py-2 text-small ${online ? 'bg-ok-soft' : 'bg-warn-soft'}`}>
        {online ? f.online : f.offline}
      </p>
      {placing && !at && <p className="rounded-lg bg-accent-soft px-3 py-2 text-small">{f.tap}</p>}
      <PlanCanvas
        className="h-[55vh] min-h-[300px]"
        project={project}
        elements={elements.filter((e) => statusOf(project, e.id) !== 'rejected')}
        issues={[]}
        marks={project.marks}
        visible={{ architecture: true, drainage: true, water: true, marks: true }}
        selected={null}
        highlighted={[]}
        picking={placing && !at}
        onPick={(p) => setAt(p)}
      />
      {!placing ? (
        <Button variant="primary" size="lg" className="w-full" onClick={() => setPlacing(true)}>
          {f.add}
        </Button>
      ) : at ? (
        <div className="space-y-3 rounded-xl border border-line bg-panel p-3">
          <p className="text-small font-medium">{f.category}</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(MARK_LABEL) as MarkCategory[]).map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} className={`min-h-11 rounded-lg border px-3 text-body ${category === c ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                {he ? MARK_LABEL[c].he : MARK_LABEL[c].en}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-small font-medium">{f.note}</span>
            <input className={inputClass} value={note} placeholder={f.notePlaceholder} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                studio.addMark({ at, category, note: note.trim() });
                setPlacing(false);
                setAt(null);
                setNote('');
              }}
            >
              {f.save}
            </Button>
            <Button size="lg" onClick={() => (setPlacing(false), setAt(null))}>
              {f.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="lg" className="w-full" onClick={() => setPlacing(false)}>
          {f.cancel}
        </Button>
      )}
      <section>
        <h3 className="mb-2 text-body font-semibold">{f.marks}</h3>
        {project.marks.length === 0 ? (
          <p className="text-small text-muted">{f.none}</p>
        ) : (
          <ul className="space-y-2">
            {project.marks.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-small">
                <span className="flex-1">
                  {he ? MARK_LABEL[m.category].he : MARK_LABEL[m.category].en}
                  {m.note ? ` — ${m.note}` : ''}
                </span>
                <Button size="sm" onClick={() => studio.removeMark(m.id)}>
                  {f.remove}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-caption text-muted">{f.sync}</p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ outputs */

function OutputsStep() {
  const t = useStudioT();
  const o = t.outputs;
  const locale = useUi((st) => st.locale);
  const { project, elements, issues } = useDesign();
  const approval = currentApproval(project);
  const sheet = useMemo(() => planSheet(project, elements, locale), [project, elements, locale]);
  const preview = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sheet.svg)}`, [sheet]);
  const [making, setMaking] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  if (!project.spaces.length) return <p className="text-body text-muted">{t.building.empty}</p>;
  const accepted = elements.filter((e) => statusOf(project, e.id) === 'accepted').length;
  const base = project.name || 'studio';

  return (
    <div className="max-w-4xl space-y-4">
      <p className={`rounded-lg px-3 py-2 text-small ${approval ? 'bg-ok-soft' : 'bg-warn-soft'}`}>{approval ? o.approved(approval.by) : o.notApproved}</p>
      <section className="space-y-2 rounded-xl border border-line bg-panel p-4">
        <Button variant="primary" onClick={() => void downloadWorkbook(`${project.name || 'studio'}-plumbing.xlsx`, [studioBill(project, elements, locale)], locale === 'he')}>
          {o.bill}
        </Button>
        <p className="text-small text-muted">{o.billNote}</p>
      </section>
      <section className="space-y-3 rounded-xl border border-line bg-panel p-4">
        <h2 className="text-body font-semibold">{o.drawing}</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => downloadText(`${base}-plumbing.dxf`, planDxf(project, elements, locale), 'application/dxf')}>{o.dxf}</Button>
          <Button
            disabled={making}
            onClick={async () => {
              setMaking(true);
              setPdfFailed(false);
              try {
                await downloadSheetPdf(sheet.svg, 420, 297, `${base}-plumbing.pdf`);
              } catch {
                setPdfFailed(true);
              } finally {
                setMaking(false);
              }
            }}
          >
            {making ? o.making : o.pdf}
          </Button>
        </div>
        {pdfFailed && (
          <p role="alert" className="text-small text-bad">
            {o.pdfFailed}
          </p>
        )}
        <p className="text-small text-muted">{o.drawingNote(sheet.scale)}</p>
        <img src={preview} alt={o.preview} className="w-full rounded-lg border border-line bg-white" />
      </section>
      <section className="space-y-2 rounded-xl border border-line bg-panel p-4">
        <h2 className="text-body font-semibold">{o.report}</h2>
        <p className="text-small">{project.name}</p>
        <ul className="list-disc space-y-1 ps-5 text-small">
          <li>{o.spaces(project.spaces.length)}</li>
          <li>{o.accepted(accepted)}</li>
          <li>{o.open(openIssues(project, issues).length)}</li>
        </ul>
        <p className="text-caption text-muted">{locale === 'he' ? STUDIO_DRAFT.he : STUDIO_DRAFT.en}</p>
        <Button size="sm" className="no-print" onClick={() => window.print()}>
          {o.print}
        </Button>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export function StudioPage({ auth, step }: { auth: AuthState; step: StudioStep }) {
  const t = useStudioT();
  const reset = useStudio((s) => s.reset);
  const saveFailed = useStudio((s) => s.saveFailed);
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <AppHeader auth={auth} />
      <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-4 px-3 py-4 sm:px-6">
        <div className="no-print flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">{t.title}</h1>
          <span className="rounded bg-accent-soft px-2 py-0.5 text-caption font-semibold text-accent-ink">{t.badge}</span>
          <nav className="flex flex-wrap gap-1" aria-label={t.title}>
            {STUDIO_STEPS.map((st) => (
              <a key={st} href={`#/studio/${st}`} aria-current={st === step ? 'page' : undefined} className={buttonClass(st === step ? 'primary' : 'secondary', 'sm')}>
                {t.steps[st]}
              </a>
            ))}
          </nav>
          <span className="flex-1" />
          <Button size="sm" onClick={() => confirm(t.resetConfirm) && (reset(), go('start'))}>
            {t.reset}
          </Button>
        </div>
        <p className="no-print rounded-lg bg-warn-soft px-3 py-2 text-small">{t.demo}</p>
        {saveFailed && (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-small text-bad">
            {t.saveFailed}
          </p>
        )}
        {step === 'start' && <StartStep />}
        {step === 'building' && <BuildingStep />}
        {step === 'plan' && <PlanStep auth={auth} />}
        {step === 'field' && <FieldStep />}
        {step === 'outputs' && <OutputsStep />}
      </main>
    </div>
  );
}

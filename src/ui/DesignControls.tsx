import { useMemo, useState } from 'react';
import { allMaterials, buildModel, finishName, getMaterial, materialName, productDescription, productTitle, supplierProductFor, type Check, type ComponentRole, type DesignResult, type EdgeOption, type FinishSpec, type LoadDistribution, type Material, type OpenShelfParams, type ParamsPatch, type ShelfLoad, type Status } from '../engine';
import { useT } from '../i18n';
import { useDesign } from '../state/designStore';
import { useUi } from '../state/uiStore';
import type { Locale } from '../state/uiStore';
import { Chip, Field, STATUS_SEVERITY, SearchField, Section, StatusIcon, Stepper, UnitInput, inputClass, matchesQuery } from './common';
import { IssuesList, openIssues } from './Issues';
import { IconChevron } from './icons';
import { componentDims, formatCm } from './measure';
import { GROUP_TITLES, TemplateFields, fieldsFor, type FieldGroup } from './TemplateFields';

export type LoadPresetId = 'books' | 'decor' | 'heavy';

export const LOAD_PRESETS: Record<LoadPresetId, Omit<ShelfLoad, 'label'>> = {
  books: { massKg: 20, distribution: 'uniform' },
  decor: { massKg: 8, distribution: 'uniform' },
  heavy: { massKg: 20, distribution: 'point_center' },
};

const PRESET_LABEL_HE: Record<LoadPresetId, string> = { books: 'ספרים', decor: 'חפצי נוי', heavy: 'פריט כבד במרכז' };

export function presetOf(load: ShelfLoad): LoadPresetId | null {
  return (Object.keys(LOAD_PRESETS) as LoadPresetId[]).find((k) => LOAD_PRESETS[k].massKg === load.massKg && LOAD_PRESETS[k].distribution === load.distribution) ?? null;
}

export function loadFor(id: LoadPresetId): ShelfLoad {
  return { label: PRESET_LABEL_HE[id], ...LOAD_PRESETS[id] };
}

function useSetter() {
  const update = useDesign((s) => s.update);
  return <K extends keyof ParamsPatch>(key: K, value: ParamsPatch[K]) => update({ [key]: value } as ParamsPatch, key);
}

function engineeringBadge(m: Material): 'none' | 'borrowed' | 'sourced' {
  if (!m.properties.length) return 'none';
  if (m.equivalence && !m.equivalence.confirmed) return 'borrowed';
  return 'sourced';
}

const BADGE_CLASS = { none: 'bg-unknown-soft text-unknown', borrowed: 'bg-warn-soft text-warn', sourced: 'bg-ok-soft text-ok' };

export function DimensionFields({ result }: { result: DesignResult }) {
  const t = useT();
  const params = useDesign((s) => s.params);
  const set = useSetter();
  const actual = result.model.overall;
  if (params.template !== 'open_shelf') return null;
  const p = params;
  const fields: { key: 'widthMm' | 'heightMm' | 'depthMm'; label: string; built: number; min: number; max: number }[] = [
    { key: 'widthMm', label: t.dims.width, built: actual.x, min: 20, max: 240 },
    { key: 'heightMm', label: t.dims.height, built: actual.y, min: 20, max: 240 },
    { key: 'depthMm', label: t.dims.depth, built: actual.z, min: 15, max: 80 },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {fields.map((f) => (
        <Field key={f.key} label={f.label}>
          <UnitInput ariaLabel={f.label} value={p[f.key]} scale={10} unit={t.common.cm} min={f.min} max={f.max} onChange={(v) => set(f.key, v)} />
          <span className="mt-1 block min-h-5 text-[13px] text-warn">{Math.abs(p[f.key] - f.built) >= 1 ? t.setup.willBuild(formatCm(f.built)) : ''}</span>
        </Field>
      ))}
    </div>
  );
}

/** Fixed (screwed) vs adjustable (32 mm line-bored supports) shelves — a construction choice asked with the shelf count. */
export function ShelfMountingCards() {
  const t = useT();
  const params = useDesign((s) => s.params);
  const update = useDesign((s) => s.update);
  if (params.template !== 'open_shelf') return null;
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t.setup.mounting}>
      {(['fixed', 'pins'] as const).map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={params.shelfMounting === id}
          disabled={params.shelfCount === 0}
          onClick={() => update({ shelfMounting: id })}
          className={`flex min-h-[72px] flex-col justify-center gap-0.5 rounded-xl px-4 py-3 text-start transition disabled:opacity-50 ${params.shelfMounting === id ? 'bg-accent-soft ring-2 ring-accent' : 'bg-panel ring-1 ring-line-strong hover:bg-sunken'}`}
        >
          <span className="text-base font-semibold">{t.setup.mountings[id].name}</span>
          <span className="text-[13px] text-muted">{t.setup.mountings[id].desc}</span>
        </button>
      ))}
    </div>
  );
}

export function LoadCards() {
  const t = useT();
  const params = useDesign((s) => s.params);
  const update = useDesign((s) => s.update);
  if (params.template !== 'open_shelf') return null;
  const current = presetOf(params.loadPerShelf);
  return (
    <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label={t.setup.whatOn}>
      {(Object.keys(LOAD_PRESETS) as LoadPresetId[]).map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={current === id}
          onClick={() => update({ loadPerShelf: loadFor(id) })}
          className={`flex min-h-[76px] flex-col justify-center gap-0.5 rounded-xl px-4 py-3 text-start transition ${current === id ? 'bg-accent-soft ring-2 ring-accent' : 'bg-panel ring-1 ring-line-strong hover:bg-sunken'}`}
        >
          <span className="text-base font-semibold">{t.setup.loads[id].name}</span>
          <span className="text-[13px] text-muted">{t.setup.loads[id].desc}</span>
        </button>
      ))}
    </div>
  );
}

function BoardPicker() {
  const t = useT();
  const locale = useUi((s) => s.locale) as Locale;
  const p = useDesign((s) => s.params);
  const update = useDesign((s) => s.update);
  const boards = useMemo(() => allMaterials().filter((m) => m.supplier?.role === 'board'), []);
  const [query, setQuery] = useState('');
  const visible = boards.filter((m) => {
    const sp = supplierProductFor(m)!;
    return matchesQuery(query, productTitle(sp.product, locale), `${sp.product.thicknessMm}`, ...sp.product.finishes.map((f) => finishName(f, locale)));
  });

  const chooseBoard = (m: Material) => {
    const sp = supplierProductFor(m)!;
    update({
      materialId: m.id,
      thicknessMm: sp.product.thicknessMm,
      finishId: sp.product.finishes.some((f) => f.id === p.finishId) ? p.finishId : sp.product.finishes[0].id,
      edgeOption: sp.product.edgeBanding ? p.edgeOption : 'none',
      // Part decors belong to a board product; keep only those the new board also comes in.
      roleFinishes: Object.fromEntries(Object.entries(p.roleFinishes ?? {}).filter(([, f]) => sp.product.finishes.some((x) => x.id === f))),
      partFinishes: Object.fromEntries(Object.entries(p.partFinishes ?? {}).filter(([, f]) => sp.product.finishes.some((x) => x.id === f))),
    });
  };

  return (
    <div className="space-y-2">
    <SearchField value={query} onChange={setQuery} placeholder={t.search.boards} />
    {query && <p className="text-[13px] text-muted">{visible.length ? t.search.showing(visible.length, boards.length) : t.search.noMatches}</p>}
    <div className="max-h-[360px] space-y-1.5 overflow-y-auto p-0.5" role="radiogroup" aria-label={t.structure.board}>
      {visible.map((m) => {
        const sp = supplierProductFor(m)!;
        const badge = engineeringBadge(m);
        const minPrice = Math.min(...sp.product.finishes.map((f) => f.pricePerSqm));
        const selected = m.id === p.materialId;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => chooseBoard(m)}
            className={`w-full rounded-lg px-3 py-2 text-start transition ${selected ? 'bg-accent-soft ring-2 ring-accent' : 'bg-panel ring-1 ring-line hover:bg-sunken'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-medium">{productTitle(sp.product, locale)}</span>
              <span className="shrink-0 text-[13px] text-muted">
                <span className="num">₪{minPrice}</span> {t.structure.perSqm}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-xs ${BADGE_CLASS[badge]}`}>{t.structure.engBadge[badge]}</span>
              {sp.product.edgeBanding && <span className="rounded bg-sunken px-1.5 py-0.5 text-xs text-muted">{t.structure.edgeAvailable}</span>}
              <span className="flex gap-0.5">
                {sp.product.finishes.slice(0, 8).map((f) => (
                  <span key={f.id} title={finishName(f, locale)} className="h-3 w-3 rounded-full ring-1 ring-black/20" style={{ background: f.color }} />
                ))}
              </span>
            </div>
          </button>
        );
      })}
    </div>
    </div>
  );
}

function IssuesSection({ result }: { result: DesignResult }) {
  const t = useT();
  const issues = openIssues(result).filter((c) => c.status !== 'GREY');
  const hasRed = issues.some((c) => c.status === 'RED');
  if (!issues.length) return null;
  return (
    <Section
      id={hasRed ? 'issues-red' : 'issues'}
      title={t.issues.sectionTitle}
      count={issues.length}
      defaultOpen={hasRed}
      summary={hasRed ? t.viewport.fixes(issues.filter((c) => c.status === 'RED').length) : t.issues.notesOnlySummary}
    >
      <IssuesList checks={issues} muted={!hasRed} />
    </Section>
  );
}

/** Structure panel for templates described by a field schema (beds, tables, chairs, pull-up station). */
function SchemaStructureControls({ result }: { result: DesignResult }) {
  const t = useT();
  const locale = useUi((s) => s.locale) as Locale;
  const p = useDesign((s) => s.params);
  const cm = formatCm;
  const board = supplierProductFor(getMaterial(p.materialId));
  const groups: FieldGroup[] = ['size', 'use', 'build', 'safety'];
  return (
    <div>
      <IssuesSection result={result} />
      {groups
        .filter((g) => fieldsFor(p, [g]).length > 0)
        .map((g) => (
          <Section
            key={g}
            id={`${p.template}-${g}`}
            title={GROUP_TITLES[g][locale]}
            defaultOpen={g === 'size' || g === 'build'}
            summary={g === 'size' ? <span className="num">{cm(result.model.overall.x)} × {cm(result.model.overall.y)} × {cm(result.model.overall.z)}</span> : undefined}
          >
            <TemplateFields groups={[g]} />
          </Section>
        ))}
      <Section id="board" title={t.structure.board} defaultOpen={false} summary={board ? productTitle(board.product, locale) : undefined}>
        <BoardPicker />
      </Section>
    </div>
  );
}

export function StructureControls({ result }: { result: DesignResult }) {
  const params = useDesign((s) => s.params);
  if (params.template !== 'open_shelf') return <SchemaStructureControls result={result} />;
  return <ShelfStructureControls result={result} p={params} />;
}

function ShelfStructureControls({ result, p }: { result: DesignResult; p: OpenShelfParams }) {
  const t = useT();
  const locale = useUi((s) => s.locale) as Locale;
  const update = useDesign((s) => s.update);
  const set = useSetter();
  const load = p.loadPerShelf;
  const cm = formatCm;
  const board = supplierProductFor(getMaterial(p.materialId));
  const preset = presetOf(load);
  return (
    <div>
      <IssuesSection result={result} />
      <Section id="dims" title={t.structure.dims} summary={<span className="num">{cm(result.model.overall.x)} × {cm(result.model.overall.y)} × {cm(result.model.overall.z)}</span>}>
        <DimensionFields result={result} />
      </Section>
      <Section id="division" title={t.structure.division} summary={`${t.setup.shelvesCount(p.shelfCount)}${p.shelfCount && p.shelfMounting === 'pins' ? ` (${t.setup.mountings.pins.name})` : ''} · ${t.setup.dividersCount(p.dividerCount)}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px]">{t.structure.shelves}</span>
          <Stepper label={t.structure.shelves} value={p.shelfCount} min={0} max={12} onChange={(v) => set('shelfCount', v)} format={(v) => String(v)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px]">{t.structure.dividers}</span>
          <Stepper label={t.structure.dividers} value={p.dividerCount} min={0} max={6} onChange={(v) => set('dividerCount', v)} format={(v) => String(v)} />
        </div>
        {p.shelfCount > 0 && <ShelfMountingCards />}
        <label className="flex min-h-10 items-center gap-3 text-[15px]">
          <input type="checkbox" checked={p.doors === 'hinged'} onChange={(e) => update({ doors: e.target.checked ? 'hinged' : 'none' })} className="h-5 w-5 accent-[var(--color-accent)]" />
          <span>
            {t.structure.doors}
            <span className="block text-[13px] text-muted">{t.structure.doorsHint}</span>
          </span>
        </label>
      </Section>
      <Section id="board" title={t.structure.board} defaultOpen={false} summary={board ? productTitle(board.product, locale) : undefined}>
        <BoardPicker />
      </Section>
      <Section id="load" title={t.structure.load} defaultOpen={false} summary={`${preset ? t.setup.loads[preset].name : ''} ${load.massKg} ${t.common.kg}`.trim()}>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LOAD_PRESETS) as LoadPresetId[]).map((id) => (
            <Chip key={id} selected={presetOf(load) === id} onClick={() => update({ loadPerShelf: loadFor(id) })}>
              {t.setup.loads[id].name}
            </Chip>
          ))}
        </div>
        <details className="group">
          <summary className="flex h-10 cursor-pointer list-none items-center gap-2 text-[15px] text-accent-ink">
            <IconChevron size={16} className="transition group-open:-rotate-90 ltr:rotate-180 ltr:group-open:rotate-90" />
            {t.structure.more}
          </summary>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.structure.customMass}>
                <UnitInput value={load.massKg} unit={t.common.kg} min={0} max={150} onChange={(v) => update({ loadPerShelf: { ...load, label: 'מותאם', massKg: v } }, 'load')} />
              </Field>
              <Field label={t.structure.distribution}>
                <select className={inputClass} value={load.distribution} onChange={(e) => update({ loadPerShelf: { ...load, label: 'מותאם', distribution: e.target.value as LoadDistribution } })}>
                  <option value="uniform">{t.structure.uniform}</option>
                  <option value="point_center">{t.structure.point}</option>
                </select>
              </Field>
            </div>
            <Field label={t.structure.plinth} hint={t.structure.plinthHint}>
              <UnitInput value={p.plinthHeightMm} scale={10} unit={t.common.cm} min={0} max={20} onChange={(v) => set('plinthHeightMm', v)} />
            </Field>
            <label className="flex min-h-10 items-center gap-3 text-[15px]">
              <input type="checkbox" checked={p.hasBack} onChange={(e) => update({ hasBack: e.target.checked })} className="h-5 w-5 accent-[var(--color-accent)]" />
              <span>
                {t.structure.hasBack}
                <span className="block text-[13px] text-muted">{t.structure.hasBackHint}</span>
              </span>
            </label>
          </div>
        </details>
      </Section>
    </div>
  );
}

/** Tier 1 of per-part color: one decor per part type, all from the same board product. */
function RoleDecors() {
  const t = useT();
  const locale = useUi((s) => s.locale) as Locale;
  const p = useDesign((s) => s.params);
  const update = useDesign((s) => s.update);
  const body = supplierProductFor(getMaterial(p.materialId));
  const roles = useMemo(() => [...new Set(buildModel(p).components.filter((c) => !c.reference && c.role !== 'back').map((c) => c.role))], [p]);
  if (!body) return null;
  const custom = Object.keys(p.roleFinishes ?? {}).length;
  const setRole = (role: ComponentRole, finishId: string) => {
    const next = { ...(p.roleFinishes ?? {}) };
    if (finishId) next[role] = finishId;
    else delete next[role];
    update({ roleFinishes: next });
  };
  return (
    <Section id="role-decors" title={t.look.byRole} defaultOpen={false} summary={custom ? t.look.customized(custom) : t.look.sameAsBody}>
      <p className="text-[13px] leading-snug text-muted">{t.look.byRoleHint}</p>
      {roles.map((role) => {
        const value = p.roleFinishes?.[role] ?? '';
        const color = body.product.finishes.find((f) => f.id === (value || p.finishId))?.color;
        return (
          <div key={role} className="flex items-center gap-3">
            <span className="h-5 w-5 shrink-0 rounded-full ring-1 ring-black/25" style={{ background: color }} />
            <span className="w-28 shrink-0 text-[15px]">{t.viewport.roles[role]}</span>
            <select aria-label={t.viewport.roles[role]} className={inputClass} value={value} onChange={(e) => setRole(role, e.target.value)}>
              <option value="">{t.look.sameAsBody}</option>
              {body.product.finishes.map((f) => (
                <option key={f.id} value={f.id}>
                  {finishName(f, locale)}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      {(custom > 0 || Object.keys(p.partFinishes ?? {}).length > 0) && (
        <button type="button" onClick={() => update({ roleFinishes: {}, partFinishes: {} })} className="self-start text-[13px] font-medium text-accent-ink underline underline-offset-2">
          {t.look.resetParts}
        </button>
      )}
    </Section>
  );
}

export function LookControls() {
  const t = useT();
  const locale = useUi((s) => s.locale) as Locale;
  const p = useDesign((s) => s.params);
  const update = useDesign((s) => s.update);
  const body = supplierProductFor(getMaterial(p.materialId));
  const backs = useMemo(() => allMaterials().filter((m) => m.supplier?.role === 'back'), []);
  const back = p.template === 'open_shelf' ? supplierProductFor(getMaterial(p.backMaterialId)) : undefined;
  const setFinish = (patch: Partial<FinishSpec>) => update({ finish: { ...p.finish, ...patch } }, 'finish');
  const [decorQuery, setDecorQuery] = useState('');

  return (
    <div>
      {body && (
        <Section id="decor" title={t.look.decor} count={body.product.finishes.length} summary={(() => { const f = body.product.finishes.find((f) => f.id === p.finishId); return f && finishName(f, locale); })()}>
          <p className="text-[13px] leading-snug text-muted">{productDescription(body.product, locale)}</p>
          {body.product.finishes.length > 6 && <SearchField value={decorQuery} onChange={setDecorQuery} placeholder={t.search.decors} />}
          <div className="flex flex-wrap gap-2">
            {body.product.finishes.filter((f) => matchesQuery(decorQuery, finishName(f, locale))).map((f) => (
              <Chip key={f.id} selected={p.finishId === f.id} onClick={() => update({ finishId: f.id, finish: { ...p.finish, type: 'supplier' } })}>
                <span className="h-4 w-4 rounded-full ring-1 ring-black/25" style={{ background: f.color }} />
                {finishName(f, locale)}
                {f.pricePerSqm !== body.product.finishes[0].pricePerSqm && <span className="num text-xs opacity-80">₪{f.pricePerSqm}</span>}
              </Chip>
            ))}
          </div>
          <Field label={t.look.edges} hint={body.product.edgeBanding ? t.look.perMeter(body.product.edgeBanding.pricePerMeter) : t.look.edgesUnavailable}>
            <select className={inputClass} value={p.edgeOption} disabled={!body.product.edgeBanding} onChange={(e) => update({ edgeOption: e.target.value as EdgeOption })}>
              <option value="none">{t.look.edgesNone}</option>
              <option value="front">{t.look.edgesFront}</option>
              <option value="all">{t.look.edgesAll}</option>
            </select>
          </Field>
        </Section>
      )}

      {body && <RoleDecors />}

      {p.template === 'open_shelf' && p.hasBack && (
        <Section id="back" title={t.look.back} defaultOpen={false} summary={back ? productTitle(back.product, locale) : undefined}>
          <Field label={t.look.backBoard}>
            <select
              className={inputClass}
              value={p.backMaterialId}
              onChange={(e) => {
                const sp = supplierProductFor(getMaterial(e.target.value))!;
                update({ backMaterialId: e.target.value, backThicknessMm: sp.product.thicknessMm, backFinishId: sp.product.finishes[0].id });
              }}
            >
              {backs.map((m) => {
                const sp = supplierProductFor(m)!;
                return (
                  <option key={m.id} value={m.id}>
                    {productTitle(sp.product, locale)} · ₪{sp.product.finishes[0].pricePerSqm}
                    {t.structure.perSqm}
                  </option>
                );
              })}
            </select>
          </Field>
          {back && back.product.finishes.length > 1 && (
            <Field label={t.look.backDecor}>
              <select className={inputClass} value={p.backFinishId} onChange={(e) => update({ backFinishId: e.target.value })}>
                {back.product.finishes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {finishName(f, locale)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {back?.product.nails && (
            <Field label={t.look.nails}>
              <select className={inputClass} value={p.backNails} onChange={(e) => update({ backNails: e.target.value as OpenShelfParams['backNails'] })}>
                {back.product.nails.map((n) => (
                  <option key={n.id} value={n.id}>
                    {finishName(n, locale)}
                    {n.price ? ` (₪${n.price})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Section>
      )}

      <Section id="after-delivery" title={t.look.afterDelivery} defaultOpen={false} summary={t.look.finishTypes[p.finish.type]}>
        <p className="text-[13px] leading-snug text-muted">{t.look.afterDeliveryHint}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.look.finishType}>
            <select className={inputClass} value={p.finish.type} onChange={(e) => setFinish({ type: e.target.value as FinishSpec['type'] })}>
              {(['supplier', 'lacquered', 'stained', 'painted'] as const).map((k) => (
                <option key={k} value={k}>
                  {t.look.finishTypes[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.look.sheen}>
            <select className={inputClass} value={p.finish.sheen} onChange={(e) => setFinish({ sheen: e.target.value as FinishSpec['sheen'] })}>
              {(['matte', 'satin', 'gloss'] as const).map((k) => (
                <option key={k} value={k}>
                  {t.look.sheens[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {(p.finish.type === 'painted' || p.finish.type === 'stained') && (
          <Field label={t.look.color}>
            <input type="color" value={p.finish.color} onChange={(e) => setFinish({ color: e.target.value })} className="h-10 w-full cursor-pointer rounded-lg border border-line-strong bg-panel" />
          </Field>
        )}
      </Section>
      <p className="m-5 rounded-lg bg-sunken p-3 text-[13px] leading-relaxed text-muted">{t.look.comingNote}</p>
    </div>
  );
}

export function worstStatus(checks: Check[]): Status {
  return checks.reduce<Status>((w, c) => (STATUS_SEVERITY[c.status] > STATUS_SEVERITY[w] ? c.status : w), 'GREEN');
}

export function SelectedPartPanel({ result }: { result: DesignResult }) {
  const t = useT();
  const locale = useUi((s) => s.locale) as Locale;
  const selectedId = useDesign((s) => s.selectedId);
  const select = useDesign((s) => s.select);
  const isolated = useDesign((s) => s.isolated);
  const setIsolated = useDesign((s) => s.setIsolated);
  const params = useDesign((s) => s.params);
  const update = useDesign((s) => s.update);
  const openAdvanced = useUi((s) => s.openAdvanced);
  const c = result.model.components.find((x) => x.id === selectedId);
  if (!c) return null;
  const cut = componentDims(result.model, c).cut;
  const partBoard = supplierProductFor(getMaterial(c.materialId));
  const checks = result.report.checks.filter((x) => x.componentIds.includes(c.id)).sort((a, b) => STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status]);
  return (
    <div>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <div className="text-[13px] text-muted">{t.structure.selected}</div>
          <div className="text-xl font-bold">{c.name}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button type="button" onClick={() => select(null)} className="h-9 rounded-lg px-3 text-[15px] text-accent-ink hover:bg-sunken">
            {t.structure.backToUnit}
          </button>
          <button type="button" aria-pressed={isolated} onClick={() => setIsolated(!isolated)} className={`h-9 rounded-lg px-3 text-[14px] ring-1 ${isolated ? 'bg-accent-soft font-semibold text-accent-ink ring-accent' : 'ring-line hover:bg-sunken'}`}>
            {isolated ? t.structure.showAll : t.structure.isolate}
          </button>
        </div>
      </div>
      <div className="space-y-4 px-5 py-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
          <dt className="text-muted">{t.structure.size}</dt>
          <dd className="text-end">
            <span className="num">
              {formatCm(c.size.x)} × {formatCm(c.size.y)} × {formatCm(c.size.z)}
            </span>{' '}
            {t.common.cm}
          </dd>
          {cut && (
            <>
              <dt className="text-muted">{t.structure.cutSize}</dt>
              <dd className="text-end">
                <span className="num">
                  {cut.partId} · {formatCm(cut.lengthMm)} × {formatCm(cut.widthMm)} × {formatCm(cut.thicknessMm)}
                </span>{' '}
                {t.common.cm}
              </dd>
            </>
          )}
          {!c.reference && (
            <>
              <dt className="text-muted">{t.structure.material}</dt>
              <dd className="text-end">
                {(() => { const m = getMaterial(c.materialId); return m && materialName(m, locale); })()} · {c.thicknessMm} {t.common.mm}
              </dd>
            </>
          )}
          {c.spanMm != null && (
            <>
              <dt className="text-muted">{t.structure.span}</dt>
              <dd className="text-end">
                <span className="num">{formatCm(c.spanMm)}</span> {t.common.cm}
              </dd>
            </>
          )}
        </dl>
        {partBoard && !c.reference && (
          <Field label={t.look.partDecor}>
            <select
              className={inputClass}
              value={params.partFinishes?.[c.id] ?? ''}
              onChange={(e) => {
                const next = { ...(params.partFinishes ?? {}) };
                if (e.target.value) next[c.id] = e.target.value;
                else delete next[c.id];
                update({ partFinishes: next });
              }}
            >
              <option value="">{t.look.sameAsRole}</option>
              {partBoard.product.finishes.map((f) => (
                <option key={f.id} value={f.id}>
                  {finishName(f, locale)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {checks.length === 0 && <p className="text-[15px] text-muted">{t.structure.noChecks}</p>}
        <IssuesList checks={checks.filter((x) => x.status !== 'GREEN')} />
        {checks.filter((x) => x.status === 'GREEN').map((check) => (
          <div key={check.id} className="flex items-start gap-2 rounded-xl bg-ok-soft p-3">
            <span className="mt-0.5 text-ok">
              <StatusIcon status="GREEN" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">{check.title}</div>
              {check.calculation && <div className="mt-0.5 text-[13px]">{check.calculation.result}</div>}
              <button type="button" onClick={() => openAdvanced('checks', check.id)} className="mt-1 text-[13px] font-medium text-accent-ink underline underline-offset-2">
                {t.structure.howCalculated}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

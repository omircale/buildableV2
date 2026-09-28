import { useMemo, useState } from 'react';
import type { AuthState } from '../cloud/supabase';
import {
  EQUIPMENT,
  billCsv,
  billSummary,
  builtPerimeterM,
  byLocation,
  byTrade,
  floorAreaM2,
  mepLines,
  spaceProblems,
  UNIT_LABEL,
  wallAreaM2,
  wallsOf,
  whatIsMissing,
  type BoqLine,
  type ServiceKind,
} from '../engine';
import { useT } from '../i18n';
import { useUi } from '../state/uiStore';
import { useSurvey } from '../state/spaceStore';
import { AppHeader } from '../ui/AppHeader';
import { Button, Chip, Field, FlatSections, Section, downloadText, inputClass } from '../ui/common';

const SERVICE_KINDS: ServiceKind[] = ['water_cold', 'water_hot', 'drain', 'electrical', 'gas', 'ventilation'];

const KIND_LABEL: Record<ServiceKind, { he: string; en: string }> = {
  water_cold: { he: 'מים קרים', en: 'Cold water' },
  water_hot: { he: 'מים חמים', en: 'Hot water' },
  drain: { he: 'ניקוז', en: 'Drain' },
  electrical: { he: 'חשמל', en: 'Electrical' },
  gas: { he: 'גז', en: 'Gas' },
  ventilation: { he: 'אוורור', en: 'Ventilation' },
};

/** An input that is empty when the value is unknown, because unknown is a real state here. */
function NullableMm({ value, onChange, label, hint }: { value: number | null; onChange: (v: number | null) => void; label: string; hint?: string }) {
  const t = useT();
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          className={inputClass}
          value={value == null ? '' : value / 10}
          placeholder={t.survey.notMeasured}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange(raw === '' ? null : Math.round(Number(raw) * 10));
          }}
        />
        <span className="shrink-0 text-[13px] text-muted">{t.common.cm}</span>
      </div>
    </Field>
  );
}

function Measure({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  const t = useT();
  return (
    <div className="rounded-lg bg-sunken px-3 py-2">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="text-[15px] font-semibold tabular-nums">{value == null ? <span className="font-normal text-muted">{t.survey.notMeasured}</span> : `${value.toFixed(2)} ${unit}`}</div>
    </div>
  );
}

function LineRow({ line }: { line: BoqLine }) {
  const locale = useUi((s) => s.locale);
  const he = locale === 'he';
  const description = he ? line.descriptionHe : line.descriptionEn;
  const why = he ? line.unknownReasonHe : line.unknownReasonEn;
  const assumption = he ? line.assumptionHe : line.assumptionEn;
  const unit = he ? UNIT_LABEL[line.unit].he : UNIT_LABEL[line.unit].en;

  return (
    <li className="border-b border-line py-2.5 last:border-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] leading-snug">{description}</div>
          {why && <div className="mt-1 text-[12.5px] leading-snug text-muted">{why}</div>}
          {assumption && <div className="mt-1 text-[12.5px] leading-snug text-muted">{assumption}</div>}
        </div>
        <div className="shrink-0 text-end tabular-nums">
          {line.quantity == null ? (
            <span className="rounded-full bg-sunken px-2 py-0.5 text-[12px] text-muted">—</span>
          ) : (
            <span className="text-[15px] font-semibold">
              {line.quantity} <span className="text-[12px] font-normal text-muted">{unit}</span>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

export function SpacePage({ auth }: { auth: AuthState }) {
  const t = useT();
  const locale = useUi((s) => s.locale);
  const he = locale === 'he';
  const survey = useSurvey();
  const [axis, setAxis] = useState<'trade' | 'location'>('trade');

  const walls = wallsOf(survey.space);

  const lines = useMemo(
    () =>
      mepLines({
        space: survey.space,
        sources: survey.sources,
        equipmentIds: survey.equipmentIds,
        location: { buildingId: survey.buildingId, levelId: survey.levelId, spaceId: survey.space.id },
      }),
    [survey.space, survey.sources, survey.equipmentIds, survey.buildingId, survey.levelId],
  );

  const summary = useMemo(() => billSummary(lines), [lines]);
  const groups = useMemo(() => (axis === 'trade' ? byTrade(lines) : byLocation(lines)), [lines, axis]);
  const problems = useMemo(() => spaceProblems(survey.space), [survey.space]);
  const gaps = useMemo(() => whatIsMissing(survey.space), [survey.space]);

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <AppHeader auth={auth} start={<h1 className="truncate text-[15px] font-semibold">{t.survey.title}</h1>} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <p className="mb-6 max-w-2xl text-[14px] leading-relaxed text-muted">{t.survey.intro}</p>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* ---- The survey ---- */}
          <div className="rounded-2xl border border-line bg-panel">
            <FlatSections>
              <Section title={t.survey.roomSection}>
                <Field label={t.survey.roomName}>
                  <input className={inputClass} value={survey.space.nameHe} onChange={(e) => survey.setName(e.target.value)} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <NullableMm label={t.survey.width} value={survey.widthMm} onChange={(v) => survey.setRectangle(v, survey.depthMm)} />
                  <NullableMm label={t.survey.depth} value={survey.depthMm} onChange={(v) => survey.setRectangle(survey.widthMm, v)} />
                </div>
                <NullableMm label={t.survey.height} value={survey.space.heightMm} onChange={survey.setHeight} />

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t.survey.building}>
                    <input className={inputClass} value={survey.buildingId} onChange={(e) => survey.setPlace(e.target.value, survey.levelId)} />
                  </Field>
                  <Field label={t.survey.level} hint={t.survey.levelHint}>
                    <input className={inputClass} value={survey.levelId} onChange={(e) => survey.setPlace(survey.buildingId, e.target.value)} />
                  </Field>
                </div>

                {walls.length > 0 && (
                  <Field label={t.survey.openSides} hint={t.survey.openSidesHint}>
                    <div className="flex flex-wrap gap-2">
                      {walls.map((w, i) => (
                        <Chip key={w.id} selected={!w.built} onClick={() => survey.toggleOpenEdge(i)}>
                          {t.survey.wall(i + 1)}
                        </Chip>
                      ))}
                    </div>
                  </Field>
                )}

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <Measure label={t.survey.floorArea} value={floorAreaM2(survey.space)} unit="m²" />
                  <Measure label={t.survey.wallArea} value={wallAreaM2(survey.space)} unit="m²" />
                  <Measure label={t.survey.perimeter} value={builtPerimeterM(survey.space)} unit="m" />
                </div>

                {problems.length > 0 && (
                  <div className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2">
                    <div className="text-[13px] font-semibold">{t.survey.problems}</div>
                    <ul className="mt-1 space-y-0.5">
                      {problems.map((p) => (
                        <li key={p.code + p.subject} className="text-[12.5px] leading-snug text-muted">
                          {he ? p.he : p.en}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>

              <Section title={t.survey.equipmentSection} count={survey.equipmentIds.length}>
                <p className="text-[12.5px] text-muted">{t.survey.equipmentHint}</p>
                <div className="flex flex-wrap gap-2">
                  {EQUIPMENT.map((item) => (
                    <Chip key={item.id} selected={survey.equipmentIds.includes(item.id)} onClick={() => survey.toggleEquipment(item.id)}>
                      {he ? item.nameHe : item.nameEn}
                    </Chip>
                  ))}
                </div>
              </Section>

              <Section title={t.survey.sourcesSection} count={survey.sources.length}>
                <p className="text-[12.5px] text-muted">{t.survey.sourcesHint}</p>
                {survey.sources.map((source) => (
                  <div key={source.id} className="space-y-2 rounded-lg border border-line p-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-sunken px-2 py-0.5 text-[12px]">{he ? KIND_LABEL[source.kind].he : KIND_LABEL[source.kind].en}</span>
                      <button type="button" className="ms-auto text-[12.5px] text-muted underline" onClick={() => survey.removeSource(source.id)}>
                        {t.survey.remove}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className={inputClass}
                        placeholder={t.survey.sourceName}
                        value={he ? source.nameHe : source.nameEn}
                        onChange={(e) => survey.updateSource(source.id, he ? { nameHe: e.target.value } : { nameEn: e.target.value })}
                      />
                      <input
                        className={inputClass}
                        placeholder={t.survey.rating}
                        value={(he ? source.ratingHe : source.ratingEn) ?? ''}
                        onChange={(e) => survey.updateSource(source.id, he ? { ratingHe: e.target.value } : { ratingEn: e.target.value })}
                      />
                    </div>
                    <Field label={t.survey.spareWays} hint={t.survey.spareWaysHint}>
                      <input
                        type="number"
                        inputMode="numeric"
                        className={inputClass}
                        placeholder="—"
                        value={source.spareWays ?? ''}
                        onChange={(e) => survey.updateSource(source.id, { spareWays: e.target.value.trim() === '' ? null : Number(e.target.value) })}
                      />
                    </Field>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  {SERVICE_KINDS.map((kind) => (
                    <button key={kind} type="button" className="rounded-full border border-line px-3 py-1 text-[12.5px] hover:bg-sunken" onClick={() => survey.addSource(kind)}>
                      + {he ? KIND_LABEL[kind].he : KIND_LABEL[kind].en}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title={t.survey.connectionsSection} count={survey.space.connections.length}>
                <p className="text-[12.5px] text-muted">{t.survey.connectionsHint}</p>
                {survey.space.connections.map((point) => (
                  <div key={point.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
                    <span className="rounded-full bg-sunken px-2 py-0.5 text-[12px]">{he ? KIND_LABEL[point.kind].he : KIND_LABEL[point.kind].en}</span>
                    <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
                      {t.survey.fedBy}
                      <select
                        className="rounded-lg border border-line-strong bg-panel px-2 py-1 text-[13px]"
                        value={point.fedBy ?? ''}
                        onChange={(e) => survey.updateConnection(point.id, { fedBy: e.target.value || undefined })}
                      >
                        <option value="">{t.survey.untraced}</option>
                        {survey.sources
                          .filter((s) => s.kind === point.kind)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {(he ? s.nameHe : s.nameEn) || s.id}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button type="button" className="ms-auto text-[12.5px] text-muted underline" onClick={() => survey.removeConnection(point.id)}>
                      {t.survey.remove}
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  {SERVICE_KINDS.map((kind) => (
                    <button key={kind} type="button" className="rounded-full border border-line px-3 py-1 text-[12.5px] hover:bg-sunken" onClick={() => survey.addConnection(kind)}>
                      + {he ? KIND_LABEL[kind].he : KIND_LABEL[kind].en}
                    </button>
                  ))}
                </div>

                {gaps.length > 0 && (
                  <ul className="space-y-0.5 pt-1">
                    {gaps.map((g) => (
                      <li key={g.field} className="text-[12.5px] leading-snug text-muted">
                        {he ? g.he : g.en}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </FlatSections>
          </div>

          {/* ---- The bill ---- */}
          <div className="rounded-2xl border border-line bg-panel">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
              <h2 className="text-[15px] font-semibold">{t.survey.billSection}</h2>
              <div className="ms-auto flex items-center gap-2">
                <Chip selected={axis === 'trade'} onClick={() => setAxis('trade')}>
                  {t.survey.byTrade}
                </Chip>
                <Chip selected={axis === 'location'} onClick={() => setAxis('location')}>
                  {t.survey.byLocation}
                </Chip>
              </div>
            </div>

            {lines.length === 0 ? (
              <p className="px-5 py-10 text-center text-[14px] text-muted">{t.survey.noLines}</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-5 py-2.5 text-[12.5px] text-muted">
                  <span>{t.survey.lines(summary.totals.lines)}</span>
                  {summary.totals.missingQuantity > 0 && <span>{t.survey.unquantified(summary.totals.missingQuantity)}</span>}
                  {summary.totals.missingPrice > 0 && <span>{t.survey.unpriced(summary.totals.missingPrice)}</span>}
                  <span className="ms-auto">{t.survey.noPricesYet}</span>
                </div>

                <div className="max-h-[60vh] overflow-y-auto px-5">
                  {groups.map((group) => (
                    <div key={group.key} className="py-3">
                      {/* On the location axis the engine's label carries the space's id, which is
                          internal. The person surveying named the room, so show them that name. */}
                      <h3 className="mb-1 text-[13px] font-semibold text-muted">
                        {axis === 'location'
                          ? [survey.buildingId, `${t.survey.level} ${survey.levelId}`, he ? survey.space.nameHe : survey.space.nameEn].filter(Boolean).join(' · ')
                          : he
                            ? group.he
                            : group.en}
                      </h3>
                      <ul>
                        {group.lines.map((line) => (
                          <LineRow key={line.id} line={line} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="border-t border-line px-5 py-3">
                  <h3 className="text-[13px] font-semibold">
                    {t.survey.pending} · {summary.pending.length}
                  </h3>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{t.survey.pendingHint}</p>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
                  <Button
                    variant="primary"
                    onClick={() => downloadText(`${survey.space.id}-boq.csv`, billCsv(lines, axis, locale), 'text/csv;charset=utf-8')}
                  >
                    {t.survey.downloadCsv}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm(t.survey.resetConfirm)) survey.reset();
                    }}
                  >
                    {t.survey.reset}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

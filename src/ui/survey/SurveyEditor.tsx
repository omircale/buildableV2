import { useState } from 'react';
import { EQUIPMENT, SECTORS, UNIT_LABEL, builtPerimeterM, danglingFeeds, floorAreaM2, mismatchedFeeds, spaceProblems, unknownEquipment, wallAreaM2, wallsOf, whatIsMissing } from '../../engine';
import { useT } from '../../i18n';
import { countOf, useSurvey } from '../../state/spaceStore';
import { HOTEL_ROOM_TEMPLATE } from '../../state/templateStore';
import { CountInput } from './CountInput';
import { useUi } from '../../state/uiStore';
import { Button, Chip, Field, FlatSections, Section, inputClass, matchesQuery } from '../common';
import { IconMinus, IconPlus, IconX } from '../icons';
import { SERVICE_KINDS, serviceName } from './services';

/** An input that is empty when the value is unknown, because unknown is a real state here. */
export function NullableCm({ value, onChange, label, hint }: { value: number | null; onChange: (v: number | null) => void; label: string; hint?: string }) {
  const t = useT();
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          className={inputClass}
          value={value == null ? '' : value / 10}
          placeholder={t.survey.notMeasured}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange(raw === '' ? null : Math.round(Number(raw) * 10));
          }}
        />
        <span className="shrink-0 text-small text-muted">{t.common.cm}</span>
      </div>
    </Field>
  );
}

function Measure({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  const t = useT();
  return (
    <div className="rounded-lg bg-sunken px-3 py-2">
      <div className="text-caption text-muted">{label}</div>
      <div className="text-control font-semibold tabular-nums">{value == null ? <span className="font-normal text-muted">{t.survey.notMeasured}</span> : `${value.toFixed(2)} ${unit}`}</div>
    </div>
  );
}

/**
 * Says, wherever the room is shown, that its outline is invented. Every quantity downstream is computed
 * from those numbers, so a client walking through the journey on the example must never lose sight of it.
 */
export function SampleBanner({ onReplace }: { onReplace?: () => void }) {
  const t = useT();
  const sample = useSurvey((s) => s.sample);
  if (!sample) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-warn/50 bg-warn-soft px-4 py-2.5 text-small">
      <span className="font-semibold">{t.survey.sampleBadge}</span>
      <span className="text-muted">{t.survey.sampleBanner}</span>
      {onReplace && (
        <button type="button" onClick={onReplace} className="ms-auto font-medium text-accent underline underline-offset-2">
          {t.survey.sampleReplace}
        </button>
      )}
    </div>
  );
}

export function SurveyEditor() {
  const t = useT();
  const locale = useUi((s) => s.locale);
  const he = locale === 'he';
  const survey = useSurvey();
  const [equipmentQuery, setEquipmentQuery] = useState('');
  const walls = wallsOf(survey.space);
  const problems = spaceProblems(survey.space);
  // Ids nothing in the catalogue answers to — from an older version or a hand-edited backup. They count for nothing, so they are shown and can be taken out.
  const unknownIds = unknownEquipment(survey.equipmentIds);
  const gaps = whatIsMissing(survey.space);
  // A survey that contradicts itself: a point fed from a source that is gone, or from the wrong kind.
  const feedProblems = [...danglingFeeds(survey.space, survey.sources), ...mismatchedFeeds(survey.space, survey.sources)];
  // What is offered: the items for this kind of place, plus anything already in the room — narrowing
  // the list must never hide something that is being counted.
  const offered = EQUIPMENT.filter((item) => survey.sector === 'all' || item.sectors.includes(survey.sector) || survey.equipmentIds.includes(item.id)).filter(
    (item) => matchesQuery(equipmentQuery, item.nameHe, item.nameEn) || survey.equipmentIds.includes(item.id),
  );
  const area = he ? UNIT_LABEL.m2.he : UNIT_LABEL.m2.en;
  const length = he ? UNIT_LABEL.m.he : UNIT_LABEL.m.en;

  return (
    <FlatSections>
      <h2 className="sr-only">{t.survey.surveyHeading}</h2>
      <Section title={t.survey.roomSection}>
        <Field label={t.survey.roomName}>
          <input className={inputClass} value={he ? survey.space.nameHe : survey.space.nameEn} onChange={(e) => survey.setName(e.target.value)} />
        </Field>

        {survey.surveyFile ? (
          // The surveyor's outline is the measurement. Typing a width over it would quietly turn an
          // L-shaped room into a rectangle, so changing it is a deliberate step of its own.
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-sunken px-3 py-2 text-small">
            <span>{t.surveyor.fromFile(survey.surveyFile)}</span>
            <span className="text-muted">{t.surveyor.outlineFacts(survey.space.footprintMm.length, (floorAreaM2(survey.space) ?? 0).toLocaleString(he ? 'he-IL' : 'en-GB', { maximumFractionDigits: 1 }))}</span>
            <button type="button" className="ms-auto text-accent-ink underline underline-offset-2" onClick={survey.dropSurveyOutline}>
              {t.surveyor.dropOutline}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <NullableCm label={t.survey.width} value={survey.widthMm} onChange={(v) => survey.setRectangle(v, survey.depthMm)} />
            <NullableCm label={t.survey.depth} value={survey.depthMm} onChange={(v) => survey.setRectangle(survey.widthMm, v)} />
          </div>
        )}
        <NullableCm label={t.survey.height} value={survey.space.heightMm} onChange={survey.setHeight} />

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
          <Measure label={t.survey.floorArea} value={floorAreaM2(survey.space)} unit={area} />
          <Measure label={t.survey.wallArea} value={wallAreaM2(survey.space)} unit={area} />
          <Measure label={t.survey.perimeter} value={builtPerimeterM(survey.space)} unit={length} />
        </div>

        {problems.length > 0 && (
          <div role="status" className="rounded-lg border border-bad/40 bg-bad-soft px-3 py-2">
            <div className="text-small font-semibold">{t.survey.problems}</div>
            <ul className="mt-1 space-y-0.5">
              {problems.map((p) => (
                <li key={p.code + p.subject} className="text-small leading-snug text-muted">
                  {he ? p.he : p.en}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title={t.survey.equipmentSection} count={survey.equipmentIds.length}>
        <p className="text-small text-muted">{t.survey.equipmentHint}</p>
        <div role="group" aria-label={t.survey.sectorLabel} className="flex flex-wrap gap-1.5">
          {(['all', ...SECTORS] as const).map((sector) => (
            <Chip key={sector} selected={survey.sector === sector} onClick={() => survey.setSector(sector)}>
              {t.survey.sectors[sector]}
            </Chip>
          ))}
        </div>
        {survey.sector === 'hotel' && (
          <div className="space-y-1">
            <Button
              size="sm"
              onClick={() => {
                survey.addEquipment(HOTEL_ROOM_TEMPLATE.equipmentIds);
                // A room still carrying the placeholder name takes the template's, so the bill reads "guest room ×120".
                if (/^(חלל חדש|חלל \d+|New space|Space \d+)$/.test(survey.space.nameHe) && HOTEL_ROOM_TEMPLATE.roomName) survey.setName(HOTEL_ROOM_TEMPLATE.roomName);
              }}
            >
              {t.survey.hotelRoom(HOTEL_ROOM_TEMPLATE.equipmentIds.length)}
            </Button>
            <p className="text-caption text-muted">{t.survey.hotelRoomHint}</p>
          </div>
        )}
        <input type="search" className={inputClass} placeholder={t.survey.equipmentSearch} aria-label={t.survey.equipmentSearch} value={equipmentQuery} onChange={(e) => setEquipmentQuery(e.target.value)} />
        {unknownIds.length > 0 && (
          <div role="alert" className="space-y-1.5 rounded-lg bg-bad-soft px-3 py-2 text-small">
            <div className="text-bad">{t.survey.unknownItems}</div>
            <div className="flex flex-wrap gap-1.5">
              {unknownIds.map((id) => (
                <button key={id} type="button" aria-label={t.survey.removeItem(id)} className="inline-flex items-center gap-1 rounded-full bg-panel px-2.5 py-1 ring-1 ring-line hover:bg-sunken" onClick={() => survey.removeEquipment(id)}>
                  <span dir="ltr">{id}</span>
                  <IconX size={14} />
                </button>
              ))}
            </div>
          </div>
        )}
        {offered.length === 0 && <p className="text-small text-muted">{t.survey.equipmentNone}</p>}
        <div className="flex flex-wrap gap-2">
          {offered.map((item) => {
            const n = countOf(survey.equipmentIds, item.id);
            return (
              <div key={item.id} className="flex items-center gap-1">
                <Chip selected={n > 0} onClick={() => survey.toggleEquipment(item.id)}>
                  {he ? item.nameHe : item.nameEn}
                  {n > 1 && <span className="ms-1 tabular-nums">×{n}</span>}
                </Chip>
                {n > 0 && (
                  <span className="flex items-center">
                    <button type="button" aria-label={t.survey.fewer} className="h-7 w-7 rounded-full text-muted hover:bg-sunken" onClick={() => survey.setEquipmentCount(item.id, n - 1)}>
                      <IconMinus size={14} className="mx-auto" />
                    </button>
                    {/* A hundred and twenty desks are typed, not clicked a hundred and twenty times. */}
                    <CountInput value={n} onCommit={(v) => survey.setEquipmentCount(item.id, v)} label={t.survey.itemCount(he ? item.nameHe : item.nameEn)} min={0} />
                    <button type="button" aria-label={t.survey.more} className="h-7 w-7 rounded-full text-muted hover:bg-sunken" onClick={() => survey.setEquipmentCount(item.id, n + 1)}>
                      <IconPlus size={14} className="mx-auto" />
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* A piece put in a room by an earlier version, when the product still designed furniture. It is
          kept in the bill as it was, and can be taken out; nothing new can be put in. */}
      {survey.piece != null && (
        <Section title={t.survey.designSection}>
          <div className="flex flex-wrap items-center gap-3 text-body">
            <span>{survey.piece.name}</span>
            <button type="button" className="text-small text-accent-ink underline underline-offset-2" onClick={() => survey.setPiece(null)}>
              {t.survey.remove}
            </button>
          </div>
        </Section>
      )}

      <Section title={t.survey.sourcesSection} count={survey.sources.length}>
        <p className="text-small text-muted">{t.survey.sourcesHint}</p>
        {survey.sources.map((source) => (
          <div key={source.id} className="space-y-2 rounded-lg border border-line p-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-sunken px-2 py-0.5 text-caption">{serviceName(source.kind, he)}</span>
              <button type="button" className="ms-auto text-small text-muted underline" onClick={() => survey.removeSource(source.id)}>
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
            <button key={kind} type="button" className="rounded-full border border-line px-3 py-1 text-small hover:bg-sunken" onClick={() => survey.addSource(kind)}>
              + {serviceName(kind, he)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t.survey.connectionsSection} count={survey.space.connections.length}>
        <p className="text-small text-muted">{t.survey.connectionsHint}</p>
        {survey.space.connections.map((point) => (
          <div key={point.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
            <span className="rounded-full bg-sunken px-2 py-0.5 text-caption">{serviceName(point.kind, he)}</span>
            <label className="flex items-center gap-1.5 text-small text-muted">
              {t.survey.fedBy}
              <select
                className="rounded-lg border border-field bg-panel px-2 py-1 text-small"
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
            <button type="button" className="ms-auto text-small text-muted underline" onClick={() => survey.removeConnection(point.id)}>
              {t.survey.remove}
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {SERVICE_KINDS.map((kind) => (
            <button key={kind} type="button" className="rounded-full border border-line px-3 py-1 text-small hover:bg-sunken" onClick={() => survey.addConnection(kind)}>
              + {serviceName(kind, he)}
            </button>
          ))}
        </div>

        {feedProblems.length > 0 && (
          <ul role="status" className="space-y-0.5 rounded-lg border border-bad/40 bg-bad-soft px-3 py-2">
            {feedProblems.map((p) => (
              <li key={p.pointId} className="text-small leading-snug">
                {he ? p.he : p.en}
              </li>
            ))}
          </ul>
        )}

        {gaps.length > 0 && (
          <ul className="space-y-0.5 pt-1">
            {gaps.map((g) => (
              <li key={g.field} className="text-small leading-snug text-muted">
                {he ? g.he : g.en}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </FlatSections>
  );
}

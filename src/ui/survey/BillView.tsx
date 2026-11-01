import { useMemo, useState } from 'react';
import { DRAFT_NOTICE, UNIT_LABEL, billDocumentCsv, billProblems, billSummary, billWorkbook, chapterLabel, numberBill, unknownEquipment, type NumberedLine } from '../../engine';
import { useT } from '../../i18n';
import { useSurvey } from '../../state/spaceStore';
import { useUi } from '../../state/uiStore';
import { Button, Chip, downloadText, inputClass, matchesQuery } from '../common';
import { downloadWorkbook } from '../xlsxFile';
import { SiteList } from './SiteList';
import type { RoomBill } from './useRoomBill';

/** Groups are opened by default only while there are few of them; forty open rooms is a wall of text. */
const OPEN_BY_DEFAULT = 3;

/** The most lines a search draws at once. */
const SEARCH_ROWS = 300;

const money = (v: number, he: boolean) => new Intl.NumberFormat(he ? 'he-IL' : 'en-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(v);

/**
 * A price on one line, entered by hand.
 *
 * The system offers no prices of its own. A person may put one in, and only together with where it
 * came from: the save button stays shut until the source is written, and the source is shown beside
 * the price from then on.
 */
function PriceEditor({ lineId, onDone }: { lineId: string; onDone: () => void }) {
  const t = useT();
  const existing = useSurvey((s) => s.prices[lineId]);
  const setPrice = useSurvey((s) => s.setPrice);
  const [price, setPriceText] = useState(existing ? String(existing.unitPriceIls) : '');
  const [source, setSource] = useState(existing?.source ?? '');
  const value = Number(price);
  const valid = price.trim() !== '' && Number.isFinite(value) && value >= 0 && source.trim() !== '';

  return (
    <form
      className="mt-2 grid gap-2 rounded-lg bg-sunken p-3 sm:grid-cols-[9rem_minmax(0,1fr)]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        setPrice(lineId, { unitPriceIls: value, source });
        onDone();
      }}
    >
      <label className="block">
        <span className="mb-1 block text-caption text-muted">{t.survey.unitPrice}</span>
        <input className={inputClass} inputMode="decimal" dir="ltr" value={price} onChange={(e) => setPriceText(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <label className="block">
        <span className="mb-1 block text-caption text-muted">{t.survey.priceSource}</span>
        <input className={inputClass} value={source} maxLength={200} onChange={(e) => setSource(e.target.value)} aria-describedby={`${lineId}-source-hint`} />
      </label>
      <p id={`${lineId}-source-hint`} className="text-caption leading-snug text-muted sm:col-span-2">
        {t.survey.priceSourceHint}
      </p>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button size="sm" variant="primary" type="submit" disabled={!valid}>
          {t.survey.priceSave}
        </Button>
        {existing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPrice(lineId, null);
              onDone();
            }}
          >
            {t.survey.priceRemove}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t.common.close}
        </Button>
      </div>
    </form>
  );
}

function LineRow({ item, place }: { item: NumberedLine; place?: string }) {
  const t = useT();
  const he = useUi((s) => s.locale) === 'he';
  const entered = useSurvey((s) => s.prices[item.line.id]);
  const [editing, setEditing] = useState(false);
  const { line, number } = item;
  const why = he ? line.unknownReasonHe : line.unknownReasonEn;
  const assumption = he ? line.assumptionHe : line.assumptionEn;
  const unit = he ? UNIT_LABEL[line.unit].he : UNIT_LABEL[line.unit].en;

  return (
    <li className="border-b border-line py-2.5 last:border-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-caption text-muted">
            <span className="tabular-nums" dir="ltr">
              {number}
            </span>
            {place && <span>· {place}</span>}
          </div>
          <div className="text-body leading-snug">{he ? line.descriptionHe : line.descriptionEn}</div>
          {why && <div className="mt-1 text-small leading-snug text-muted">{why}</div>}
          {assumption && <div className="mt-1 text-small leading-snug text-muted">{assumption}</div>}
          {entered && line.unitPriceIls != null && (
            <div className="mt-1 text-small leading-snug">
              <span className="tabular-nums" dir="ltr">
                {money(line.unitPriceIls, he)}
              </span>{' '}
              / {unit}
              {line.quantity != null && (
                <>
                  {' · '}
                  <span className="font-semibold tabular-nums" dir="ltr">
                    {money(line.unitPriceIls * line.quantity, he)}
                  </span>
                </>
              )}
              <span className="text-muted"> · {t.survey.priceFrom(entered.source)}</span>
            </div>
          )}
          {!editing && (
            <button type="button" className="mt-1 text-small text-accent-ink underline underline-offset-2" onClick={() => setEditing(true)}>
              {entered ? t.survey.editPrice : t.survey.addPrice}
            </button>
          )}
          {editing && <PriceEditor lineId={line.id} onDone={() => setEditing(false)} />}
        </div>
        <div className="shrink-0 text-end tabular-nums">
          {line.quantity == null ? (
            <span className="rounded-full bg-unknown-soft px-2 py-0.5 text-caption text-muted">—</span>
          ) : (
            <span className="text-control font-semibold">
              {line.quantity} <span className="text-caption font-normal text-muted">{unit}</span>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * The bill, numbered the way the industry numbers it, on either axis.
 *
 * "By room" is the document's own order — room, chapter, sub-chapter. "By chapter" gathers a trade's
 * lines from every room, which is what goes out to tender. Both show the same lines with the same
 * numbers; the search narrows whichever one is open.
 */
export function BillView({ bill, showReset = false, maxHeight = '60vh' }: { bill: RoomBill; showReset?: boolean; maxHeight?: string }) {
  const t = useT();
  const locale = useUi((s) => s.locale);
  const he = locale === 'he';
  const reset = useSurvey((s) => s.reset);
  const [axis, setAxis] = useState<'room' | 'chapter'>('room');
  const [query, setQuery] = useState('');
  // Which groups the person opened or closed themselves; anything not in here follows the default.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const { lines, roomName, rooms } = bill;

  // The bill checking itself. A room with no floor cannot be placed in the document, and anything the
  // engine's own validator objects to is said here rather than left in a test file.
  const unplaced = rooms.filter((r) => r.levelId.trim() === '');
  // Equipment the catalogue does not know produces no lines. That has to be said, not left to be noticed.
  const unknown = rooms.map((r) => ({ room: r, ids: unknownEquipment(r.equipmentIds) })).filter((u) => u.ids.length);
  const integrity = useMemo(
    () =>
      billProblems(lines, { levelIds: [...new Set(rooms.map((r) => r.levelId))], spaces: rooms.map((r) => r.space) })
        .filter((p) => p.code !== 'line_on_unknown_level')
        .map((p) => p.code),
    [lines, rooms],
  );

  const { structures, numbered, problems } = useMemo(() => numberBill(lines), [lines]);
  const summary = useMemo(() => billSummary(lines), [lines]);

  const matches = (n: NumberedLine) => matchesQuery(query, n.number, n.line.descriptionHe, n.line.descriptionEn, roomName(n.line.location));
  const searching = query.trim() !== '';

  const groups = useMemo(() => {
    if (axis === 'room') {
      return structures.map((s) => ({
        key: s.code,
        title: `${s.code} · ${roomName(s.location)}`,
        sections: s.chapters.map((c) => ({ key: c.code, title: `${c.code} ${he ? c.he : c.en}`, items: c.subChapters.flatMap((x) => x.lines), showPlace: false })),
      }));
    }
    const codes = [...new Set(numbered.map((n) => n.chapter))].sort();
    return codes.map((code) => {
      const label = chapterLabel(code);
      return { key: code, title: `${code} · ${he ? label.he : label.en}`, sections: [{ key: code, title: '', items: numbered.filter((n) => n.chapter === code), showPlace: true }] };
    });
  }, [axis, structures, numbered, roomName, he]);

  const matched = groups
    .map((g) => ({ ...g, sections: g.sections.map((s) => ({ ...s, items: s.items.filter(matches) })).filter((s) => s.items.length) }))
    .filter((g) => g.sections.length);
  const matchedCount = matched.reduce((a, g) => a + g.sections.reduce((b, s) => b + s.items.length, 0), 0);

  // A search opens every group it found something in. On a large bill a loose word matches a thousand
  // lines, and drawing them all freezes the screen for seconds — so a search shows the first few
  // hundred and says how many it is holding back, rather than hanging or hiding them unannounced.
  let budget = searching ? SEARCH_ROWS : Infinity;
  const visible = matched
    .map((g) => ({
      ...g,
      sections: g.sections
        .map((s) => {
          const items = s.items.slice(0, Math.max(0, budget));
          budget -= items.length;
          return { ...s, items };
        })
        .filter((s) => s.items.length),
    }))
    .filter((g) => g.sections.length);
  const shownCount = Math.min(matchedCount, SEARCH_ROWS);

  return (
    <div>
      {/* What this document is, before anything in it. */}
      <div className="border-b border-line bg-warn-soft px-5 py-3">
        <div className="text-small font-semibold">{t.survey.draftTitle}</div>
        <p className="mt-0.5 max-w-prose text-small leading-snug">{he ? DRAFT_NOTICE.he : DRAFT_NOTICE.en}</p>
      </div>
      {unknown.length > 0 && (
        <ul role="alert" className="space-y-0.5 border-b border-line bg-bad-soft px-5 py-2.5 text-small leading-snug text-bad">
          {unknown.map((u) => (
            <li key={u.room.space.id}>{t.survey.unknownEquipment((he ? u.room.space.nameHe : u.room.space.nameEn) || t.survey.unnamed, u.ids.join(', '))}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <h2 className="text-control font-semibold">{t.survey.billSection}</h2>
        <div className="ms-auto flex items-center gap-2">
          <Chip selected={axis === 'room'} onClick={() => setAxis('room')}>
            {t.survey.byLocation}
          </Chip>
          <Chip selected={axis === 'chapter'} onClick={() => setAxis('chapter')}>
            {t.survey.byTrade}
          </Chip>
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="px-5 py-10 text-center text-body text-muted">{t.survey.noLines}</p>
      ) : (
        <>
          <div aria-live="polite" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-5 py-2.5 text-small text-muted">
            <span>{t.survey.lines(summary.totals.lines)}</span>
            {structures.length > 1 && <span>{t.survey.roomsCount(structures.length)}</span>}
            {summary.totals.missingQuantity > 0 && <span>{t.survey.unquantified(summary.totals.missingQuantity)}</span>}
            {summary.totals.missingPrice > 0 && <span>{t.survey.unpriced(summary.totals.missingPrice)}</span>}
            {summary.totals.pricedLines > 0 && <span>{t.survey.pricedOf(summary.totals.pricedLines, summary.totals.lines)}</span>}
            {/* A total is a claim that nothing is missing, so it appears only when nothing is. */}
            <span className="ms-auto">
              {summary.totals.complete ? <strong className="text-ink">{t.survey.totalIs(money(summary.totals.pricedIls, he))}</strong> : summary.totals.pricedLines > 0 ? t.survey.partialTotal : t.survey.noPricesYet}
            </span>
          </div>

          <div className="border-b border-line px-5 py-2.5">
            <input type="search" className={inputClass} placeholder={t.survey.searchBill} aria-label={t.survey.searchBill} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {(problems.length > 0 || unplaced.length > 0 || integrity.length > 0) && (
            <ul role="status" className="space-y-0.5 border-b border-line bg-warn-soft px-5 py-2.5 text-small leading-snug">
              {unplaced.map((r) => (
                <li key={r.space.id}>{t.survey.noLevel((he ? r.space.nameHe : r.space.nameEn) || t.survey.unnamed)}</li>
              ))}
              {[...new Set(integrity)].map((code) => (
                <li key={code}>{t.survey.integrity(code)}</li>
              ))}
              {/* The same finding in ninety-nine rooms is said once, with how many times — not ninety-nine times. */}
              {[...problems.reduce((m, p) => m.set(he ? p.he : p.en, (m.get(he ? p.he : p.en) ?? 0) + 1), new Map<string, number>())].map(([text, n]) => (
                <li key={text}>
                  {text}
                  {n > 1 && <span className="text-muted"> · {t.survey.inRooms(n)}</span>}
                </li>
              ))}
            </ul>
          )}

          <div className="overflow-y-auto px-5" style={{ maxHeight }}>
            {searching && matchedCount > shownCount && (
              <p role="status" className="my-2 rounded-lg bg-warn-soft px-3 py-2 text-small leading-snug">
                {t.survey.searchCapped(shownCount, matchedCount)}
              </p>
            )}
            {visible.length === 0 ? (
              <p className="py-8 text-center text-body text-muted">{t.survey.noMatch}</p>
            ) : (
              visible.map((g, gi) => {
                const count = g.sections.reduce((a, s) => a + s.items.length, 0);
                const id = `${axis}-${g.key}`;
                // A search opens everything it found; otherwise the first few groups start open, and
                // whatever the person opened or closed stays that way.
                const open = searching || (toggled[id] ?? (visible.length <= OPEN_BY_DEFAULT || gi === 0));
                return (
                  <details
                    key={id}
                    open={open}
                    onToggle={(e) => {
                      // Read now: the event is released before a state updater would get to it.
                      const now = e.currentTarget.open;
                      // The event also fires when the screen itself opens or closes a group — a search
                      // does that to every group at once. Only a change the person made is remembered,
                      // or one search would leave ninety-nine rooms open for good.
                      if (now === open) return;
                      setToggled((was) => (was[id] === now ? was : { ...was, [id]: now }));
                    }}
                    className="border-b border-line py-1 last:border-0"
                  >
                    <summary className="flex cursor-pointer items-baseline gap-2 py-2 text-body font-semibold">
                      <span>{g.title}</span>
                      <span className="text-small font-normal text-muted">{t.survey.lines(count)}</span>
                    </summary>
                    {/* A closed group's lines are not built at all: a hundred rooms folded shut cost nothing. */}
                    {open &&
                      g.sections.map((s) => (
                        <div key={s.key} className="pb-2">
                          {s.title && <h3 className="mt-1 text-small font-semibold text-muted">{s.title}</h3>}
                          <ul>
                            {s.items.map((item) => (
                              <LineRow key={item.line.id} item={item} place={s.showPlace ? roomName(item.line.location) : undefined} />
                            ))}
                          </ul>
                        </div>
                      ))}
                  </details>
                );
              })
            )}
          </div>

          <div className="border-t border-line px-5 py-4">
            <SiteList rooms={rooms} />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            <Button variant="primary" onClick={() => downloadText('boq.csv', billDocumentCsv(lines, { locale, roomName }), 'text/csv;charset=utf-8')}>
              {t.survey.downloadCsv}
            </Button>
            <Button onClick={() => void downloadWorkbook('boq.xlsx', billWorkbook(lines, { locale, roomName }), he)}>{t.survey.downloadXlsx}</Button>
            {showReset && (
              <Button variant="ghost" onClick={reset}>
                {t.survey.reset}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

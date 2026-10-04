import { useMemo, useState } from 'react';
import { UNIT_LABEL, billDocumentCsv, billSummary, chapterLabel, numberBill, type NumberedLine } from '../../engine';
import { useT } from '../../i18n';
import { useSurvey } from '../../state/spaceStore';
import { useUi } from '../../state/uiStore';
import { Button, Chip, downloadText, inputClass, matchesQuery } from '../common';
import type { RoomBill } from './useRoomBill';

/** Groups are opened by default only while there are few of them; forty open rooms is a wall of text. */
const OPEN_BY_DEFAULT = 3;

function LineRow({ item, place }: { item: NumberedLine; place?: string }) {
  const he = useUi((s) => s.locale) === 'he';
  const { line, number } = item;
  const why = he ? line.unknownReasonHe : line.unknownReasonEn;
  const assumption = he ? line.assumptionHe : line.assumptionEn;
  const unit = he ? UNIT_LABEL[line.unit].he : UNIT_LABEL[line.unit].en;

  return (
    <li className="border-b border-line py-2.5 last:border-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-muted">
            <span className="tabular-nums" dir="ltr">
              {number}
            </span>
            {place && <span>· {place}</span>}
          </div>
          <div className="text-[14px] leading-snug">{he ? line.descriptionHe : line.descriptionEn}</div>
          {why && <div className="mt-1 text-[12.5px] leading-snug text-muted">{why}</div>}
          {assumption && <div className="mt-1 text-[12.5px] leading-snug text-muted">{assumption}</div>}
        </div>
        <div className="shrink-0 text-end tabular-nums">
          {line.quantity == null ? (
            <span className="rounded-full bg-unknown-soft px-2 py-0.5 text-[12px] text-muted">—</span>
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
  const { lines, roomName } = bill;

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

  const visible = groups
    .map((g) => ({ ...g, sections: g.sections.map((s) => ({ ...s, items: s.items.filter(matches) })).filter((s) => s.items.length) }))
    .filter((g) => g.sections.length);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <h2 className="text-[15px] font-semibold">{t.survey.billSection}</h2>
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
        <p className="px-5 py-10 text-center text-[14px] text-muted">{t.survey.noLines}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-5 py-2.5 text-[12.5px] text-muted">
            <span>{t.survey.lines(summary.totals.lines)}</span>
            {structures.length > 1 && <span>{t.survey.roomsCount(structures.length)}</span>}
            {summary.totals.missingQuantity > 0 && <span>{t.survey.unquantified(summary.totals.missingQuantity)}</span>}
            {summary.totals.missingPrice > 0 && <span>{t.survey.unpriced(summary.totals.missingPrice)}</span>}
            <span className="ms-auto">{t.survey.noPricesYet}</span>
          </div>

          <div className="border-b border-line px-5 py-2.5">
            <input type="search" className={inputClass} placeholder={t.survey.searchBill} aria-label={t.survey.searchBill} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {problems.length > 0 && (
            <ul className="space-y-0.5 border-b border-line bg-warn-soft px-5 py-2.5 text-[12.5px] leading-snug">
              {problems.map((p) => (
                <li key={p.code + (p.lineId ?? '')}>{he ? p.he : p.en}</li>
              ))}
            </ul>
          )}

          <div className="overflow-y-auto px-5" style={{ maxHeight }}>
            {visible.length === 0 ? (
              <p className="py-8 text-center text-[14px] text-muted">{t.survey.noMatch}</p>
            ) : (
              visible.map((g, gi) => {
                const count = g.sections.reduce((a, s) => a + s.items.length, 0);
                return (
                  // A search opens everything it found; otherwise only the first few groups start open.
                  <details key={`${axis}-${g.key}-${searching}`} open={searching || visible.length <= OPEN_BY_DEFAULT || gi === 0} className="border-b border-line py-1 last:border-0">
                    <summary className="flex cursor-pointer items-baseline gap-2 py-2 text-[14px] font-semibold">
                      <span>{g.title}</span>
                      <span className="text-[12.5px] font-normal text-muted">{t.survey.lines(count)}</span>
                    </summary>
                    {g.sections.map((s) => (
                      <div key={s.key} className="pb-2">
                        {s.title && <h4 className="mt-1 text-[12.5px] font-semibold text-muted">{s.title}</h4>}
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

          <div className="border-t border-line px-5 py-3">
            <h3 className="text-[13px] font-semibold">
              {t.survey.pending} · {summary.pending.length}
            </h3>
            <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{t.survey.pendingHint}</p>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            <Button variant="primary" onClick={() => downloadText('boq.csv', billDocumentCsv(lines, { locale, roomName }), 'text/csv;charset=utf-8')}>
              {t.survey.downloadCsv}
            </Button>
            {showReset && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (window.confirm(t.survey.resetConfirm)) reset();
                }}
              >
                {t.survey.reset}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

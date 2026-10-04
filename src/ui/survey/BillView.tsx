import { useMemo, useState } from 'react';
import { UNIT_LABEL, billCsv, billSummary, byLocation, byTrade, type BoqLine } from '../../engine';
import { useT } from '../../i18n';
import { useSurvey } from '../../state/spaceStore';
import { useUi } from '../../state/uiStore';
import { Button, Chip, downloadText } from '../common';

function LineRow({ line }: { line: BoqLine }) {
  const he = useUi((s) => s.locale) === 'he';
  const why = he ? line.unknownReasonHe : line.unknownReasonEn;
  const assumption = he ? line.assumptionHe : line.assumptionEn;
  const unit = he ? UNIT_LABEL[line.unit].he : UNIT_LABEL[line.unit].en;

  return (
    <li className="border-b border-line py-2.5 last:border-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
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

/** The bill on either axis, with what it is still waiting on and a file to take away. */
export function BillView({ lines, showReset = false, maxHeight = '60vh' }: { lines: BoqLine[]; showReset?: boolean; maxHeight?: string }) {
  const t = useT();
  const locale = useUi((s) => s.locale);
  const he = locale === 'he';
  const survey = useSurvey();
  const [axis, setAxis] = useState<'trade' | 'location'>('trade');

  const summary = useMemo(() => billSummary(lines), [lines]);
  const groups = useMemo(() => (axis === 'trade' ? byTrade(lines) : byLocation(lines)), [lines, axis]);

  return (
    <div>
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

          <div className="overflow-y-auto px-5" style={{ maxHeight }}>
            {groups.map((group) => (
              <div key={group.key} className="py-3">
                {/* On the location axis the engine's label carries the space's id, which is internal. The
                    person surveying named the room, so show them that name. */}
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
            <Button variant="primary" onClick={() => downloadText(`${survey.space.id}-boq.csv`, billCsv(lines, axis, locale), 'text/csv;charset=utf-8')}>
              {t.survey.downloadCsv}
            </Button>
            {showReset && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (window.confirm(t.survey.resetConfirm)) survey.reset();
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

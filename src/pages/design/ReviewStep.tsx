import { getMaterial, materialName, type Check, type DesignResult, type EngineLocale, type Status } from '../../engine';
import { useT } from '../../i18n';
import { useDesign } from '../../state/designStore';
import { useUi } from '../../state/uiStore';
import { Button, StatusIcon } from '../../ui/common';
import { worstStatus } from '../../ui/DesignControls';
import { ArCard } from '../../ui/ar/ArCard';
import { artKindFor } from '../../ui/furnitureCatalog';
import { formatCm } from '../../ui/measure';
import { IconChevron, IconDownload, FurnitureArt } from '../../ui/icons';

interface Item {
  key: string;
  status: Status;
  title: string;
  text: string;
  checks: Check[];
}

const ITEM_BG: Record<Status, string> = { GREEN: 'bg-panel', YELLOW: 'bg-warn-soft', RED: 'bg-bad-soft', GREY: 'bg-unknown-soft' };
const ITEM_FG: Record<Status, string> = { GREEN: 'text-ok', YELLOW: 'text-warn', RED: 'text-bad', GREY: 'text-unknown' };

function useReviewItems(result: DesignResult): { items: Item[]; notChecked: Check[] } {
  const t = useT();
  const { report, model } = result;
  const p = model.params;
  const by = (prefix: string) => report.checks.filter((c) => c.id.startsWith(prefix));
  const cm = formatCm;
  const items: Item[] = [];
  const used = new Set<string>();
  const take = (checks: Check[]) => {
    checks.forEach((c) => used.add(c.id));
    return checks;
  };

  const geometry = take(by('geometry.'));
  const gStatus = worstStatus(geometry);
  const req = model.requested;
  const rounded = Math.abs(req.x - model.overall.x) >= 1 || Math.abs(req.y - model.overall.y) >= 1 || Math.abs(req.z - model.overall.z) >= 1;
  items.push({
    key: 'fits',
    status: gStatus === 'YELLOW' && rounded ? 'GREEN' : gStatus,
    title: gStatus === 'RED' ? geometry.find((c) => c.status === 'RED')!.title : t.review.fitsTitle,
    text: rounded
      ? t.review.fitsRounded(`${cm(req.x)} × ${cm(req.y)} × ${cm(req.z)}`, `${cm(model.overall.x)} × ${cm(model.overall.y)} × ${cm(model.overall.z)}`)
      : t.review.fitsExact,
    checks: geometry.filter((c) => c.status !== 'GREEN' && c.id !== 'geometry.order_step'),
  });

  const structure = take(by('structure.'));
  const equivalence = report.checks.find((c) => c.id === 'materials.equivalence' && c.status === 'YELLOW');
  if (equivalence) used.add(equivalence.id);
  const sStatus = worstStatus(structure);
  if (structure.length) {
    items.push({
      key: 'holds',
      status: sStatus,
      // Non-shelf furniture names the failing member (or rule) itself instead of the shelf wording.
      title: p.template === 'open_shelf' ? t.review.holdsTitle(p.loadPerShelf.massKg) : sStatus === 'RED' ? structure.find((c) => c.status === 'RED')!.title : t.review.holdsGeneric,
      text:
        sStatus === 'RED'
          ? p.template === 'open_shelf'
            ? t.review.holdsFail
            : structure.find((c) => c.status === 'RED')!.explanation
          : sStatus === 'GREY'
            ? t.review.holdsUnknown
            : sStatus === 'YELLOW' && equivalence
              ? t.review.holdsBorrowed
              : t.review.holdsOk,
      checks: structure.filter((c) => c.status !== 'GREEN'),
    });
  }

  const manufacturing = take(by('manufacturing.'));
  const mStatus = worstStatus(manufacturing);
  items.push({
    key: 'orderable',
    status: mStatus,
    title: mStatus === 'RED' ? t.review.orderableFail : t.review.orderableTitle,
    text: mStatus === 'RED' ? manufacturing.filter((c) => c.status === 'RED').map((c) => c.title).join(' · ') : '',
    checks: manufacturing.filter((c) => c.status === 'RED'),
  });

  for (const c of report.checks) {
    // The shelf's generic safety note is replaced by the wall-anchoring item below; other furniture lists its own safety rules.
    if (used.has(c.id) || c.status === 'GREEN' || c.status === 'GREY' || (c.category === 'safety' && p.template === 'open_shelf')) continue;
    used.add(c.id);
    items.push({ key: c.id, status: c.status, title: c.title, text: c.explanation, checks: [c] });
  }

  if (p.template === 'open_shelf') items.push({ key: 'safety', status: 'YELLOW', title: t.review.safetyTitle, text: t.review.safetyText, checks: [] });

  const notChecked = report.checks.filter((c) => c.status === 'GREY' && !used.has(c.id));
  return { items, notChecked };
}

function PriceRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? '' : 'text-[15px]'}`}>
      <span className={strong ? 'text-base font-semibold' : 'text-muted'}>{label}</span>
      <span className={`num ${strong ? 'text-[32px] font-bold' : ''}`}>{value}</span>
    </div>
  );
}

export function ReviewStep({ result, onCsv, onPrint, pdfBusy, onBooklet, bookletBusy }: { result: DesignResult; onCsv: () => void; onPrint: () => void; pdfBusy: boolean; onBooklet: () => void; bookletBusy: boolean }) {
  const t = useT();
  const locale = useUi((s) => s.locale) as EngineLocale;
  const p = useDesign((s) => s.params);
  const applyChange = useDesign((s) => s.applyChange);
  const openAdvanced = useUi((s) => s.openAdvanced);
  const { items, notChecked } = useReviewItems(result);
  const q = result.quote;
  const blocked = result.report.exportBlocked;
  const cm = formatCm;

  const goToDetails = (checkId?: string) => {
    openAdvanced(checkId ? 'checks' : 'order', checkId);
    window.location.hash = '#/design/structure';
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-8 py-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-6">
            <div className="flex h-36 w-28 shrink-0 items-center justify-center rounded-xl bg-sunken text-ink">
              <FurnitureArt kind={artKindFor(p)} />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-[32px] leading-tight font-bold">{blocked ? t.review.notReady : t.review.ready}</h1>
              <p className="text-[17px] text-muted">
                {t.review.summaryLine(cm(result.model.overall.x), cm(result.model.overall.y), cm(result.model.overall.z), (() => { const m = getMaterial(p.materialId); return m ? materialName(m, locale) : ''; })(), p.template === 'open_shelf' ? p.shelfCount : null)}
              </p>
              {result.bom.totalMassKg != null && (
                <p className="text-[15px] text-muted" title={t.review.weightHint}>
                  {t.review.weight(result.bom.totalMassKg)}
                </p>
              )}
            </div>
          </div>

          <ul className="overflow-hidden rounded-xl ring-1 ring-line">
            {items.map((item) => {
              // Every re-checked fix is offered right here, so a blocked design is fixed without leaving the summary.
              const fixes = item.status === 'RED' ? item.checks.flatMap((c) => c.fixes).filter((f) => f.projectedStatus !== 'RED') : [];
              const detailCheck = item.checks[0];
              return (
                <li key={item.key} className={`flex items-start gap-4 border-b border-line px-5 py-4 last:border-b-0 ${ITEM_BG[item.status]}`}>
                  <span className={`mt-0.5 ${ITEM_FG[item.status]}`}>
                    <StatusIcon status={item.status} size={22} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-base font-semibold">{item.title}</span>
                    {item.text && <span className="text-[15px] leading-relaxed">{item.text}</span>}
                    {fixes.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {fixes.map((f, i) => (
                          <Button key={f.change.label} size="sm" variant={i === 0 ? 'primary' : 'secondary'} onClick={() => applyChange(f.change)}>
                            {i === 0 ? `${t.review.fix}: ` : ''}
                            {f.change.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  {detailCheck && (
                    <button type="button" onClick={() => goToDetails(detailCheck.id)} className="shrink-0 py-1 text-[15px] font-medium text-accent-ink underline underline-offset-2">
                      {detailCheck.calculation ? t.structure.howCalculated : t.structure.whyShown}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <ArCard result={result} />

          {notChecked.length > 0 && (
            <details className="group rounded-xl bg-panel ring-1 ring-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-5 text-[15px]">
                <IconChevron size={16} className="transition group-open:-rotate-90 ltr:rotate-180 ltr:group-open:rotate-90" />
                <span className="font-medium">{t.review.notChecked}</span>
                <span className="text-muted">({notChecked.length})</span>
              </summary>
              <ul className="space-y-2 px-5 pb-4">
                {notChecked.map((c) => (
                  <li key={c.id} className="text-[15px]">
                    <span className="font-medium">{c.title}</span>
                    <span className="block text-sm text-muted">{c.explanation}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <div className="flex flex-col gap-3.5 rounded-xl bg-panel p-6 ring-1 ring-line">
            <span className="text-base font-semibold">{t.review.priceTitle}</span>
            {q ? (
              <>
                <PriceRow label={p.template === 'open_shelf' ? t.review.boardsLine : t.review.boardsOnlyLine} value={t.common.ils(q.materialsIls)} />
                {q.edgesIls > 0 && <PriceRow label={t.review.edgesLine} value={t.common.ils(q.edgesIls)} />}
                {q.addons.map((a) => (
                  <PriceRow key={a.name} label={a.name} value={t.common.ils(a.ils)} />
                ))}
                <PriceRow label={t.review.shippingLine} value={t.common.ils(q.shippingIls)} />
                <div className="h-px bg-line" />
                <PriceRow label={t.review.total} value={t.common.ils(q.totalIls)} strong />
                <p className="text-[13px] leading-relaxed text-muted">{p.template === 'open_shelf' ? t.review.hardwareNote : t.review.hardwareNoteGeneric}</p>
              </>
            ) : (
              <p className="text-[15px] text-muted">{t.flow.noPrice}</p>
            )}
            <Button size="lg" variant="primary" disabled={blocked || !q} onClick={() => goToDetails()} className="mt-1 w-full">
              {t.review.order}
            </Button>
            <p className="text-[13px] text-muted">{blocked ? t.review.blockedExport : t.review.orderSoon}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => goToDetails()} className="w-full">
                {t.review.partsDetails}
              </Button>
              <Button onClick={onPrint} disabled={blocked || pdfBusy} className="w-full">
                <IconDownload size={18} />
                {pdfBusy ? t.review.pdfPreparing : t.review.pdf}
              </Button>
            </div>
            <Button onClick={onBooklet} disabled={blocked || bookletBusy} className="w-full">
              <IconDownload size={18} />
              {bookletBusy ? t.booklet.preparing : t.booklet.download}
            </Button>
            <Button variant="ghost" onClick={onCsv} disabled={blocked} className="w-full">
              {t.review.csv}
            </Button>
          </div>
          <p className="rounded-xl bg-sunken px-5 py-4 text-sm leading-relaxed text-muted">{t.review.signInLater}</p>
        </aside>
      </div>
    </div>
  );
}

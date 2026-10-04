import { billCsv, tenderPackages, type BoqLine } from '../../engine';
import { useT } from '../../i18n';
import { useSurvey } from '../../state/spaceStore';
import { useUi } from '../../state/uiStore';
import { Button, downloadText } from '../common';

/**
 * The bill cut into what goes out to tender. The packages and their files are real; sending them is not,
 * because there is no network of contractors to send them to yet, and the button says so.
 */
export function TenderStage({ lines }: { lines: BoqLine[] }) {
  const t = useT();
  const k = t.journey.tender;
  const locale = useUi((s) => s.locale);
  const he = locale === 'he';
  const spaceId = useSurvey((s) => s.space.id);
  const packages = tenderPackages(lines);

  if (packages.length === 0) return <p className="text-[14px] text-muted">{k.empty}</p>;

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-[14px] leading-relaxed text-muted">{k.intro}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {packages.map((pkg) => (
          <div key={pkg.trade} className="flex flex-col gap-3 rounded-xl border border-line px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-[15px] font-semibold">{he ? pkg.he : pkg.en}</h3>
              <span className="text-[12.5px] text-muted">{k.lines(pkg.totals.lines)}</span>
              {pkg.totals.missingQuantity > 0 && <span className="text-[12.5px] text-muted">· {k.pending(pkg.totals.missingQuantity)}</span>}
            </div>
            {pkg.licensed && <span className="self-start rounded-full bg-warn-soft px-2.5 py-0.5 text-[12px]">{k.licensed}</span>}
            <div className="mt-auto flex flex-wrap items-center gap-2">
              <Button onClick={() => downloadText(`${spaceId}-${pkg.trade}-tender.csv`, billCsv(pkg.lines, 'trade', locale), 'text/csv;charset=utf-8')}>{k.download}</Button>
              <Button variant="ghost" disabled>
                {k.send}
              </Button>
              <span className="text-[12px] text-muted">{k.sendPrototype}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[12.5px] text-muted">{k.noSuppliers}</p>
    </div>
  );
}

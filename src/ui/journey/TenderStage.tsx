import { billDocumentCsv, tenderPackages } from '../../engine';
import { useT } from '../../i18n';
import { useUi } from '../../state/uiStore';
import { Button, downloadText } from '../common';
import type { RoomBill } from '../survey/useRoomBill';

/**
 * The bill cut into what goes out to tender. The packages and their files are real; sending them is not,
 * because there is no network of contractors to send them to yet, and the button says so.
 */
export function TenderStage({ bill }: { bill: RoomBill }) {
  const t = useT();
  const k = t.journey.tender;
  const locale = useUi((s) => s.locale);
  const he = locale === 'he';
  const { lines, roomName } = bill;
  const packages = tenderPackages(lines);

  if (packages.length === 0) return <p className="text-body text-muted">{k.empty}</p>;

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-body leading-relaxed text-muted">{k.intro}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {packages.map((pkg) => (
          <div key={pkg.trade} className="flex flex-col gap-3 rounded-xl border border-line px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-control font-semibold">{he ? pkg.he : pkg.en}</h3>
              <span className="text-small text-muted">{k.lines(pkg.totals.lines)}</span>
              {pkg.totals.missingQuantity > 0 && <span className="text-small text-muted">· {k.pending(pkg.totals.missingQuantity)}</span>}
            </div>
            {pkg.licensed && <span className="self-start rounded-full bg-warn-soft px-2.5 py-0.5 text-caption">{k.licensed}</span>}
            <div className="mt-auto flex flex-wrap items-center gap-2">
              {/* Numbered against the whole bill, so a contractor's package and the bill it came from agree. */}
              <Button onClick={() => downloadText(`tender-${pkg.trade}.csv`, billDocumentCsv(lines, { locale, roomName, only: (l) => l.trade === pkg.trade }), 'text/csv;charset=utf-8')}>{k.download}</Button>
              <Button variant="ghost" disabled>
                {k.send}
              </Button>
              <span className="text-caption text-muted">{k.sendPrototype}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-small text-muted">{k.noSuppliers}</p>
    </div>
  );
}

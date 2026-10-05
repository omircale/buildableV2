import { UNIT_LABEL, type BoqLine } from '../../engine';
import { useT } from '../../i18n';
import { useUi } from '../../state/uiStore';

const PREVIEW_ROWS = 8;

/**
 * How a quote will arrive and how it will read — with no prices in it.
 *
 * This step is a prototype, and the one thing it must not do is show a number. A plausible figure on
 * a screen a procurement manager is looking at would be read as a price, and a price with no source is
 * exactly what this system refuses to produce. So the preview is the real bill's lines with every price
 * cell empty, beside the three places real prices will come from.
 */
export function PriceStage({ lines }: { lines: BoqLine[] }) {
  const t = useT();
  const p = t.journey.price;
  const he = useUi((s) => s.locale) === 'he';
  const preview = lines.slice(0, PREVIEW_ROWS);

  return (
    <div className="space-y-6">
      <p className="rounded-xl border border-line bg-sunken px-4 py-3 text-[0.875rem] font-medium">{p.noNumbers}</p>

      <section>
        <h3 className="text-[0.875rem] font-semibold">{p.sourcesTitle}</h3>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          {p.sources.map((src) => (
            <div key={src.title} className="flex flex-col rounded-xl border border-line px-4 py-3">
              <div className="text-[0.875rem] font-semibold">{src.title}</div>
              <p className="mt-1 flex-1 text-[0.8125rem] leading-snug text-muted">{src.body}</p>
              <span className="mt-3 self-start rounded-full bg-unknown-soft px-2.5 py-0.5 text-[0.75rem]">{src.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-[0.875rem] font-semibold">{p.previewTitle}</h3>
        {preview.length === 0 ? (
          <p className="mt-1 text-[0.8125rem] text-muted">{p.empty}</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[560px] text-[0.8125rem]">
              <thead className="bg-sunken text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{p.columns.item}</th>
                  <th className="px-3 py-2 text-end font-medium">{p.columns.qty}</th>
                  <th className="px-3 py-2 text-end font-medium">{p.columns.unitPrice}</th>
                  <th className="px-3 py-2 text-end font-medium">{p.columns.range}</th>
                  <th className="px-3 py-2 text-start font-medium">{p.columns.source}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <td className="max-w-[28ch] truncate px-3 py-2">{he ? l.descriptionHe : l.descriptionEn}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{l.quantity == null ? '—' : `${l.quantity} ${he ? UNIT_LABEL[l.unit].he : UNIT_LABEL[l.unit].en}`}</td>
                    <td className="px-3 py-2 text-end text-muted">—</td>
                    <td className="px-3 py-2 text-end text-muted">—</td>
                    <td className="px-3 py-2 text-muted">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lines.length > PREVIEW_ROWS && <div className="border-t border-line px-3 py-2 text-[0.7812rem] text-muted">{p.more(lines.length - PREVIEW_ROWS)}</div>}
          </div>
        )}
      </section>
    </div>
  );
}

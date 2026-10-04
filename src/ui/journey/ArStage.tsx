import type { DesignResult } from '../../engine';
import { useT } from '../../i18n';
import { ArCard } from '../ar/ArCard';

/**
 * AR on site, in its two moments. Before the order, standing the designed piece in the real room works
 * today. After installation, laying the design over what was actually fitted needs the model anchored
 * to a scan of the room, which needs the iOS app — so that half is described, not shown.
 */
export function ArStage({ design, modeLabels }: { design: DesignResult; modeLabels: { live: string; prototype: string } }) {
  const t = useT();
  const a = t.journey.ar;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="min-w-0 space-y-3 rounded-xl border border-line p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-[12px] font-medium">{modeLabels.live}</span>
          <h3 className="text-[14px] font-semibold">{a.beforeTitle}</h3>
        </div>
        <p className="text-[13.5px] leading-relaxed text-muted">{a.beforeBody}</p>
        <ArCard result={design} />
      </section>

      <section className="min-w-0 space-y-3 rounded-xl border border-dashed border-line-strong p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-unknown-soft px-2.5 py-0.5 text-[12px] font-medium">{modeLabels.prototype}</span>
          <h3 className="text-[14px] font-semibold">{a.afterTitle}</h3>
        </div>
        <p className="text-[13.5px] leading-relaxed text-muted">{a.afterBody}</p>
        <p className="rounded-lg bg-sunken px-3 py-2 text-[12.5px] leading-snug">{a.afterNeeds}</p>
      </section>
    </div>
  );
}

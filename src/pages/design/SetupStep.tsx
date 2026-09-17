import type { DesignResult } from '../../engine';
import { useT } from '../../i18n';
import { useDesign } from '../../state/designStore';
import { Stepper } from '../../ui/common';
import { DimensionFields, LoadCards, ShelfMountingCards } from '../../ui/DesignControls';
import { TemplateFields } from '../../ui/TemplateFields';
import { Viewport3D } from '../../ui/Viewport3D';

const PRESET = { name: 'iso' as const, nonce: 0 };

export function SetupStep({ result }: { result: DesignResult }) {
  const t = useT();
  const p = useDesign((s) => s.params);
  const update = useDesign((s) => s.update);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
      <section className="flex flex-col gap-8 overflow-y-auto px-10 py-10 xl:px-16">
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] leading-tight font-bold">{t.setup.title}</h1>
          <p className="text-[17px] text-muted">{t.setup.subtitle}</p>
        </div>
        {p.template === 'open_shelf' ? (
          <>
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">{t.setup.size}</h2>
              <DimensionFields result={result} />
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">{t.setup.whatOn}</h2>
              <LoadCards />
            </div>
            <div className="flex flex-wrap gap-10">
              <div className="flex flex-col gap-3">
                <h2 className="text-base font-semibold">{t.setup.shelves}</h2>
                <Stepper label={t.setup.shelves} value={p.shelfCount} min={0} max={12} onChange={(v) => update({ shelfCount: v }, 'shelfCount')} format={t.setup.shelvesCount} />
              </div>
              <div className="flex flex-col gap-3">
                <h2 className="text-base font-semibold">{t.setup.dividers}</h2>
                <Stepper label={t.setup.dividers} value={p.dividerCount} min={0} max={6} onChange={(v) => update({ dividerCount: v }, 'dividerCount')} format={t.setup.dividersCount} />
              </div>
            </div>
            {p.shelfCount > 0 && (
              <div className="flex flex-col gap-3">
                <h2 className="text-base font-semibold">{t.setup.mounting}</h2>
                <ShelfMountingCards />
              </div>
            )}
            <p className="rounded-xl bg-panel p-4 text-[15px] leading-relaxed text-muted ring-1 ring-line">{t.setup.wallNote}</p>
          </>
        ) : (
          <div className="max-w-xl">
            <TemplateFields groups={['size', 'use']} />
          </div>
        )}
      </section>
      <section className="relative hidden min-h-0 bg-sunken lg:block" aria-label={t.setup.preview}>
        <Viewport3D result={result} preset={PRESET} preview />
        <span className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-sm text-muted">{t.setup.preview}</span>
      </section>
    </div>
  );
}

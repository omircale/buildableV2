import { useMemo } from 'react';
import type { AssemblyStep, DesignResult, FurnitureModel } from '../engine';
import { useT } from '../i18n';
import { drawComponents, type Shade } from './isometric';
import { formatCm } from './measure';

const SHADE_NEW: Record<Shade, string> = { top: '#f3c79a', front: '#e3a468', side: '#c9844a' };
const SHADE_DONE: Record<Shade, string> = { top: '#f4f1ec', front: '#e2ddd5', side: '#cfc8bd' };
const SHADE_REF: Record<Shade, string> = { top: '#fbfaf7', front: '#f1eee8', side: '#e6e1d9' };

/** Step index (0-based) at which each component first appears in the sequence. */
export function introducedAt(steps: AssemblyStep[]): Map<string, number> {
  const map = new Map<string, number>();
  steps.forEach((s, i) => s.componentIds.forEach((id) => !map.has(id) && map.set(id, i)));
  return map;
}

/**
 * Isometric drawing of one assembly step: parts added in this step are highlighted, parts from earlier steps are
 * drawn light, later parts are not drawn. With `step` null the finished piece is drawn.
 */
export function AssemblyDiagram({ model, steps, stepIndex, className }: { model: FurnitureModel; steps: AssemblyStep[]; stepIndex: number | null; className?: string }) {
  const drawing = useMemo(() => {
    const intro = introducedAt(steps);
    const visible = model.components.filter((c) => {
      if (stepIndex == null) return true;
      const at = intro.get(c.id);
      return at != null && at <= stepIndex;
    });
    return drawComponents(visible);
  }, [model, steps, stepIndex]);
  const current = new Set(stepIndex == null ? [] : steps[stepIndex].componentIds);
  const ref = new Set(model.components.filter((c) => c.reference).map((c) => c.id));
  const { minX, minY, maxX, maxY } = drawing.bounds;
  const pad = Math.max(maxX - minX, maxY - minY) * 0.04;
  return (
    <svg viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`} className={className} role="img" aria-hidden>
      {drawing.faces.map((f, i) => {
        const palette = ref.has(f.componentId) ? SHADE_REF : current.has(f.componentId) ? SHADE_NEW : SHADE_DONE;
        return (
          <polygon
            key={i}
            points={f.points.map((p) => p.join(',')).join(' ')}
            fill={palette[f.shade]}
            stroke={current.has(f.componentId) ? '#7a4a22' : '#6f675d'}
            strokeWidth={current.has(f.componentId) ? 2.2 : 1.2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}

const STEPS_PER_PAGE = 4;

/**
 * Light IKEA-style assembly booklet, rendered off-screen as A4 pages (`data-pdf-page`) and exported page by page:
 * cover with the finished piece, parts and hardware; then numbered step drawings.
 */
export function AssemblyBooklet({ result, projectName }: { result: DesignResult; projectName: string }) {
  const t = useT();
  const { model, assembly, bom } = result;
  const pages: AssemblyStep[][] = [];
  for (let i = 0; i < assembly.length; i += STEPS_PER_PAGE) pages.push(assembly.slice(i, i + STEPS_PER_PAGE));
  const page = 'relative flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white p-[12mm] text-black';
  const cell = 'border border-gray-300 px-1.5 py-0.5 text-start';
  const hwName = (id: string) => bom.hardware.find((h) => h.id === id);

  return (
    <div id="assembly-booklet" aria-hidden="true" dir={t.dir} className="hidden">
      <section data-pdf-page className={page}>
        <h1 className="text-2xl font-bold">{t.booklet.title}</h1>
        <p className="mb-2 text-sm text-gray-600">{projectName}</p>
        <AssemblyDiagram model={model} steps={assembly} stepIndex={null} className="mx-auto h-[95mm] w-full" />
        {bom.totalMassKg != null && <p className="mt-2 text-[11px] font-semibold">{t.booklet.weight(bom.totalMassKg)}</p>}
        <h2 className="mt-1 mb-1 text-base font-bold">{t.booklet.parts}</h2>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              {t.booklet.partCols.map((h) => (
                <th key={h} className={`${cell} bg-gray-100`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.parts.map((p) => (
              <tr key={p.id}>
                <td className={`${cell} font-mono`}>{p.id}</td>
                <td className={cell}>{p.name}</td>
                <td className={cell} dir="ltr">
                  {formatCm(p.lengthMm)} × {formatCm(p.widthMm)} × {formatCm(p.thicknessMm)}
                </td>
                <td className={cell}>{p.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2 className="mt-3 mb-1 text-base font-bold">{t.booklet.hardware}</h2>
        <table className="w-full border-collapse text-[10px]">
          <tbody>
            {bom.hardware.map((h) => (
              <tr key={h.id}>
                <td className={cell}>{h.name}</td>
                <td className={cell}>{h.spec}</td>
                <td className={`${cell} font-bold`}>× {h.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-auto pt-2 text-[9px] text-gray-500">{t.booklet.disclaimer}</p>
      </section>
      {pages.map((stepsOnPage, pi) => (
        <section key={pi} data-pdf-page className={page}>
          <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-[6mm]">
            {stepsOnPage.map((s) => (
              <div key={s.n} className="flex flex-col rounded-lg border border-gray-300 p-[4mm]">
                <div className="flex items-start gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-base font-bold text-white">{s.n}</span>
                  <span className="text-[12px] leading-snug font-semibold">{s.title}</span>
                </div>
                <AssemblyDiagram model={model} steps={assembly} stepIndex={s.n - 1} className="my-2 min-h-0 w-full flex-1" />
                {s.hardware.length > 0 && (
                  <p className="text-[10px]">
                    {s.hardware
                      .map((id) => hwName(id))
                      .filter(Boolean)
                      .map((h) => h!.name)
                      .join(' · ')}
                  </p>
                )}
                {s.warning && <p className="mt-1 text-[10px] font-semibold">⚠ {s.warning}</p>}
              </div>
            ))}
          </div>
          <p className="pt-2 text-center text-[9px] text-gray-500">
            {t.booklet.page(pi + 2, pages.length + 1)}
          </p>
        </section>
      ))}
    </div>
  );
}

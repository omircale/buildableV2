import { ENGINE_VERSION, getMaterial, type DesignResult } from '../engine';
import { CATEGORY_LABEL, STATUS_LABEL } from './common';
import { SheetDiagram } from './ManufacturingPanel';

/** Supplier/timber-yard order package. Printed through the browser so Hebrew text renders correctly. */
export function PrintPackage({ result, projectName, snapshot }: { result: DesignResult; projectName: string; snapshot: string | null }) {
  const { model, report, bom, nesting, assembly } = result;
  const p = model.params;
  const cell = 'border border-gray-300 px-2 py-1 text-right';
  return (
    <div className="hidden bg-white p-2 text-[11px] leading-snug text-black print:block">
      <header className="mb-3 flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <h1 className="text-xl font-bold">חבילת הזמנה וייצור — {projectName}</h1>
          <p>
            תאריך: {new Date().toLocaleDateString('he-IL')} · גרסת מנוע {ENGINE_VERSION}
          </p>
        </div>
        <div className="text-left font-bold">Buildable</div>
      </header>

      <section className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <h2 className="mb-1 text-sm font-bold">סיכום</h2>
          <p>
            יחידת מדפים פתוחה {p.widthMm}×{p.heightMm}×{p.depthMm} מ"מ (רוחב×גובה×עומק)
          </p>
          <p>
            חומר: {getMaterial(p.materialId)?.nameHe} {p.thicknessMm} מ"מ{p.hasBack ? ` · גב: ${getMaterial(p.backMaterialId)?.nameHe} ${p.backThicknessMm} מ"מ` : ' · ללא גב'}
          </p>
          <p>
            מדפים: {p.shelfCount} · מחיצות: {p.dividerCount} · עומס מתוכנן למדף: {p.loadPerShelf.massKg} ק"ג ({p.loadPerShelf.distribution === 'uniform' ? 'מפוזר' : 'מרוכז'})
          </p>
          <h2 className="mb-1 mt-2 text-sm font-bold">סטטוס אימות תוכנתי</h2>
          <table className="w-full border-collapse">
            <tbody>
              {Object.entries(report.coverage).map(([k, v]) => (
                <tr key={k}>
                  <td className={cell}>{CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL]}</td>
                  <td className={cell}>{STATUS_LABEL[v]}</td>
                </tr>
              ))}
              <tr>
                <td className={cell}>אימות פיזי</td>
                <td className={cell}>נדרש</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1">המסמך אינו אישור בטיחות או עמידה בתקן. כל הבדיקות התוכנתיות מבוססות על ההנחות והמקורות המפורטים במערכת.</p>
        </div>
        {snapshot && <img src={snapshot} alt="הדמיית הרהיט" className="max-h-[90mm] w-full object-contain" />}
      </section>

      <section className="mb-3">
        <h2 className="mb-1 text-sm font-bold">רשימת לוחות לרכישה</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['חומר', 'עובי', 'מידת לוח', 'כמות', 'הערה'].map((h) => (
                <th key={h} className={`${cell} bg-gray-100`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bom.sheets.map((s) => (
              <tr key={`${s.materialId}-${s.thicknessMm}-${s.sheetSize}`}>
                <td className={cell}>{s.materialName}</td>
                <td className={cell}>{s.thicknessMm} מ"מ</td>
                <td className={cell}>{s.sheetSize}</td>
                <td className={cell}>{s.sheets}</td>
                <td className={cell}>{s.sizeIsAssumption ? 'מידת לוח לאישור הספק' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-3">
        <h2 className="mb-1 text-sm font-bold">רשימת חיתוך (מידות גמורות, מ"מ)</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['מזהה', 'חלק', 'חומר', 'עובי', 'אורך', 'רוחב', 'כמות', 'סיבים', 'קנט'].map((h) => (
                <th key={h} className={`${cell} bg-gray-100`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.parts.map((pt) => (
              <tr key={pt.id}>
                <td className={cell}>{pt.id}</td>
                <td className={cell}>{pt.name}</td>
                <td className={cell}>{getMaterial(pt.materialId)?.nameHe}</td>
                <td className={cell}>{pt.thicknessMm}</td>
                <td className={cell}>{pt.lengthMm}</td>
                <td className={cell}>{pt.widthMm}</td>
                <td className={cell}>{pt.quantity}</td>
                <td className={cell}>{pt.grainLocked ? 'לאורך' : '—'}</td>
                <td className={cell}>{pt.edgeBanding.length1 ? `${pt.edgeBanding.length1} מ"מ אורך אחד` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-3">
        <h2 className="mb-1 text-sm font-bold">פרזול</h2>
        <table className="w-full border-collapse">
          <tbody>
            {bom.hardware.map((h) => (
              <tr key={h.id}>
                <td className={cell}>{h.name}</td>
                <td className={cell}>{h.quantity}</td>
                <td className={cell}>{h.spec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="print-break">
        <h2 className="mb-1 text-sm font-bold">פריסת חיתוך מוצעת</h2>
        <div className="grid grid-cols-2 gap-2">
          {nesting.flatMap((g) =>
            g.sheets.map((s, i) => (
              <figure key={`${g.materialId}-${g.thicknessMm}-${s.index}`}>
                <SheetDiagram group={g} sheetIndex={i} compact />
                <figcaption>
                  {getMaterial(g.materialId)?.nameHe} {g.thicknessMm} מ"מ · לוח {s.index} · פחת {s.wastePercent}%
                </figcaption>
              </figure>
            )),
          )}
        </div>
        <h2 className="mb-1 mt-3 text-sm font-bold">סדר הרכבה</h2>
        <ol className="list-decimal pr-5">
          {assembly.map((s) => (
            <li key={s.n}>
              {s.title}
              {s.warning ? ` — ${s.warning}` : ''}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

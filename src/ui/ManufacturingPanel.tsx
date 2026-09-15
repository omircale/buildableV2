import { useMemo, useState } from 'react';
import { changeImpact, getMaterial, runDesign, type DesignResult, type NestingGroupResult } from '../engine';
import { useDesign } from '../state/designStore';
import { CATEGORY_LABEL, StatusBadge } from './common';

type Tab = 'cut' | 'sheets' | 'bom' | 'assembly' | 'impact';

const PALETTE = ['#e8c9a0', '#c9dbe8', '#d7e8c9', '#e8d0e3', '#f0e0b0', '#cfe3df', '#e3cfc9', '#d9d2ec'];

export function SheetDiagram({ group, sheetIndex, compact }: { group: NestingGroupResult; sheetIndex: number; compact?: boolean }) {
  const sheet = group.sheets[sheetIndex];
  const W = sheet.stock.lengthMm;
  const H = sheet.stock.widthMm;
  const partIds = [...new Set(group.sheets.flatMap((s) => s.placements.map((p) => p.partId)))];
  return (
    <svg viewBox={`-20 -20 ${W + 40} ${H + 40}`} className={compact ? 'w-full' : 'w-full max-w-full'} role="img" aria-label={`לוח ${sheet.index}`}>
      <rect x={0} y={0} width={W} height={H} fill="#f4efe7" stroke="#8a7f70" strokeWidth={4} />
      {sheet.placements.map((pl) => (
        <g key={`${pl.partId}-${pl.instance}`}>
          <rect x={pl.x} y={pl.y} width={pl.lengthMm} height={pl.widthMm} fill={PALETTE[partIds.indexOf(pl.partId) % PALETTE.length]} stroke="#5b5146" strokeWidth={2} />
          {pl.lengthMm > 160 && pl.widthMm > 70 && (
            <text x={pl.x + pl.lengthMm / 2} y={pl.y + pl.widthMm / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(60, pl.widthMm / 3)} fill="#2a241e" direction="ltr">
              {pl.partId} · {Math.round(pl.lengthMm)}×{Math.round(pl.widthMm)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function ManufacturingPanel({ result }: { result: DesignResult }) {
  const [tab, setTab] = useState<Tab>('cut');
  const previous = useDesign((s) => s.previous);
  const config = useDesign((s) => s.config);
  const selectedId = useDesign((s) => s.selectedId);
  const select = useDesign((s) => s.select);
  const impact = useMemo(() => (previous ? changeImpact(runDesign(previous, config), result) : null), [previous, result, config]);
  const { model, nesting, bom, assembly } = result;
  const tabs: [Tab, string][] = [
    ['cut', 'רשימת חיתוך'],
    ['sheets', 'פריסה על לוחות'],
    ['bom', 'כתב כמויות'],
    ['assembly', 'הרכבה'],
    ['impact', 'השפעת שינוי'],
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-line bg-white px-3 pt-2">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-t-md px-3 py-1.5 text-sm ${tab === id ? 'bg-paper font-semibold text-ink ring-1 ring-line ring-b-0' : 'text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-3 text-sm">
        {result.report.exportBlocked && tab !== 'impact' && <div className="mb-2 rounded-md bg-bad-soft px-3 py-2 text-xs text-bad">ייצוא חסום: יש כשל בבדיקות. הנתונים מוצגים לעיון בלבד.</div>}

        {tab === 'cut' && (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-line text-muted">
                {['מזהה', 'חלק', 'חומר', 'עובי', 'אורך', 'רוחב', 'כמות', 'כיוון סיבים', 'קנט'].map((h) => (
                  <th key={h} className="px-2 py-1.5 text-right font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.parts.map((p) => (
                <tr key={p.id} onClick={() => select(p.componentIds[0])} className={`cursor-pointer border-b border-line/60 hover:bg-accent-soft ${p.componentIds.includes(selectedId ?? '') ? 'bg-accent-soft' : ''}`}>
                  <td className="px-2 py-1.5 font-mono">{p.id}</td>
                  <td className="px-2 py-1.5">{p.name}</td>
                  <td className="px-2 py-1.5">{getMaterial(p.materialId)?.nameHe}</td>
                  <td className="num px-2 py-1.5">{p.thicknessMm}</td>
                  <td className="num px-2 py-1.5">{p.lengthMm}</td>
                  <td className="num px-2 py-1.5">{p.widthMm}</td>
                  <td className="num px-2 py-1.5 font-semibold">{p.quantity}</td>
                  <td className="px-2 py-1.5">{p.grainLocked ? 'לאורך' : '—'}</td>
                  <td className="px-2 py-1.5">{p.edgeBanding.length1 ? `${p.edgeBanding.length1} מ"מ (אורך)` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'sheets' && (
          <div className="space-y-4">
            <p className="text-xs text-muted">
              חיתוך גיליוטינה, להב {config.kerfMm} מ"מ, שוליים {config.trimMarginMm} מ"מ. חלקים עם כיוון סיבים לא מסובבים. מידות הלוחות טרם אומתו מול ספק.
            </p>
            {nesting.map((g) => (
              <div key={`${g.materialId}-${g.thicknessMm}`}>
                <h4 className="mb-1 font-semibold">
                  {getMaterial(g.materialId)?.nameHe} {g.thicknessMm} מ"מ — {g.sheets.length} לוחות
                </h4>
                {g.unplaced.length > 0 && <p className="text-xs text-bad">לא שובצו: {g.unplaced.map((u) => `${u.partId} (${u.reason})`).join(', ')}</p>}
                <div className="grid gap-3 md:grid-cols-2">
                  {g.sheets.map((s, i) => (
                    <figure key={s.index} className="rounded-md bg-white p-2 ring-1 ring-line">
                      <SheetDiagram group={g} sheetIndex={i} />
                      <figcaption className="mt-1 text-xs text-muted">
                        לוח {s.index}: <span className="num">{s.stock.lengthMm}×{s.stock.widthMm}</span> · פחת <span className="num">{s.wastePercent}%</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'bom' && (
          <div className="space-y-4">
            <div>
              <h4 className="mb-1 font-semibold">לוחות</h4>
              <table className="w-full text-xs">
                <tbody>
                  {bom.sheets.map((s) => (
                    <tr key={`${s.materialId}-${s.thicknessMm}-${s.sheetSize}`} className="border-b border-line/60">
                      <td className="py-1.5">{s.materialName}</td>
                      <td className="num">{s.thicknessMm} מ"מ</td>
                      <td className="num">{s.sheetSize}</td>
                      <td className="num font-semibold">× {s.sheets}</td>
                      <td className="text-muted">פחת {s.wastePercent}%{s.sizeIsAssumption ? ' · מידה לא מאומתת' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bom.edgeBanding.length > 0 && (
              <div>
                <h4 className="mb-1 font-semibold">קנט</h4>
                {bom.edgeBanding.map((e) => (
                  <p key={e.thicknessMm} className="text-xs">
                    {e.thicknessMm} מ"מ — <span className="num">{e.lengthM}</span> מ' ({e.basis})
                  </p>
                ))}
              </div>
            )}
            <div>
              <h4 className="mb-1 font-semibold">פרזול</h4>
              <table className="w-full text-xs">
                <tbody>
                  {bom.hardware.map((h) => (
                    <tr key={h.id} className="border-b border-line/60 align-top">
                      <td className="py-1.5 font-medium">{h.name}</td>
                      <td className="num font-semibold">× {h.quantity}</td>
                      <td className="text-muted">
                        {h.spec}
                        <br />
                        {h.basis}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs">משקל משוער של הרהיט: {bom.totalMassKg != null ? <span className="num">{bom.totalMassKg} ק"ג</span> : 'לא ידוע'} (כולל צפיפויות מונחות כשאין מקור)</p>
          </div>
        )}

        {tab === 'assembly' && (
          <ol className="space-y-2">
            {assembly.map((s) => (
              <li key={s.n} className="flex gap-3 rounded-md bg-white p-2 ring-1 ring-line">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{s.n}</span>
                <div className="text-xs">
                  <div className="font-medium">{s.title}</div>
                  {s.hardware.length > 0 && <div className="text-muted">פרזול: {s.hardware.map((h) => bom.hardware.find((x) => x.id === h)?.name ?? h).join(', ')}</div>}
                  {s.warning && <div className="mt-0.5 text-warn">⚠ {s.warning}</div>}
                </div>
              </li>
            ))}
          </ol>
        )}

        {tab === 'impact' &&
          (impact ? (
            <div className="space-y-2 text-xs">
              <p>
                שינוי אחרון: <strong>{impact.changedParams.join(', ') || 'אין'}</strong>
              </p>
              <ul className="space-y-1">
                <li>רכיבים שהשתנו במידה: {impact.resizedComponents.length}</li>
                <li>נוספו: {impact.addedComponents.length} · הוסרו: {impact.removedComponents.length}</li>
                <li>רשימת חיתוך: {impact.cutListChanged ? 'השתנתה' : 'ללא שינוי'}</li>
                <li>
                  לוחות: <span className="num">{impact.sheetsBefore}</span> ← <span className="num">{impact.sheetsAfter}</span>
                </li>
              </ul>
              {impact.statusChanges.length > 0 && (
                <div className="space-y-1">
                  <div className="font-semibold">שינויי סטטוס:</div>
                  {impact.statusChanges.map((s) => (
                    <div key={s.category} className="flex items-center gap-2">
                      <span className="w-16">{CATEGORY_LABEL[s.category as keyof typeof CATEGORY_LABEL]}</span>
                      <StatusBadge status={s.from as never} /> ← <StatusBadge status={s.to as never} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted">עדיין לא בוצע שינוי.</p>
          ))}
      </div>
    </div>
  );
}

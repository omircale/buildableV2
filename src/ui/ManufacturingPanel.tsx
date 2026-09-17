import { Fragment, useMemo, useState } from 'react';
import { changeImpact, edgeOptionName, getMaterial, materialName, runDesign, type CheckCategory, type DesignResult, type EngineLocale, type NestingGroupResult, type Part, type Status, type SupplierQuote } from '../engine';
import { useT, type Dict } from '../i18n';
import { useDesign } from '../state/designStore';
import { useUi, type AdvancedTab } from '../state/uiStore';
import { SearchField, StatusBadge, buttonClass, matchesQuery } from './common';
import { AssemblyDiagram } from './AssemblyBooklet';
import { IconCheck } from './icons';

export function edgeLabel(p: Part, t: Dict): string {
  void t;
  const e = p.edges;
  const n = Number(e.long1) + Number(e.long2) + Number(e.short1) + Number(e.short2);
  if (n === 0) return '—';
  if (n === 4) return t.mfg.edgeAll;
  return e.long1 && !e.long2 && !e.short1 ? t.mfg.edgeOneLong : t.mfg.edgeN(n);
}

export function orderText(q: SupplierQuote, projectName: string, t: Dict, locale: EngineLocale = 'he', parts: Part[] = []): string {
  const o = t.mfg.orderText;
  const machining = parts.flatMap((p) => (p.machining ?? []).map((m) => `${p.id} (${p.name} ×${p.quantity}): ${m}`));
  return [
    o.header(projectName),
    ...q.lines.map((l, i) => o.line(i + 1, l.productTitle, l.finishId, l.widthCm, l.depthCm, l.edgeOption ? edgeOptionName(l.edgeOption, locale) : t.mfg.noEdges, l.quantity, l.lineIls)),
    ...q.addons.map((a) => o.addon(a.name, a.productTitle, a.ils)),
    o.total(q.totalIls),
    o.grain,
    // Drilling and angle cuts the supplier's straight cut does not cover, so the order never loses them.
    ...(machining.length ? ['', t.mfg.machining, ...machining] : []),
  ].join('\n');
}

const th = 'px-2.5 py-2 text-start font-medium whitespace-nowrap';
const td = 'px-2.5 py-2';

export function OrderTab({ result }: { result: DesignResult }) {
  const t = useT();
  const locale = useUi((s) => s.locale) as EngineLocale;
  const q = result.quote;
  const projectName = useDesign((s) => s.projectName);
  const [copied, setCopied] = useState(false);
  if (!q) return <p className="text-sm text-muted">{t.mfg.noQuote}</p>;
  const ils = t.common.ilsExact;
  return (
    <div className="space-y-4 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold">{t.mfg.orderTitle}</div>
          <div className="text-muted">{t.mfg.orderSubtitle}</div>
        </div>
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          onClick={() => {
            void navigator.clipboard.writeText(orderText(q, projectName, t, locale, result.model.parts)).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied && <IconCheck size={16} />}
          {copied ? t.mfg.copied : t.mfg.copy}
        </button>
      </div>
      {q.issues.length > 0 && (
        <div className="rounded-lg bg-bad-soft px-3 py-2 text-bad">
          {t.mfg.cannotOrder} {q.issues.join(' · ')}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line text-muted">
              {t.mfg.orderCols.map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.lines.map((l, i) => (
              <tr key={l.partId} className={`border-b border-line/60 ${l.issues.length ? 'bg-bad-soft/60' : ''}`}>
                <td className={td}>{i + 1}</td>
                <td className={td}>
                  {l.productTitle}
                  <div className="text-xs text-muted">
                    {l.partId} · {l.partName}
                  </div>
                </td>
                <td className={td}>{l.finishId}</td>
                <td className={`num ${td} font-semibold`}>{l.widthCm}</td>
                <td className={`num ${td} font-semibold`}>{l.depthCm}</td>
                <td className={td}>{l.edgeOption ? edgeOptionName(l.edgeOption, locale) : t.mfg.noEdges}</td>
                <td className={`num ${td} font-semibold`}>{l.quantity}</td>
                <td className={`num ${td}`}>
                  {ils(l.unitIls)}
                  {l.unitEdgeIls > 0 && (
                    <div className="text-xs text-muted">
                      {t.mfg.inclEdge} {ils(l.unitEdgeIls)}
                    </div>
                  )}
                </td>
                <td className={`num ${td} font-semibold`}>{ils(l.lineIls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="space-y-1 rounded-lg bg-panel p-3 ring-1 ring-line">
          <Row label={t.mfg.materials} value={ils(q.materialsIls)} />
          {q.edgesIls > 0 && <Row label={t.mfg.edges} value={ils(q.edgesIls)} />}
          {q.addons.map((a) => (
            <Row key={a.name} label={a.name} value={ils(a.ils)} />
          ))}
          <Row label={t.mfg.shipping} value={ils(q.shippingIls)} />
          <div className="flex justify-between border-t border-line pt-1.5 text-[15px] font-bold">
            <span>{t.mfg.total}</span>
            <span className="num">{ils(q.totalIls)}</span>
          </div>
        </div>
        <div className="space-y-1 rounded-lg bg-panel p-3 ring-1 ring-line">
          <div className="font-semibold">{t.mfg.buySeparately}</div>
          {q.notAvailable.map((h) => (
            <div key={h.id}>
              {h.name} × {h.quantity}
            </div>
          ))}
          <details className="pt-1 text-muted">
            <summary className="cursor-pointer py-1">{t.mfg.quoteAssumptions}</summary>
            <ul className="list-disc ps-4">
              {q.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

const PALETTE = ['#e8c9a0', '#c9dbe8', '#d7e8c9', '#e8d0e3', '#f0e0b0', '#cfe3df', '#e3cfc9', '#d9d2ec'];

export function SheetDiagram({ group, sheetIndex }: { group: NestingGroupResult; sheetIndex: number }) {
  const sheet = group.sheets[sheetIndex];
  const W = sheet.stock.lengthMm;
  const H = sheet.stock.widthMm;
  const partIds = [...new Set(group.sheets.flatMap((s) => s.placements.map((p) => p.partId)))];
  return (
    <svg viewBox={`-20 -20 ${W + 40} ${H + 40}`} className="w-full" role="img" aria-label={`sheet ${sheet.index}`}>
      <rect x={0} y={0} width={W} height={H} fill="#f4efe7" stroke="#8a7f70" strokeWidth={4} />
      {sheet.placements.map((pl) => (
        <g key={`${pl.partId}-${pl.instance}`}>
          <rect x={pl.x} y={pl.y} width={pl.lengthMm} height={pl.widthMm} fill={PALETTE[partIds.indexOf(pl.partId) % PALETTE.length]} stroke="#5b5146" strokeWidth={2} />
          {pl.lengthMm > 160 && pl.widthMm > 70 && (
            <text x={pl.x + pl.lengthMm / 2} y={pl.y + pl.widthMm / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(60, pl.widthMm / 3)} fill="#2a241e" direction="ltr">
              {pl.partId} · {pl.lengthMm}×{pl.widthMm}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** Renders one manufacturing tab; the tab strip lives in AdvancedPanel. */
export function ManufacturingTab({ result, tab }: { result: DesignResult; tab: Exclude<AdvancedTab, 'checks'> }) {
  const t = useT();
  const locale = useUi((s) => s.locale) as EngineLocale;
  const previous = useDesign((s) => s.previous);
  const config = useDesign((s) => s.config);
  const selectedId = useDesign((s) => s.selectedId);
  const select = useDesign((s) => s.select);
  const impact = useMemo(() => (tab === 'impact' && previous ? changeImpact(runDesign(previous, config), result) : null), [tab, previous, result, config]);
  const { model, nesting, bom, assembly } = result;
  const [query, setQuery] = useState('');
  const parts = model.parts.filter((p) => { const m = getMaterial(p.materialId); return matchesQuery(query, p.id, p.name, m && materialName(m, locale), p.finishId); });
  const hardware = bom.hardware.filter((h) => matchesQuery(query, h.name, h.spec));

  return (
    <div className="space-y-3 p-5 text-sm">
      {result.report.exportBlocked && tab !== 'impact' && tab !== 'order' && <div className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{t.mfg.blockedNotice}</div>}

      {tab === 'order' && <OrderTab result={result} />}

      {(tab === 'cut' || tab === 'bom') && <SearchField value={query} onChange={setQuery} placeholder={t.search.parts} />}

      {tab === 'cut' && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-muted">
                {t.mfg.cutCols.map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <Fragment key={p.id}>
                <tr onClick={() => select(p.componentIds[0])} className={`cursor-pointer border-b border-line/60 hover:bg-accent-soft ${p.componentIds.includes(selectedId ?? '') ? 'bg-accent-soft' : ''}`}>
                  <td className={`${td} font-mono`}>{p.id}</td>
                  <td className={td}>{p.name}</td>
                  <td className={td}>{(() => { const m = getMaterial(p.materialId); return m && materialName(m, locale); })()}</td>
                  <td className={td}>{p.finishId}</td>
                  <td className={`num ${td}`}>{p.thicknessMm}</td>
                  <td className={`num ${td}`}>{p.lengthMm}</td>
                  <td className={`num ${td}`}>{p.widthMm}</td>
                  <td className={`num ${td} font-semibold`}>{p.quantity}</td>
                  <td className={td}>{p.grainLocked ? t.mfg.grainAlong : '—'}</td>
                  <td className={td}>{edgeLabel(p, t)}</td>
                </tr>
                {p.machining?.length ? (
                  <tr className="border-b border-line/60 bg-warn-soft/40">
                    <td className={td} />
                    <td className={`${td} text-[12px]`} colSpan={t.mfg.cutCols.length - 1}>
                      <span className="font-semibold">{t.mfg.machining}:</span> {p.machining.join(' · ')}
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sheets' && (
        <div className="space-y-4">
          <p className="text-[13px] text-muted">{t.mfg.sheetsNote(config.kerfMm, config.trimMarginMm)}</p>
          {nesting.map((g) => (
            <div key={`${g.materialId}-${g.thicknessMm}`}>
              <h4 className="mb-1.5 font-semibold">
                {(() => { const m = getMaterial(g.materialId); return m && materialName(m, locale); })()} {g.thicknessMm} {t.common.mm} · {t.mfg.sheetsCount(g.sheets.length)}
              </h4>
              {g.unplaced.length > 0 && (
                <p className="text-[13px] text-bad">
                  {t.mfg.unplaced} {g.unplaced.map((u) => `${u.partId} (${u.reason})`).join(', ')}
                </p>
              )}
              <div className="grid gap-3">
                {g.sheets.map((s, i) => (
                  <figure key={s.index} className="rounded-lg bg-panel p-2 ring-1 ring-line">
                    <SheetDiagram group={g} sheetIndex={i} />
                    <figcaption className="mt-1 text-[13px] text-muted">
                      {t.mfg.sheetCaption(s.index)}: <span className="num">{s.stock.lengthMm}×{s.stock.widthMm}</span> · {t.mfg.waste} <span className="num">{s.wastePercent}%</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'bom' && (
        <div className="space-y-5 text-[13px]">
          <div>
            <h4 className="mb-1.5 text-[15px] font-semibold">{t.mfg.boards}</h4>
            <table className="w-full">
              <tbody>
                {bom.sheets.map((s) => (
                  <tr key={`${s.materialId}-${s.thicknessMm}-${s.sheetSize}`} className="border-b border-line/60">
                    <td className="py-2">{s.materialName}</td>
                    <td className="num">
                      {s.thicknessMm} {t.common.mm}
                    </td>
                    <td className="num">{s.sheetSize}</td>
                    <td className="num font-semibold">× {s.sheets}</td>
                    <td className="text-muted">
                      {t.mfg.waste} {s.wastePercent}%{s.sizeIsAssumption ? ` · ${t.mfg.unverifiedSize}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bom.edgeBanding.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[15px] font-semibold">{t.mfg.edgeBanding}</h4>
              {bom.edgeBanding.map((e) => (
                <p key={e.basis}>
                  <span className="num">{e.lengthM}</span> m ({e.basis})
                </p>
              ))}
            </div>
          )}
          <div>
            <h4 className="mb-1.5 text-[15px] font-semibold">{t.mfg.hardware}</h4>
            <table className="w-full">
              <tbody>
                {hardware.map((h) => (
                  <tr key={h.id} className="border-b border-line/60 align-top">
                    <td className="py-2 font-medium">{h.name}</td>
                    <td className="num px-2 font-semibold">× {h.quantity}</td>
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
          <p>
            {t.mfg.mass} {bom.totalMassKg != null ? <span className="num">{bom.totalMassKg} {t.common.kg}</span> : t.mfg.massUnknown} {t.mfg.massNote}
          </p>
        </div>
      )}

      {tab === 'assembly' && (
        <ol className="space-y-2">
          {assembly.map((s) => (
            <li key={s.n} className="flex gap-3 rounded-lg bg-panel p-3 ring-1 ring-line">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-on-accent">{s.n}</span>
              <AssemblyDiagram model={model} steps={assembly} stepIndex={s.n - 1} className="h-24 w-28 shrink-0 rounded bg-white" />
              <div className="text-[13px]">
                <div className="text-[15px] font-medium">{s.title}</div>
                {s.hardware.length > 0 && (
                  <div className="text-muted">
                    {t.mfg.stepHardware} {s.hardware.map((h) => bom.hardware.find((x) => x.id === h)?.name ?? h).join(', ')}
                  </div>
                )}
                {s.warning && <div className="mt-0.5 text-warn">⚠ {s.warning}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {tab === 'impact' &&
        (impact ? (
          <div className="space-y-2 text-[13px]">
            <p>
              {t.mfg.lastChange} <strong>{impact.changedParams.join(', ') || t.mfg.none}</strong>
            </p>
            <ul className="space-y-1">
              <li>
                {t.mfg.resized} {impact.resizedComponents.length}
              </li>
              <li>
                {t.mfg.added} {impact.addedComponents.length} · {t.mfg.removed} {impact.removedComponents.length}
              </li>
              <li>
                {t.mfg.cutList} {impact.cutListChanged ? t.mfg.changed : t.mfg.unchanged}
              </li>
              <li>
                {t.mfg.sheets} <span className="num">{impact.sheetsBefore}</span> → <span className="num">{impact.sheetsAfter}</span>
              </li>
            </ul>
            {impact.statusChanges.length > 0 && (
              <div className="space-y-1">
                <div className="font-semibold">{t.mfg.statusChanges}</div>
                {impact.statusChanges.map((s) => (
                  <div key={s.category} className="flex items-center gap-2">
                    <span className="w-20">{t.category[s.category as CheckCategory]}</span>
                    <StatusBadge status={s.from as Status} /> → <StatusBadge status={s.to as Status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-muted">{t.mfg.noChangeYet}</p>
        ))}
    </div>
  );
}

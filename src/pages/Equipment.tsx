import { useMemo, useState } from 'react';
import type { AuthState } from '../cloud/api';
import { EQUIPMENT, SERVICE_LABEL, type EquipmentItem } from '../engine/equipment/catalog';
import { serviceDemand, type DemandReport, type Severity } from '../engine/services/demand';
import { POOL_BAR_EXAMPLE, SLUSH_KIOSK_EXAMPLE } from '../engine/services/programs';
import { PRODUCTS } from '../engine/services/products';
import { DEMAND_DRAFT, DISCIPLINE_LABEL, demandSheets, SEVERITY_LABEL } from '../engine/services/sheet';
import type { Fact, ProductSpec } from '../engine/services/spec';
import { useServicesT, type ServicesDict } from '../i18n/services';
import { useServices } from '../state/servicesStore';
import { useUi } from '../state/uiStore';
import { AppHeader } from '../ui/AppHeader';
import { Button, inputClass, Stepper } from '../ui/common';
import { downloadWorkbook } from '../ui/xlsxFile';

/**
 * What a space's equipment asks of the building. The person says what is in the space and which
 * model; everything else on the screen is worked out by the engine (engine/services/demand.ts), and
 * every number on it can be traced to a data sheet or is marked unknown.
 */

const productsFor = (equipmentId: string) => PRODUCTS.filter((p) => p.equipmentId === equipmentId);
const fmt = (n: number, locale: 'he' | 'en') => n.toLocaleString(locale === 'he' ? 'he-IL' : 'en-GB');

/* ------------------------------------------------------------------ model data */

/** One row per thing the building needs to know about a model: the value and where it was read. */
function ModelFacts({ spec }: { spec: ProductSpec }) {
  const t = useServicesT();
  const f = t.fields;
  const locale = useUi((s) => s.locale);
  const yn = (v: boolean) => (v ? t.yes : t.no);
  const num = (v: number, unit: string) => `${fmt(v, locale)} ${unit}`;
  const rows: { label: string; facts: Fact<unknown>[]; text: string | null }[] = [
    {
      label: f.size,
      facts: [spec.size.widthMm, spec.size.depthMm, spec.size.heightMm],
      text: spec.size.widthMm.value !== null && spec.size.depthMm.value !== null && spec.size.heightMm.value !== null ? `${spec.size.widthMm.value}×${spec.size.depthMm.value}×${spec.size.heightMm.value} mm` : null,
    },
    { label: f.massKg, facts: [spec.massKg], text: spec.massKg.value === null ? null : num(spec.massKg.value, 'kg') },
    { label: f.power, facts: [spec.electrical.powerW], text: spec.electrical.powerW.value === null ? null : num(spec.electrical.powerW.value, 'W') },
    {
      label: f.voltage,
      facts: [spec.electrical.voltageV, spec.electrical.frequencyHz],
      text: spec.electrical.voltageV.value === null ? null : `${spec.electrical.voltageV.value} V${spec.electrical.frequencyHz.value === null ? '' : ` ${spec.electrical.frequencyHz.value} Hz`}`,
    },
    { label: f.phases, facts: [spec.electrical.phases], text: spec.electrical.phases.value === null ? null : String(spec.electrical.phases.value) },
    { label: f.currentA, facts: [spec.electrical.currentA], text: spec.electrical.currentA.value === null ? null : num(spec.electrical.currentA.value, 'A') },
    { label: f.dedicatedCircuit, facts: [spec.electrical.dedicatedCircuit], text: spec.electrical.dedicatedCircuit.value === null ? null : yn(spec.electrical.dedicatedCircuit.value) },
    { label: f.waterRequired, facts: [spec.water.required], text: spec.water.required.value === null ? null : yn(spec.water.required.value) },
    { label: f.waterConnection, facts: [spec.water.connection], text: spec.water.connection.value },
    {
      label: f.pressure,
      facts: [spec.water.minPressureBar, spec.water.maxPressureBar],
      text: spec.water.minPressureBar.value === null ? null : `${spec.water.minPressureBar.value}–${spec.water.maxPressureBar.value ?? '?'} bar`,
    },
    { label: f.scaleFilter, facts: [spec.water.scaleFilter], text: spec.water.scaleFilter.value === null ? null : yn(spec.water.scaleFilter.value) },
    { label: f.drainRequired, facts: [spec.drain.required], text: spec.drain.required.value === null ? null : yn(spec.drain.required.value) },
    { label: f.greaseSeparator, facts: [spec.drain.greaseSeparator], text: spec.drain.greaseSeparator.value === null ? null : yn(spec.drain.greaseSeparator.value) },
    { label: f.condenser, facts: [spec.heat.condenser], text: spec.heat.condenser.value },
    { label: f.toRoom, facts: [spec.heat.toRoomW], text: spec.heat.toRoomW.value === null ? null : num(spec.heat.toRoomW.value, 'W') },
  ];
  return (
    <div className="mt-2 overflow-x-auto rounded-lg bg-sunken p-3">
      <p className="mb-2 text-caption text-muted">
        {t.sheet}:{' '}
        {spec.sheet.url ? (
          <a href={spec.sheet.url} target="_blank" rel="noreferrer" className="underline underline-offset-2" dir="ltr">
            {spec.sheet.title}
          </a>
        ) : (
          <span dir="ltr">{spec.sheet.title}</span>
        )}
      </p>
      <table className="w-full text-small">
        <tbody>
          {rows.map((r) => {
            const note = r.facts.map((x) => (locale === 'he' ? x.note : x.noteEn)).find(Boolean);
            return (
              <tr key={r.label} className="border-t border-line align-top">
                <th scope="row" className="py-1.5 pe-3 text-start font-medium whitespace-nowrap">
                  {r.label}
                </th>
                <td className="py-1.5 pe-3 whitespace-nowrap" dir="ltr">
                  {r.text ?? <span className="rounded bg-warn-soft px-1.5 text-caption">{t.notOnSheet}</span>}
                </td>
                <td className="py-1.5 text-caption text-muted">{note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ inputs */

function SpaceSection() {
  const t = useServicesT();
  const s = useServices();
  const load = (p: typeof POOL_BAR_EXAMPLE) => (s.lines.length === 0 || confirm(t.replaceConfirm)) && s.replace(p);
  return (
    <section className="space-y-3 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-base font-semibold">{t.space}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-small font-medium">{t.name}</span>
          <input className={inputClass} value={s.name} maxLength={80} onChange={(e) => s.setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-small font-medium">{t.enclosed}</span>
          <select className={inputClass} value={s.enclosed === null ? 'unknown' : s.enclosed ? 'yes' : 'no'} onChange={(e) => s.setEnclosed(e.target.value === 'unknown' ? null : e.target.value === 'yes')}>
            {(['yes', 'no', 'unknown'] as const).map((k) => (
              <option key={k} value={k}>
                {t.enclosedOptions[k]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-caption text-muted">{t.enclosedHint}</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-small text-muted">{t.examples}:</span>
        <Button size="sm" onClick={() => load(POOL_BAR_EXAMPLE)}>
          {t.examplePool}
        </Button>
        <Button size="sm" onClick={() => load(SLUSH_KIOSK_EXAMPLE)}>
          {t.exampleKiosk}
        </Button>
      </div>
      <p className="text-caption text-muted">{t.exampleNote}</p>
    </section>
  );
}

function EquipmentSection() {
  const t = useServicesT();
  const locale = useUi((s) => s.locale);
  const s = useServices();
  const [adding, setAdding] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const name = (item: EquipmentItem) => (locale === 'he' ? item.nameHe : item.nameEn);
  const sorted = [...EQUIPMENT].sort((a, b) => name(a).localeCompare(name(b), locale));
  const groups = [
    { label: t.groupBar, items: sorted.filter((i) => i.sectors.includes('bar')) },
    { label: t.groupOther, items: sorted.filter((i) => !i.sectors.includes('bar')) },
  ];

  return (
    <section className="space-y-3 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-base font-semibold">{t.equipment}</h2>
      {s.lines.length === 0 && <p className="text-small text-muted">{t.empty}</p>}
      <ul className="divide-y divide-line">
        {s.lines.map((line, i) => {
          const item = EQUIPMENT.find((e) => e.id === line.equipmentId);
          const models = productsFor(line.equipmentId);
          const spec = models.find((m) => m.id === line.productId);
          return (
            <li key={`${line.equipmentId}-${i}`} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 basis-40 font-medium">{item ? name(item) : line.equipmentId}</span>
                <Stepper value={line.count} onChange={(n) => s.setCount(i, n)} min={1} max={999} label={t.count} format={(n) => String(n)} />
                <Button size="sm" variant="ghost" onClick={() => s.removeLine(i)}>
                  {t.remove}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-small">
                  <span className="shrink-0 text-muted">{t.model}</span>
                  <select className={`${inputClass} min-w-0`} value={line.productId ?? ''} disabled={models.length === 0} onChange={(e) => s.setProduct(i, e.target.value || null)}>
                    <option value="">{models.length ? t.noModel : t.noModels}</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.maker} {m.model}
                      </option>
                    ))}
                  </select>
                </label>
                {spec && (
                  <Button size="sm" variant="ghost" onClick={() => setOpen(open === i ? null : i)}>
                    {open === i ? t.hideData : t.showData}
                  </Button>
                )}
              </div>
              {spec && open === i && <ModelFacts spec={spec} />}
            </li>
          );
        })}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (adding) s.addLine(adding);
          setAdding('');
        }}
      >
        <select className={`${inputClass} min-w-0 flex-1 basis-56`} value={adding} aria-label={t.add} onChange={(e) => setAdding(e.target.value)}>
          <option value="">{t.addPlaceholder}</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {name(item)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <Button type="submit" disabled={!adding}>
          {t.add}
        </Button>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ results */

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-sunken p-3">
      <div className="text-caption text-muted">{label}</div>
      <div className="num mt-0.5 text-lg font-semibold" dir="ltr">
        {value}
      </div>
      {note && <div className="text-caption text-muted">{note}</div>}
    </div>
  );
}

const SEVERITY_TONE: Record<Severity, string> = { blocking: 'bg-bad-soft text-bad', warning: 'bg-warn-soft', info: 'bg-sunken' };

function Results({ report, t }: { report: DemandReport; t: ServicesDict }) {
  const locale = useUi((s) => s.locale);
  const he = locale === 'he';
  const e = report.electrical;
  const missingPower = new Set(report.findings.filter((f) => /^(no_model|power_unknown)_/.test(f.id) && f.line !== undefined).map((f) => f.line)).size;
  const kw = (w: number) => `${fmt(Math.round(w) / 1000, locale)} kW`;
  const hasPower = report.points.some((p) => p.kind === 'electrical');
  return (
    <section className="space-y-3 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-base font-semibold">{t.results}</h2>
      <div className="grid grid-cols-2 gap-2">
        <Tile
          label={t.load}
          value={!hasPower ? t.notApplicable : e.complete ? kw(e.connectedW) : e.connectedW > 0 ? `≥ ${kw(e.connectedW)}` : t.unknown}
          note={hasPower && !e.complete ? t.partial(missingPower) : undefined}
        />
        <Tile label={t.current} value={!hasPower ? t.notApplicable : e.currentA === null ? t.unknown : `${fmt(e.currentA, locale)} A`} />
        <Tile label={t.circuits} value={!hasPower ? t.notApplicable : e.dedicatedCircuits === null ? t.unknown : String(e.dedicatedCircuits)} />
        <Tile
          label={t.heat}
          value={report.heat.complete ? (report.heat.toRoomW ? `${fmt(report.heat.toRoomW, locale)} W` : t.notApplicable) : report.heat.toRoomW ? `≥ ${fmt(report.heat.toRoomW, locale)} W` : t.unknown}
          note={report.heat.toRoomW ? `${fmt(report.heat.btuPerHour, locale)} BTU/h` : undefined}
        />
      </div>
      <div>
        <h3 className="mb-1 text-small font-semibold">{t.points}</h3>
        <ul className="flex flex-wrap gap-2">
          {report.points.map((p) => (
            <li key={p.kind} className="rounded-full bg-sunken px-3 py-1 text-small">
              {he ? SERVICE_LABEL[p.kind].he : SERVICE_LABEL[p.kind].en} · <span className="num font-semibold">{p.quantity}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Findings({ report, t }: { report: DemandReport; t: ServicesDict }) {
  const he = useUi((s) => s.locale) === 'he';
  const order: Severity[] = ['blocking', 'warning', 'info'];
  const sorted = [...report.findings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return (
    <section className="space-y-2 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-base font-semibold">
        {t.findings} <span className="num text-small font-normal text-muted">· {report.findings.length}</span>
      </h2>
      {sorted.length === 0 && <p className="text-small text-muted">{t.noFindings}</p>}
      <ul className="space-y-1.5">
        {sorted.map((f) => (
          <li key={f.id} className={`rounded-lg px-3 py-2 text-small ${SEVERITY_TONE[f.severity]}`}>
            <span className="font-semibold">{he ? SEVERITY_LABEL[f.severity].he : SEVERITY_LABEL[f.severity].en}</span>
            <span className="text-muted"> · {he ? DISCIPLINE_LABEL[f.discipline].he : DISCIPLINE_LABEL[f.discipline].en}</span>
            <p className="mt-0.5">{he ? f.he : f.en}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Bill({ report, t }: { report: DemandReport; t: ServicesDict }) {
  const locale = useUi((s) => s.locale);
  const he = locale === 'he';
  const program = useServices();
  return (
    <section className="space-y-2 rounded-xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-base font-semibold">{t.bill}</h2>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void downloadWorkbook(`${program.name || 'equipment'}.xlsx`, demandSheets({ name: program.name, enclosed: program.enclosed, lines: program.lines }, report, locale), he)}
        >
          {t.download}
        </Button>
      </div>
      <p className="text-caption text-muted">{he ? DEMAND_DRAFT.he : DEMAND_DRAFT.en}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr className="text-start text-caption text-muted">
              <th className="py-1 pe-3 text-start font-medium">{t.billCols.discipline}</th>
              <th className="py-1 pe-3 text-start font-medium">{t.billCols.item}</th>
              <th className="py-1 pe-3 text-start font-medium">{t.billCols.unit}</th>
              <th className="py-1 pe-3 text-start font-medium">{t.billCols.qty}</th>
              <th className="py-1 text-start font-medium">{t.billCols.note}</th>
            </tr>
          </thead>
          <tbody>
            {report.boq.map((b, i) => (
              <tr key={i} className="border-t border-line align-top">
                <td className="py-1.5 pe-3 whitespace-nowrap text-muted">{he ? DISCIPLINE_LABEL[b.discipline].he : DISCIPLINE_LABEL[b.discipline].en}</td>
                <td className="py-1.5 pe-3">{he ? b.he : b.en}</td>
                <td className="py-1.5 pe-3 whitespace-nowrap">{t.units[b.unit]}</td>
                <td className="num py-1.5 pe-3 font-semibold whitespace-nowrap">{b.quantity ?? <span className="rounded bg-warn-soft px-1.5 font-normal">{t.unknown}</span>}</td>
                <td className="py-1.5 ps-3 text-caption text-muted">{he ? b.noteHe : b.noteEn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ page */

export function EquipmentPage({ auth }: { auth: AuthState }) {
  const t = useServicesT();
  const name = useServices((s) => s.name);
  const enclosed = useServices((s) => s.enclosed);
  const lines = useServices((s) => s.lines);
  const report = useMemo(() => serviceDemand({ name, enclosed, lines }), [name, enclosed, lines]);
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <AppHeader auth={auth} />
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-3 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">{t.title}</h1>
          <span className="rounded bg-accent-soft px-2 py-0.5 text-caption font-semibold text-accent-ink">{t.badge}</span>
        </div>
        <p className="max-w-prose text-body text-muted">{t.intro}</p>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <SpaceSection />
            <EquipmentSection />
          </div>
          <div className="space-y-4">
            <Results report={report} t={t} />
            <Findings report={report} t={t} />
            <Bill report={report} t={t} />
          </div>
        </div>
      </main>
    </div>
  );
}

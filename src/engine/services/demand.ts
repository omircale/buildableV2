import { equipmentById, SERVICE_LABEL, SERVICE_TRADE, servicesFor, type ServiceKind } from '../equipment/catalog';
import type { Source } from '../types';
import { productById } from './products';
import { fact, specProblems, type Fact, type ProductSpec } from './spec';

/**
 * What a space's equipment asks of the building: points, connected electrical load, heat into the
 * room, and the quantities that follow — worked out by arithmetic from the catalog and the chosen
 * models, never estimated.
 *
 * It adds what is known and says what is not. A model nobody chose, a figure a data sheet does not
 * give, a value only a licensed engineer may set (a demand factor, a breaker, a cable, an airflow):
 * each one is a finding, so a total is never presented as more complete than it is.
 */

export type Discipline = 'plumbing' | 'electrical' | 'gas' | 'hvac' | 'general';
export type Severity = 'blocking' | 'warning' | 'info';

export interface Finding {
  id: string;
  severity: Severity;
  discipline: Discipline;
  he: string;
  en: string;
  /** The line of the program it is about, when it is about one. */
  line?: number;
}

export interface ProgramLine {
  equipmentId: string;
  count: number;
  /** The model chosen for it, if one has been. */
  productId?: string | null;
}

export interface SpaceProgram {
  name: string;
  /** A closed room (a kiosk, a back bar) keeps the heat its equipment gives off; an open deck does not. Null: not known. */
  enclosed: boolean | null;
  lines: ProgramLine[];
}

/** The supply on site. Null facts are reported, never assumed. */
export interface SiteSupply {
  voltageV: Fact<number>;
  frequencyHz: Fact<number>;
}

const IEC_WORLD_PLUGS: Source = {
  title: 'IEC — World Plugs: Israel',
  reference: 'Israel: 230 V, 50 Hz',
  url: 'https://www.iec.ch/world-plugs',
};

/** The public supply in Israel, as the IEC lists it. A site with its own supply passes its own. */
export const ISRAEL_SUPPLY: SiteSupply = { voltageV: fact(230, IEC_WORLD_PLUGS), frequencyHz: fact(50, IEC_WORLD_PLUGS) };

/** 1 Btu(IT)/h = 0.2930711 W, so 1 W = 1 / 0.2930711 Btu/h. */
const NIST_SP811: Source = {
  title: 'NIST SP 811, Guide for the Use of the International System of Units (SI)',
  reference: 'Appendix B: British thermal unit (IT) per hour = 2.930 711 E-01 W',
  url: 'https://www.nist.gov/pml/special-publication-811',
};
export const W_PER_BTU_H = fact(0.2930711, NIST_SP811);

export interface BoqLine {
  he: string;
  en: string;
  unit: 'unit' | 'point';
  /** Null when it cannot be counted yet; the findings say why. */
  quantity: number | null;
  discipline: Discipline;
  noteHe?: string;
  noteEn?: string;
}

export interface DemandReport {
  lines: { equipmentId: string; nameHe: string; nameEn: string; count: number; product: Pick<ProductSpec, 'id' | 'maker' | 'model'> | null }[];
  points: { kind: ServiceKind; quantity: number }[];
  electrical: {
    /** Sum of rated input of the units whose rating is known. */
    connectedW: number;
    /** Whether every unit's rating is known; when not, connectedW is a floor, not a total. */
    complete: boolean;
    /** Sum of rated currents, only when every unit's current is known — never derived from power. */
    currentA: number | null;
    /** Units that need a dedicated circuit by their data; null when any unit does not say. */
    dedicatedCircuits: number | null;
  };
  heat: {
    toRoomW: number;
    complete: boolean;
    btuPerHour: number;
  };
  boq: BoqLine[];
  findings: Finding[];
}

const isCount = (n: number) => Number.isInteger(n) && n >= 1 && n <= 999;

export function serviceDemand(space: SpaceProgram, supply: SiteSupply = ISRAEL_SUPPLY, products: (id: string) => ProductSpec | undefined = productById): DemandReport {
  const findings: Finding[] = [];
  const find = (f: Finding) => findings.push(f);
  const report: DemandReport = {
    lines: [],
    points: [],
    electrical: { connectedW: 0, complete: true, currentA: 0, dedicatedCircuits: 0 },
    heat: { toRoomW: 0, complete: true, btuPerHour: 0 },
    boq: [],
    findings,
  };

  const ids: string[] = [];
  const extraPoints = new Map<ServiceKind, number>();
  let scaleFilters = 0;
  let greaseSeparator = false;

  space.lines.forEach((line, i) => {
    const item = equipmentById(line.equipmentId);
    if (!item) {
      find({ id: `unknown_item_${i}`, severity: 'blocking', discipline: 'general', he: `פריט לא מוכר בקטלוג: ${line.equipmentId}`, en: `Not an item in the catalog: ${line.equipmentId}`, line: i });
      return;
    }
    if (!isCount(line.count)) {
      find({ id: `bad_count_${i}`, severity: 'blocking', discipline: 'general', he: `${item.nameHe}: כמות לא תקינה (${line.count})`, en: `${item.nameEn}: not a valid count (${line.count})`, line: i });
      return;
    }
    let spec = line.productId ? products(line.productId) : undefined;
    if (line.productId && !spec) {
      find({ id: `unknown_product_${i}`, severity: 'blocking', discipline: 'general', he: `${item.nameHe}: דגם לא מוכר (${line.productId})`, en: `${item.nameEn}: unknown model (${line.productId})`, line: i });
    }
    if (spec && spec.equipmentId !== item.id) {
      find({ id: `wrong_product_${i}`, severity: 'blocking', discipline: 'general', he: `${item.nameHe}: הדגם ${spec.model} שייך לפריט אחר`, en: `${item.nameEn}: model ${spec.model} belongs to another item`, line: i });
      spec = undefined;
    }
    if (spec) {
      const problems = specProblems(spec);
      if (problems.length) {
        find({ id: `bad_spec_${i}`, severity: 'blocking', discipline: 'general', he: `${item.nameHe}: נתוני הדגם ${spec.model} פגומים — ${problems[0]}`, en: `${item.nameEn}: model ${spec.model} has bad data — ${problems[0]}`, line: i });
        spec = undefined;
      }
    }

    report.lines.push({ equipmentId: item.id, nameHe: item.nameHe, nameEn: item.nameEn, count: line.count, product: spec ? { id: spec.id, maker: spec.maker, model: spec.model } : null });
    for (let k = 0; k < line.count; k++) ids.push(item.id);

    const label = { he: spec ? `${item.nameHe} (${spec.maker} ${spec.model})` : item.nameHe, en: spec ? `${item.nameEn} (${spec.maker} ${spec.model})` : item.nameEn };
    const needsPower = item.services.some((s) => s.kind === 'electrical');
    const givesHeat = item.services.some((s) => s.kind === 'ventilation' && s.form === 'clearance');

    if (!spec) {
      if (needsPower || givesHeat) {
        find({ id: `no_model_${i}`, severity: 'warning', discipline: 'general', he: `${label.he}: לא נבחר דגם, ולכן ההספק והחום שלו לא ידועים`, en: `${label.en}: no model chosen, so its power and heat are unknown`, line: i });
      }
      if (needsPower) report.electrical.complete = false;
      if (needsPower) report.electrical.currentA = null;
      if (needsPower) report.electrical.dedicatedCircuits = null;
      if (givesHeat) report.heat.complete = false;
      return;
    }

    const e = spec.electrical;
    for (const [f, site, unit] of [
      [e.voltageV, supply.voltageV, 'V'],
      [e.frequencyHz, supply.frequencyHz, 'Hz'],
    ] as const) {
      if (f.value !== null && site.value !== null && f.value !== site.value) {
        find({ id: `supply_${unit}_${i}`, severity: 'blocking', discipline: 'electrical', he: `${label.he}: הדגם בנוי ל-${f.value} ${unit}, והאספקה באתר ${site.value} ${unit}`, en: `${label.en}: built for ${f.value} ${unit}, the site supplies ${site.value} ${unit}`, line: i });
      }
    }
    if (needsPower) {
      if (e.powerW.value === null) {
        report.electrical.complete = false;
        find({ id: `power_unknown_${i}`, severity: 'warning', discipline: 'electrical', he: `${label.he}: ההספק לא ידוע`, en: `${label.en}: power rating unknown`, line: i });
      } else report.electrical.connectedW += e.powerW.value * line.count;
      if (e.currentA.value === null) report.electrical.currentA = null;
      else if (report.electrical.currentA !== null) report.electrical.currentA += e.currentA.value * line.count;
      if (e.dedicatedCircuit.value === null) report.electrical.dedicatedCircuits = null;
      else if (e.dedicatedCircuit.value && report.electrical.dedicatedCircuits !== null) report.electrical.dedicatedCircuits += line.count;
    }

    if (givesHeat || spec.heat.toRoomW.value !== null) {
      if (spec.heat.toRoomW.value === null) report.heat.complete = false;
      else report.heat.toRoomW += spec.heat.toRoomW.value * line.count;
    }

    // What the model adds beyond the catalog's points, and what it leaves unsaid.
    const hasPoint = (kind: ServiceKind) => item.services.some((s) => s.kind === kind && (s.form ?? 'point') === 'point');
    if (spec.water.required.value === true && !hasPoint('water_cold')) extraPoints.set('water_cold', (extraPoints.get('water_cold') ?? 0) + line.count);
    if (spec.drain.required.value === true && !hasPoint('drain')) extraPoints.set('drain', (extraPoints.get('drain') ?? 0) + line.count);
    for (const [what, f] of [
      ['water', spec.water.required],
      ['drain', spec.drain.required],
    ] as const) {
      if (f.value === null && !hasPoint(what === 'water' ? 'water_cold' : 'drain')) {
        find({
          id: `${what}_unconfirmed_${i}`,
          severity: 'warning',
          discipline: 'plumbing',
          he: `${label.he}: לא ידוע אם צריך ${what === 'water' ? 'חיבור מים' : 'ניקוז'} — לאשר מול הספק`,
          en: `${label.en}: whether it needs ${what === 'water' ? 'a water supply' : 'a drain'} is unknown — confirm with the supplier`,
          line: i,
        });
      }
    }
    if (spec.water.scaleFilter.value === true) scaleFilters += line.count;
    if (spec.drain.greaseSeparator.value === true) greaseSeparator = true;
  });

  // Points: the catalog's, by item and count, plus what a chosen model added.
  const points = new Map<ServiceKind, number>(servicesFor(ids).map((p) => [p.kind, p.quantity]));
  for (const [kind, n] of extraPoints) points.set(kind, (points.get(kind) ?? 0) + n);
  report.points = [...points.entries()].map(([kind, quantity]) => ({ kind, quantity }));
  report.heat.btuPerHour = Math.round(report.heat.toRoomW / W_PER_BTU_H.value!);

  // What only a licensed engineer sets, said once, whatever the data.
  if (points.get('electrical')) {
    find({
      id: 'electrical_design',
      severity: 'info',
      discipline: 'electrical',
      he: 'העומס המוצג הוא סכום ההספקים המחוברים, לא עומס תכנון. מקדם ביקוש, חלוקה לפאזות, מפסקים וחתכי כבלים — לפי חשמלאי מורשה.',
      en: 'The load shown is the sum of connected ratings, not a design load. Demand factor, phase balance, breakers and cable sizes are for a licensed electrician.',
    });
  }
  if (space.enclosed === true && (report.heat.toRoomW > 0 || !report.heat.complete)) {
    find({
      id: 'ventilation_design',
      severity: report.heat.complete ? 'info' : 'warning',
      discipline: 'hvac',
      he: report.heat.complete
        ? `חלל סגור: הציוד פולט ${report.heat.toRoomW} W לחדר. ספיקת האוורור או המיזוג — לפי יועץ מיזוג.`
        : 'חלל סגור, וחלק מהציוד לא מפרסם כמה חום הוא פולט — אי אפשר לבדוק אוורור עד שהנתון יגיע.',
      en: report.heat.complete
        ? `Closed room: the equipment gives off ${report.heat.toRoomW} W into it. Ventilation or cooling airflow is for the HVAC consultant.`
        : 'Closed room, and some equipment does not publish the heat it gives off — ventilation cannot be checked until it does.',
    });
  }
  if (space.enclosed === null && report.lines.some((l) => equipmentById(l.equipmentId)!.services.some((s) => s.kind === 'ventilation'))) {
    find({ id: 'enclosure_unknown', severity: 'warning', discipline: 'hvac', he: 'לא ידוע אם החלל סגור או פתוח, ולכן לא ברור לאן הולך החום מהציוד.', en: 'Whether the space is closed or open is unknown, so where the equipment’s heat goes is not clear.' });
  }
  if (greaseSeparator) {
    find({ id: 'grease_separator', severity: 'warning', discipline: 'plumbing', he: 'לפחות דגם אחד דורש מפריד שומן — גודל ומיקום לפי מתכנן האינסטלציה.', en: 'At least one model requires a grease separator — size and position per the plumbing designer.' });
  }
  if (points.size) {
    find({ id: 'lengths', severity: 'info', discipline: 'general', he: 'אורכי צנרת וכבלים נגזרים מהתוואי בתוכנית, ולא מרשימת הציוד.', en: 'Pipe and cable lengths come from the routes on the plan, not from the equipment list.' });
  }

  // The bill: what is bought, and the points that are run to it.
  for (const l of report.lines) {
    report.boq.push({
      he: l.product ? `${l.nameHe} — ${l.product.maker} ${l.product.model}` : l.nameHe,
      en: l.product ? `${l.nameEn} — ${l.product.maker} ${l.product.model}` : l.nameEn,
      unit: 'unit',
      quantity: l.count,
      discipline: 'general',
      noteHe: l.product ? undefined : 'דגם לא נבחר',
      noteEn: l.product ? undefined : 'model not chosen',
    });
  }
  for (const { kind, quantity } of report.points) {
    const trade = SERVICE_TRADE[kind];
    report.boq.push({
      he: `נקודת ${SERVICE_LABEL[kind].he}`,
      en: `${SERVICE_LABEL[kind].en} point`,
      unit: 'point',
      quantity,
      discipline: trade === 'communications' ? 'general' : trade,
    });
  }
  if (points.get('electrical')) {
    report.boq.push({
      he: 'מעגל חשמל ייעודי',
      en: 'Dedicated circuit',
      unit: 'unit',
      quantity: report.electrical.dedicatedCircuits,
      discipline: 'electrical',
      noteHe: report.electrical.dedicatedCircuits === null ? 'לא כל הדגמים מציינים אם צריך מעגל ייעודי' : undefined,
      noteEn: report.electrical.dedicatedCircuits === null ? 'not every model says whether it needs one' : undefined,
    });
  }
  if (scaleFilters) report.boq.push({ he: 'מסנן אבנית', en: 'Scale filter', unit: 'unit', quantity: scaleFilters, discipline: 'plumbing', noteHe: 'לפי דרישת היצרן', noteEn: 'as the maker requires' });

  return report;
}

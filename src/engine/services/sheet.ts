import type { Sheet } from '../boq/workbook';
import { SERVICE_LABEL } from '../equipment/catalog';
import type { DemandReport, Discipline, Severity, SpaceProgram } from './demand';

/**
 * The report as a workbook a contractor opens in Excel: the bill of quantities, and the findings
 * beside it, so a quantity never travels without what is still missing behind it.
 */

const DISCIPLINE: Record<Discipline, { he: string; en: string }> = {
  plumbing: { he: 'אינסטלציה', en: 'Plumbing' },
  electrical: { he: 'חשמל', en: 'Electrical' },
  gas: { he: 'גז', en: 'Gas' },
  hvac: { he: 'מיזוג ואוורור', en: 'HVAC' },
  general: { he: 'כללי', en: 'General' },
};
export const DISCIPLINE_LABEL = DISCIPLINE;

export const SEVERITY_LABEL: Record<Severity, { he: string; en: string }> = {
  blocking: { he: 'חוסם', en: 'Blocking' },
  warning: { he: 'לבדיקה', en: 'To check' },
  info: { he: 'מידע', en: 'Note' },
};

export const DEMAND_DRAFT = {
  he: 'טיוטה לבדיקת מהנדס. כמויות של פריטים ונקודות בלבד; תכנון, מידות והגנות — לפי בעלי מקצוע מורשים.',
  en: 'Draft for an engineer’s review. Quantities of items and points only; design, sizes and protection are for licensed trades.',
};

export function demandSheets(space: SpaceProgram, report: DemandReport, locale: 'he' | 'en'): Sheet[] {
  const he = locale === 'he';
  const unknown = he ? 'לא ידוע' : 'unknown';
  const atLeast = (n: number, complete: boolean, unit: string) => (complete ? `${n} ${unit}` : n > 0 ? `${he ? 'לפחות' : 'at least'} ${n} ${unit}` : unknown);
  const e = report.electrical;
  const count = (sev: Severity) => report.findings.filter((f) => f.severity === sev).length;
  const enclosed = space.enclosed === null ? unknown : space.enclosed ? (he ? 'סגור' : 'closed') : he ? 'פתוח' : 'open';
  // The totals first, each saying whether it is complete — a floor is never shown as a total.
  const summary: Sheet = {
    name: he ? 'סיכום' : 'Summary',
    widths: [34, 30, 60],
    rows: [
      [he ? `סיכום — ${space.name || 'חלל'}` : `Summary — ${space.name || 'Space'}`],
      [he ? DEMAND_DRAFT.he : DEMAND_DRAFT.en],
      [],
      [he ? 'החלל' : 'Space', enclosed],
      [he ? 'עומס חשמל מחובר' : 'Connected electrical load', atLeast(e.connectedW, e.complete, 'W'), he ? 'סכום ההספקים, לא עומס תכנון' : 'Sum of ratings, not a design load'],
      [he ? 'זרם נקוב' : 'Rated current', e.currentA === null ? unknown : `${e.currentA} A`],
      [he ? 'מעגלים ייעודיים' : 'Dedicated circuits', e.dedicatedCircuits ?? unknown],
      [he ? 'חום לחדר' : 'Heat into the room', atLeast(report.heat.toRoomW, report.heat.complete, 'W'), report.heat.toRoomW ? `${report.heat.btuPerHour} BTU/h` : ''],
      ...report.points.map((p) => [he ? `נקודות ${SERVICE_LABEL[p.kind].he}` : `${SERVICE_LABEL[p.kind].en} points`, p.quantity]),
      [],
      [he ? 'ממצאים' : 'Findings', `${count('blocking')} ${he ? SEVERITY_LABEL.blocking.he : SEVERITY_LABEL.blocking.en} · ${count('warning')} ${he ? SEVERITY_LABEL.warning.he : SEVERITY_LABEL.warning.en} · ${count('info')} ${he ? SEVERITY_LABEL.info.he : SEVERITY_LABEL.info.en}`],
    ],
  };
  const unit = (u: 'unit' | 'point') => (u === 'unit' ? (he ? "יח'" : 'ea') : he ? "נק'" : 'pt');
  const title = space.name || (he ? 'חלל' : 'Space');
  const bill: Sheet = {
    name: he ? 'כתב כמויות' : 'Bill of quantities',
    widths: [16, 44, 8, 10, 48],
    rows: [
      [he ? `כתב כמויות — ${title}` : `Bill of quantities — ${title}`],
      [he ? DEMAND_DRAFT.he : DEMAND_DRAFT.en],
      [],
      he ? ['תחום', 'תיאור', 'יחידה', 'כמות', 'הערה'] : ['Discipline', 'Description', 'Unit', 'Qty', 'Note'],
      ...report.boq.map((b) => [
        he ? DISCIPLINE[b.discipline].he : DISCIPLINE[b.discipline].en,
        he ? b.he : b.en,
        unit(b.unit),
        b.quantity ?? (he ? 'לא ידוע' : 'unknown'),
        (he ? b.noteHe : b.noteEn) ?? '',
      ]),
    ],
  };
  const findings: Sheet = {
    name: he ? 'ממצאים' : 'Findings',
    widths: [12, 16, 90],
    rows: [
      he ? ['רמה', 'תחום', 'ממצא'] : ['Level', 'Discipline', 'Finding'],
      ...(['blocking', 'warning', 'info'] as const).flatMap((sev) =>
        report.findings
          .filter((f) => f.severity === sev)
          .map((f) => [he ? SEVERITY_LABEL[sev].he : SEVERITY_LABEL[sev].en, he ? DISCIPLINE[f.discipline].he : DISCIPLINE[f.discipline].en, he ? f.he : f.en]),
      ),
    ],
  };
  return [summary, bill, findings];
}

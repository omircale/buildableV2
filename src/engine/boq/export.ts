import { TRADE_LABEL, UNIT_LABEL, byLocation, byTrade, totals, type BoqLine, type Totals } from './line';

/**
 * The bill as a file somebody can open.
 *
 * Two orderings, because the whole point of the location axis is that the same lines read two ways: by
 * trade for the tender that goes out, by location for the work that happens. Neither is a summary of
 * the other and both carry the same lines.
 *
 * Three columns exist purely so the document cannot be mistaken for a finished bill. `כמות` is empty
 * where the quantity is unknown, and `למה חסר` says what has to happen before it can be filled in;
 * `הנחה` carries what a real figure rests on. A bill that hid those would read as complete and price
 * work nobody has established.
 */

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The byte order mark; without it Excel opens Hebrew as mojibake. */
const BOM = '﻿';

export type BillAxis = 'trade' | 'location';

const HEADER_HE = ['פרק', 'סעיף', 'מיקום', 'תיאור', 'יחידה', 'כמות', 'למה חסר', 'הנחה', 'מחיר יחידה', 'סה"כ', 'מקורות'];
const HEADER_EN = ['Chapter', 'Section', 'Location', 'Description', 'Unit', 'Quantity', 'Why missing', 'Assumption', 'Unit price', 'Total', 'Sources'];

function row(l: BoqLine, locale: 'he' | 'en'): (string | number)[] {
  const he = locale === 'he';
  const lineTotal = l.quantity != null && l.unitPriceIls != null ? l.quantity * l.unitPriceIls : '';
  const place = [l.location.buildingId, l.location.levelId, l.location.spaceId, l.location.zoneId].filter(Boolean).join(' / ');
  return [
    he ? TRADE_LABEL[l.trade].he : TRADE_LABEL[l.trade].en,
    l.section,
    place,
    he ? l.descriptionHe : l.descriptionEn,
    he ? UNIT_LABEL[l.unit].he : UNIT_LABEL[l.unit].en,
    l.quantity ?? '',
    (he ? l.unknownReasonHe : l.unknownReasonEn) ?? '',
    (he ? l.assumptionHe : l.assumptionEn) ?? '',
    l.unitPriceIls ?? '',
    lineTotal,
    l.sources.map((s) => s.reference ?? s.url ?? '').filter(Boolean).join(' | '),
  ];
}

/** A group's subtotal row, written so it cannot be read as a complete figure. */
function subtotalRow(labelHe: string, labelEn: string, t: Totals, locale: 'he' | 'en'): (string | number)[] {
  const he = locale === 'he';
  const pending = t.missingQuantity + t.missingPrice;
  const caveat = he
    ? pending > 0
      ? `סיכום חלקי — ${t.pricedLines} מתוך ${t.lines} שורות מתומחרות, ${pending} ממתינות`
      : 'סיכום מלא'
    : pending > 0
      ? `Partial — ${t.pricedLines} of ${t.lines} lines priced, ${pending} pending`
      : 'Complete';
  return [he ? `סיכום ${labelHe}` : `${labelEn} subtotal`, '', '', caveat, '', '', '', '', '', t.pricedIls, ''];
}

/**
 * The bill as CSV, in the axis asked for.
 *
 * Grouped with a subtotal after each group rather than a flat table, because that is how a bill is read
 * and how a trade quotes against one. Every subtotal states how many of its lines it could not price.
 */
export function billCsv(lines: BoqLine[], axis: BillAxis = 'trade', locale: 'he' | 'en' = 'he'): string {
  const groups = axis === 'trade' ? byTrade(lines) : byLocation(lines);
  const header = locale === 'he' ? HEADER_HE : HEADER_EN;
  const out: (string | number)[][] = [header];

  for (const g of groups) {
    const label = locale === 'he' ? g.he : g.en;
    out.push([label, '', '', '', '', '', '', '', '', '', '']);
    for (const l of g.lines) out.push(row(l, locale));
    out.push(subtotalRow(g.he, g.en, g.totals, locale));
    out.push([]);
  }

  const grand = totals(lines);
  out.push(subtotalRow(locale === 'he' ? 'הפרוייקט' : 'Project', 'Project', grand, locale));

  return BOM + out.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export interface BillSummary {
  totals: Totals;
  /** Chapters present, in the bill's own order. */
  trades: { key: string; he: string; en: string; totals: Totals }[];
  /** Locations present. */
  locations: { key: string; he: string; en: string; totals: Totals }[];
  /** The lines nobody can price yet, with the reason, ready to be taken to the trades. */
  pending: { lineId: string; he: string; en: string }[];
}

/**
 * What the bill amounts to and what it is still waiting on.
 *
 * `pending` is the useful half for a procurement manager: it is the list of questions the document
 * cannot answer by itself, each one attached to the line it holds up.
 */
export function billSummary(lines: BoqLine[]): BillSummary {
  const pending = lines
    .filter((l) => l.quantity == null || l.unitPriceIls == null)
    .map((l) => {
      if (l.quantity == null) {
        return { lineId: l.id, he: l.unknownReasonHe ?? 'אין כמות ולא נרשם מה חסר', en: l.unknownReasonEn ?? 'No quantity and no statement of what is missing' };
      }
      return { lineId: l.id, he: 'אין מחיר — ממתין להצעה או למחירון', en: 'No price — waiting on a quote or a price list' };
    });

  return {
    totals: totals(lines),
    trades: byTrade(lines).map((g) => ({ key: g.key, he: g.he, en: g.en, totals: g.totals })),
    locations: byLocation(lines).map((g) => ({ key: g.key, he: g.he, en: g.en, totals: g.totals })),
    pending,
  };
}

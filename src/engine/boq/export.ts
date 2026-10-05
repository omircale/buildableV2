import { csvCell } from '../csv';
import { LICENSED_TRADES } from '../equipment/catalog';
import { TRADE_LABEL, UNIT_LABEL, byLocation, byTrade, totals, type BoqLine, type Totals, type Trade } from './line';
import { numberBill } from './numbering';

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

export interface TenderPackage {
  trade: Trade;
  he: string;
  en: string;
  lines: BoqLine[];
  totals: Totals;
  /** The trade's design and sign-off need a licensed professional before anyone can price it properly. */
  licensed: boolean;
}

/**
 * The bill cut into what goes out to tender: one package per trade.
 *
 * A tender goes to one trade at a time, so this is the unit a procurement manager actually sends. The
 * licensed flag travels with the package, because a plumbing package priced before a licensed plumber
 * has designed the runs is a price for a quantity nobody established.
 */
export function tenderPackages(lines: BoqLine[]): TenderPackage[] {
  return byTrade(lines).map((g) => ({
    trade: g.extra.trade,
    he: g.he,
    en: g.en,
    lines: g.lines,
    totals: g.totals,
    licensed: LICENSED_TRADES.has(g.extra.trade),
  }));
}

const DOC_HEADER_HE = ['סעיף', 'מקור הסעיף', 'תאור', "יח'", 'כמות', 'מחיר', 'סה"כ', 'מה חסר לקביעת הכמות', 'הנחה'];
const DOC_HEADER_EN = ['Item', 'Item source', 'Description', 'Unit', 'Quantity', 'Price', 'Total', 'What the quantity is waiting on', 'Assumption'];

export interface BillDocumentOptions {
  locale?: 'he' | 'en';
  /** What a room is called by the people who use it. Falls back to the space id. */
  roomName?: (location: BoqLine['location']) => string;
  /** Keep only these lines, after numbering — so a package for one trade keeps the bill's own numbers. */
  only?: (line: BoqLine) => boolean;
}

/**
 * The bill as the document the industry reads.
 *
 * The first seven columns are the ones a published Israeli bill carries, in its order: item, item
 * source, description, unit, quantity, price, total. It is laid out room, chapter, sub-chapter, item,
 * with a "סה"כ ל…" row closing each, and numbered `מבנה.פרק.תת-פרק.סעיף`. Two columns follow that a
 * conventional bill has no place for: what a missing quantity is waiting on, and what a stated one
 * rests on.
 *
 * A total is written only where every line under it is priced. A partial sum in the total column would
 * be read as the total, so an incomplete group leaves the cell empty and says how far it got.
 */
export function billDocumentCsv(lines: BoqLine[], options: BillDocumentOptions = {}): string {
  const locale = options.locale ?? 'he';
  const he = locale === 'he';
  const roomName = options.roomName ?? ((l) => l.spaceId);
  const keep = options.only ?? (() => true);
  const { structures } = numberBill(lines);
  const out: (string | number)[][] = [he ? DOC_HEADER_HE : DOC_HEADER_EN];

  const closing = (label: string, group: BoqLine[]) => {
    const t = totals(group);
    const note = t.complete ? '' : he ? `${t.pricedLines} מתוך ${t.lines} שורות מתומחרות` : `${t.pricedLines} of ${t.lines} lines priced`;
    out.push(['', '', he ? `סה"כ ל${label}` : `Total for ${label}`, '', '', '', t.complete ? t.pricedIls : '', note, '']);
  };

  const all: BoqLine[] = [];
  for (const structure of structures) {
    const inRoom = structure.chapters.flatMap((c) => c.subChapters.flatMap((s) => s.lines.map((n) => n.line))).filter(keep);
    if (!inRoom.length) continue;
    const place = [roomName(structure.location), he ? `קומה ${structure.location.levelId}` : `level ${structure.location.levelId}`, structure.location.buildingId].filter(Boolean).join(' · ');
    out.push([structure.code, '', place]);

    for (const chapter of structure.chapters) {
      const inChapter = chapter.subChapters.flatMap((s) => s.lines.map((n) => n.line)).filter(keep);
      if (!inChapter.length) continue;
      out.push([chapter.code, '', he ? chapter.he : chapter.en]);

      for (const sub of chapter.subChapters) {
        const kept = sub.lines.filter((n) => keep(n.line));
        if (!kept.length) continue;
        out.push([sub.code, '', he ? sub.he : sub.en]);
        for (const { line: l, number } of kept) {
          out.push([
            number,
            l.sources.map((s) => s.title ?? s.reference ?? '').filter(Boolean).join(' | '),
            he ? l.descriptionHe : l.descriptionEn,
            he ? UNIT_LABEL[l.unit].he : UNIT_LABEL[l.unit].en,
            l.quantity ?? '',
            l.unitPriceIls ?? '',
            l.quantity != null && l.unitPriceIls != null ? l.quantity * l.unitPriceIls : '',
            (he ? l.unknownReasonHe : l.unknownReasonEn) ?? '',
            (he ? l.assumptionHe : l.assumptionEn) ?? '',
          ]);
        }
        closing(he ? sub.he : sub.en, kept.map((n) => n.line));
      }
      closing(he ? chapter.he : chapter.en, inChapter);
    }
    closing(roomName(structure.location), inRoom);
    out.push([]);
    all.push(...inRoom);
  }
  closing(he ? 'כתב הכמויות' : 'the bill', all);

  return BOM + out.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

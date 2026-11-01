import { chapterLabel, chapterOf } from './chapters';
import { billDocumentRows, type BillDocumentOptions } from './export';
import { totals, type BoqLine } from './line';
import { DRAFT_NOTICE } from './project';

/** One sheet of a workbook, as plain rows. A number is a number; everything else is text. */
export interface Sheet {
  name: string;
  rows: (string | number)[][];
  /** Column widths in characters, by column. */
  widths: number[];
}

/** Excel refuses these in a sheet name, and refuses names over 31 characters. */
export function sheetName(raw: string, taken: Set<string>): string {
  const clean = raw.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = clean;
  for (let n = 2; taken.has(name.toLowerCase()); n++) {
    const tail = ` (${n})`;
    name = clean.slice(0, 31 - tail.length) + tail;
  }
  taken.add(name.toLowerCase());
  return name;
}

/**
 * The bill as a workbook: a summary sheet, then one sheet per chapter.
 *
 * A chapter is the unit that goes out to a trade, so it is the unit a sheet holds — every room's lines
 * for that chapter, under the bill's own numbers. The summary says what the document is before it says
 * anything else, and gives a total only where every line under it is priced; a partial sum in a total
 * cell would be read as the total.
 */
export function billWorkbook(lines: BoqLine[], options: BillDocumentOptions = {}): Sheet[] {
  const he = (options.locale ?? 'he') === 'he';
  const taken = new Set<string>();
  const codes = [...new Set(lines.map(chapterOf))].sort();

  const summary: (string | number)[][] = [
    [he ? 'כתב כמויות — טיוטה לבדיקת יועץ' : 'Bill of quantities — draft for a consultant’s review'],
    [he ? DRAFT_NOTICE.he : DRAFT_NOTICE.en],
    [],
    he ? ['פרק', 'שם הפרק', 'שורות', 'ללא כמות', 'ללא מחיר', 'סה"כ ₪', 'הערה'] : ['Chapter', 'Name', 'Lines', 'No quantity', 'No price', 'Total ILS', 'Note'],
  ];
  const row = (code: string, name: string, group: BoqLine[]) => {
    const t = totals(group);
    const note = t.complete ? '' : he ? `${t.pricedLines} מתוך ${t.lines} שורות מתומחרות — אין סכום` : `${t.pricedLines} of ${t.lines} lines priced — no total`;
    summary.push([code, name, t.lines, t.missingQuantity, t.missingPrice, t.complete ? t.pricedIls : '', note]);
  };
  for (const code of codes) {
    const label = chapterLabel(code);
    row(
      code,
      he ? label.he : label.en,
      lines.filter((l) => chapterOf(l) === code),
    );
  }
  row('', he ? 'כל כתב הכמויות' : 'The whole bill', lines);

  const sheets: Sheet[] = [{ name: sheetName(he ? 'סיכום' : 'Summary', taken), rows: summary, widths: [10, 34, 10, 12, 12, 14, 44] }];
  for (const code of codes) {
    const label = chapterLabel(code);
    sheets.push({
      name: sheetName(`${code} ${he ? label.he : label.en}`, taken),
      rows: billDocumentRows(lines, { ...options, only: (l) => chapterOf(l) === code && (options.only?.(l) ?? true) }),
      widths: [16, 28, 70, 8, 10, 12, 14, 50, 50],
    });
  }
  return sheets;
}

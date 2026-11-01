import { equipmentById } from '../equipment/catalog';
import type { BoqLine } from './line';

/**
 * A room that stands for several identical rooms.
 *
 * Forty guest rooms that are the same room are surveyed once. Their lines stay one set of lines — one
 * entry in the bill — with every quantity multiplied, and each line says both figures: what one room
 * takes, and how many rooms that was multiplied by. A reader must be able to undo the multiplication
 * in their head; a bare "120 points" hides whether that is one big room or forty small ones.
 *
 * A line with no quantity stays without one. Forty times unknown is unknown.
 */
export function timesRooms(lines: BoqLine[], count: number): BoqLine[] {
  if (!Number.isInteger(count) || count <= 1) return lines;
  return lines.map((l) => {
    const perHe = l.quantity != null ? `לחדר אחד: ${l.quantity}. ` : '';
    const perEn = l.quantity != null ? `Per room: ${l.quantity}. ` : '';
    return {
      ...l,
      quantity: l.quantity != null ? l.quantity * count : null,
      assumptionHe: `${perHe}×${count} חדרים זהים.${l.assumptionHe ? ` ${l.assumptionHe}` : ''}`,
      assumptionEn: `${perEn}×${count} identical rooms.${l.assumptionEn ? ` ${l.assumptionEn}` : ''}`,
    };
  });
}

export interface EnteredPrice {
  unitPriceIls: number;
  source: string;
  date: string;
}

/**
 * Prices a person entered, laid onto the lines they belong to.
 *
 * A price reaches a line only with its source, and the source travels with it into the "item source"
 * column of the document. An entry with no source is ignored here as well as refused at the door, so
 * no path through the system can put an unsourced figure in the price column.
 */
export function withPrices(lines: BoqLine[], prices: Record<string, EnteredPrice>): BoqLine[] {
  return lines.map((l) => {
    const p = prices[l.id];
    if (!p || !p.source.trim() || !Number.isFinite(p.unitPriceIls) || p.unitPriceIls < 0) return l;
    return { ...l, unitPriceIls: p.unitPriceIls, sources: [...l.sources, { title: p.source.trim(), reference: p.date }] };
  });
}

/** Equipment ids in a room that the catalogue does not know, each once. */
export function unknownEquipment(equipmentIds: string[]): string[] {
  return [...new Set(equipmentIds.filter((id) => !equipmentById(id)))];
}

/**
 * What every screen and every file says about what this document is.
 *
 * The bill counts; it does not design and it does not approve. Said once here so the screen, the CSV
 * and the workbook cannot drift into saying it three different ways.
 */
export const DRAFT_NOTICE = {
  he: 'טיוטת דרישות וכתב כמויות לבדיקת יועץ. המסמך סופר כמויות מתוך מה שהוזן; הוא אינו תכנון, אינו אישור ואינו בדיקת עמידה בתקנים. כל שורה מחייבת בדיקה ואישור של בעל מקצוע מוסמך לפני תמחור, הזמנה או ביצוע.',
  en: 'A draft of requirements and a bill of quantities, for a consultant’s review. The document counts quantities from what was entered; it is not a design, not an approval and not a check against standards. Every line needs a licensed professional’s review and approval before it is priced, ordered or built.',
} as const;

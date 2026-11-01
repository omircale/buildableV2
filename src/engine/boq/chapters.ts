import type { Source } from '../types';
import type { BoqLine, Trade } from './line';

/**
 * The chapters an Israeli bill of quantities is numbered by.
 *
 * Nothing here is invented. The chapter numbers and titles are those of the General Specification for
 * Building Works ("the Blue Book"), read off the inter-ministerial committee's own site. Two further
 * chapters are not in the Blue Book but appear, under these numbers and titles, in real published
 * bills produced with the price-book software the industry uses — they are marked as such.
 *
 * A trade this engine knows that has no chapter anyone could point to stays without one, and its lines
 * are numbered under chapter 99 with a note, rather than being filed under a plausible neighbour.
 */

const BLUE_BOOK: Source = {
  title: 'המפרט הכללי לעבודות בנייה (הספר הכחול) — רשימת הפרקים',
  reference: 'הוועדה הבין-משרדית לסטנדרטיזציה של מסמכי החוזה ולמיחשובם',
  url: 'https://mifratclali.mod.gov.il/AllSpecifications',
};

const PUBLISHED_BILLS: Source = {
  title: 'כתבי כמויות של מכרזים ציבוריים שהופקו ב"תוכנת דקל"',
  reference: 'פרקים שאינם בספר הכחול אך מופיעים במספור זה בכתבי כמויות שפורסמו (2021, 2024)',
  url: 'https://www.mdby.org.il/pdf/auctions/auction-02_23-amounts.pdf',
};

export interface Chapter {
  code: string;
  he: string;
  en: string;
  source: Source;
}

export const CHAPTERS: Record<string, Chapter> = {
  '04': { code: '04', he: 'עבודות בנייה', en: 'Masonry and building works', source: BLUE_BOOK },
  '06': { code: '06', he: 'נגרות אומן ומסגרות פלדה', en: 'Joinery and steel metalwork', source: BLUE_BOOK },
  '07': { code: '07', he: 'מתקני תברואה', en: 'Plumbing installations', source: BLUE_BOOK },
  '08': { code: '08', he: 'מתקני חשמל', en: 'Electrical installations', source: BLUE_BOOK },
  '10': { code: '10', he: 'עבודות ריצוף וחיפוי', en: 'Flooring and cladding', source: BLUE_BOOK },
  '11': { code: '11', he: 'עבודות צביעה', en: 'Painting', source: BLUE_BOOK },
  '14': { code: '14', he: 'עבודות אבן', en: 'Stone works', source: BLUE_BOOK },
  '15': { code: '15', he: 'מתקני מיזוג אוויר', en: 'Air-conditioning installations', source: BLUE_BOOK },
  '18': { code: '18', he: 'תשתיות תקשורת', en: 'Communications infrastructure', source: BLUE_BOOK },
  '24': { code: '24', he: 'הריסות ופירוקים', en: 'Demolition and strip-out', source: PUBLISHED_BILLS },
  '30': { code: '30', he: 'ריהוט וציוד מורכב בבניין', en: 'Fitted furniture and equipment', source: PUBLISHED_BILLS },
};

/** Lines whose trade has no chapter anyone could cite are numbered here, and say so. */
export const UNASSIGNED_CHAPTER = '99';

/**
 * Where each trade's lines are filed. Gas and logistics have no entry on purpose: no source read so
 * far says which chapter a cooking-gas point or a haulage allowance belongs in.
 */
export const TRADE_CHAPTER: Partial<Record<Trade, string>> = {
  demolition: '24',
  builder_work: '04',
  joinery: '06',
  worktops: '14',
  plumbing: '07',
  electrical: '08',
  hvac: '15',
  communications: '18',
  finishes: '10',
  equipment: '30',
};

/** The chapter a line is filed under: its own override first, then its trade's, then unassigned. */
export function chapterOf(line: BoqLine): string {
  return line.chapter ?? TRADE_CHAPTER[line.trade] ?? UNASSIGNED_CHAPTER;
}

export function chapterLabel(code: string): { he: string; en: string } {
  const c = CHAPTERS[code];
  return c ? { he: c.he, en: c.en } : { he: 'פרק לא נקבע', en: 'Chapter not determined' };
}

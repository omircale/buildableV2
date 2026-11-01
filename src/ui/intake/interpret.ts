import type { FurnitureKind, SpaceCm } from '../furnitureCatalog';
import type { LoadPresetId } from '../DesignControls';

/**
 * Reads what a person wrote about the piece they want.
 *
 * The rule this is built around: **it never supplies a number the person did not give.** "A big
 * bookcase" yields a bookcase and no width, and the gap is asked about; it does not quietly become
 * 180 cm. Everything it does take is handed back as a labelled, correctable claim with the words it
 * came from, and every phrase it could not place is handed back too — because silently ignoring half
 * a sentence reads exactly like understanding it.
 *
 * That is also the contract any future model-driven parsing has to meet: produce these same claims
 * for a person to confirm, never write to the design directly.
 */

export type Claim =
  | { field: 'kind'; kind: FurnitureKind; source: string }
  | { field: 'width' | 'height' | 'depth'; cm: number; source: string }
  | { field: 'use'; use: LoadPresetId; source: string };

/**
 * A phrase we could not place. When it sits next to a dimension word — "height up to the ceiling" —
 * we know which measurement the person believes they gave, and ask for exactly that one.
 */
export interface Unread {
  phrase: string;
  axis?: 'width' | 'height' | 'depth';
}

export interface Reading {
  /** What the text said, in the order it said it. */
  claims: Claim[];
  /** Phrases that carry meaning we could not place — shown to the person, never dropped in silence. */
  unread: Unread[];
}

/** A dimension the design needs that the text did not give. */
export type Gap = 'kind' | 'width' | 'height' | 'depth';

type Vocab<T> = { value: T; words: string[] };

/**
 * Words that name a piece of furniture. Deliberately plain: these are matched literally, so what the
 * reader understands is exactly what is listed here and can be read off the page.
 */
const KINDS: Vocab<FurnitureKind>[] = [
  { value: 'floor_bed', words: ['מונטסורי', 'מיטת רצפה', 'montessori', 'floor bed'] },
  { value: 'bed', words: ['מיטה', 'מיטת', 'bed'] },
  { value: 'cabinet_doors', words: ['ארון', 'ארונית', 'cabinet', 'wardrobe'] },
  { value: 'shoe_cabinet', words: ['ארון נעליים', 'נעליים', 'shoe cabinet'] },
  { value: 'shoe_rack', words: ['מדף נעליים', 'shoe rack'] },
  { value: 'tv_unit', words: ['מזנון', 'טלוויזיה', 'tv unit', 'media unit'] },
  { value: 'cube_organizer', words: ['כוננית', 'קוביות', 'cube'] },
  { value: 'open_shelf', words: ['ספרייה', 'ספריה', 'מדפים', 'מדף', 'כוורת', 'bookcase', 'shelf', 'shelves', 'shelving'] },
  { value: 'desk', words: ['שולחן כתיבה', 'שולחן עבודה', 'desk'] },
  { value: 'coffee_table', words: ['שולחן סלון', 'שולחן קפה', 'coffee table'] },
  { value: 'nightstand', words: ['שידת לילה', 'קומודה', 'nightstand', 'bedside'] },
  { value: 'bench', words: ['ספסל', 'bench'] },
  { value: 'kids_chair', words: ['כיסא ילדים', 'כסא ילדים', 'kids chair'] },
  { value: 'chair', words: ['כיסא', 'כסא', 'chair'] },
  { value: 'pullup', words: ['מתח', 'מתקן כושר', 'pull-up', 'pull up', 'pullup'] },
];

const USES: Vocab<LoadPresetId>[] = [
  { value: 'books', words: ['ספרים', 'ספרייה', 'ספריה', 'books'] },
  { value: 'decor', words: ['נוי', 'קישוט', 'צמחים', 'ornaments', 'plants', 'decor'] },
  { value: 'heavy', words: ['כבד', 'טלוויזיה', 'מיקרוגל', 'heavy', 'tv'] },
];

/** Hebrew and English words for each dimension, longest first so "רוחב" never matches inside a longer word. */
const AXES: Vocab<'width' | 'height' | 'depth'>[] = [
  { value: 'width', words: ['רוחב', 'ברוחב', 'width', 'wide'] },
  { value: 'height', words: ['גובה', 'בגובה', 'height', 'tall', 'high'] },
  { value: 'depth', words: ['עומק', 'בעומק', 'depth', 'deep'] },
];

const METRE_WORDS = ['מטר', "מ'", 'metre', 'meter', ' m'];
const CM_WORDS = ['ס"מ', 'סמ', 'ס״מ', 'cm', 'centimet'];

/**
 * Phrases that sound like a measurement without being one. They are called out by name rather than
 * ignored, because a person who wrote "up to the ceiling" believes they said how tall it is.
 */
const VAGUE = [
  'עד התקרה',
  'עד הקיר',
  'גדול',
  'גדולה',
  'קטן',
  'קטנה',
  'בינוני',
  'בינונית',
  'רגיל',
  'ענק',
  'to the ceiling',
  'floor to ceiling',
  'big',
  'large',
  'small',
  'medium',
  'huge',
];

const norm = (s: string) => s.replace(/[֑-ׇ]/g, '').toLowerCase();

/** Centimetres for a number written with (or without) a unit right after it. */
function toCm(value: number, unitText: string): number | null {
  const u = norm(unitText);
  if (METRE_WORDS.some((w) => u.startsWith(norm(w.trim())))) return Math.round(value * 100);
  if (CM_WORDS.some((w) => u.startsWith(norm(w)))) return Math.round(value);
  // No unit: a plain number in this context is centimetres, which is how people write furniture sizes.
  if (u === '') return Math.round(value);
  return null;
}

export function readDescription(text: string): Reading {
  const claims: Claim[] = [];
  const unread: Unread[] = [];
  const lower = norm(text);
  const consumed: [number, number][] = [];
  const claim = (c: Claim, at: number, len: number) => {
    claims.push(c);
    consumed.push([at, at + len]);
  };

  // A written triple: 200x80x30, 200 x 80 x 30.
  const triple = /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/.exec(lower);
  if (triple) {
    const [w, h, d] = [triple[1], triple[2], triple[3]].map((n) => Math.round(Number(n.replace(',', '.'))));
    claim({ field: 'width', cm: w, source: triple[0] }, triple.index, triple[0].length);
    claims.push({ field: 'height', cm: h, source: triple[0] });
    claims.push({ field: 'depth', cm: d, source: triple[0] });
  }

  // A labelled dimension, with the label on either side of the number: "רוחב 2 מטר", "2 מטר רוחב".
  for (const axis of AXES) {
    if (claims.some((c) => c.field === axis.value)) continue;
    for (const word of axis.words) {
      const w = norm(word);
      const after = new RegExp(`${w}\\s*(?:של\\s*|is\\s*|of\\s*)?(\\d+(?:[.,]\\d+)?)\\s*([\\p{L}"'״]*)`, 'u').exec(lower);
      const before = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*([\\p{L}"'״]*)\\s*${w}`, 'u').exec(lower);
      const m = after ?? before;
      if (!m) continue;
      const value = Number((after ? m[1] : m[1]).replace(',', '.'));
      const cm = toCm(value, after ? m[2] : m[2]);
      if (cm == null || cm <= 0) continue;
      claim({ field: axis.value, cm, source: m[0].trim() }, m.index, m[0].length);
      break;
    }
  }

  for (const kind of KINDS) {
    if (claims.some((c) => c.field === 'kind')) break;
    for (const word of kind.words) {
      const at = lower.indexOf(norm(word));
      if (at < 0) continue;
      claim({ field: 'kind', kind: kind.value, source: word }, at, word.length);
      break;
    }
  }

  for (const use of USES) {
    if (claims.some((c) => c.field === 'use')) break;
    for (const word of use.words) {
      const at = lower.indexOf(norm(word));
      if (at < 0) continue;
      claim({ field: 'use', use: use.value, source: word }, at, word.length);
      break;
    }
  }

  // Anything that sounds like a size but is not one is named, not skipped.
  for (const phrase of VAGUE) {
    const at = lower.indexOf(norm(phrase));
    if (at < 0) continue;
    if (consumed.some(([s, e]) => at >= s && at < e)) continue;
    // The words just before it say which measurement the person thought they were giving.
    const lead = lower.slice(Math.max(0, at - 14), at);
    const axis = AXES.find((a) => a.words.some((w) => lead.includes(norm(w))))?.value;
    unread.push({ phrase, ...(axis ? { axis } : {}) });
  }

  return { claims, unread };
}

/** The space a reading pins down, for the catalog's own filter. */
export function spaceFrom(claims: Claim[]): SpaceCm {
  const of = (f: 'width' | 'height' | 'depth') => {
    const c = claims.find((x) => x.field === f);
    return c && 'cm' in c ? c.cm : null;
  };
  return { w: of('width'), h: of('height'), d: of('depth') };
}

export function kindFrom(claims: Claim[]): FurnitureKind | null {
  const c = claims.find((x) => x.field === 'kind');
  return c && 'kind' in c ? c.kind : null;
}

export function intendedUse(claims: Claim[]): LoadPresetId | null {
  const c = claims.find((x) => x.field === 'use');
  return c && 'use' in c ? c.use : null;
}

/**
 * What still has to be asked. Only the piece itself is always required: a size the person did not
 * give is left to the template's own starting point, which is a stated default rather than a guess
 * dressed up as their intention.
 */
export function gapsIn(claims: Claim[], unread: Unread[]): Gap[] {
  const gaps: Gap[] = [];
  if (!kindFrom(claims)) gaps.push('kind');
  const missing = (axis: 'width' | 'height' | 'depth') => !claims.some((c) => c.field === axis);
  for (const u of unread) {
    // A vague phrase next to "height" asks only about height. One on its own — "a big bookcase" —
    // is about the measurement that defines the piece, which is how wide it is.
    const axis = u.axis ?? 'width';
    if (missing(axis) && !gaps.includes(axis)) gaps.push(axis);
  }
  return gaps;
}

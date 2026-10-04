/**
 * Reads what a person wrote about a room and what goes in it.
 *
 * Same contract as the furniture interpreter beside it: **it never supplies a number the person did
 * not give**, everything it takes is handed back as a claim the person confirms, and every phrase it
 * could not place is handed back too — silently ignoring half a sentence reads exactly like
 * understanding it. A dimension given without a unit is still taken, because the number was said,
 * but the claim carries `unitStated: false` so the screen asks which unit was meant.
 *
 * It is deliberately a lexicon, not a language model. Every mapping here can be read and argued with,
 * and a model-driven reader would have to produce these same claims for the same confirmation step.
 */

export type SpaceClaim =
  | { field: 'equipment'; equipmentId: string; count: number; source: string }
  | { field: 'size'; widthMm: number; depthMm: number; unitStated: boolean; source: string }
  | { field: 'height'; heightMm: number; unitStated: boolean; source: string }
  | { field: 'name'; name: string; source: string }
  | { field: 'open'; source: string };

export interface SpaceReading {
  claims: SpaceClaim[];
  /** Phrases that carry meaning this could not place, in the order they appeared. */
  unread: string[];
}

/** Every phrasing that names a catalogue item. Token sequences, matched after prefix stripping. */
const EQUIPMENT_TERMS: Record<string, string[][]> = {
  bar_sink_single: [['כיור', 'בר'], ['כיור'], ['כיורים'], ['sink'], ['sinks']],
  bar_tap: [['ברז'], ['ברזים'], ['tap'], ['taps'], ['faucet']],
  undercounter_fridge: [
    ['מקרר', 'מתחת', 'לדלפק'],
    ['מקררים', 'מתחת', 'לדלפק'],
    ['מקרר', 'תת-דלפקי'],
    ['מקררים', 'תת-דלפקיים'],
    ['מקרר'],
    ['מקררים'],
    ['fridge'],
    ['fridges'],
    ['refrigerator'],
  ],
  ice_maker: [['מכונת', 'קרח'], ['מכונות', 'קרח'], ['ice', 'maker'], ['ice', 'machine']],
  grease_trap: [['מפריד', 'שומן'], ['מפרידי', 'שומן'], ['grease', 'trap']],
  waste_bin_unit: [['יחידת', 'פסולת'], ['פח', 'אשפה'], ['פח'], ['פחים'], ['waste', 'unit'], ['bin']],
};

const ROOM_TERMS: string[][] = [['בר', 'בריכה'], ['pool', 'bar'], ['מטבח'], ['kitchen'], ['ספא'], ['spa'], ['לובי'], ['lobby'], ['בר']];

const OPEN_TERMS: string[][] = [['פתוח', 'לבריכה'], ['פתוח', 'לדק'], ['פתוח'], ['פתוחה'], ['open', 'to'], ['open']];

const COUNT_WORDS: Record<string, number> = {
  אחד: 1,
  אחת: 1,
  שני: 2,
  שתי: 2,
  שניים: 2,
  שתיים: 2,
  שלושה: 3,
  שלוש: 3,
  ארבעה: 4,
  ארבע: 4,
  חמישה: 5,
  חמש: 5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

/** Words that carry no content of their own here. "אין" is deliberately absent: it means something. */
const STOPWORDS = new Set([
  'עם',
  'של',
  'את',
  'גם',
  'יש',
  'צריך',
  'צריכים',
  'צריכה',
  'רוצה',
  'רוצים',
  'אני',
  'אנחנו',
  'זה',
  'לנו',
  'לי',
  'עוד',
  'ועוד',
  'וגם',
  'כולל',
  'בו',
  'בה',
  'שם',
  'a',
  'an',
  'the',
  'with',
  'and',
  'of',
  'we',
  'need',
  'want',
  'i',
  'plus',
  'also',
]);

const UNIT = String.raw`(מטר|מטרים|מ'|מ׳|ס"מ|ס״מ|סמ|cm|m)?`;
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const SIZE_RE = new RegExp(`${NUM}\\s*${UNIT}\\s*(?:על|x|×|\\*)\\s*${NUM}\\s*${UNIT}`, 'i');
const HEIGHT_RE = new RegExp(`(?:גובה\\s+(?:ה)?תקרה|גובה|תקרה|ceiling\\s+height|height|ceiling)\\s*(?:של|of)?\\s*${NUM}\\s*${UNIT}`, 'i');

function toMm(value: number, unit: string | undefined): { mm: number; unitStated: boolean } {
  if (unit) {
    const cm = /ס|cm/i.test(unit);
    return { mm: Math.round(value * (cm ? 10 : 1000)), unitStated: true };
  }
  // No unit was said. A room is not 7 cm wide or 720 m wide, so the reading follows the size of the
  // number — and the claim says the unit was inferred, so the person confirms it before it counts.
  return { mm: Math.round(value <= 30 ? value * 1000 : value * 10), unitStated: false };
}

const num = (s: string) => Number(s.replace(',', '.'));

/** A token with up to two leading Hebrew prefix letters removed — ו, ה, ב, ל, מ, ש, כ. */
function stems(token: string): string[] {
  const out = [token];
  if (/^[והבלמשכ]/.test(token) && token.length > 2) out.push(token.slice(1));
  if (/^[והבלמשכ]{2}/.test(token) && token.length > 3) out.push(token.slice(2));
  return out;
}

function matchesAt(tokens: string[], i: number, term: string[]): boolean {
  if (i + term.length > tokens.length) return false;
  // Only the first word of a phrase takes a prefix ("ומכונת קרח"); the rest must match as written.
  if (!stems(tokens[i]).includes(term[0])) return false;
  for (let k = 1; k < term.length; k++) if (tokens[i + k] !== term[k]) return false;
  return true;
}

function countBefore(tokens: string[], i: number): { count: number; at: number } | null {
  if (i === 0) return null;
  const prev = tokens[i - 1];
  if (/^\d+$/.test(prev)) return { count: Number(prev), at: i - 1 };
  for (const s of stems(prev)) if (COUNT_WORDS[s] != null) return { count: COUNT_WORDS[s], at: i - 1 };
  return null;
}

export function interpretSpace(text: string): SpaceReading {
  const claims: SpaceClaim[] = [];
  let rest = ` ${text} `;

  const size = SIZE_RE.exec(rest);
  if (size) {
    const unitA = size[2] ?? size[4];
    const unitB = size[4] ?? size[2];
    const w = toMm(num(size[1]), unitA);
    const d = toMm(num(size[3]), unitB);
    claims.push({ field: 'size', widthMm: w.mm, depthMm: d.mm, unitStated: w.unitStated && d.unitStated, source: size[0].trim() });
    rest = rest.replace(size[0], ' ');
  }

  const height = HEIGHT_RE.exec(rest);
  if (height) {
    const h = toMm(num(height[1]), height[2]);
    claims.push({ field: 'height', heightMm: h.mm, unitStated: h.unitStated, source: height[0].trim() });
    rest = rest.replace(height[0], ' ');
  }

  // A comma is where one thing a person said ends and the next begins, so it survives as a boundary
  // token rather than being washed out with the rest of the punctuation.
  const tokens = rest
    .toLowerCase()
    .replace(/[,;]/g, ' , ')
    .replace(/[:!?()[\]{}“”"״.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const used = new Set<number>();
  const counts = new Map<string, { count: number; sources: string[] }>();
  let named = false;

  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;

    let hit: { id: string; term: string[] } | null = null;
    for (const [id, terms] of Object.entries(EQUIPMENT_TERMS)) {
      for (const term of terms) {
        if (matchesAt(tokens, i, term) && (!hit || term.length > hit.term.length)) hit = { id, term };
      }
    }
    if (hit) {
      const before = countBefore(tokens, i);
      const from = before ? before.at : i;
      const to = i + hit.term.length;
      for (let k = from; k < to; k++) used.add(k);
      const at = counts.get(hit.id) ?? { count: 0, sources: [] };
      at.count += before?.count ?? 1;
      at.sources.push(tokens.slice(from, to).join(' '));
      counts.set(hit.id, at);
      i = to - 1;
      continue;
    }

    const room = ROOM_TERMS.find((term) => matchesAt(tokens, i, term));
    if (room && !named) {
      for (let k = i; k < i + room.length; k++) used.add(k);
      const source = tokens.slice(i, i + room.length).join(' ');
      claims.push({ field: 'name', name: source, source });
      named = true;
      i += room.length - 1;
      continue;
    }

    const open = OPEN_TERMS.find((term) => matchesAt(tokens, i, term));
    if (open) {
      for (let k = i; k < i + open.length; k++) used.add(k);
      claims.push({ field: 'open', source: tokens.slice(i, i + open.length).join(' ') });
      i += open.length - 1;
    }
  }

  for (const [equipmentId, { count, sources }] of counts) claims.push({ field: 'equipment', equipmentId, count, source: sources.join(', ') });

  // What is left, grouped into the phrases it came in, with the empty words taken out.
  const unread: string[] = [];
  let run: string[] = [];
  const flush = () => {
    const words = run.filter((w) => !stems(w).some((s) => STOPWORDS.has(s)));
    if (words.length) unread.push(words.join(' '));
    run = [];
  };
  tokens.forEach((t, i) => {
    if (used.has(i) || t === ',') return flush();
    // A word opening with "ו" is Hebrew's "and": what follows is a new thing, not more of the last one.
    if (run.length && /^ו[^ו]/.test(t) && t.length > 2) flush();
    run.push(t);
  });
  flush();

  return { claims, unread };
}

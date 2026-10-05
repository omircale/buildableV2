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

import type { Sector } from '../../engine';

export type SpaceClaim =
  | { field: 'equipment'; equipmentId: string; count: number; source: string }
  | { field: 'size'; widthMm: number; depthMm: number; unitStated: boolean; source: string }
  | { field: 'height'; heightMm: number; unitStated: boolean; source: string }
  | { field: 'name'; name: string; source: string }
  | { field: 'sector'; sector: Sector; source: string }
  | { field: 'open'; source: string };

export interface SpaceReading {
  claims: SpaceClaim[];
  /** Phrases that carry meaning this could not place, in the order they appeared. */
  unread: string[];
}

/** Every phrasing that names a catalogue item. Token sequences, matched after prefix stripping. */
export const EQUIPMENT_TERMS: Record<string, string[][]> = {
  // The first phrase of each item is the one that names it without doubt; a test reads it back.
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

  hand_wash_basin: [['כיור', 'רחיצת', 'ידיים'], ['כיור', 'ידיים'], ['כיורי', 'ידיים'], ['hand', 'wash', 'basin'], ['handwash', 'basin']],
  prep_sink_double: [['כיור', 'הכנה'], ['כיור', 'כפול'], ['כיורי', 'הכנה'], ['prep', 'sink']],
  dishwasher_commercial: [['מדיח', 'כלים', 'תעשייתי'], ['מדיח', 'תעשייתי'], ['מדיח', 'כלים'], ['מדיח'], ['מדיחים'], ['dishwasher'], ['dishwashers']],
  glasswasher: [['מדיח', 'כוסות'], ['מדיחי', 'כוסות'], ['glasswasher'], ['glass', 'washer']],
  // A range or a combi oven is only recognised with its fuel: the fuel is what decides the point.
  range_gas: [['כיריים', 'גז'], ['gas', 'range'], ['gas', 'hob']],
  range_induction: [['כיריים', 'אינדוקציה'], ['אינדוקציה'], ['induction', 'range'], ['induction', 'hob'], ['induction']],
  oven_combi_electric: [['תנור', 'קומבי', 'חשמלי'], ['קומביסטימר', 'חשמלי'], ['electric', 'combi', 'oven'], ['electric', 'combi']],
  oven_combi_gas: [['תנור', 'קומבי', 'גז'], ['קומביסטימר', 'גז'], ['gas', 'combi', 'oven'], ['gas', 'combi']],
  fryer_electric: [['צ׳יפסר', 'חשמלי'], ["צ'יפסר", 'חשמלי'], ['ציפסר', 'חשמלי'], ['electric', 'fryer']],
  fryer_gas: [['צ׳יפסר', 'גז'], ["צ'יפסר", 'גז'], ['ציפסר', 'גז'], ['gas', 'fryer']],
  griddle_gas: [['פלנצ׳ה'], ["פלנצ'ה"], ['פלנצה'], ['גריל', 'גז'], ['griddle'], ['gas', 'grill']],
  extraction_hood: [['קולט', 'אדים'], ['קולטי', 'אדים'], ['מנדף'], ['מנדפים'], ['extraction', 'hood'], ['hood'], ['hoods']],
  upright_fridge: [['מקרר', 'עומד'], ['מקררים', 'עומדים'], ['upright', 'fridge'], ['upright', 'refrigerator']],
  upright_freezer: [['מקפיא', 'עומד'], ['מקפיא'], ['מקפיאים'], ['upright', 'freezer'], ['freezer'], ['freezers']],
  prep_counter_refrigerated: [['שולחן', 'קירור'], ['שולחנות', 'קירור'], ['סלטייה'], ['refrigerated', 'counter'], ['prep', 'counter']],
  espresso_machine: [['מכונת', 'אספרסו'], ['מכונות', 'אספרסו'], ['אספרסו'], ['espresso', 'machine'], ['espresso']],
  coffee_grinder: [['מטחנת', 'קפה'], ['מטחנות', 'קפה'], ['מטחנה'], ['coffee', 'grinder'], ['grinder']],

  workstation: [['עמדת', 'עבודה'], ['עמדות', 'עבודה'], ['עמדות'], ['workstation'], ['workstations'], ['desk'], ['desks']],
  meeting_room_screen: [['מסך', 'חדר', 'ישיבות'], ['מסך', 'ישיבות'], ['מסך'], ['מסכים'], ['meeting', 'room', 'screen'], ['screen'], ['screens']],
  printer_mfp: [['מדפסת', 'משולבת'], ['מדפסת'], ['מדפסות'], ['printer'], ['printers']],
  network_cabinet: [['ארון', 'תקשורת'], ['ארונות', 'תקשורת'], ['network', 'cabinet'], ['comms', 'cabinet'], ['rack']],
  wifi_access_point: [['נקודת', 'גישה'], ['נקודות', 'גישה'], ['wifi'], ['wi-fi'], ['access', 'point'], ['access', 'points']],
  kitchenette_sink: [['כיור', 'מטבחון'], ['kitchenette', 'sink']],
  kitchenette_dishwasher: [['מדיח', 'למטבחון'], ['מדיח', 'מטבחון'], ['kitchenette', 'dishwasher']],
  kitchenette_fridge: [['מקרר', 'מטבחון'], ['מקרר', 'למטבחון'], ['kitchenette', 'fridge'], ['office', 'fridge']],
  water_dispenser: [['מתקן', 'מים'], ['מתקני', 'מים'], ['בר', 'מים'], ['water', 'dispenser'], ['water', 'cooler']],
  split_ac_indoor: [['מזגן', 'מפוצל'], ['מזגן'], ['מזגנים'], ['air', 'conditioner'], ['air', 'conditioners'], ['split', 'ac']],

  pos_terminal: [['עמדת', 'קופה'], ['עמדות', 'קופה'], ['קופה'], ['קופות'], ['point', 'of', 'sale'], ['till'], ['tills'], ['checkout'], ['pos']],
  display_fridge: [['מקרר', 'תצוגה'], ['מקררי', 'תצוגה'], ['display', 'fridge'], ['display', 'fridges']],
  display_freezer: [['מקפיא', 'תצוגה'], ['מקפיאי', 'תצוגה'], ['display', 'freezer']],
  illuminated_sign: [['שלט', 'מואר'], ['שלט'], ['שלטים'], ['illuminated', 'sign'], ['sign'], ['signs']],
  automatic_door: [['דלת', 'אוטומטית'], ['דלתות', 'אוטומטיות'], ['automatic', 'door'], ['automatic', 'doors']],
  electric_shutter: [['תריס', 'חשמלי'], ['תריס', 'גלילה'], ['תריס'], ['תריסים'], ['roller', 'shutter'], ['shutter'], ['shutters']],
  security_camera: [['מצלמת', 'אבטחה'], ['מצלמות', 'אבטחה'], ['מצלמה'], ['מצלמות'], ['security', 'camera'], ['camera'], ['cameras'], ['cctv']],
  anti_theft_gate: [['שער', 'נגד', 'גניבות'], ['שערי', 'גניבות'], ['anti-theft', 'gate'], ['security', 'gate']],
};

const ROOM_TERMS: string[][] = [['בר', 'בריכה'], ['pool', 'bar'], ['חדר', 'ישיבות'], ['meeting', 'room'], ['מטבחון'], ['kitchenette'], ['מטבח'], ['kitchen'], ['מסעדה'], ['restaurant'], ['משרד'], ['office'], ['חנות'], ['shop'], ['store'], ['ספא'], ['spa'], ['לובי'], ['lobby'], ['בר']];

/**
 * Words that say what kind of place this is. "Kitchen" is not among them: an office has one too.
 * A word here can also be the room's name — "משרד" is both a kind of place and what the room is called.
 */
const SECTOR_TERMS: [Sector, string[]][] = [
  ['office', ['משרד']],
  ['office', ['משרדים']],
  ['office', ['office']],
  ['restaurant', ['מסעדה']],
  ['restaurant', ['מסעדת']],
  ['restaurant', ['בית', 'קפה']],
  ['restaurant', ['restaurant']],
  ['restaurant', ['cafe']],
  ['restaurant', ['café']],
  ['shop', ['חנות']],
  ['shop', ['shop']],
  ['shop', ['store']],
  ['bar', ['בר']],
  ['bar', ['פאב']],
  ['bar', ['bar']],
  ['bar', ['pub']],
];

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
  שישה: 6,
  שש: 6,
  שבעה: 7,
  שבע: 7,
  שמונה: 8,
  תשעה: 9,
  תשע: 9,
  עשרה: 10,
  עשר: 10,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
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
  let sectorSaid = false;

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
    const kind = sectorSaid ? undefined : SECTOR_TERMS.find(([, term]) => matchesAt(tokens, i, term));
    if (kind) {
      const [sector, term] = kind;
      claims.push({ field: 'sector', sector, source: tokens.slice(i, i + term.length).join(' ') });
      sectorSaid = true;
      // The word is spoken for even when the room already has a name: "מטבח מסעדה" is a kitchen, in a restaurant.
      for (let k = i; k < i + term.length; k++) used.add(k);
      if (!room || named) {
        i += term.length - 1;
        continue;
      }
    }
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

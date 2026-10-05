import type { Source } from '../types';

/**
 * Equipment: the things in a project that are **bought, not built**.
 *
 * A sink, a tap, a under-counter fridge, a grease trap. They differ from boards in every way that
 * matters to a bill of quantities: there is nothing to cut, the size is the manufacturer's and not
 * ours, and the line names a product rather than a piece of material.
 *
 * The reason they belong in this engine at all is the second field below. **A piece of equipment
 * declares the connections it needs**, and that is where most of the plumbing, electrical and gas
 * quantities in a bar come from — a sink is not one line, it is a sink plus a hot point plus a cold
 * point plus a drain. Counting those is quantity surveying; designing and certifying them is not,
 * and this engine never does the second.
 */

/** A service an item needs brought to it. Quantities only — never a route, a size or a compliance claim. */
export type ServiceKind = 'water_cold' | 'water_hot' | 'drain' | 'electrical' | 'gas' | 'ventilation' | 'data';

/**
 * Whether the requirement is something brought to the item or space left around it.
 *
 * The distinction is not cosmetic. A water point is run, connected and billed as a point; a fridge's
 * condenser clearance is a gap in the joinery that nobody installs and nobody prices as a point.
 * Counting the two together overstates the hvac chapter and, worse, puts "bring a ventilation supply
 * to the room" into a document a hotel reads when what was meant is "leave 50 mm behind the fridge".
 */
export type RequirementForm = 'point' | 'clearance';

export interface ServiceRequirement {
  kind: ServiceKind;
  quantity: number;
  /** Defaults to 'point' when absent. */
  form?: RequirementForm;
  /** What the licensed trade needs to know, in their words. Never a calculated value. */
  noteHe: string;
  noteEn: string;
}

export type EquipmentCategory =
  | 'sink'
  | 'tap'
  | 'refrigeration'
  | 'drainage'
  | 'ice'
  | 'dispense'
  | 'waste'
  | 'cooking'
  | 'warewashing'
  | 'extraction'
  | 'beverage'
  | 'workplace'
  | 'network'
  | 'point_of_sale'
  | 'climate'
  | 'shopfront'
  | 'security';

/**
 * The kind of place an item belongs in. An item can belong in several — a hand-wash basin is in a
 * restaurant, a shop and an office alike. This only decides what a person is offered first; nothing
 * stops a fridge being put in an office.
 */
export type Sector = 'bar' | 'restaurant' | 'office' | 'shop';
export const SECTORS: readonly Sector[] = ['bar', 'restaurant', 'office', 'shop'];

export interface EquipmentItem {
  id: string;
  nameHe: string;
  nameEn: string;
  category: EquipmentCategory;
  sectors: Sector[];
  /** Nominal outer size in mm. From a product, or null when it depends on the model chosen. */
  sizeMm: { width: number | null; height: number | null; depth: number | null };
  /** Space the trade needs around it to install and service it. Null when unknown. */
  serviceClearanceMm: number | null;
  /** What has to be brought to this item for it to work. */
  services: ServiceRequirement[];
  /** Mass for the weight estimate; null when it depends on the model. */
  massKg: number | null;
  /** Price is a market fact, not a product fact: null until a real quote or price list says otherwise. */
  priceIls: number | null;
  sources: Source[];
  noteHe?: string;
  noteEn?: string;
}

const NO_SOURCE_YET: Source[] = [];

const COMBI_SOURCE: Source = {
  title: 'How to prepare for a combi oven installation — Foodservice Equipment Reports',
  reference: 'a cold water line and a drain within three feet of the unit; a gas hookup depending on the model',
  url: 'https://www.fermag.com/articles/how-to-prepare-for-a-combi-oven-installation/',
};

/** The usual services, written once so the wording a trade reads is the same on every item. */
const NEED = {
  cold: { kind: 'water_cold', quantity: 1, noteHe: 'נקודת מים קרים', noteEn: 'Cold water point' },
  hot: { kind: 'water_hot', quantity: 1, noteHe: 'נקודת מים חמים', noteEn: 'Hot water point' },
  drain: { kind: 'drain', quantity: 1, noteHe: 'ניקוז — קוטר ושיפוע לפי תכנון אינסטלטור', noteEn: 'Drain — diameter and fall per the plumber’s design' },
  power: { kind: 'electrical', quantity: 1, noteHe: 'נקודת חשמל — הספק והגנה לפי חשמלאי מורשה', noteEn: 'Electrical point — rating and protection per a licensed electrician' },
  circuit: { kind: 'electrical', quantity: 1, noteHe: 'מעגל ייעודי — לפי חשמלאי מורשה', noteEn: 'Dedicated circuit — per a licensed electrician' },
  gas: { kind: 'gas', quantity: 1, noteHe: 'נקודת גז — לפי מתקין גז מורשה', noteEn: 'Gas point — per a licensed gas fitter' },
  data: { kind: 'data', quantity: 1, noteHe: 'נקודת תקשורת — סוג הכבל לפי מתכנן התקשורת', noteEn: 'Data point — cable type per the communications designer' },
  duct: { kind: 'ventilation', quantity: 1, noteHe: 'חיבור לתעלת פליטה — לפי יועץ מיזוג ואוורור', noteEn: 'Connection to an exhaust duct — per the HVAC consultant' },
  heat: { kind: 'ventilation', quantity: 1, form: 'clearance', noteHe: 'פינוי חום מהמעבה — מרווח לפי היצרן', noteEn: 'Condenser heat clearance — per the maker' },
} satisfies Record<string, ServiceRequirement>;

/**
 * An item whose size, weight and price are not yet known — which is every item until a model is
 * chosen. The builder exists so that "unknown" is written in one place and cannot be forgotten on one.
 */
function bought(
  id: string,
  nameHe: string,
  nameEn: string,
  category: EquipmentCategory,
  sectors: Sector[],
  services: ServiceRequirement[],
  note?: { he: string; en: string },
  sources: Source[] = NO_SOURCE_YET,
): EquipmentItem {
  return {
    id,
    nameHe,
    nameEn,
    category,
    sectors,
    sizeMm: { width: null, height: null, depth: null },
    serviceClearanceMm: null,
    services,
    massKg: null,
    priceIls: null,
    sources,
    noteHe: note?.he,
    noteEn: note?.en,
  };
}

const MODEL_DECIDES_WATER = {
  he: 'יש דגמים שמוזנים במים חמים ויש במים קרים — הנקודה נספרת, והסוג נקבע לפי הדגם.',
  en: 'Some models are fed hot water and some cold — the point is counted, and which it is follows the model.',
};
const HOOD_SEPARATE = {
  he: 'קולט אדים, אם נדרש, נספר כפריט נפרד — הצורך בו נקבע על ידי יועץ.',
  en: 'An extraction hood, where one is required, is counted as its own item — whether it is needed is a consultant’s call.',
};

/**
 * The starting catalogue for a pool bar.
 *
 * Every size, mass and price here is **null on purpose**. These are product facts that come from a
 * chosen model, and inventing plausible ones is the exact failure this engine exists to avoid — a
 * "standard" 600 mm sink that turns out to be 550 mm is a hole in a worktop that has been cut.
 *
 * What is *not* null is the service requirements, because those follow from what the item is: a sink
 * needs water and a drain whichever model you buy. That is what makes the catalogue useful before a
 * single product has been picked.
 */
export const EQUIPMENT: EquipmentItem[] = [
  {
    id: 'bar_sink_single',
    nameHe: 'כיור בר חד-תא',
    nameEn: 'Single-bowl bar sink',
    category: 'sink',
    sectors: ['bar', 'restaurant'],
    sizeMm: { width: null, height: null, depth: null },
    serviceClearanceMm: null,
    services: [
      { kind: 'water_cold', quantity: 1, noteHe: 'נקודת מים קרים', noteEn: 'Cold water point' },
      { kind: 'water_hot', quantity: 1, noteHe: 'נקודת מים חמים', noteEn: 'Hot water point' },
      { kind: 'drain', quantity: 1, noteHe: 'ניקוז — קוטר ושיפוע לפי תכנון אינסטלטור', noteEn: 'Drain — diameter and fall per the plumber’s design' },
    ],
    massKg: null,
    priceIls: null,
    sources: NO_SOURCE_YET,
    noteHe: 'החיתוך במשטח נגזר ממידות הדגם שייבחר, ולכן אינו מחושב כאן.',
    noteEn: 'The worktop cut-out follows the chosen model’s dimensions, so it is not derived here.',
  },
  {
    id: 'bar_tap',
    nameHe: 'ברז בר',
    nameEn: 'Bar tap',
    category: 'tap',
    sectors: ['bar', 'restaurant'],
    sizeMm: { width: null, height: null, depth: null },
    serviceClearanceMm: null,
    services: [],
    massKg: null,
    priceIls: null,
    sources: NO_SOURCE_YET,
    noteHe: 'מתחבר לנקודות של הכיור; אינו מוסיף נקודות משלו.',
    noteEn: 'Connects to the sink’s points; adds none of its own.',
  },
  {
    id: 'undercounter_fridge',
    nameHe: 'מקרר תת-דלפקי',
    nameEn: 'Under-counter refrigerator',
    category: 'refrigeration',
    sectors: ['bar', 'restaurant'],
    sizeMm: { width: null, height: null, depth: null },
    serviceClearanceMm: null,
    services: [
      { kind: 'electrical', quantity: 1, noteHe: 'מעגל ייעודי — לפי חשמלאי מורשה', noteEn: 'Dedicated circuit — per a licensed electrician' },
      { kind: 'ventilation', quantity: 1, form: 'clearance', noteHe: 'פינוי חום מהמעבה — מרווח לפי היצרן', noteEn: 'Condenser heat clearance — per the maker' },
    ],
    massKg: null,
    priceIls: null,
    sources: NO_SOURCE_YET,
  },
  {
    id: 'ice_maker',
    nameHe: 'מכונת קרח',
    nameEn: 'Ice maker',
    category: 'ice',
    sectors: ['bar', 'restaurant'],
    sizeMm: { width: null, height: null, depth: null },
    serviceClearanceMm: null,
    services: [
      { kind: 'water_cold', quantity: 1, noteHe: 'מים קרים', noteEn: 'Cold water' },
      { kind: 'drain', quantity: 1, noteHe: 'ניקוז', noteEn: 'Drain' },
      { kind: 'electrical', quantity: 1, noteHe: 'מעגל ייעודי', noteEn: 'Dedicated circuit' },
    ],
    massKg: null,
    priceIls: null,
    sources: NO_SOURCE_YET,
  },
  {
    id: 'grease_trap',
    nameHe: 'מפריד שומן',
    nameEn: 'Grease trap',
    category: 'drainage',
    sectors: ['bar', 'restaurant'],
    sizeMm: { width: null, height: null, depth: null },
    serviceClearanceMm: null,
    services: [{ kind: 'drain', quantity: 1, noteHe: 'על קו הניקוז, במעלה הזרם', noteEn: 'On the drain line, upstream' }],
    massKg: null,
    priceIls: null,
    sources: NO_SOURCE_YET,
    noteHe: 'הצורך בו, גודלו ומיקומו נקבעים בתכנון אינסטלציה מורשה — כאן הוא נספר בלבד.',
    noteEn: 'Whether one is required, its size and its position are set by licensed plumbing design — here it is only counted.',
  },
  {
    id: 'waste_bin_unit',
    nameHe: 'יחידת פסולת',
    nameEn: 'Waste unit',
    category: 'waste',
    sectors: ['bar', 'restaurant', 'office', 'shop'],
    sizeMm: { width: null, height: null, depth: null },
    serviceClearanceMm: null,
    services: [],
    massKg: null,
    priceIls: null,
    sources: NO_SOURCE_YET,
  },
  // ---- A restaurant kitchen ----
  bought('hand_wash_basin', 'כיור רחיצת ידיים', 'Hand-wash basin', 'sink', ['restaurant', 'bar', 'shop', 'office'], [NEED.cold, NEED.hot, NEED.drain]),
  bought('prep_sink_double', 'כיור הכנה כפול', 'Double-bowl prep sink', 'sink', ['restaurant'], [NEED.cold, NEED.hot, NEED.drain], {
    he: 'נספר ניקוז אחד לשתי הקערות. אם האינסטלטור מפריד — לעדכן.',
    en: 'One drain is counted for the two bowls. If the plumber separates them, update it.',
  }),
  bought('dishwasher_commercial', 'מדיח כלים תעשייתי', 'Commercial dishwasher', 'warewashing', ['restaurant'], [NEED.hot, NEED.drain, NEED.circuit], MODEL_DECIDES_WATER),
  bought('glasswasher', 'מדיח כוסות', 'Glasswasher', 'warewashing', ['bar', 'restaurant'], [NEED.cold, NEED.drain, NEED.circuit], MODEL_DECIDES_WATER),
  bought('range_gas', 'כיריים גז', 'Gas range', 'cooking', ['restaurant'], [NEED.gas], HOOD_SEPARATE),
  bought('range_induction', 'כיריים אינדוקציה', 'Induction range', 'cooking', ['restaurant'], [NEED.circuit], HOOD_SEPARATE),
  bought('oven_combi_electric', 'תנור קומבי חשמלי', 'Electric combi oven', 'cooking', ['restaurant'], [NEED.cold, NEED.drain, NEED.circuit], HOOD_SEPARATE, [COMBI_SOURCE]),
  bought('oven_combi_gas', 'תנור קומבי גז', 'Gas combi oven', 'cooking', ['restaurant'], [NEED.cold, NEED.drain, NEED.gas, NEED.power], HOOD_SEPARATE, [COMBI_SOURCE]),
  bought('fryer_electric', 'צ׳יפסר חשמלי', 'Electric fryer', 'cooking', ['restaurant'], [NEED.circuit], HOOD_SEPARATE),
  bought('fryer_gas', 'צ׳יפסר גז', 'Gas fryer', 'cooking', ['restaurant'], [NEED.gas], HOOD_SEPARATE),
  bought('griddle_gas', 'פלנצ׳ה / גריל גז', 'Gas griddle / grill', 'cooking', ['restaurant'], [NEED.gas], HOOD_SEPARATE),
  bought('extraction_hood', 'קולט אדים', 'Extraction hood', 'extraction', ['restaurant'], [NEED.duct, NEED.power], {
    he: 'הצורך בו, גודלו וספיקתו נקבעים על ידי יועץ — כאן הוא נספר בלבד.',
    en: 'Whether one is needed, its size and its airflow are set by a consultant — here it is only counted.',
  }),
  bought('upright_fridge', 'מקרר עומד', 'Upright refrigerator', 'refrigeration', ['restaurant', 'bar'], [NEED.power, NEED.heat]),
  bought('upright_freezer', 'מקפיא עומד', 'Upright freezer', 'refrigeration', ['restaurant'], [NEED.power, NEED.heat]),
  bought('prep_counter_refrigerated', 'שולחן קירור (סלטייה)', 'Refrigerated prep counter', 'refrigeration', ['restaurant'], [NEED.power, NEED.heat]),
  bought('espresso_machine', 'מכונת אספרסו', 'Espresso machine', 'beverage', ['restaurant', 'bar'], [NEED.cold, NEED.drain, NEED.circuit], {
    he: 'מכונה מקצועית המחוברת לרשת המים. מכונה עם מיכל אינה צריכה מים וניקוז.',
    en: 'A professional machine plumbed to the mains. A tank-fed machine needs neither water nor a drain.',
  }),
  bought('coffee_grinder', 'מטחנת קפה', 'Coffee grinder', 'beverage', ['restaurant', 'bar'], [NEED.power]),

  // ---- An office ----
  bought('workstation', 'עמדת עבודה', 'Workstation', 'workplace', ['office'], [NEED.power, NEED.data], {
    he: 'נקודת חשמל אחת ונקודת תקשורת אחת לעמדה. מספר השקעים בכל נקודה — לפי המתכנן.',
    en: 'One electrical and one data point per desk. How many outlets each carries is the designer’s call.',
  }),
  bought('meeting_room_screen', 'מסך חדר ישיבות', 'Meeting-room screen', 'workplace', ['office'], [NEED.power, NEED.data]),
  bought('printer_mfp', 'מדפסת משולבת', 'Multifunction printer', 'workplace', ['office', 'shop'], [NEED.power, NEED.data]),
  bought('network_cabinet', 'ארון תקשורת', 'Network cabinet', 'network', ['office', 'shop', 'restaurant'], [NEED.circuit], {
    he: 'הארון הוא המקור של נקודות התקשורת — לרשום אותו גם תחת "מאיפה זה מוזן".',
    en: 'The cabinet is where the data points are fed from — record it under "What feeds it" as well.',
  }),
  bought('wifi_access_point', 'נקודת גישה אלחוטית', 'Wi-Fi access point', 'network', ['office', 'shop', 'restaurant'], [NEED.data], {
    he: 'מוזנת בדרך כלל דרך כבל התקשורת. דגם שדורש שקע נפרד — להוסיף נקודת חשמל.',
    en: 'Usually powered over the data cable. For a model that needs its own socket, add an electrical point.',
  }),
  bought('kitchenette_sink', 'כיור מטבחון', 'Kitchenette sink', 'sink', ['office', 'shop'], [NEED.cold, NEED.hot, NEED.drain]),
  bought('kitchenette_dishwasher', 'מדיח כלים למטבחון', 'Kitchenette dishwasher', 'warewashing', ['office'], [NEED.cold, NEED.drain, NEED.power], MODEL_DECIDES_WATER),
  bought('kitchenette_fridge', 'מקרר מטבחון', 'Kitchenette refrigerator', 'refrigeration', ['office', 'shop'], [NEED.power]),
  bought('water_dispenser', 'מתקן מים מחובר לרשת', 'Mains-fed water dispenser', 'beverage', ['office', 'shop'], [NEED.cold, NEED.power], {
    he: 'יש דגמים שדורשים גם ניקוז — לבדוק מול הדגם.',
    en: 'Some models also need a drain — check against the model.',
  }),
  bought('split_ac_indoor', 'מזגן מפוצל — יחידה פנימית', 'Split air conditioner — indoor unit', 'climate', ['office', 'shop', 'restaurant'], [NEED.drain, NEED.power], {
    he: 'ניקוז מי עיבוי, והזנת חשמל למערכת — ליחידה הפנימית או החיצונית לפי הדגם. התפוקה ומיקום היחידה החיצונית לפי יועץ מיזוג.',
    en: 'Condensate drain, and power to the system — to the indoor or the outdoor unit depending on the model. Capacity and the outdoor unit’s position per the HVAC consultant.',
  }),

  // ---- A shop ----
  bought('pos_terminal', 'עמדת קופה', 'Point-of-sale terminal', 'point_of_sale', ['shop', 'restaurant', 'bar'], [NEED.power, NEED.data]),
  bought('display_fridge', 'מקרר תצוגה', 'Display refrigerator', 'refrigeration', ['shop', 'restaurant'], [NEED.power, NEED.heat]),
  bought('display_freezer', 'מקפיא תצוגה', 'Display freezer', 'refrigeration', ['shop'], [NEED.power, NEED.heat]),
  bought('illuminated_sign', 'שלט מואר', 'Illuminated sign', 'shopfront', ['shop', 'restaurant', 'bar'], [NEED.power]),
  bought('automatic_door', 'דלת אוטומטית', 'Automatic door', 'shopfront', ['shop', 'office'], [NEED.power]),
  bought('electric_shutter', 'תריס גלילה חשמלי', 'Electric roller shutter', 'shopfront', ['shop', 'restaurant'], [NEED.power]),
  bought('security_camera', 'מצלמת אבטחה', 'Security camera', 'security', ['shop', 'office', 'restaurant', 'bar'], [NEED.data], {
    he: 'מוזנת בדרך כלל דרך כבל התקשורת. דגם שדורש שקע נפרד — להוסיף נקודת חשמל.',
    en: 'Usually powered over the data cable. For a model that needs its own socket, add an electrical point.',
  }),
  bought('anti_theft_gate', 'שער נגד גניבות', 'Anti-theft gate', 'security', ['shop'], [NEED.power]),
];

/** The items offered for one kind of place, in catalogue order. */
export function equipmentFor(sector: Sector): EquipmentItem[] {
  return EQUIPMENT.filter((e) => e.sectors.includes(sector));
}

export function equipmentById(id: string): EquipmentItem | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}

function rollUp(ids: string[], form: RequirementForm): { kind: ServiceKind; quantity: number; from: string[] }[] {
  const totals = new Map<ServiceKind, { quantity: number; from: string[] }>();
  for (const id of ids) {
    const item = equipmentById(id);
    if (!item) continue;
    for (const s of item.services) {
      if ((s.form ?? 'point') !== form) continue;
      const at = totals.get(s.kind) ?? { quantity: 0, from: [] };
      at.quantity += s.quantity;
      at.from.push(item.id);
      totals.set(s.kind, at);
    }
  }
  return [...totals.entries()].map(([kind, v]) => ({ kind, ...v }));
}

/**
 * Every service **point** a set of equipment needs, added up by kind.
 *
 * This is the bridge from equipment to the plumbing, electrical and gas chapters of the bill: those
 * quantities are not drawn by anyone, they fall out of what the room has to contain. Clearances are
 * deliberately not here — see `clearancesFor`, which keeps them out of the point counts.
 */
export function servicesFor(ids: string[]): { kind: ServiceKind; quantity: number; from: string[] }[] {
  return rollUp(ids, 'point');
}

/**
 * The space a set of equipment needs left around it.
 *
 * Separate from `servicesFor` so a clearance can never be counted, quantified or priced as a point. It
 * still belongs in the bill, as an instruction to whoever builds the joinery around the item.
 */
export function clearancesFor(ids: string[]): { kind: ServiceKind; quantity: number; from: string[] }[] {
  return rollUp(ids, 'clearance');
}

/** Which trades a set of equipment pulls in — the chapters its lines will land in. */
export const SERVICE_TRADE: Record<ServiceKind, 'plumbing' | 'electrical' | 'gas' | 'hvac' | 'communications'> = {
  water_cold: 'plumbing',
  water_hot: 'plumbing',
  drain: 'plumbing',
  electrical: 'electrical',
  gas: 'gas',
  ventilation: 'hvac',
  data: 'communications',
};

/** The trades whose design and sign-off require a licensed professional. Rule 02 of the north star. */
export const LICENSED_TRADES: ReadonlySet<string> = new Set(['plumbing', 'electrical', 'gas', 'hvac']);

/** What each service is called, for anything that shows one to a person. */
export const SERVICE_LABEL: Record<ServiceKind, { he: string; en: string }> = {
  water_cold: { he: 'מים קרים', en: 'cold water' },
  water_hot: { he: 'מים חמים', en: 'hot water' },
  drain: { he: 'ניקוז', en: 'drain' },
  electrical: { he: 'חשמל', en: 'electrical' },
  gas: { he: 'גז', en: 'gas' },
  ventilation: { he: 'אוורור', en: 'ventilation' },
  data: { he: 'תקשורת', en: 'data' },
};

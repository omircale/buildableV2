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
export type ServiceKind = 'water_cold' | 'water_hot' | 'drain' | 'electrical' | 'gas' | 'ventilation';

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

export type EquipmentCategory = 'sink' | 'tap' | 'refrigeration' | 'drainage' | 'ice' | 'dispense' | 'waste';

export interface EquipmentItem {
  id: string;
  nameHe: string;
  nameEn: string;
  category: EquipmentCategory;
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
    sizeMm: { width: null, height: null, depth: null },
    serviceClearanceMm: null,
    services: [],
    massKg: null,
    priceIls: null,
    sources: NO_SOURCE_YET,
  },
];

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
export const SERVICE_TRADE: Record<ServiceKind, 'plumbing' | 'electrical' | 'gas' | 'hvac'> = {
  water_cold: 'plumbing',
  water_hot: 'plumbing',
  drain: 'plumbing',
  electrical: 'electrical',
  gas: 'gas',
  ventilation: 'hvac',
};

/** The trades whose design and sign-off require a licensed professional. Rule 02 of the north star. */
export const LICENSED_TRADES: ReadonlySet<string> = new Set(['plumbing', 'electrical', 'gas', 'hvac']);

import { LICENSED_TRADES, SERVICE_TRADE, clearancesFor, equipmentById, servicesFor, type ServiceKind } from '../equipment/catalog';
import { matchServices, type Space } from '../space/space';
import { BLOCKING_SUPPLY_STATUSES, supplyReport, type ServiceSource } from '../space/supply';
import type { Vec3 } from '../types';
import type { BoqLine, LineLocation, Trade } from './line';

/**
 * MEP as quantities, and nothing more.
 *
 * This is the line that lets the system be useful to a hotel without entering a licensed field. A
 * plumber's work divides into things that are **counted** and things that are **designed**: how many
 * water points a bar needs is counted, and it falls straight out of what the room has to contain; what
 * diameter the drain is, what fall it runs at and how it gets there is designed, and in Israel and the
 * US alike it requires a licensed professional's sign-off.
 *
 * So this module emits point counts with real quantities, and emits the runs between them with
 * `quantity: null` and a reason that names the licensed trade. That is not a limitation to be fixed
 * later — a linear metre of pipe is the output of a route somebody has to design, and producing a
 * plausible one would be worse than producing nothing, because it would look like an answer.
 *
 * What is still missing here is the chapter and section coding of a real Israeli bill, which has to come
 * off an actual document rather than out of this engine. Sections below carry descriptive keys as a
 * deliberate placeholder.
 */

/** Whether a line's work requires a licensed professional to design and sign off. Derived, never stored. */
export function requiresLicensedDesign(trade: Trade): boolean {
  return LICENSED_TRADES.has(trade);
}

const KIND_LABEL: Record<ServiceKind, { he: string; en: string }> = {
  water_cold: { he: 'מים קרים', en: 'cold water' },
  water_hot: { he: 'מים חמים', en: 'hot water' },
  drain: { he: 'ניקוז', en: 'drain' },
  electrical: { he: 'חשמל', en: 'electrical' },
  gas: { he: 'גז', en: 'gas' },
  ventilation: { he: 'אוורור', en: 'ventilation' },
};

/** The note every MEP line carries, so no reader can mistake a count for a design. */
const LICENSED_NOTE = {
  he: 'כמות בלבד — קוטר, הגנה ותוואי נקבעים בתכנון של בעל מקצוע מוסמך',
  en: 'Quantity only — diameter, protection and routing are set by a licensed professional’s design',
};

export interface MepLinesInput {
  space: Space;
  sources: ServiceSource[];
  equipmentIds: string[];
  location: LineLocation;
  /** Where the equipment is going, when it has been placed. Used only to report real distances. */
  atMm?: Vec3;
}

/**
 * The MEP chapters of a bill for one room.
 *
 * Three kinds of line come out, and only the first carries a number:
 *
 * 1. **Points to create** — counted, from what the equipment declares it needs against what the room
 *    already has.
 * 2. **The run to each point** — `quantity: null`. A length is a route, and a route is design.
 * 3. **A service the room does not have at all** — `quantity: null`, as a lump, because bringing a hot
 *    water supply into a room is a job whose extent nobody can state from a survey of that room alone.
 */
export function mepLines({ space, sources, equipmentIds, location, atMm }: MepLinesInput): BoqLine[] {
  const needs = matchServices(space, servicesFor(equipmentIds), atMm);
  const supply = supplyReport(
    space,
    sources,
    needs.map((n) => ({ kind: n.kind, toCreate: n.toCreate })),
    atMm,
  );
  const lines: BoqLine[] = [];

  for (const need of needs) {
    if (need.toCreate <= 0) continue;
    const trade = SERVICE_TRADE[need.kind];
    const label = KIND_LABEL[need.kind];
    const here = supply.find((s) => s.kind === need.kind);

    lines.push({
      id: `mep_${need.kind}_points`,
      trade,
      section: `${need.kind}_points`,
      descriptionHe: `נקודת ${label.he} חדשה. ${LICENSED_NOTE.he}.`,
      descriptionEn: `New ${label.en} point. ${LICENSED_NOTE.en}.`,
      unit: 'unit',
      quantity: need.toCreate,
      location,
      origin: { kind: 'service_point', ref: need.kind },
      unitPriceIls: null,
      sources: [],
    });

    // The run to those points. This engine will never fill this quantity in.
    const distanceHe = here?.nearestSourceMm != null ? ` המקור הקרוב ביותר שנמדד נמצא במרחק אווירי של ${(here.nearestSourceMm / 1000).toFixed(1)} מ'.` : '';
    const distanceEn = here?.nearestSourceMm != null ? ` The nearest measured source is ${(here.nearestSourceMm / 1000).toFixed(1)} m away in a straight line.` : '';
    lines.push({
      id: `mep_${need.kind}_run`,
      trade,
      section: `${need.kind}_runs`,
      descriptionHe: `צינור/כבל הזנה לנקודות ${label.he}.${distanceHe}`,
      descriptionEn: `Supply run to the ${label.en} points.${distanceEn}`,
      unit: 'm',
      quantity: null,
      unknownReasonHe: `אורך התוואי הוא תוצר של תכנון ${TRADE_HE[trade]} מוסמך, ואינו נגזר ממידות החדר. המרחק האווירי אינו אורך צינור.`,
      unknownReasonEn: `The length of the run is the output of licensed ${trade} design, not something derived from the room. A straight-line distance is not a length of pipe.`,
      location,
      origin: { kind: 'service_point', ref: need.kind },
      unitPriceIls: null,
      sources: [],
    });
  }

  // Space left around an item is not a point and is not priced as one, but it has to reach the joiner.
  // Left out of the bill, the box gets built tight and the condenser cooks.
  for (const clearance of clearancesFor(equipmentIds)) {
    const label = KIND_LABEL[clearance.kind];
    const items = clearance.from.map((id) => equipmentById(id)).filter((i) => i != null);
    const namesHe = items.map((i) => i!.nameHe).join(', ');
    const namesEn = items.map((i) => i!.nameEn).join(', ');
    lines.push({
      id: `clearance_${clearance.kind}`,
      trade: 'joinery',
      section: 'clearances',
      descriptionHe: `מרווח ${label.he} סביב ${namesHe} — להשאיר בנגרות, לא נקודה שמותקנת.`,
      descriptionEn: `${label.en} clearance around ${namesEn} — to be left in the joinery, not a point that gets installed.`,
      unit: 'lump',
      quantity: null,
      unknownReasonHe: `המרווח הנדרש הוא נתון של היצרן ותלוי בדגם שייבחר. עד אז אי אפשר לנקוב במידה.`,
      unknownReasonEn: `The required gap is the maker's figure and depends on the model chosen. Until then no dimension can be stated.`,
      location,
      origin: { kind: 'equipment', ref: clearance.from[0] },
      unitPriceIls: null,
      sources: [],
    });
  }

  for (const s of supply) {
    if (s.status !== 'no_source') continue;
    const trade = SERVICE_TRADE[s.kind];
    const label = KIND_LABEL[s.kind];
    lines.push({
      id: `mep_${s.kind}_bring_supply`,
      trade,
      section: `${s.kind}_supply`,
      descriptionHe: `הבאת אספקת ${label.he} אל החלל. ${LICENSED_NOTE.he}.`,
      descriptionEn: `Bring a ${label.en} supply to the room. ${LICENSED_NOTE.en}.`,
      unit: 'lump',
      quantity: null,
      unknownReasonHe: `אין מקור ${label.he} בחלל. היקף העבודה נקבע לפי מאיפה יימשך המקור, ולא ניתן לקבוע זאת מסקר החדר בלבד.`,
      unknownReasonEn: `No ${label.en} source reaches this room. The extent of the work depends on where the supply would be drawn from, which a survey of this room alone cannot establish.`,
      location,
      origin: { kind: 'service_point', ref: s.kind },
      unitPriceIls: null,
      sources: [],
    });
  }

  return lines;
}

const TRADE_HE: Record<Trade, string> = {
  demolition: 'הריסה',
  builder_work: 'בנייה',
  joinery: 'נגרות',
  worktops: 'משטחים',
  plumbing: 'אינסטלציה',
  electrical: 'חשמל',
  gas: 'גז',
  hvac: 'מיזוג',
  finishes: 'גמרים',
  equipment: 'ציוד',
  logistics: 'הובלה',
};

/**
 * What somebody has to go and establish before the MEP chapters can be priced.
 *
 * Separate from the lines on purpose. These are not quantities and do not belong in a bill — they are
 * the questions a bill is waiting on, and a procurement manager needs them as a list they can take to
 * the trades.
 */
export function mepOpenQuestions({ space, sources, equipmentIds, atMm }: Omit<MepLinesInput, 'location'>): { kind: ServiceKind; he: string; en: string }[] {
  const needs = matchServices(space, servicesFor(equipmentIds), atMm);
  return supplyReport(
    space,
    sources,
    needs.map((n) => ({ kind: n.kind, toCreate: n.toCreate })),
    atMm,
  )
    .filter((s) => BLOCKING_SUPPLY_STATUSES.has(s.status))
    .map((s) => ({ kind: s.kind, he: s.he, en: s.en }));
}

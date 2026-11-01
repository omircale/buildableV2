import { floorAreaM2, wallAreaM2, type Space } from '../space/space';
import type { Source } from '../types';
import type { BoqLine, LineLocation } from './line';

/**
 * A finish specification — the document that sits between a design and a bill.
 *
 * The schema here is taken from a real hotel finish schedule issued for tender (a SPA fit-out, 65
 * pages, October 2025), not invented. Three things in that document decided the shape of this one:
 *
 * 1. **The code is per specification, not per product.** Two sheets carried the same oak from the same
 *    maker under different codes because one is laid in herringbone and one in straight planks, in
 *    different rooms, in different plank widths. Pattern and use are part of the identity, because
 *    they are what the labour and the waste actually depend on.
 * 2. **Location is in the item's own name** — "Timber Floor @ Treatment Room" — *and* again in a
 *    separate AREAS block. A real schedule states where twice.
 * 3. **An unsettled spec states who will settle it and leaves its fields out.** One sheet had no size,
 *    no thickness and no wear layer at all — not zeros, not placeholders — with the manufacturer given
 *    as "By SPA Consultant" and a note naming who would develop it. Every sheet in the set, including
 *    the fully specified ones, also carried "Quantity must be verified and confirmed by
 *    manufacturer/installer/contractor".
 *
 * That last point is the discipline this engine already applies, arriving from the other direction.
 */

export type FinishCategory = 'wood' | 'stone' | 'tile' | 'paint' | 'wallcovering' | 'metal' | 'glass' | 'carpet';

/** The letter codes a finish schedule tags with. Taken from the schedule that was read. */
export const FINISH_CODE_PREFIX: Record<FinishCategory, string> = {
  wood: 'WD',
  stone: 'ST',
  tile: 'TL',
  paint: 'PT',
  wallcovering: 'WC',
  metal: 'MT',
  glass: 'GL',
  carpet: 'CPT',
};

/** Which surface the finish covers, and therefore which area measures it. */
export type FinishSurface = 'floor' | 'wall' | 'ceiling' | 'other';

/**
 * Whether the line buys the material, or buys it and fixes it.
 *
 * The schedule leaves "Supplied By" and "Installed By" as blank fields to be filled in later, which is
 * exactly the distinction a bill has to carry: a supply-only line and a supply-and-fix line for the
 * same material are different money and different responsibility.
 */
export type FinishScope = 'supply_only' | 'supply_and_fix' | 'unknown';

export interface FinishProduct {
  /** Product name and range, as the schedule writes it. */
  type: string | null;
  color: string | null;
  finish: string | null;
  /** Unit size of the piece, in mm. A plank, a tile, a slab. */
  sizeMm: { width: number | null; length: number | null } | null;
  thicknessMm: number | null;
  /** Wear layer on an engineered board; null for anything that does not have one. */
  wearLayerMm: number | null;
}

/**
 * One sheet of a finish schedule. Named apart from the engine's own `FinishSpec`, which is a furniture
 * finish — a sheen and a colour applied to a board — and an entirely different thing.
 */
export interface FinishScheduleSpec {
  /** The tag the drawings reference: "WD-2", "WD-2.1". */
  code: string;
  category: FinishCategory;
  /** The base code, when this sheet is a variant of another — "WD-2" for "WD-2.1". */
  variantOf?: string;
  /** As the schedule writes it, location included: "Timber Floor @ Relaxation Lounge". */
  itemNameEn: string;
  itemNameHe?: string;
  surface: FinishSurface;
  /** How it is laid. Part of the spec, not the product, because it drives labour and waste. */
  pattern?: string;
  product: FinishProduct;
  /**
   * Set when the specification is not settled, naming who will settle it. When this is present the
   * fields above stay null and no quantity is produced — the schedule this was taken from does exactly
   * that rather than filling in a plausible board.
   */
  toBeDevelopedBy?: { he: string; en: string };
  /** The space ids this finish is used in — the schedule's own AREAS block. */
  areas: string[];
  scope: FinishScope;
  /**
   * Kept deliberately apart from everything a description carries. The end user of this system never
   * sees who supplies a material, and a test holds that line.
   */
  manufacturer?: { name: string; contactName?: string };
  sources: Source[];
}

/** The area that measures this finish, in m². Null when the room has not been measured. */
export function measuredAreaM2(spec: FinishScheduleSpec, space: Space): number | null {
  if (spec.surface === 'floor') return floorAreaM2(space);
  if (spec.surface === 'wall') return wallAreaM2(space);
  if (spec.surface === 'ceiling') return floorAreaM2(space);
  return null;
}

export interface FinishLinesInput {
  specs: FinishScheduleSpec[];
  spaces: Space[];
  /** Where each space sits — a hotel's building and floor, which the space model does not carry. */
  locationOf: (spaceId: string) => LineLocation;
  /** What a room is called. A published bill opens a finish line with it: "אולם רב תכליתי - ריצוף…". */
  placeName?: (spaceId: string) => { he: string; en: string };
}

/**
 * A flooring maker's own published wastage guidance for timber floors.
 *
 * It is one manufacturer's recommendation for its own products, not a rule and not necessarily the
 * recommendation of whoever makes the floor in a given schedule. So the allowance it produces is an
 * assumption with its source attached, for the installer to confirm — and it exists only for timber
 * floors, because that is all the source speaks about.
 */
const TIMBER_WASTE_SOURCE: Source = {
  title: 'Havwoods — Everything you need to know about wastage in timber flooring',
  reference: 'plank 10% under 100 m² / 7% above; herringbone and chevron 15% under 100 m² / 12% above',
  url: 'https://www.havwoods.com/au/news/everything-you-need-to-know-about-wastage/',
};

const PATTERNED = /herringbone|chevron|אדרה|שברון|דג/i;

/** The published allowance for a timber floor of this pattern and total area, or null for anything else. */
export function timberWasteRate(spec: FinishScheduleSpec, totalAreaM2: number): { rate: number; source: Source } | null {
  if (spec.category !== 'wood' || spec.surface !== 'floor') return null;
  const patterned = PATTERNED.test(spec.pattern ?? '');
  const small = totalAreaM2 < 100;
  return { rate: patterned ? (small ? 0.15 : 0.12) : small ? 0.1 : 0.07, source: TIMBER_WASTE_SOURCE };
}

/** The chapter a finish is filed under. Painting has its own; stone goes with its trade. */
function chapterFor(spec: FinishScheduleSpec): string | undefined {
  if (spec.category === 'paint') return '11';
  if (spec.category === 'stone') return undefined;
  return '10';
}

/**
 * The finishes chapters of a bill.
 *
 * This is the first chapter whose quantities the engine can legitimately compute, and the reason is
 * worth stating: an area is geometry. Unlike a pipe run, nobody has to design it and no licensed trade
 * has to approve it — it follows from the room once the room is measured. The engine stops exactly
 * where the geometry stops: the **waste allowance is its own line with no quantity**, because how much
 * a herringbone floor wastes against a straight-laid one is a fact about a laying method that has to
 * come from a floorer, not from a shape.
 */
export function finishLines({ specs, spaces, locationOf, placeName }: FinishLinesInput): BoqLine[] {
  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  const lines: BoqLine[] = [];

  // Two floor finishes in one room cannot be split without a boundary somebody drew.
  const floorClaims = new Map<string, string[]>();
  for (const spec of specs) {
    if (spec.surface !== 'floor') continue;
    for (const id of spec.areas) floorClaims.set(id, [...(floorClaims.get(id) ?? []), spec.code]);
  }

  for (const spec of specs) {
    // The published thresholds speak of the installation as a whole, so the rate is set by the
    // finish's total measured area across its rooms, not room by room.
    const totalArea = spec.areas.reduce((a, id) => {
      const sp = spaceById.get(id);
      return a + ((sp && measuredAreaM2(spec, sp)) || 0);
    }, 0);
    const waste = timberWasteRate(spec, totalArea);

    for (const spaceId of spec.areas) {
      const space = spaceById.get(spaceId);
      const location = locationOf(spaceId);
      const place = placeName?.(spaceId);
      const shared = spec.surface === 'floor' ? (floorClaims.get(spaceId) ?? []) : [];
      const contested = shared.length > 1;
      const area = space ? measuredAreaM2(spec, space) : null;

      let quantity: number | null = area;
      let whyHe: string | undefined;
      let whyEn: string | undefined;

      if (spec.toBeDevelopedBy) {
        quantity = null;
        whyHe = `המפרט טרם נקבע. ${spec.toBeDevelopedBy.he}`;
        whyEn = `The specification is not settled. ${spec.toBeDevelopedBy.en}`;
      } else if (!space) {
        quantity = null;
        whyHe = `החלל ${spaceId} אינו בפרוייקט, ולכן אי אפשר למדוד את השטח.`;
        whyEn = `Space ${spaceId} is not in the project, so its area cannot be measured.`;
      } else if (contested) {
        // Honest refusal: the room's total area is known and this finish's share of it is not.
        quantity = null;
        whyHe = `${shared.join(' ו-')} חולקים את רצפת ${spaceId}. שטח החדר ידוע, החלוקה ביניהם אינה — נדרש גבול משורטט.`;
        whyEn = `${shared.join(' and ')} share the floor of ${spaceId}. The room's area is known; the split between them is not — a drawn boundary is needed.`;
      } else if (area == null) {
        quantity = null;
        whyHe = spec.surface === 'wall' ? `גובה התקרה ב${spaceId} לא נמדד.` : `${spaceId} לא נמדד.`;
        whyEn = spec.surface === 'wall' ? `The ceiling height in ${spaceId} was not measured.` : `${spaceId} has not been measured.`;
      }

      lines.push({
        id: `finish_${spec.code}_${spaceId}`,
        trade: spec.category === 'stone' ? 'worktops' : 'finishes',
        chapter: chapterFor(spec),
        section: spec.surface,
        descriptionHe: (place ? `${place.he} - ` : '') + describe(spec, 'he'),
        descriptionEn: (place ? `${place.en} - ` : '') + describe(spec, 'en'),
        unit: 'm2',
        quantity: quantity == null ? null : Math.round(quantity * 100) / 100,
        unknownReasonHe: whyHe,
        unknownReasonEn: whyEn,
        assumptionHe: quantity != null ? 'שטח נטו לפי מידות החדר, ללא תוספת פחת. הכמות טעונה אימות על ידי המתקין.' : undefined,
        assumptionEn: quantity != null ? 'Net area from the room’s measurements, with no waste added. The quantity must be verified by the installer.' : undefined,
        location,
        origin: { kind: 'surface', ref: spec.code },
        unitPriceIls: null,
        sources: spec.sources,
      });

      // Waste. For a timber floor a maker's published guidance gives a figure to start from, kept as an
      // assumption with its source. For anything else it is the installer's figure and stays unknown.
      if (quantity != null) {
        const wasteQty = waste ? Math.round(quantity * waste.rate * 100) / 100 : null;
        const pct = waste ? Math.round(waste.rate * 100) : null;
        lines.push({
          id: `finish_${spec.code}_${spaceId}_waste`,
          trade: spec.category === 'stone' ? 'worktops' : 'finishes',
          chapter: chapterFor(spec),
          section: spec.surface,
          descriptionHe: (place ? `${place.he} - ` : '') + `תוספת פחת ל-${spec.code}${spec.pattern ? ` (${spec.pattern})` : ''}.`,
          descriptionEn: (place ? `${place.en} - ` : '') + `Waste allowance for ${spec.code}${spec.pattern ? ` (${spec.pattern})` : ''}.`,
          unit: 'm2',
          quantity: wasteQty,
          unknownReasonHe: waste
            ? undefined
            : spec.pattern
              ? `אחוז הפחת תלוי בשיטת ההנחה (${spec.pattern}) ובמידות החדר, והוא נתון של המתקין — לא נגזר מהשטח.`
              : 'אחוז הפחת הוא נתון של המתקין ואינו נגזר מהשטח.',
          unknownReasonEn: waste
            ? undefined
            : spec.pattern
              ? `The waste percentage depends on the laying method (${spec.pattern}) and the room's shape. It is the installer's figure, not something derived from an area.`
              : "The waste percentage is the installer's figure and is not derived from an area.",
          assumptionHe: waste ? `${pct}% לפי המלצה שפרסם יצרן פרקט לשיטת הנחה זו ולשטח כולל כזה. היצרן של מפרט זה עשוי להמליץ אחרת — לאשר מול המתקין.` : undefined,
          assumptionEn: waste ? `${pct}% per a timber-floor maker's published guidance for this laying method and total area. The maker of this specification may recommend otherwise — confirm with the installer.` : undefined,
          location,
          origin: { kind: 'surface', ref: spec.code },
          unitPriceIls: null,
          sources: waste ? [waste.source] : [],
        });
      }
    }
  }

  return lines;
}

/**
 * The line's description.
 *
 * Deliberately built from the specification and never from the manufacturer. The end user of this
 * system does not see who supplies a material, and this is the function that would leak it.
 */
function describe(spec: FinishScheduleSpec, locale: 'he' | 'en'): string {
  const he = locale === 'he';
  const name = he ? (spec.itemNameHe ?? spec.itemNameEn) : spec.itemNameEn;
  const bits: string[] = [`${spec.code} — ${name}`];

  if (spec.product.type) bits.push(spec.product.type);
  if (spec.product.color) bits.push(he ? `גוון ${spec.product.color}` : `colour ${spec.product.color}`);
  if (spec.product.finish) bits.push(spec.product.finish);
  if (spec.product.sizeMm?.width != null && spec.product.sizeMm.length != null) {
    bits.push(`${spec.product.sizeMm.width}×${spec.product.sizeMm.length} מ"מ`.replace('מ"מ', he ? 'מ"מ' : 'mm'));
  }
  if (spec.product.thicknessMm != null) bits.push(he ? `עובי ${spec.product.thicknessMm} מ"מ` : `${spec.product.thicknessMm} mm thick`);
  if (spec.pattern) bits.push(spec.pattern);
  if (spec.scope === 'supply_only') bits.push(he ? 'אספקה בלבד' : 'supply only');
  if (spec.scope === 'supply_and_fix') bits.push(he ? 'אספקה והתקנה' : 'supply and fix');

  return bits.join('. ') + '.';
}

/** Specs whose code does not match the prefix their category uses. */
export function codePrefixProblems(specs: FinishScheduleSpec[]): { code: string; he: string; en: string }[] {
  return specs
    .filter((s) => !s.code.startsWith(FINISH_CODE_PREFIX[s.category] + '-'))
    .map((s) => ({
      code: s.code,
      he: `הקוד ${s.code} אינו מתחיל ב-${FINISH_CODE_PREFIX[s.category]}- כמתחייב מקטגוריית ${s.category}`,
      en: `Code ${s.code} does not start with ${FINISH_CODE_PREFIX[s.category]}-, which its ${s.category} category requires`,
    }));
}

/** A variant pointing at a base code that is not in the schedule. */
export function orphanVariants(specs: FinishScheduleSpec[]): { code: string; he: string; en: string }[] {
  const known = new Set(specs.map((s) => s.code));
  return specs
    .filter((s) => s.variantOf != null && !known.has(s.variantOf))
    .map((s) => ({
      code: s.code,
      he: `${s.code} מוגדר כגרסה של ${s.variantOf}, שאינו קיים במפרט`,
      en: `${s.code} is a variant of ${s.variantOf}, which is not in the schedule`,
    }));
}

import type { Source } from '../types';

/**
 * A line in a bill of quantities, with location as a first-class axis.
 *
 * The task that asked for this put the constraint in one sentence: *adding location retroactively means
 * rewriting the model.* So `location` is not optional here and never will be. A bill whose lines only
 * know their trade can be printed and cannot be used — the document is read by trade, and the work is
 * done by location, and those are two views of the same lines rather than two documents.
 *
 * The other thing this schema takes seriously is a quantity nobody can establish yet. `quantity: null`
 * with a reason is a first-class state, because the alternative — a plausible number — is the failure
 * this engine exists to avoid. `totals()` below never returns a figure that pretends to be complete.
 */

/** Chapters a hotel bill is divided into. */
export type Trade =
  | 'demolition'
  | 'builder_work'
  | 'joinery'
  | 'worktops'
  | 'plumbing'
  | 'electrical'
  | 'gas'
  | 'hvac'
  | 'finishes'
  | 'equipment'
  | 'logistics';

/** Units an Israeli bill is written in. */
export type BoqUnit = 'unit' | 'm' | 'm2' | 'm3' | 'kg' | 'lump';

export const UNIT_LABEL: Record<BoqUnit, { he: string; en: string }> = {
  unit: { he: "יח'", en: 'no.' },
  m: { he: "מ'", en: 'm' },
  m2: { he: 'מ"ר', en: 'm²' },
  m3: { he: 'מ"ק', en: 'm³' },
  kg: { he: 'ק"ג', en: 'kg' },
  lump: { he: "קומפ'", en: 'lump' },
};

export const TRADE_LABEL: Record<Trade, { he: string; en: string }> = {
  demolition: { he: 'הריסה ופירוק', en: 'Demolition and strip-out' },
  builder_work: { he: 'עבודות בניין', en: 'Builder’s work' },
  joinery: { he: 'נגרות', en: 'Joinery' },
  worktops: { he: 'משטחי עבודה', en: 'Worktops' },
  plumbing: { he: 'אינסטלציה', en: 'Plumbing' },
  electrical: { he: 'חשמל', en: 'Electrical' },
  gas: { he: 'גז', en: 'Gas' },
  hvac: { he: 'מיזוג ואוורור', en: 'HVAC and ventilation' },
  finishes: { he: 'גמרים', en: 'Finishes' },
  equipment: { he: 'ציוד', en: 'Equipment' },
  logistics: { he: 'הובלה והתארגנות', en: 'Logistics and site set-up' },
};

/**
 * Where the work happens.
 *
 * `levelId` is a string because hotels do not number their floors like integers: there is a lobby
 * level, a basement at −1, a pool deck, and plenty of buildings with no thirteenth floor. Storing it
 * as a number would force a translation at every edge and lose the name the hotel actually uses — and
 * the level is what decides whether a delivery goes through a service lift or up a stair.
 */
export interface LineLocation {
  /** Building or wing. A hotel usually has more than one, and they price differently. */
  buildingId?: string;
  /** The floor, exactly as the hotel names it. */
  levelId: string;
  /** The room, keyed to a `Space`. */
  spaceId: string;
  /** Which part of the room, keyed to a `Zone`, when it matters. */
  zoneId?: string;
}

/** What in the model produced a line, so a reader can get back to the reason for it. */
export interface LineOrigin {
  kind: 'equipment' | 'service_point' | 'part' | 'surface' | 'obstacle' | 'manual';
  /** The id of the thing — an equipment id, a connection point id, a part id. */
  ref: string;
}

export interface BoqLine {
  id: string;
  trade: Trade;
  /** Section within the chapter, for ordering and subtotals. */
  section: string;
  descriptionHe: string;
  descriptionEn: string;
  unit: BoqUnit;
  /** Null when the quantity depends on something nobody has established yet. */
  quantity: number | null;
  /** Required whenever `quantity` is null: what has to happen before it can be filled in. */
  unknownReasonHe?: string;
  unknownReasonEn?: string;
  /** Not optional, by design. See the note on this module. */
  location: LineLocation;
  origin: LineOrigin;
  /** Null until a real quote or price list says otherwise. A market fact, not a product fact. */
  unitPriceIls: number | null;
  sources: Source[];
}

/** A stable, readable key for one location — used to group and to compare. */
export function locationKey(l: LineLocation): string {
  return [l.buildingId ?? '-', l.levelId, l.spaceId, l.zoneId ?? '-'].join('/');
}

export interface Group<T> {
  key: string;
  he: string;
  en: string;
  lines: BoqLine[];
  totals: Totals;
  extra: T;
}

/**
 * The document: lines by trade, then by section.
 *
 * This is the order a bill is printed in and the order a procurement manager reads it in, because a
 * tender goes out to one trade at a time.
 */
export function byTrade(lines: BoqLine[]): Group<{ trade: Trade; sections: { section: string; lines: BoqLine[]; totals: Totals }[] }>[] {
  const order = Object.keys(TRADE_LABEL) as Trade[];
  const present = order.filter((t) => lines.some((l) => l.trade === t));
  return present.map((trade) => {
    const ofTrade = lines.filter((l) => l.trade === trade);
    const sectionNames = [...new Set(ofTrade.map((l) => l.section))].sort();
    return {
      key: trade,
      he: TRADE_LABEL[trade].he,
      en: TRADE_LABEL[trade].en,
      lines: ofTrade,
      totals: totals(ofTrade),
      extra: {
        trade,
        sections: sectionNames.map((section) => {
          const ofSection = ofTrade.filter((l) => l.section === section);
          return { section, lines: ofSection, totals: totals(ofSection) };
        }),
      },
    };
  });
}

/**
 * The work: the same lines by where they happen.
 *
 * This is the view a site manager needs and the one a bill organised only by trade cannot produce.
 * It is also what makes a phased job possible — close one room at a time rather than one trade at a
 * time — which for a hotel that has to keep trading is usually the whole question.
 */
export function byLocation(lines: BoqLine[]): Group<{ location: LineLocation; trades: Trade[] }>[] {
  const keys = [...new Set(lines.map((l) => locationKey(l.location)))].sort();
  return keys.map((key) => {
    const here = lines.filter((l) => locationKey(l.location) === key);
    const location = here[0].location;
    const parts = [location.buildingId, `קומה ${location.levelId}`, location.spaceId, location.zoneId].filter(Boolean);
    const partsEn = [location.buildingId, `level ${location.levelId}`, location.spaceId, location.zoneId].filter(Boolean);
    return {
      key,
      he: parts.join(' · '),
      en: partsEn.join(' · '),
      lines: here,
      totals: totals(here),
      extra: { location, trades: [...new Set(here.map((l) => l.trade))] },
    };
  });
}

/** Lines grouped by the floor they happen on — what a haulage and access allowance is built from. */
export function byLevel(lines: BoqLine[]): Group<{ levelId: string }>[] {
  const levels = [...new Set(lines.map((l) => l.location.levelId))].sort();
  return levels.map((levelId) => {
    const here = lines.filter((l) => l.location.levelId === levelId);
    return { key: levelId, he: `קומה ${levelId}`, en: `Level ${levelId}`, lines: here, totals: totals(here), extra: { levelId } };
  });
}

export interface Totals {
  /** Lines in the group. */
  lines: number;
  /** Money for the lines where both a quantity and a unit price are known. */
  pricedIls: number;
  /** Lines counted in `pricedIls`. */
  pricedLines: number;
  /** Lines with no quantity yet. */
  missingQuantity: number;
  /** Lines with a quantity but no price yet. */
  missingPrice: number;
  /** True only when every line is both quantified and priced. */
  complete: boolean;
}

/**
 * What a group adds up to, and what it does not.
 *
 * A single number would be a lie the moment one line has no price, and a bill is unpriced for most of
 * its life. So the total always arrives with the count of lines it had to leave out; `complete` is the
 * only thing that licenses reading `pricedIls` as the answer.
 */
export function totals(lines: BoqLine[]): Totals {
  let pricedIls = 0;
  let pricedLines = 0;
  let missingQuantity = 0;
  let missingPrice = 0;
  for (const l of lines) {
    if (l.quantity == null) {
      missingQuantity++;
      continue;
    }
    if (l.unitPriceIls == null) {
      missingPrice++;
      continue;
    }
    pricedIls += l.quantity * l.unitPriceIls;
    pricedLines++;
  }
  return {
    lines: lines.length,
    pricedIls,
    pricedLines,
    missingQuantity,
    missingPrice,
    complete: lines.length > 0 && missingQuantity === 0 && missingPrice === 0,
  };
}

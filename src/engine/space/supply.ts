import type { ServiceKind } from '../equipment/catalog';
import type { Source, Vec3 } from '../types';
import type { ConnectionPoint, Space } from './space';

/**
 * Where a service comes from.
 *
 * The space model records that a room has a drain and where it is. That is not enough to quantify a new
 * one, and the task that asked for this said why: *you cannot quantify a water point without knowing
 * what feeds it.* A cold point teed off a 1" main in the corner and one that needs a new riser from the
 * floor below are the same line in a naive bill and two completely different jobs.
 *
 * So a point belongs to a source, and a source carries what the survey **read off the thing itself** —
 * a panel's label, a pipe's stamped diameter — never a figure this engine worked out. Whether that
 * source can carry another point is a licensed trade's judgement, and `supplyReport` below is careful
 * to say what is known and what is not, and never to say a supply is adequate.
 */

/** A riser, a main, a sub-panel, a gas meter — the thing points hang off. */
export interface ServiceSource {
  id: string;
  kind: ServiceKind;
  nameHe: string;
  nameEn: string;
  /** Where it is. Null when its existence is known but nobody measured it. */
  atMm: Vec3 | null;
  /**
   * What the survey read off the source: a panel's label, a pipe's stamped size, a meter's plate.
   * Free text on purpose — it is a transcription, and turning "3×25A" into a number invites arithmetic
   * this engine has no business doing.
   */
  ratingHe?: string;
  ratingEn?: string;
  /** Spare ways or outlets, when a licensed trade stated a figure. Null means nobody said. */
  spareWays: number | null;
  sources?: Source[];
}

/** How well a project's supply for one service is understood. There is deliberately no 'adequate'. */
export type SupplyStatus =
  /** No source of this kind reaches the room. A new point here is a far bigger job than a point. */
  | 'no_source'
  /** Points exist but none of them says what feeds it — the gap that blocks MEP quantification. */
  | 'source_unknown'
  /** A source is named, but nobody stated whether it has room for more. */
  | 'capacity_unstated'
  /** A source is named and a trade stated spare ways, and the new points exceed them. */
  | 'over_stated_capacity'
  /** A source is named and a trade stated enough spare ways for what the project adds. */
  | 'within_stated_capacity';

export interface SupplyLine {
  kind: ServiceKind;
  /** Points the project has to create, from `matchServices`. */
  toCreate: number;
  status: SupplyStatus;
  /** The sources of this kind the room has. */
  sourceIds: string[];
  /** Existing points of this kind whose source nobody recorded. */
  untracedPointIds: string[];
  /** Spare ways a trade stated across the sources of this kind. Null when none of them says. */
  statedSpareWays: number | null;
  /** Straight-line distance from `atMm` to the nearest measured source of this kind. */
  nearestSourceMm: number | null;
  he: string;
  en: string;
}

/** Points that name a source, grouped. A point with no `fedBy` is the interesting case. */
function tracing(points: ConnectionPoint[]): { traced: ConnectionPoint[]; untraced: ConnectionPoint[] } {
  return {
    traced: points.filter((p) => p.fedBy != null),
    untraced: points.filter((p) => p.fedBy == null),
  };
}

const WORDING: Record<SupplyStatus, { he: (k: string) => string; en: (k: string) => string }> = {
  no_source: {
    he: (k) => `אין מקור ${k} בחלל — הבאת המקור היא עבודה נפרדת ורחבה מהנקודה עצמה`,
    en: (k) => `No ${k} source reaches this room — bringing one is separate work, far larger than the point itself`,
  },
  source_unknown: {
    he: (k) => `יש נקודות ${k} אך לא נרשם ממה הן מוזנות — בלי זה אי אפשר לכמת נקודה חדשה`,
    en: (k) => `There are ${k} points but nothing records what feeds them — a new point cannot be quantified without it`,
  },
  capacity_unstated: {
    he: (k) => `המקור ל${k} מזוהה, אך אף בעל מקצוע מוסמך לא קבע אם יש בו מקום לנקודות נוספות`,
    en: (k) => `The ${k} source is identified, but no licensed professional has stated whether it has room for more points`,
  },
  over_stated_capacity: {
    he: (k) => `המקום הפנוי שנמסר במקור ה${k} קטן ממספר הנקודות שהפרוייקט מוסיף — נדרשת החלטה של בעל מקצוע מוסמך`,
    en: (k) => `The spare capacity stated for the ${k} source is less than the points this project adds — a licensed professional has to decide`,
  },
  within_stated_capacity: {
    he: (k) => `המקום הפנוי שנמסר במקור ה${k} מכסה את הנקודות שהפרוייקט מוסיף, לפי מה שנמסר בלבד`,
    en: (k) => `The spare capacity stated for the ${k} source covers the points this project adds, on the strength of that statement alone`,
  },
};

/**
 * What is known about the supply behind each new point a project needs.
 *
 * Read the statuses as degrees of ignorance, not a pass mark. `within_stated_capacity` is the best this
 * function will ever return and it says only that somebody stated a figure and the figure is bigger —
 * it is not a design check, and the wording says so in both languages. Capacity, diameter and
 * protection are a licensed trade's to determine; this reports what a survey found.
 */
export function supplyReport(
  space: Space,
  sources: ServiceSource[],
  required: { kind: ServiceKind; toCreate: number }[],
  atMm?: Vec3,
): SupplyLine[] {
  return required
    .filter((r) => r.toCreate > 0)
    .map(({ kind, toCreate }) => {
      const ofKind = sources.filter((s) => s.kind === kind);
      const points = space.connections.filter((c) => c.kind === kind && c.existing);
      const { untraced } = tracing(points);
      const stated = ofKind.filter((s) => s.spareWays != null);
      const statedSpareWays = stated.length ? stated.reduce((a, s) => a + s.spareWays!, 0) : null;
      const measured = ofKind.filter((s) => s.atMm != null);
      const nearestSourceMm =
        atMm && measured.length
          ? Math.min(...measured.map((s) => Math.hypot(s.atMm!.x - atMm.x, s.atMm!.y - atMm.y, s.atMm!.z - atMm.z)))
          : null;

      let status: SupplyStatus;
      if (!ofKind.length) status = 'no_source';
      else if (points.length > 0 && untraced.length === points.length) status = 'source_unknown';
      else if (statedSpareWays == null) status = 'capacity_unstated';
      else if (statedSpareWays < toCreate) status = 'over_stated_capacity';
      else status = 'within_stated_capacity';

      const label = KIND_LABEL[kind];
      return {
        kind,
        toCreate,
        status,
        sourceIds: ofKind.map((s) => s.id),
        untracedPointIds: untraced.map((p) => p.id),
        statedSpareWays,
        nearestSourceMm,
        he: WORDING[status].he(label.he),
        en: WORDING[status].en(label.en),
      };
    });
}

const KIND_LABEL: Record<ServiceKind, { he: string; en: string }> = {
  water_cold: { he: 'מים קרים', en: 'cold water' },
  water_hot: { he: 'מים חמים', en: 'hot water' },
  drain: { he: 'ניקוז', en: 'drain' },
  electrical: { he: 'חשמל', en: 'electrical' },
  gas: { he: 'גז', en: 'gas' },
  ventilation: { he: 'אוורור', en: 'ventilation' },
};

/** The statuses that mean somebody has to go and find something out before a bill can be priced. */
export const BLOCKING_SUPPLY_STATUSES: ReadonlySet<SupplyStatus> = new Set<SupplyStatus>(['no_source', 'source_unknown', 'capacity_unstated']);

/** A point naming a source that is not in the list — a survey that contradicts itself. */
export function danglingFeeds(space: Space, sources: ServiceSource[]): { pointId: string; fedBy: string; he: string; en: string }[] {
  const known = new Set(sources.map((s) => s.id));
  return space.connections
    .filter((c) => c.fedBy != null && !known.has(c.fedBy))
    .map((c) => ({
      pointId: c.id,
      fedBy: c.fedBy!,
      he: `הנקודה ${c.id} מוזנת לכאורה מ-${c.fedBy}, שאינו רשום כמקור`,
      en: `Point ${c.id} is recorded as fed from ${c.fedBy}, which is not a registered source`,
    }));
}

/** A source whose kind does not match the points hanging off it. */
export function mismatchedFeeds(space: Space, sources: ServiceSource[]): { pointId: string; sourceId: string; he: string; en: string }[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const out: { pointId: string; sourceId: string; he: string; en: string }[] = [];
  for (const c of space.connections) {
    const src = c.fedBy ? byId.get(c.fedBy) : undefined;
    if (src && src.kind !== c.kind) {
      out.push({
        pointId: c.id,
        sourceId: src.id,
        he: `הנקודה ${c.id} (${KIND_LABEL[c.kind].he}) מוזנת לכאורה מ${src.nameHe}, שהוא מקור ${KIND_LABEL[src.kind].he}`,
        en: `Point ${c.id} (${KIND_LABEL[c.kind].en}) is recorded as fed from ${src.nameEn}, which is a ${KIND_LABEL[src.kind].en} source`,
      });
    }
  }
  return out;
}

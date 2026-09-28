import type { Space } from '../space/space';
import { SERVICE_TRADE } from '../equipment/catalog';
import type { BoqLine, Trade } from './line';
import { TRADE_LABEL } from './line';

/**
 * Checks on the bill itself, not on the design.
 *
 * These exist because the location axis is only worth having if it cannot be skipped. TypeScript makes
 * `location` mandatory; nothing in the type system stops a line pointing at a room that is not in the
 * project, or at a floor spelled two different ways in the same bill, and either one quietly splits the
 * work view in half.
 */

export interface BillProblem {
  code: string;
  severity: 'red' | 'yellow';
  lineId: string;
  he: string;
  en: string;
}

export interface Project {
  /** Levels as the hotel names them, in the order they should be read. The spelling here is canonical. */
  levelIds: string[];
  spaces: Space[];
  buildingIds?: string[];
}

export function billProblems(lines: BoqLine[], project: Project): BillProblem[] {
  const problems: BillProblem[] = [];
  const spaceIds = new Set(project.spaces.map((s) => s.id));
  const levelIds = new Set(project.levelIds);
  const buildingIds = project.buildingIds ? new Set(project.buildingIds) : null;
  const seen = new Set<string>();

  for (const l of lines) {
    if (seen.has(l.id)) {
      problems.push({ code: 'duplicate_line_id', severity: 'red', lineId: l.id, he: `מזהה השורה ${l.id} מופיע יותר מפעם אחת`, en: `Line id ${l.id} appears more than once` });
    }
    seen.add(l.id);

    if (!spaceIds.has(l.location.spaceId)) {
      problems.push({
        code: 'line_in_unknown_space',
        severity: 'red',
        lineId: l.id,
        he: `השורה ${l.id} משויכת לחלל ${l.location.spaceId} שאינו בפרוייקט`,
        en: `Line ${l.id} is placed in space ${l.location.spaceId}, which is not in the project`,
      });
    }

    if (!levelIds.has(l.location.levelId)) {
      // Usually "0" against "קרקע" in the same bill, which silently splits the work view in two.
      problems.push({
        code: 'line_on_unknown_level',
        severity: 'red',
        lineId: l.id,
        he: `השורה ${l.id} משויכת לקומה ${l.location.levelId}, שאינה ברשימת הקומות של הפרוייקט`,
        en: `Line ${l.id} is on level ${l.location.levelId}, which is not in the project’s list of levels`,
      });
    }

    if (buildingIds && l.location.buildingId && !buildingIds.has(l.location.buildingId)) {
      problems.push({
        code: 'line_in_unknown_building',
        severity: 'red',
        lineId: l.id,
        he: `השורה ${l.id} משויכת לבניין ${l.location.buildingId} שאינו בפרוייקט`,
        en: `Line ${l.id} is in building ${l.location.buildingId}, which is not in the project`,
      });
    }

    const space = project.spaces.find((s) => s.id === l.location.spaceId);
    if (space && l.location.zoneId && !space.zones.some((z) => z.id === l.location.zoneId)) {
      problems.push({
        code: 'line_in_unknown_zone',
        severity: 'yellow',
        lineId: l.id,
        he: `השורה ${l.id} משויכת לאזור ${l.location.zoneId} שאינו מוגדר בחלל ${space.id}`,
        en: `Line ${l.id} is in zone ${l.location.zoneId}, which is not defined in space ${space.id}`,
      });
    }

    if (l.quantity == null && !l.unknownReasonHe) {
      // An unquantified line with no reason cannot be chased. The reason is the actionable half.
      problems.push({
        code: 'unknown_quantity_without_reason',
        severity: 'red',
        lineId: l.id,
        he: `לשורה ${l.id} אין כמות ואין הסבר מה חסר כדי לקבוע אותה`,
        en: `Line ${l.id} has no quantity and no statement of what is missing to establish it`,
      });
    }

    if (l.quantity != null && l.quantity < 0) {
      problems.push({ code: 'negative_quantity', severity: 'red', lineId: l.id, he: `לשורה ${l.id} כמות שלילית`, en: `Line ${l.id} has a negative quantity` });
    }

    if (l.unitPriceIls != null && l.sources.length === 0) {
      // A price with no source is the exact thing this engine refuses to produce.
      problems.push({
        code: 'price_without_source',
        severity: 'red',
        lineId: l.id,
        he: `לשורה ${l.id} יש מחיר ללא מקור`,
        en: `Line ${l.id} carries a price with no source`,
      });
    }
  }

  return problems;
}

/**
 * Every trade a service point can land in must be a chapter of the bill.
 *
 * `SERVICE_TRADE` maps equipment's service needs onto trades, and `TRADE_LABEL` is the bill's chapter
 * list. If the two drift, a counted water point has nowhere to be printed and vanishes silently.
 */
export function serviceTradesCovered(): boolean {
  const chapters = new Set(Object.keys(TRADE_LABEL));
  return Object.values(SERVICE_TRADE).every((t) => chapters.has(t));
}

/** Lines whose trade is not a chapter — impossible through the type, checked anyway for data read in. */
export function unknownTrades(lines: BoqLine[]): string[] {
  const chapters = new Set(Object.keys(TRADE_LABEL) as Trade[]);
  return [...new Set(lines.filter((l) => !chapters.has(l.trade)).map((l) => l.trade as string))];
}

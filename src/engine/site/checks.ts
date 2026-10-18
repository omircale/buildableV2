import { servicesFor, type ServiceKind } from '../equipment/catalog';
import type { Source } from '../types';

/**
 * Whether a property can take the branch at all — the questions a construction manager answers on the
 * first walk-through, before the lease is signed.
 *
 * These are checks, not rulings. Each one asks what a person found; none of them says a property
 * complies with anything. Where a public source names the requirement behind a check, it is cited; where
 * none was found, the check says whose question it is instead. Nothing here was taken from a person in
 * the field yet: the list is a starting point to be corrected with one.
 */

export type CheckAnswer = 'yes' | 'no' | 'unknown';

/** Who has to deal with a gap: the landlord before handover, us in the fit-out, or a consultant to establish it. */
export type Owner = 'landlord' | 'us' | 'consultant';

export const OWNERS: readonly Owner[] = ['landlord', 'us', 'consultant'];

export interface SiteCheck {
  id: string;
  he: string;
  en: string;
  /** What a "yes" means on the ground, so two people answer it the same way. */
  hintHe: string;
  hintEn: string;
  /** The answer that means the property is fine on this point. */
  good: 'yes' | 'no';
  /** Who deals with it by default when it is not fine. Changeable per property. */
  owner: Owner;
  /** When the check applies. A property for a shop has no hood to vent. */
  appliesWhen: (need: BranchNeed) => boolean;
  sources: Source[];
}

/** What the branch going into the property needs, worked out from its equipment. */
export interface BranchNeed {
  points: Partial<Record<ServiceKind, number>>;
  equipmentIds: string[];
}

const UNIFORM_SPEC_FOOD: Source = {
  title: 'מפרט אחיד לבתי אוכל, פריט 4.2 — משרד הפנים',
  reference: 'גז: ת"י 158; כיבוי במנדפים: ת"י 5356 חלק 2',
  url: 'https://www.gov.il/BlobFolder/policy/specifications_4_2_c/he/Specifications4.2C.pdf',
  titleEn: 'Uniform specification for food businesses, item 4.2 — Ministry of Interior',
  referenceEn: 'Gas: SI 158; hood suppression: SI 5356 part 2',
};

const GREASE_LOCAL: Source = {
  title: 'דרישות רשות מקומית / תאגיד מים למפריד שומן כתנאי לרישיון עסק',
  reference: 'משתנה בין רשויות — לבדוק מול הרשות המקומית',
  url: 'https://www.b-y.org.il/uploads/n/1731245331.3465.pdf',
  titleEn: 'Local authority / water utility requirements for a grease separator as a licensing condition',
  referenceEn: 'Varies by authority — check with the local authority',
};

const has = (need: BranchNeed, kind: ServiceKind) => (need.points[kind] ?? 0) > 0;
const hasItem = (need: BranchNeed, id: string) => need.equipmentIds.includes(id);
const always = () => true;

export const SITE_CHECKS: SiteCheck[] = [
  {
    id: 'landlord_annex',
    he: 'יש נספח טכני או מדריך התאמות של המשכיר',
    en: 'There is a technical annex or fit-out manual from the landlord',
    hintHe: 'מסמך שאומר מה המשכיר מכין לפני מסירה ומה על הדייר.',
    hintEn: 'A document saying what the landlord prepares before handover and what is the tenant’s.',
    good: 'yes',
    owner: 'landlord',
    appliesWhen: always,
    sources: [],
  },
  {
    id: 'handover_date',
    he: 'ידוע מועד המסירה ומה הקנס על איחור בהתאמות',
    en: 'The handover date and the penalty for a late fit-out are known',
    hintHe: 'בקניונים קנס יומי מתחיל לרוץ במועד שנקבע, גמור או לא.',
    hintEn: 'In malls a daily penalty often starts on the set date, finished or not.',
    good: 'yes',
    owner: 'landlord',
    appliesWhen: always,
    sources: [],
  },
  {
    id: 'exhaust_route',
    he: 'יש דרך להוציא פליטה מהמנדף אל מעל הגג',
    en: 'There is a way to take hood exhaust above the roof',
    hintHe: 'פיר קיים או תוואי שהמשכיר מאשר. בלי זה אין מטבח מבשל.',
    hintEn: 'An existing shaft or a route the landlord approves. Without it there is no cooking kitchen.',
    good: 'yes',
    owner: 'landlord',
    appliesWhen: (n) => hasItem(n, 'extraction_hood'),
    sources: [],
  },
  {
    id: 'exhaust_shared',
    he: 'פיר הפליטה משותף לדיירים אחרים',
    en: 'The exhaust shaft is shared with other tenants',
    hintHe: 'פיר משותף מגביל כמה אוויר אפשר להוציא דרכו — שאלה ליועץ האוורור.',
    hintEn: 'A shared shaft limits how much air can go through it — a question for the ventilation consultant.',
    good: 'no',
    owner: 'consultant',
    appliesWhen: (n) => hasItem(n, 'extraction_hood'),
    sources: [],
  },
  {
    id: 'hood_suppression',
    he: 'יש מערכת כיבוי במנדף, עם אישור התאמה לתקן',
    en: 'There is a hood fire-suppression system, with a certificate that it meets the standard',
    hintHe: 'המפרט האחיד לבתי אוכל דורש כיבוי במנדפים לפי ת"י 5356 חלק 2.',
    hintEn: 'The uniform specification for food businesses requires hood suppression to SI 5356 part 2.',
    good: 'yes',
    owner: 'us',
    appliesWhen: (n) => hasItem(n, 'extraction_hood'),
    sources: [UNIFORM_SPEC_FOOD],
  },
  {
    id: 'makeup_air',
    he: 'יש מיזוג לחלל ומקום לאוויר משלים למנדף',
    en: 'The space has air conditioning and room for make-up air to the hood',
    hintHe: 'מנדף שמוציא אוויר צריך אוויר שייכנס במקומו — שאלה ליועץ האוורור.',
    hintEn: 'A hood that extracts air needs air coming in to replace it — a question for the ventilation consultant.',
    good: 'yes',
    owner: 'consultant',
    appliesWhen: (n) => hasItem(n, 'extraction_hood'),
    sources: [],
  },
  {
    id: 'electrical_supply',
    he: 'גודל חיבור החשמל לנכס ידוע, ומספיק לציוד',
    en: 'The property’s electrical connection size is known and enough for the equipment',
    hintHe: 'לרשום את גודל החיבור (אמפר) בהערה. הגדלה דרך חברת החשמל לוקחת זמן וכסף.',
    hintEn: 'Write the connection size (amps) in the note. An upgrade through the utility takes time and money.',
    good: 'yes',
    owner: 'landlord',
    appliesWhen: (n) => has(n, 'electrical'),
    sources: [],
  },
  {
    id: 'gas_supply',
    he: 'יש אספקת גז לנכס ומקום מאושר למיכלים',
    en: 'There is a gas supply to the property and an approved place for cylinders',
    hintHe: 'מערכת הגפ"מ צריכה לענות על ת"י 158 — לפי המפרט האחיד לבתי אוכל.',
    hintEn: 'The LPG system has to meet SI 158 — per the uniform specification for food businesses.',
    good: 'yes',
    owner: 'landlord',
    appliesWhen: (n) => has(n, 'gas'),
    sources: [UNIFORM_SPEC_FOOD],
  },
  {
    id: 'water_supply',
    he: 'יש אספקת מים לחלל',
    en: 'There is a water supply to the space',
    hintHe: 'קוטר הקו קובע כמה ציוד אפשר להפעיל במקביל — שאלה לאינסטלטור.',
    hintEn: 'The pipe size decides how much equipment can run at once — a question for the plumber.',
    good: 'yes',
    owner: 'landlord',
    appliesWhen: (n) => has(n, 'water_cold') || has(n, 'water_hot'),
    sources: [],
  },
  {
    id: 'drain_in_space',
    he: 'יש נקודת ביוב בתוך החלל',
    en: 'There is a drain connection inside the space',
    hintHe: 'ובגובה שמאפשר ניקוז בשיפוע מהכלים אליה.',
    hintEn: 'At a level that lets the equipment drain to it with a fall.',
    good: 'yes',
    owner: 'landlord',
    appliesWhen: (n) => has(n, 'drain'),
    sources: [],
  },
  {
    id: 'grease_separator',
    he: 'יש מפריד שומן מחובר לקו הביוב',
    en: 'There is a grease separator connected to the drain line',
    hintHe: 'ברשויות רבות זה תנאי לרישיון עסק למקום שמכין אוכל.',
    hintEn: 'In many authorities it is a licensing condition for a place that prepares food.',
    good: 'yes',
    owner: 'landlord',
    appliesWhen: (n) => has(n, 'drain') && (hasItem(n, 'extraction_hood') || hasItem(n, 'dishwasher_commercial') || hasItem(n, 'prep_sink_double') || hasItem(n, 'grease_trap')),
    sources: [GREASE_LOCAL],
  },
  {
    id: 'previous_tenant',
    he: 'מה שנשאר מהדייר הקודם נבדק ותקין',
    en: 'What the previous tenant left has been checked and works',
    hintHe: '"יש כאן מנדף" זה לא "המנדף כשיר". אם אין דייר קודם — לענות כן.',
    hintEn: '"There is a hood here" is not "the hood is fit for use". If there was no previous tenant, answer yes.',
    good: 'yes',
    owner: 'consultant',
    appliesWhen: always,
    sources: [],
  },
];

export interface CheckState {
  answer: CheckAnswer;
  note: string;
  /** Set only when someone moved the gap away from its default owner. */
  owner?: Owner;
}

export type CheckStatus = 'ok' | 'gap' | 'unknown';

export interface EvaluatedCheck {
  check: SiteCheck;
  status: CheckStatus;
  owner: Owner;
  note: string;
  answered: boolean;
}

/** What a set of rooms needs: every room's equipment, multiplied by how many identical rooms it stands for. */
export function branchNeed(rooms: { equipmentIds: string[]; count?: number }[]): BranchNeed {
  const points: Partial<Record<ServiceKind, number>> = {};
  const ids = new Set<string>();
  for (const room of rooms) {
    for (const id of room.equipmentIds) ids.add(id);
    for (const s of servicesFor(room.equipmentIds)) points[s.kind] = (points[s.kind] ?? 0) + s.quantity * (room.count ?? 1);
  }
  return { points, equipmentIds: [...ids] };
}

/**
 * Every check that applies to this branch, with what was found.
 *
 * Not answered and "don't know" are the same status — unknown — because for a decision to sign they
 * are the same thing. The difference is kept in `answered` for the screen that asks.
 */
export function evaluateChecks(need: BranchNeed, states: Record<string, CheckState>): EvaluatedCheck[] {
  return SITE_CHECKS.filter((c) => c.appliesWhen(need)).map((check) => {
    const s = states[check.id];
    const answer = s?.answer ?? 'unknown';
    const status: CheckStatus = answer === 'unknown' ? 'unknown' : answer === check.good ? 'ok' : 'gap';
    return { check, status, owner: s?.owner ?? check.owner, note: s?.note ?? '', answered: s != null && s.answer !== 'unknown' };
  });
}

export interface PropertySummary {
  ok: number;
  gaps: number;
  unknown: number;
  total: number;
  byOwner: Record<Owner, EvaluatedCheck[]>;
}

/** The property at a glance, and the open items grouped by who has to deal with them. */
export function propertySummary(evaluated: EvaluatedCheck[]): PropertySummary {
  const byOwner: Record<Owner, EvaluatedCheck[]> = { landlord: [], us: [], consultant: [] };
  for (const e of evaluated) if (e.status !== 'ok') byOwner[e.owner].push(e);
  return {
    ok: evaluated.filter((e) => e.status === 'ok').length,
    gaps: evaluated.filter((e) => e.status === 'gap').length,
    unknown: evaluated.filter((e) => e.status === 'unknown').length,
    total: evaluated.length,
    byOwner,
  };
}

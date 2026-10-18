import type { ServiceKind } from '../equipment/catalog';
import { SERVICE_LABEL } from '../equipment/catalog';
import type { BranchNeed, EvaluatedCheck } from './checks';

/** Which points a check is about, so a requirement to the landlord can say how many. */
const CHECK_POINTS: Record<string, ServiceKind[]> = {
  electrical_supply: ['electrical'],
  gas_supply: ['gas'],
  water_supply: ['water_cold', 'water_hot'],
  drain_in_space: ['drain'],
};

const STATUS = {
  gap: { he: 'חסר', en: 'Missing' },
  unknown: { he: 'לא ידוע', en: 'Unknown' },
  ok: { he: 'תקין', en: 'Fine' },
} as const;

export interface DocumentOptions {
  locale: 'he' | 'en';
  propertyName: string;
  date: string;
}

function header(title: string, o: DocumentOptions, note: string): string[] {
  return [title, o.propertyName, o.date, '', note, ''];
}

/** "How many of which point" for a check, e.g. "נדרשות 121 נקודות חשמל". */
function pointsLine(check: string, need: BranchNeed, he: boolean): string | null {
  const kinds = CHECK_POINTS[check];
  if (!kinds) return null;
  const parts = kinds.filter((k) => (need.points[k] ?? 0) > 0).map((k) => `${need.points[k]} ${he ? `נק' ${SERVICE_LABEL[k].he}` : `${SERVICE_LABEL[k].en} points`}`);
  if (!parts.length) return null;
  return he ? `הסניף צריך: ${parts.join(', ')} (לפי רשימת הציוד; כמות בלבד, לא תכנון).` : `The branch needs: ${parts.join(', ')} (from the equipment list; a count, not a design).`;
}

/**
 * What to ask of the landlord before signing — the items for the technical annex.
 *
 * Only what the landlord has to deal with and is not yet fine: a list of preparations to negotiate,
 * each with what was found and, where the equipment decides it, how many points are needed.
 */
export function landlordRequirements(evaluated: EvaluatedCheck[], need: BranchNeed, o: DocumentOptions): string {
  const he = o.locale === 'he';
  const items = evaluated.filter((e) => e.owner === 'landlord' && e.status !== 'ok');
  const out = header(
    he ? 'דרישות הכנה מהמשכיר — לנספח הטכני' : 'Preparations required of the landlord — for the technical annex',
    o,
    he
      ? 'טיוטה לבדיקה ולמשא ומתן. הרשימה נגזרת ממה שנמצא בסיור ומרשימת הציוד של הסניף; היא אינה תכנון ואינה קביעה של עמידה בתקן.'
      : 'A draft to check and negotiate from. Derived from what was found on the walk-through and the branch’s equipment list; not a design and not a ruling on any standard.',
  );
  if (!items.length) out.push(he ? 'אין פריטים פתוחים מול המשכיר.' : 'No open items with the landlord.');
  items.forEach((e, i) => {
    out.push(`${i + 1}. ${he ? e.check.he : e.check.en} — ${he ? STATUS[e.status].he : STATUS[e.status].en}`);
    const points = pointsLine(e.check.id, need, he);
    if (points) out.push(`   ${points}`);
    if (e.note.trim()) out.push(`   ${he ? 'נמצא בסיור' : 'Found on site'}: ${e.note.trim()}`);
    for (const s of e.check.sources) out.push(`   ${he ? 'מקור' : 'Source'}: ${he ? s.title : (s.titleEn ?? s.title)}${s.reference ? ` — ${he ? s.reference : (s.referenceEn ?? s.reference)}` : ''}`);
  });
  return out.join('\n');
}

/**
 * The open questions, for the consultants and whoever else has to find out: everything not yet known,
 * whoever it belongs to, and every gap that is a consultant's to establish.
 */
export function openQuestions(evaluated: EvaluatedCheck[], need: BranchNeed, o: DocumentOptions, extra: string[] = []): string {
  const he = o.locale === 'he';
  const items = evaluated.filter((e) => e.status === 'unknown' || (e.owner === 'consultant' && e.status === 'gap'));
  const out = header(
    he ? 'שאלות פתוחות לבדיקה — ליועצים ולשטח' : 'Open questions — for the consultants and the site',
    o,
    he ? 'מה שעוד לא ידוע. כל שאלה שנענית יורדת מהרשימה בסיור הבא.' : 'What is not known yet. Each question answered leaves the list on the next walk-through.',
  );
  const all = [...items.map((e) => `[ ] ${he ? e.check.he : e.check.en}? ${he ? e.check.hintHe : e.check.hintEn}${e.note.trim() ? ` (${e.note.trim()})` : ''}`), ...extra.map((q) => `[ ] ${q}`)];
  if (!all.length) out.push(he ? 'אין שאלות פתוחות.' : 'No open questions.');
  out.push(...all);
  const points = Object.entries(need.points).filter(([, n]) => (n ?? 0) > 0);
  if (points.length) {
    out.push('', he ? 'מה הסניף צריך, לפי רשימת הציוד (כמות בלבד):' : 'What the branch needs, from the equipment list (counts only):');
    for (const [k, n] of points) out.push(`- ${n} ${he ? `נק' ${SERVICE_LABEL[k as ServiceKind].he}` : `${SERVICE_LABEL[k as ServiceKind].en} points`}`);
  }
  return out.join('\n');
}

import { polygonArea, type Pt } from '../geometry';
import { MM_PER, type DxfDrawing, type DxfUnit } from '../survey/dxf';
import { CITATIONS, type CitationId } from './citations';

/**
 * Buildable 2's design studio, as a prototype: the building, what was proposed for it, what is wrong
 * with the proposal, and who approved what.
 *
 * Only what a person decided is stored — the spaces, the values they entered with a source, the
 * status they gave each element, what they acknowledged, the approvals, the field marks. The proposal
 * and its issues are derived from those on every render, so a change anywhere is checked again at once
 * and there is no second copy of the truth to drift.
 *
 * The proposal itself is placed by a handful of fixed rules, not by a designer: fixtures along the wall
 * nearest the street, orthogonal runs to an assumed connection. It is there to show how a proposal is
 * reviewed, and every screen that shows it says so.
 */

export type SpaceUse = 'kitchen' | 'restroom' | 'dining' | 'storage' | 'other';

export interface StudioSpace {
  id: string;
  name: string;
  use: SpaceUse;
  /** In millimetres, in the building's own frame: every space shares one origin. */
  outline: Pt[];
  areaM2: number;
}

/** A value a person typed, with where it came from. Never a default. */
export interface Manual {
  value: number;
  source: string;
}

export interface StudioDesign {
  slopePct: Manual | null;
  diameterMm: Manual | null;
  ceilingMm: number | null;
  /** Which city's water corporation the site answers to. Decides whether a local rule applies. */
  city: string;
  /** Where the sewer leaves the building, once someone has marked it. Null until then — and assumed. */
  connection: Pt | null;
}

export type ElementKind =
  | 'sink'
  | 'floor_drain'
  | 'wc'
  | 'basin'
  | 'drain_run'
  | 'water_run'
  | 'grease_separator'
  | 'backflow'
  | 'sewer_connection';

export type Layer = 'drainage' | 'water';
export type ElementStatus = 'proposed' | 'accepted' | 'rejected';

export interface StudioElement {
  id: string;
  kind: ElementKind;
  layer: Layer;
  spaceId?: string;
  /** One point for a fixture or a device, the route for a run. */
  points: Pt[];
  citations: CitationId[];
}

export type Severity = 'blocking' | 'warning' | 'info';
export type IssueKind = 'missing_source' | 'missing_data' | 'local_rule' | 'physics' | 'field';

export interface StudioIssue {
  id: string;
  severity: Severity;
  kind: IssueKind;
  elementIds: string[];
  at?: Pt;
  he: string;
  en: string;
  fixHe: string;
  fixEn: string;
  citations: CitationId[];
}

export type MarkCategory = 'obstacle' | 'moved' | 'missing' | 'different';

export interface FieldMark {
  id: string;
  at: Pt;
  category: MarkCategory;
  note: string;
  createdAt: number;
}

export interface Approval {
  by: string;
  at: number;
  revision: number;
}

export interface StudioProject {
  name: string;
  fileName: string | null;
  spaces: StudioSpace[];
  design: StudioDesign;
  status: Record<string, ElementStatus>;
  acknowledged: string[];
  approvals: Approval[];
  marks: FieldMark[];
  /** Goes up with every change that touches the design, so an approval is tied to what was approved. */
  revision: number;
}

export function blankStudio(): StudioProject {
  return {
    name: '',
    fileName: null,
    spaces: [],
    design: { slopePct: null, diameterMm: null, ceilingMm: null, city: '', connection: null },
    status: {},
    acknowledged: [],
    approvals: [],
    marks: [],
    revision: 0,
  };
}

/* ---------------------------------------------------------------- reading the drawing */

const USE_TERMS: [SpaceUse, RegExp][] = [
  ['kitchen', /מטבח|kitchen/i],
  ['restroom', /שירותים|נוחיות|wc|toilet|restroom/i],
  ['dining', /אולם|ישיבה|סועדים|dining|seating|hall/i],
  ['storage', /מחסן|אחסון|storage|store/i],
];

export function useFromName(name: string): SpaceUse {
  return USE_TERMS.find(([, re]) => re.test(name))?.[0] ?? 'other';
}

function inside(poly: Pt[], at: Pt): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > at.y !== b.y > at.y && at.x < ((b.x - a.x) * (at.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function centroid(poly: Pt[]): Pt {
  return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
}

/**
 * The spaces on one layer of a drawing, kept where they are relative to each other.
 *
 * Unlike the room import, which moves every room to its own origin, a design needs the plan as one
 * piece: a pipe runs from one room to the next. An outline that holds two or more of the others is the
 * floor or the unit around them, not a space, and is left out.
 */
export function spacesFromDrawing(d: DxfDrawing, layer: string, unit: Exclude<DxfUnit, 'unknown'>): StudioSpace[] {
  const k = MM_PER[unit];
  const outlines = d.polylines
    .filter((pl) => pl.layer === layer && pl.closed && pl.points.length >= 3)
    .map((pl) => ({ raw: pl.points, mm: pl.points.map((p) => ({ x: p.x * k, y: p.y * k })) }))
    .map((o) => ({ ...o, areaM2: Math.abs(polygonArea(o.mm)) / 1e6 }))
    .filter((o) => o.areaM2 >= 1);
  const rooms = outlines.filter((o) => outlines.filter((other) => other !== o && inside(o.mm, centroid(other.mm))).length < 2);
  if (!rooms.length) return [];
  const minX = Math.min(...rooms.flatMap((o) => o.mm.map((p) => p.x)));
  const minY = Math.min(...rooms.flatMap((o) => o.mm.map((p) => p.y)));
  const taken = new Set<number>();
  return rooms
    .sort((a, b) => b.areaM2 - a.areaM2)
    .map((o, i) => {
      const labelIndex = d.texts.findIndex((t, ti) => !taken.has(ti) && inside(o.raw, t.at));
      if (labelIndex >= 0) taken.add(labelIndex);
      const name = labelIndex >= 0 ? d.texts[labelIndex].text : '';
      return {
        id: `s${i + 1}`,
        name,
        use: useFromName(name),
        outline: o.mm.map((p) => ({ x: Math.round(p.x - minX), y: Math.round(p.y - minY) })),
        areaM2: o.areaM2,
      };
    });
}

/* ---------------------------------------------------------------- the proposal */

/** Which fixtures a space of each use gets. A demonstration table, not a programme of requirements. */
export const FIXTURES: Record<SpaceUse, ElementKind[]> = {
  kitchen: ['sink', 'sink', 'floor_drain'],
  restroom: ['wc', 'basin'],
  dining: [],
  storage: [],
  other: [],
};

const WATER_FIXTURES = new Set<ElementKind>(['sink', 'wc', 'basin']);
const INSET = 500;

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const boxOf = (pts: Pt[]): Box => ({
  minX: Math.min(...pts.map((p) => p.x)),
  minY: Math.min(...pts.map((p) => p.y)),
  maxX: Math.max(...pts.map((p) => p.x)),
  maxY: Math.max(...pts.map((p) => p.y)),
});

/** A route that turns once: along y first, then along x. */
const yThenX = (a: Pt, b: Pt): Pt[] => (a.x === b.x || a.y === b.y ? [a, b] : [a, { x: a.x, y: b.y }, b]);
const xThenY = (a: Pt, b: Pt): Pt[] => (a.x === b.x || a.y === b.y ? [a, b] : [a, { x: b.x, y: a.y }, b]);

export function runLengthM(points: Pt[]): number {
  let mm = 0;
  for (let i = 1; i < points.length; i++) mm += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return mm / 1000;
}

/** Where the sewer is taken to leave when nobody has marked it: the street side, under the wet rooms. */
export function assumedConnection(spaces: StudioSpace[]): Pt | null {
  const wet = spaces.filter((s) => FIXTURES[s.use].length > 0);
  if (!wet.length) return null;
  const all = boxOf(spaces.flatMap((s) => s.outline));
  const x = wet.reduce((sum, s) => sum + centroid(s.outline).x, 0) / wet.length;
  return { x: Math.round(Math.min(all.maxX, Math.max(all.minX, x))), y: all.minY };
}

export function proposePlumbing(project: StudioProject): StudioElement[] {
  const connection = project.design.connection ?? assumedConnection(project.spaces);
  if (!connection) return [];
  const out: StudioElement[] = [
    { id: 'sewer_connection', kind: 'sewer_connection', layer: 'drainage', points: [connection], citations: [] },
  ];
  const all = boxOf(project.spaces.flatMap((s) => s.outline));
  const waterEntry = { x: Math.min(all.maxX - INSET, connection.x + 1000), y: connection.y + INSET };
  out.push({ id: 'backflow', kind: 'backflow', layer: 'water', points: [waterEntry], citations: ['backflowInstall', 'backflowTest'] });

  for (const space of project.spaces) {
    const kinds = FIXTURES[space.use];
    if (!kinds.length) continue;
    const b = boxOf(space.outline);
    // Fixtures go along the side of the room that faces the connection — the shortest way out.
    const towardLow = Math.abs(connection.y - b.minY) <= Math.abs(connection.y - b.maxY);
    const wallY = towardLow ? b.minY + INSET : b.maxY - INSET;
    const collectorY = towardLow ? b.minY + INSET / 2 : b.maxY - INSET / 2;
    const along = kinds.filter((k) => k !== 'floor_drain');
    const fixtures: StudioElement[] = kinds.map((kind, i) => {
      let at: Pt;
      // Between the middle of the room and the wall, so it does not sit under the room's name.
      if (kind === 'floor_drain') at = { x: centroid(space.outline).x, y: (centroid(space.outline).y + wallY) / 2 };
      else {
        const n = along.length;
        const index = along.indexOf(kind) + kinds.slice(0, i).filter((k) => k === kind).length;
        at = { x: b.minX + ((b.maxX - b.minX) * (index + 1)) / (n + 1), y: wallY };
      }
      if (!inside(space.outline, at)) at = centroid(space.outline);
      return { id: `${space.id}_${kind}_${i}`, kind, layer: 'drainage', spaceId: space.id, points: [{ x: Math.round(at.x), y: Math.round(at.y) }], citations: ['drainParts'] };
    });
    out.push(...fixtures);

    const meanX = Math.round(fixtures.reduce((s, f) => s + f.points[0].x, 0) / fixtures.length);
    const collector = { x: meanX, y: Math.round(collectorY) };
    const grease = space.use === 'kitchen';
    if (grease) out.push({ id: `${space.id}_grease`, kind: 'grease_separator', layer: 'drainage', spaceId: space.id, points: [collector], citations: ['greaseTelAviv', 'greaseRestaurant', 'planMarks'] });

    fixtures.forEach((f, i) =>
      out.push({ id: `${space.id}_drain_${i}`, kind: 'drain_run', layer: 'drainage', spaceId: space.id, points: yThenX(f.points[0], collector), citations: ['drainParts'] }),
    );
    out.push({ id: `${space.id}_drain_out`, kind: 'drain_run', layer: 'drainage', spaceId: space.id, points: yThenX(collector, connection), citations: ['drainParts'] });

    fixtures
      .filter((f) => WATER_FIXTURES.has(f.kind))
      .forEach((f, i) => {
        // Drawn a little off the drain so the two layers can be told apart where they share a corridor.
        const target = { x: f.points[0].x + 150, y: f.points[0].y + 150 };
        out.push({ id: `${space.id}_water_${i}`, kind: 'water_run', layer: 'water', spaceId: space.id, points: xThenY(waterEntry, target), citations: [] });
      });
  }
  return out;
}

/* ---------------------------------------------------------------- checking it */

/** Manning’s n used for the check: the top of the range the card gives for sewer design. */
export const MANNING_N = 0.013;
export const MIN_VELOCITY = 0.6;

/** Full-flow velocity (m/s) and flow (l/s) of a round pipe, from its inside diameter and slope. */
export function fullFlow(diameterMm: number, slopePct: number): { velocity: number; flowLps: number } {
  const d = diameterMm / 1000;
  const r = d / 4;
  const velocity = (1 / MANNING_N) * Math.pow(r, 2 / 3) * Math.sqrt(slopePct / 100);
  return { velocity, flowLps: velocity * ((Math.PI * d * d) / 4) * 1000 };
}

const fmt = (v: number, digits = 2) => (Math.round(v * 10 ** digits) / 10 ** digits).toString();

const TEL_AVIV = /תל[\s-]?אביב|tel[\s-]?aviv/i;

export function deriveIssues(project: StudioProject, elements: StudioElement[]): StudioIssue[] {
  const issues: StudioIssue[] = [];
  const ids = (kind: ElementKind) => elements.filter((e) => e.kind === kind).map((e) => e.id);
  const drains = ids('drain_run');
  const d = project.design;

  if (drains.length && (!d.slopePct || !d.diameterMm)) {
    issues.push({
      id: 'source_slope_diameter',
      severity: 'blocking',
      kind: 'missing_source',
      elementIds: drains,
      he: 'שיפוע וקוטר לצנרת השפכים — אין עדיין מקור ישראלי',
      en: 'Slope and diameter for the soil pipes — no Israeli source yet',
      fixHe: 'הזינו שיפוע וקוטר, וכתבו מאיפה הם (למשל הל"ת, ת"י 1205 או מתכנן האינסטלציה). המוצר לא ממלא אותם בעצמו.',
      fixEn: 'Enter a slope and a diameter and say where they come from (the Israeli plumbing regulations, SI 1205, or the plumbing designer). The product does not fill them in itself.',
      citations: [],
    });
  }

  if (elements.length && !d.connection) {
    const at = elements.find((e) => e.kind === 'sewer_connection')?.points[0];
    issues.push({
      id: 'connection_assumed',
      severity: 'warning',
      kind: 'missing_data',
      elementIds: ['sewer_connection'],
      at,
      he: 'נקודת החיבור לביוב לא ידועה — הונחה בצד הרחוב',
      en: 'The sewer connection is not known — assumed on the street side',
      fixHe: 'סמנו את הנקודה על התוכנית לפי מדידה או תיק המבנה, או אשרו את ההנחה לבדיקה בשטח.',
      fixEn: 'Mark it on the plan from a survey or the building file, or accept the assumption for a site check.',
      citations: [],
    });
  }

  if (drains.length && d.ceilingMm == null) {
    issues.push({
      id: 'ceiling_unknown',
      severity: 'warning',
      kind: 'missing_data',
      elementIds: [],
      he: 'גובה התקרה לא ידוע',
      en: 'The ceiling height is not known',
      fixHe: 'בלי גובה תקרה אי אפשר לבדוק אם הניקוז והתעלות נכנסים מתחת לתקרה. הזינו אותו בשלב המבנה.',
      fixEn: 'Without it there is no checking whether drains and ducts fit under the ceiling. Enter it in the building step.',
      citations: [],
    });
  }

  const grease = ids('grease_separator');
  if (grease.length) {
    const local = TEL_AVIV.test(d.city);
    issues.push({
      id: 'grease_local',
      severity: 'info',
      kind: 'local_rule',
      elementIds: grease,
      at: elements.find((e) => e.id === grease[0])?.points[0],
      he: local ? 'מפריד שומן — נדרש בשטח הפרטי, קיבולת לפי יועץ' : 'מפריד שומן — הכלל שנלמד הוא של מי אביבים (תל אביב-יפו)',
      en: local ? 'Grease separator — required on private ground, capacity by a consultant' : 'Grease separator — the rule learned so far is Mei Avivim’s (Tel Aviv-Yafo)',
      fixHe: local ? 'סמנו את קיבולת המפריד בתכנית העסק לפי חישוב יועץ.' : `באתר ב${d.city || 'עיר אחרת'} בודקים את הדרישה מול תאגיד המים המקומי.`,
      fixEn: local ? 'Mark the separator’s capacity on the business plan from a consultant’s calculation.' : `For a site in ${d.city || 'another city'}, check the requirement with the local water corporation.`,
      citations: ['greaseTelAviv', 'greaseRestaurant'],
    });
  }

  if (ids('backflow').length) {
    issues.push({
      id: 'backflow_type',
      severity: 'info',
      kind: 'missing_data',
      elementIds: ['backflow'],
      at: elements.find((e) => e.kind === 'backflow')?.points[0],
      he: 'סוג המז"ח לא נקבע (אל"מ או חכ"כ)',
      en: 'The backflow preventer type is not set (reduced pressure or double check)',
      fixHe: 'זו שאלה לפרטנר האינסטלציה: איזה סוג נדרש בפועל לעסק כזה.',
      fixEn: 'This is a question for the plumbing partner: which type such a business actually needs.',
      citations: ['backflowInstall'],
    });
  }

  if (drains.length && d.slopePct && d.diameterMm) {
    const { velocity, flowLps } = fullFlow(d.diameterMm.value, d.slopePct.value);
    const slow = velocity < MIN_VELOCITY;
    issues.push({
      id: 'velocity',
      severity: slow ? 'warning' : 'info',
      kind: 'physics',
      elementIds: drains,
      he: slow ? `מהירות במילוי מלא ${fmt(velocity)} מ׳/שנ׳ — מתחת ל-${MIN_VELOCITY}` : `מהירות במילוי מלא ${fmt(velocity)} מ׳/שנ׳, ספיקה ${fmt(flowLps, 1)} ל׳/שנ׳`,
      en: slow ? `Full-flow velocity ${fmt(velocity)} m/s — below ${MIN_VELOCITY}` : `Full-flow velocity ${fmt(velocity)} m/s, flow ${fmt(flowLps, 1)} l/s`,
      fixHe: `חושב במשוואת מנינג עם n=${MANNING_N}, והקוטר נלקח כקוטר פנימי. המקורות זרים, ולכן המספר לבדיקה בלבד עד שיימצא מקור ישראלי.${slow ? ' שיפוע גדול יותר מעלה את המהירות.' : ''}`,
      fixEn: `Manning’s equation with n=${MANNING_N}, taking the diameter as the inside diameter. The sources are foreign, so the figure is for checking only until an Israeli source is found.${slow ? ' A steeper slope raises the velocity.' : ''}`,
      citations: ['manning', 'hydraulicRadius', 'manningN', 'minVelocity'],
    });
  }

  for (const m of project.marks) {
    issues.push({
      id: `mark_${m.id}`,
      severity: 'warning',
      kind: 'field',
      elementIds: [],
      at: m.at,
      he: `סימון מהשטח: ${MARK_LABEL[m.category].he}${m.note ? ` — ${m.note}` : ''}`,
      en: `Field mark: ${MARK_LABEL[m.category].en}${m.note ? ` — ${m.note}` : ''}`,
      fixHe: 'בדקו את ההשפעה על התכנון, ועדכנו או אשרו שאין שינוי.',
      fixEn: 'Check what it changes in the design, then update it or confirm nothing changes.',
      citations: [],
    });
  }
  return issues;
}

export const MARK_LABEL: Record<MarkCategory, { he: string; en: string }> = {
  obstacle: { he: 'מכשול', en: 'obstacle' },
  moved: { he: 'מיקום שונה', en: 'different position' },
  missing: { he: 'חסר', en: 'missing' },
  different: { he: 'בוצע אחרת', en: 'built differently' },
};

/* ---------------------------------------------------------------- approving it */

export const statusOf = (project: StudioProject, id: string): ElementStatus => project.status[id] ?? 'proposed';

/** What still needs someone: every blocking issue, and every warning nobody has checked. Notes are not counted. */
export function openIssues(project: StudioProject, issues: StudioIssue[]): StudioIssue[] {
  return issues.filter((i) => i.severity === 'blocking' || (i.severity === 'warning' && !project.acknowledged.includes(i.id)));
}

export interface ApprovalCheck {
  ok: boolean;
  blocking: number;
  unacknowledged: number;
  undecided: number;
}

/** What stands between the plumbing and an approval. All three must be zero. */
export function approvalCheck(project: StudioProject, elements: StudioElement[], issues: StudioIssue[]): ApprovalCheck {
  const blocking = issues.filter((i) => i.severity === 'blocking').length;
  const unacknowledged = issues.filter((i) => i.severity === 'warning' && !project.acknowledged.includes(i.id)).length;
  const undecided = elements.filter((e) => statusOf(project, e.id) === 'proposed').length;
  return { ok: elements.length > 0 && blocking === 0 && unacknowledged === 0 && undecided === 0, blocking, unacknowledged, undecided };
}

/** The approval that still stands — one given to an earlier revision does not. */
export function currentApproval(project: StudioProject): Approval | null {
  const last = project.approvals[project.approvals.length - 1];
  return last && last.revision === project.revision ? last : null;
}

/* ---------------------------------------------------------------- the bill */

export const KIND_LABEL: Record<ElementKind, { he: string; en: string }> = {
  sink: { he: 'כיור מטבח', en: 'kitchen sink' },
  floor_drain: { he: 'מחסום רצפה', en: 'floor drain' },
  wc: { he: 'אסלה', en: 'WC' },
  basin: { he: 'כיור רחצה', en: 'wash basin' },
  drain_run: { he: 'קו שפכים', en: 'soil pipe' },
  water_run: { he: 'קו מים', en: 'water pipe' },
  grease_separator: { he: 'מפריד שומן', en: 'grease separator' },
  backflow: { he: 'מז"ח', en: 'backflow preventer' },
  sewer_connection: { he: 'חיבור לביוב', en: 'sewer connection' },
};

export const STUDIO_DRAFT = {
  he: 'טיוטה לבדיקה — ההצעה הונחה בכללים פשוטים להדגמה, ואינה תכנון של בעל מקצוע מוסמך',
  en: 'Draft for review — the proposal was placed by simple demonstration rules and is not a licensed design',
};

export interface StudioSheet {
  name: string;
  rows: (string | number)[][];
  widths: number[];
}

/** The plumbing bill, from accepted elements only. A proposal nobody accepted is not a quantity. */
export function studioBill(project: StudioProject, elements: StudioElement[], locale: 'he' | 'en'): StudioSheet {
  const he = locale === 'he';
  const accepted = elements.filter((e) => statusOf(project, e.id) === 'accepted');
  const count = (k: ElementKind) => accepted.filter((e) => e.kind === k).length;
  const length = (k: ElementKind) => Math.round(accepted.filter((e) => e.kind === k).reduce((s, e) => s + runLengthM(e.points), 0) * 10) / 10;
  const label = (k: ElementKind) => (he ? KIND_LABEL[k].he : KIND_LABEL[k].en);
  const sectionNote = he ? 'מספר סעיף לפי המפרט הכללי — לא הושלם' : 'Section number per the general specification — not filled in';
  const diameter = project.design.diameterMm;
  const lines: (string | number)[][] = [];
  const add = (description: string, unit: string, qty: number, note: string) => {
    if (qty > 0) lines.push(['07', description, unit, qty, '', '', note]);
  };
  for (const k of ['sink', 'floor_drain', 'wc', 'basin'] as const) add(he ? `נקודת ${label(k)}` : `${label(k)} point`, he ? "נק'" : 'pt', count(k), sectionNote);
  add(
    diameter ? (he ? `${label('drain_run')} קוטר ${diameter.value} מ"מ` : `${label('drain_run')} ${diameter.value} mm`) : he ? `${label('drain_run')} — קוטר לפי תכנון` : `${label('drain_run')} — diameter by design`,
    he ? 'מ"א' : 'm',
    length('drain_run'),
    he ? 'אורך לפי תוואי מוצע' : 'Length along the proposed route',
  );
  add(he ? `${label('water_run')} — קוטר לפי תכנון` : `${label('water_run')} — diameter by design`, he ? 'מ"א' : 'm', length('water_run'), he ? 'אורך לפי תוואי מוצע' : 'Length along the proposed route');
  add(label('grease_separator'), he ? "יח'" : 'ea', count('grease_separator'), he ? 'קיבולת לפי חישוב יועץ' : 'Capacity by a consultant’s calculation');
  add(label('backflow'), he ? "יח'" : 'ea', count('backflow'), he ? 'סוג לפי תכנון' : 'Type by design');

  const approval = currentApproval(project);
  return {
    name: he ? 'אינסטלציה' : 'Plumbing',
    widths: [8, 44, 8, 10, 12, 12, 48],
    rows: [
      [he ? `כתב כמויות — אינסטלציה — ${project.name || 'פרויקט'}` : `Bill of quantities — plumbing — ${project.name || 'project'}`],
      [he ? STUDIO_DRAFT.he : STUDIO_DRAFT.en],
      [
        approval
          ? he
            ? `גרסה ${project.revision} · אושר בידי ${approval.by}`
            : `Revision ${project.revision} · approved by ${approval.by}`
          : he
            ? `גרסה ${project.revision} · לא אושר`
            : `Revision ${project.revision} · not approved`,
      ],
      [he ? 'רק רכיבים שאושרו נכנסים לכמויות' : 'Only accepted elements are counted'],
      [],
      he ? ['פרק', 'תיאור', 'יחידה', 'כמות', 'מחיר יחידה', 'סה"כ', 'הערה'] : ['Chapter', 'Description', 'Unit', 'Qty', 'Unit price', 'Total', 'Note'],
      ...lines,
    ],
  };
}

export const citationsOf = (ids: CitationId[]) => ids.map((id) => CITATIONS[id]);

import { CONFIG_SOURCES, DEFAULT_CONFIG, type EngineeringConfig } from '../config';
import { GAMMA_M, KDEF_SC1, KMOD_LONG_TERM_SC1, SOURCES, allMaterials, ec5ClassFor, getMaterial, propertiesFor } from '../materials';
import { nestParts } from '../manufacturing/nesting';
import {
  deflectionSimplePointCenter,
  deflectionSimpleUdl,
  kgToN,
  momentSimplePointCenter,
  momentSimpleUdl,
  rectInertia,
  rectSectionModulus,
} from '../structural/beam';
import { buildOpenShelf } from '../templates/openShelf';
import type { Check, CheckCategory, Component, DesignChange, FurnitureModel, OpenShelfParams, ProjectedFix, Status, ValidationReport } from '../types';

const SEVERITY: Record<Status, number> = { GREEN: 0, YELLOW: 1, GREY: 2, RED: 3 };

export function worst(statuses: Status[]): Status {
  return statuses.reduce<Status>((w, s) => (SEVERITY[s] > SEVERITY[w] ? s : w), 'GREEN');
}

const CATEGORIES: CheckCategory[] = ['geometry', 'materials', 'structure', 'connections', 'stability', 'manufacturing', 'assembly', 'safety'];

const KIND_HE: Record<string, string> = { mean: 'ממוצע', characteristic: 'אופייני', standard_minimum: 'מינימום תקן', manufacturer: 'יצרן', user_provided: 'משתמש', assumption: 'הנחה' };

const fmt = (v: number, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('he-IL');

export interface ValidateOptions {
  config?: EngineeringConfig;
  /** Fix projection re-runs validation; nested runs skip fix generation. */
  withFixes?: boolean;
}

export function validate(model: FurnitureModel, opts: ValidateOptions = {}): ValidationReport {
  const config = opts.config ?? DEFAULT_CONFIG;
  const withFixes = opts.withFixes ?? true;
  const p = model.params;
  const checks: Check[] = [];

  checks.push(...geometryChecks(model, config));
  checks.push(...materialChecks(p));
  const geometryOk = worst(checks.filter((c) => c.category === 'geometry').map((c) => c.status)) !== 'RED';

  if (geometryOk) {
    checks.push(...structureChecks(model, config, withFixes));
    checks.push(...manufacturingChecks(model, config));
  } else {
    checks.push({
      id: 'structure.skipped',
      category: 'structure',
      status: 'GREY',
      componentIds: [],
      title: 'בדיקה מבנית לא בוצעה',
      explanation: 'יש לתקן קודם את שגיאות הגאומטריה.',
      assumptions: [],
      sources: [],
      fixes: [],
    });
  }
  checks.push(...stabilityChecks(p));
  checks.push(assemblyCheck(model));
  checks.push(safetyCheck());

  const coverage = Object.fromEntries(
    CATEGORIES.map((cat) => {
      const list = checks.filter((c) => c.category === cat);
      return [cat, list.length ? worst(list.map((c) => c.status)) : 'GREY'];
    }),
  ) as Record<CheckCategory, Status>;

  const blocking: CheckCategory[] = ['geometry', 'materials', 'structure', 'manufacturing'];
  return {
    checks,
    coverage,
    overall: worst(Object.values(coverage)),
    exportBlocked: blocking.some((c) => coverage[c] === 'RED'),
    physicalVerificationRequired: true,
  };
}

// ---------------------------------------------------------------- geometry

const LIMITS = {
  widthMm: [200, 2400],
  heightMm: [200, 2700],
  depthMm: [150, 800],
  shelfCount: [0, 12],
  dividerCount: [0, 6],
  plinthHeightMm: [0, 200],
} as const;

const MIN_CLEAR_GAP_MM = 120;

function geometryChecks(model: FurnitureModel, config: EngineeringConfig): Check[] {
  const p = model.params;
  const out: Check[] = [];
  const range = (key: keyof typeof LIMITS, label: string) => {
    const [min, max] = LIMITS[key];
    const v = p[key];
    if (!Number.isFinite(v) || v < min || v > max) {
      out.push({
        id: `geometry.range.${key}`,
        category: 'geometry',
        status: 'RED',
        componentIds: [],
        title: `${label} מחוץ לטווח הנתמך`,
        explanation: `הערך ${fmt(v, 0)} אינו בטווח ${min}–${max}. הטווח הוא מגבלת גרסה זו של המערכת.`,
        assumptions: ['טווחי מידות הם החלטת מוצר לשלב 1'],
        sources: [],
        fixes: [],
      });
    }
  };
  range('widthMm', 'רוחב');
  range('heightMm', 'גובה');
  range('depthMm', 'עומק');
  range('shelfCount', 'מספר מדפים');
  range('dividerCount', 'מספר מחיצות');
  range('plinthHeightMm', 'גובה סוקל');

  if (p.thicknessMm < config.minPanelThicknessMm) {
    out.push({
      id: 'geometry.thickness_min',
      category: 'geometry',
      status: 'RED',
      componentIds: [],
      title: 'עובי לוח קטן מהמינימום',
      explanation: `עובי ${p.thicknessMm} מ"מ קטן מהמינימום המוגדר (${config.minPanelThicknessMm} מ"מ) לחיבורי ברגים בקצה הלוח.`,
      assumptions: ['מינימום עובי הוא החלטת מוצר'],
      sources: [],
      fixes: [],
    });
  }

  const bad = model.components.filter((c) => c.size.x <= 0 || c.size.y <= 0 || c.size.z <= 0);
  if (bad.length) {
    out.push({
      id: 'geometry.nonpositive',
      category: 'geometry',
      status: 'RED',
      componentIds: bad.map((c) => c.id),
      title: 'רכיבים במידה אפסית או שלילית',
      explanation: 'הרכיבים לא נכנסים בתוך מידות הרהיט. הקטינו מספר מדפים/מחיצות או הגדילו את המידות.',
      assumptions: [],
      sources: [],
      fixes: [],
    });
  }

  const overlapping = findOverlaps(model.components);
  if (overlapping.length) {
    out.push({
      id: 'geometry.overlap',
      category: 'geometry',
      status: 'RED',
      componentIds: [...new Set(overlapping.flat())],
      title: 'רכיבים חופפים',
      explanation: `${overlapping.length} זוגות לוחות תופסים את אותו מקום (למשל ${overlapping[0].join(' ו-')}). אין מספיק מקום למספר המדפים/המחיצות.`,
      assumptions: [],
      sources: [],
      fixes: p.shelfCount > 0 ? [{ change: { label: 'הפחתת מדף אחד', set: { shelfCount: p.shelfCount - 1 } }, projectedStatus: 'YELLOW', projectedDetail: 'לבדוק שוב' }] : [],
    });
  }

  const horizontals = model.components.filter((c) => c.role === 'shelf' || c.role === 'bottom' || c.role === 'top');
  const firstBay = horizontals.filter((c) => c.origin.x === model.params.thicknessMm).sort((a, b) => a.origin.y - b.origin.y);
  const gaps = firstBay.slice(1).map((c, i) => c.origin.y - (firstBay[i].origin.y + firstBay[i].size.y));
  const minGap = gaps.length ? Math.min(...gaps) : Infinity;
  if (Number.isFinite(minGap) && minGap > 0 && minGap < MIN_CLEAR_GAP_MM) {
    out.push({
      id: 'geometry.shelf_gap',
      category: 'geometry',
      status: 'YELLOW',
      componentIds: firstBay.map((c) => c.id),
      title: 'מרווח קטן בין מדפים',
      explanation: `המרווח הפנוי בין מדפים הוא ${fmt(minGap, 0)} מ"מ — פחות מ-${MIN_CLEAR_GAP_MM} מ"מ, קשה לשימוש.`,
      assumptions: [`${MIN_CLEAR_GAP_MM} מ"מ הוא סף שימושיות — החלטת מוצר`],
      sources: [],
      fixes: [{ change: { label: 'הפחתת מדף אחד', set: { shelfCount: Math.max(0, p.shelfCount - 1) } }, projectedStatus: 'GREEN', projectedDetail: 'מגדיל את המרווח' }],
    });
  }

  if (!out.length) {
    out.push({
      id: 'geometry.ok',
      category: 'geometry',
      status: 'GREEN',
      componentIds: [],
      title: 'גאומטריה תקינה',
      explanation: `כל ${model.components.length} הרכיבים בעלי מידות חיוביות ובתוך מעטפת הרהיט.`,
      assumptions: [],
      sources: [],
      fixes: [],
    });
  }
  return out;
}

export function findOverlaps(components: Component[], epsMm = 0.01): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      const a = components[i];
      const b = components[j];
      const axisOverlap = (k: 'x' | 'y' | 'z') => Math.min(a.origin[k] + a.size[k], b.origin[k] + b.size[k]) - Math.max(a.origin[k], b.origin[k]) > epsMm;
      if (axisOverlap('x') && axisOverlap('y') && axisOverlap('z')) pairs.push([a.id, b.id]);
    }
  }
  return pairs;
}

// ---------------------------------------------------------------- materials

function materialChecks(p: OpenShelfParams): Check[] {
  const out: Check[] = [];
  const m = getMaterial(p.materialId);
  if (!m) {
    return [
      {
        id: 'materials.missing',
        category: 'materials',
        status: 'RED',
        componentIds: [],
        title: 'חומר לא קיים בספרייה',
        explanation: `החומר "${p.materialId}" לא נמצא.`,
        assumptions: [],
        sources: [],
        fixes: [],
      },
    ];
  }
  if (!m.thicknessesMm.includes(p.thicknessMm)) {
    out.push({
      id: 'materials.thickness_stock',
      category: 'materials',
      status: 'RED',
      componentIds: [],
      title: 'עובי לא קיים לחומר זה',
      explanation: `${m.nameHe} מוגדר בעוביים: ${m.thicknessesMm.join(', ')} מ"מ.`,
      assumptions: ['רשימת העוביים טרם אומתה מול ספק'],
      sources: [],
      fixes: m.thicknessesMm.map((t) => ({ change: { label: `עובי ${t} מ"מ`, set: { thicknessMm: t } }, projectedStatus: 'GREEN' as Status, projectedDetail: 'עובי קיים' })),
    });
  }
  if (!m.structuralUse) {
    out.push({
      id: 'materials.not_structural',
      category: 'materials',
      status: 'RED',
      componentIds: [],
      title: 'חומר לא מיועד לרכיבים נושאים',
      explanation: `${m.nameHe} מוגדר ללוחות גב בלבד.`,
      assumptions: [],
      sources: [],
      fixes: [],
    });
  }
  if (p.hasBack) {
    const b = getMaterial(p.backMaterialId);
    if (!b || !b.thicknessesMm.includes(p.backThicknessMm)) {
      out.push({
        id: 'materials.back',
        category: 'materials',
        status: 'RED',
        componentIds: ['back'],
        title: 'חומר או עובי גב לא תקינים',
        explanation: b ? `עוביים זמינים ל-${b.nameHe}: ${b.thicknessesMm.join(', ')} מ"מ.` : 'חומר הגב לא נמצא.',
        assumptions: [],
        sources: [],
        fixes: [],
      });
    }
  }
  const stockAssumed = m.stock.every((s) => s.kind === 'assumption');
  out.push({
    id: 'materials.availability',
    category: 'materials',
    status: stockAssumed ? 'YELLOW' : 'GREEN',
    componentIds: [],
    title: stockAssumed ? 'זמינות ומידות לוח לא אומתו מול ספק' : 'זמינות אומתה',
    explanation: stockAssumed ? `מידות הלוח (${m.stock.map((s) => `${s.lengthMm}×${s.widthMm}`).join(', ')}) הן מידות מקובלות שטרם אומתו מול מחסן עצים.` : 'מידות הלוח אומתו מול ספק.',
    assumptions: stockAssumed ? ['מידות לוח סטנדרטיות'] : [],
    sources: [],
    requiredVerification: stockAssumed ? 'לאשר עם הספק מידות לוח ועובי בפועל' : undefined,
    fixes: [],
  });
  return out;
}

// ---------------------------------------------------------------- structure

export interface ShelfAnalysis {
  status: Status;
  spanMm: number;
  instMm: number | null;
  finalMm: number | null;
  limitGreenMm: number;
  limitRedMm: number;
  stressRatio: number | null;
  explanation: string;
  calculation?: Check['calculation'];
  assumptions: string[];
  sources: Check['sources'];
  requiredVerification?: string;
}

export function analyseHorizontal(c: Component, config: EngineeringConfig): ShelfAnalysis {
  const L = c.spanMm ?? c.size.x;
  const limitGreenMm = L / config.deflectionGreenRatio;
  const limitRedMm = L / config.deflectionRedRatio;
  const base = { spanMm: L, limitGreenMm, limitRedMm };
  const m = getMaterial(c.materialId);
  const props = m ? propertiesFor(m, c.thicknessMm) : undefined;
  const E = props?.eBendingMpa.value ?? null;
  const f = props?.fBendingMpa.value ?? null;
  const rho = m?.densityKgM3.value ?? null;

  if (!m || E == null || rho == null) {
    return {
      ...base,
      status: 'GREY',
      instMm: null,
      finalMm: null,
      stressRatio: null,
      explanation: !m
        ? 'החומר לא נמצא.'
        : E == null
          ? `אין במערכת מודול אלסטיות מאומת ל-${m.nameHe} בעובי ${c.thicknessMm} מ"מ. לא בוצע חישוב — לא מנחשים ערכים.`
          : `אין צפיפות ידועה ל-${m.nameHe}.`,
      assumptions: [],
      sources: [],
      requiredVerification: 'להוסיף נתון הנדסי ממקור מוסמך לעובי זה, או לבצע בדיקת עומס פיזית',
    };
  }

  const b = c.size.z;
  const h = c.thicknessMm;
  const I = rectInertia(b, h);
  const W = rectSectionModulus(b, h);
  const wSelf = kgToN((rho * b * h) / 1e9); // N per mm of span
  const load = c.load;
  const massKg = load?.massKg ?? 0;
  const loadN = kgToN(massKg);

  let instLoad = 0;
  let momentLoad = 0;
  if (load && massKg > 0) {
    if (load.distribution === 'uniform') {
      instLoad = deflectionSimpleUdl(loadN / L, L, E, I);
      momentLoad = momentSimpleUdl(loadN / L, L);
    } else {
      instLoad = deflectionSimplePointCenter(loadN, L, E, I);
      momentLoad = momentSimplePointCenter(loadN, L);
    }
  }
  const instSelf = deflectionSimpleUdl(wSelf, L, E, I);
  const instMm = instSelf + instLoad;

  const ec5 = ec5ClassFor(m);
  const assumptions: string[] = [
    'המדף מחושב כקורה פשוטה על שתי סמכות (שמרני ביחס לחיבור קשיח)',
    load?.distribution === 'point_center' ? 'העומס מרוכז במרכז המפתח' : 'העומס מפוזר באחידות לאורך המפתח',
    'כל העומס נחשב קבוע לאורך זמן (ψ2 = 1) — שמרני',
    'רוחב החתך = עומק הלוח המלא; השפעת גב מחובר לא נלקחת בחשבון',
  ];
  const sources = [SOURCES.ec5, ...props!.eBendingMpa.sources, ...(props!.fBendingMpa.sources ?? [])];
  if (props!.eBendingMpa.kind === 'standard_minimum') assumptions.push('E הוא ערך מינימום של תקן המוצר — שמרני ביחס לממוצע');
  if (m.densityKgM3.kind === 'assumption') assumptions.push(m.densityKgM3.note ?? 'צפיפות מונחת');
  if (m.hasGrain) assumptions.push('כיוון הסיבים (או סיבי שכבת הפנים) מקביל למפתח — נאכף ברשימת החיתוך');

  let status: Status;
  let finalMm: number | null = null;
  let stressRatio: number | null = null;
  let capYellowReason: string | null = null;

  if (!ec5) {
    status = 'GREY';
  } else {
    const kdef = KDEF_SC1[ec5.cls];
    finalMm = instMm * (1 + kdef);
    if (ec5.byAnalogy) {
      capYellowReason = `${m.nameHe} אינו מכוסה ב-Eurocode 5; מקדמי זחילה ומשך עומס נלקחו באנלוגיה (${ec5.cls}).`;
      assumptions.push(capYellowReason);
    }
    if (m.densityKgM3.kind === 'assumption') capYellowReason ??= 'צפיפות החומר מונחת ולא מאומתת.';

    if (f != null) {
      const kmod = KMOD_LONG_TERM_SC1[ec5.cls];
      const gM = GAMMA_M[ec5.cls];
      const Md = config.loadPartialFactor * (momentSimpleUdl(wSelf, L) + momentLoad);
      const sigma = Md / W;
      const fd = (kmod * f) / gM;
      stressRatio = sigma / fd;
    }

    if (finalMm > limitRedMm || (stressRatio != null && stressRatio > 1)) status = 'RED';
    else if (finalMm > limitGreenMm) status = 'YELLOW';
    else status = 'GREEN';
    if (status === 'GREEN' && capYellowReason) status = 'YELLOW';
    if (stressRatio == null && status === 'GREEN') status = 'YELLOW';
  }

  const kdefVal = ec5 ? KDEF_SC1[ec5.cls] : null;
  const calculation = {
    formula:
      (load?.distribution === 'point_center' ? 'δ = PL³/(48EI) + 5·w_self·L⁴/(384EI)' : 'δ = 5·(w + w_self)·L⁴/(384EI)') +
      '; δ_fin = δ_inst·(1+k_def); σ = γ·M/W ≤ k_mod·f_m,k/γ_M',
    inputs: {
      'מפתח L': `${fmt(L, 0)} מ"מ`,
      'עומק b': `${fmt(b, 0)} מ"מ`,
      'עובי h': `${h} מ"מ`,
      E: `${E.toLocaleString('he-IL')} MPa (${KIND_HE[props!.eBendingMpa.kind]})`,
      'f_m': f != null ? `${f} MPa (${KIND_HE[props!.fBendingMpa.kind]})` : 'לא ידוע',
      'עומס': `${massKg} ק"ג`,
      'משקל עצמי': `${fmt((rho * b * h * L) / 1e9, 2)} ק"ג`,
      k_def: kdefVal != null ? String(kdefVal) : 'לא ידוע',
    },
    result:
      finalMm != null
        ? `δ_inst = ${fmt(instMm, 2)} מ"מ, δ_fin = ${fmt(finalMm, 2)} מ"מ (ירוק ≤ ${fmt(limitGreenMm, 2)}, אדום > ${fmt(limitRedMm, 2)})` +
          (stressRatio != null ? `; ניצולת חוזק ${fmt(stressRatio * 100, 0)}%` : '')
        : `δ_inst = ${fmt(instMm, 2)} מ"מ; זחילה לא ידועה`,
  };

  let explanation: string;
  if (status === 'RED') {
    explanation =
      stressRatio != null && stressRatio > 1
        ? `המדף חורג מחוזק הכפיפה המחושב (ניצולת ${fmt(stressRatio * 100, 0)}%).`
        : `השקיעה הצפויה לאורך זמן (${fmt(finalMm!, 1)} מ"מ) חורגת מסף הכשל L/${config.deflectionRedRatio} = ${fmt(limitRedMm, 1)} מ"מ.`;
  } else if (status === 'YELLOW') {
    explanation =
      finalMm != null && finalMm > limitGreenMm
        ? `השקיעה הצפויה לאורך זמן (${fmt(finalMm, 1)} מ"מ) עוברת את יעד L/${config.deflectionGreenRatio} = ${fmt(limitGreenMm, 1)} מ"מ.`
        : `החישוב עומד בספים, אך ${capYellowReason ?? 'חלק מהנתונים חסרים'}`;
  } else if (status === 'GREY') {
    explanation = 'אין מקדמי Eurocode 5 לחומר זה — לא ניתן להעריך זחילה לאורך זמן.';
  } else {
    explanation = `עומד בכללי הבדיקה המוגדרים: δ_fin = ${fmt(finalMm!, 1)} מ"מ ≤ ${fmt(limitGreenMm, 1)} מ"מ, ניצולת חוזק ${fmt((stressRatio ?? 0) * 100, 0)}%.`;
  }

  return {
    ...base,
    status,
    instMm,
    finalMm,
    stressRatio,
    explanation,
    calculation,
    assumptions,
    sources: [...new Map([...sources, ...CONFIG_SOURCES.deflection].map((s) => [s.title, s])).values()],
    requiredVerification: 'בדיקת עומס פיזית על מדף לדוגמה (למשל לפי EN 16122) לפני ייצור סדרתי',
  };
}

function structureChecks(model: FurnitureModel, config: EngineeringConfig, withFixes: boolean): Check[] {
  const loaded = model.components.filter((c) => (c.role === 'shelf' || c.role === 'bottom') && c.load && c.load.massKg > 0);
  // Members with identical span, section, material and load behave identically: report them once.
  const groups = new Map<string, Component[]>();
  for (const c of loaded) {
    const key = JSON.stringify([c.spanMm, c.size.z, c.thicknessMm, c.materialId, c.load]);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const out: Check[] = [];
  const analyses = [...groups.entries()].map(([key, comps]) => ({ key, comps, a: analyseHorizontal(comps[0], config) }));
  // Levels share span, material and load, so fixes are computed once for the governing level.
  const governing = analyses.reduce<(typeof analyses)[number] | null>((g, x) => (!g || SEVERITY[x.a.status] > SEVERITY[g.a.status] ? x : g), null);
  const fixes = withFixes && governing && (governing.a.status === 'RED' || governing.a.status === 'YELLOW') ? projectStructureFixes(model.params, config) : [];

  for (const { key, comps, a } of analyses) {
    const levels = [...new Set(comps.map((c) => c.name.replace(/ \(תא \d+\)$/, '')))];
    const name = levels.length > 1 ? `${levels.join(', ')} (${comps.length} לוחות זהים)` : levels[0];
    out.push({
      id: `structure.deflection.${comps[0].id}`,
      category: 'structure',
      status: a.status,
      componentIds: comps.map((c) => c.id),
      title: `${name}: ${a.status === 'GREEN' ? 'עומד בבדיקה' : a.status === 'GREY' ? 'לא ניתן לאמת' : a.status === 'RED' ? 'לא עומד בעומס המבוקש' : 'אזהרה'}`,
      explanation: a.explanation,
      calculation: a.calculation,
      assumptions: a.assumptions,
      sources: a.sources,
      requiredVerification: a.requiredVerification,
      fixes: governing?.key === key ? fixes : [],
    });
  }
  if (!loaded.length) {
    out.push({
      id: 'structure.no_load',
      category: 'structure',
      status: 'YELLOW',
      componentIds: [],
      title: 'לא הוגדר עומס',
      explanation: 'העומס למדף הוא 0 ק"ג — הבדיקה המבנית לא מייצגת שימוש אמיתי.',
      assumptions: [],
      sources: [],
      fixes: [],
    });
  }
  out.push({
    id: 'connections.strength',
    category: 'connections',
    status: 'GREY',
    componentIds: [],
    title: 'חוזק חיבורים לא מחושב',
    explanation: 'כמות הברגים נקבעת לפי כלל אצבע מוצהר. עמידות החיבור בעומס לא מחושבת בגרסה זו.',
    assumptions: [],
    sources: [],
    requiredVerification: 'שימוש בברגים לפי הנחיות היצרן ובדיקת אב-טיפוס',
    fixes: [],
  });
  return out;
}

/** Deterministic fix search: every candidate is re-validated with the full engine before it is offered. */
export function projectStructureFixes(p: OpenShelfParams, config: EngineeringConfig): ProjectedFix[] {
  const candidates: DesignChange[] = [];
  const m = getMaterial(p.materialId);
  if (m) {
    for (const t of m.thicknessesMm.filter((t) => t > p.thicknessMm && propertiesFor(m, t))) {
      candidates.push({ label: `הגדלת עובי ל-${t} מ"מ`, set: { thicknessMm: t } });
    }
  }
  for (let d = p.dividerCount + 1; d <= Math.min(p.dividerCount + 2, LIMITS.dividerCount[1]); d++) {
    const added = d - p.dividerCount;
    candidates.push({ label: added === 1 ? `הוספת מחיצה אנכית (${d} סה"כ)` : `הוספת ${added} מחיצות אנכיות (${d} סה"כ)`, set: { dividerCount: d } });
  }
  for (const alt of allMaterials().filter((x) => x.id !== p.materialId && x.structuralUse && x.verified)) {
    const t = alt.thicknessesMm.filter((t) => propertiesFor(alt, t)).sort((a, b) => Math.abs(a - p.thicknessMm) - Math.abs(b - p.thicknessMm))[0];
    if (t != null) candidates.push({ label: `החלפת חומר ל-${alt.nameHe} ${t} מ"מ`, set: { materialId: alt.id, thicknessMm: t } });
  }

  const run = (set: DesignChange['set']) => governingShelf({ ...p, ...set } as OpenShelfParams, config);
  const passes = (set: DesignChange['set']) => run(set)?.passesLimits ?? false;

  const out: ProjectedFix[] = [];
  for (const change of candidates) {
    const g = run(change.set);
    if (g?.passesLimits) out.push({ change, projectedStatus: g.status, projectedDetail: g.status === 'GREEN' ? 'עומד בבדיקות המבנה' : 'עומד בספים; נשארת אזהרת נתונים' });
  }

  const bestWidth = searchMax(LIMITS.widthMm[0], p.widthMm - 10, 10, (w) => passes({ widthMm: w }));
  if (bestWidth != null) {
    const s = run({ widthMm: bestWidth })!.status;
    out.push({ change: { label: `הקטנת רוחב ל-${bestWidth} מ"מ`, set: { widthMm: bestWidth } }, projectedStatus: s, projectedDetail: 'הרוחב המרבי שעומד בספים' });
  }
  const bestLoad = searchMax(1, p.loadPerShelf.massKg - 1, 1, (kg) => passes({ loadPerShelf: { ...p.loadPerShelf, massKg: kg } }));
  if (bestLoad != null) {
    const set = { loadPerShelf: { ...p.loadPerShelf, massKg: bestLoad } };
    out.push({ change: { label: `הגבלת עומס ל-${bestLoad} ק"ג למדף`, set }, projectedStatus: run(set)!.status, projectedDetail: 'העומס המרבי שעומד בספים' });
  }

  const rank = (f: ProjectedFix) => (f.projectedStatus === 'GREEN' ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, 6);
}

/** Worst loaded horizontal member of a design; `passesLimits` ignores data-quality caps. */
export function governingShelf(p: OpenShelfParams, config: EngineeringConfig): (ShelfAnalysis & { passesLimits: boolean }) | null {
  const model = buildOpenShelf(p);
  if (model.components.some((c) => c.size.x <= 0 || c.size.y <= 0 || c.size.z <= 0)) return null;
  const loaded = model.components.filter((c) => (c.role === 'shelf' || c.role === 'bottom') && c.load);
  let worstA: ShelfAnalysis | null = null;
  for (const c of loaded) {
    const a = analyseHorizontal(c, config);
    if (!worstA || SEVERITY[a.status] > SEVERITY[worstA.status] || (a.status === worstA.status && (a.finalMm ?? 0) > (worstA.finalMm ?? 0))) worstA = a;
  }
  if (!worstA) return null;
  const passesLimits = worstA.finalMm != null && worstA.finalMm <= worstA.limitGreenMm && (worstA.stressRatio == null || worstA.stressRatio <= 1);
  return { ...worstA, passesLimits };
}

/** Largest value in [lo, hi] (step) satisfying a monotone predicate, or null. */
function searchMax(lo: number, hi: number, step: number, ok: (v: number) => boolean): number | null {
  if (hi < lo) return null;
  let a = Math.ceil(lo / step);
  let b = Math.floor(hi / step);
  if (!ok(a * step)) return null;
  while (a < b) {
    const mid = Math.ceil((a + b) / 2);
    if (ok(mid * step)) a = mid;
    else b = mid - 1;
  }
  return a * step;
}

// ---------------------------------------------------------------- stability, manufacturing, assembly, safety

function stabilityChecks(p: OpenShelfParams): Check[] {
  const out: Check[] = [
    {
      id: 'stability.tipping',
      category: 'stability',
      status: 'GREY',
      componentIds: [],
      title: 'יציבות נגד התהפכות לא מחושבת',
      explanation: `יחס גובה לעומק ${fmt(p.heightMm / p.depthMm, 1)}. בגרסה זו המערכת לא מחשבת התהפכות. יש לעגן לקיר.`,
      assumptions: [],
      sources: [],
      requiredVerification: 'עיגון לקיר עם ערכת נגד-התהפכות המתאימה לסוג הקיר',
      fixes: [],
    },
  ];
  if (!p.hasBack) {
    out.push({
      id: 'stability.racking',
      category: 'stability',
      status: 'YELLOW',
      componentIds: [],
      title: 'אין גב — אין התנגדות לעיוות צידי',
      explanation: 'בלי גב או חיזוק אלכסוני, היחידה עלולה להתעוות לצדדים (racking) כי חיבורי ברגים לבדם אינם קשיחים.',
      assumptions: [],
      sources: [],
      fixes: [{ change: { label: 'הוספת גב', set: { hasBack: true } }, projectedStatus: 'GREEN', projectedDetail: 'גב מחובר מקשיח את המסגרת' }],
    });
  }
  return out;
}

function manufacturingChecks(model: FurnitureModel, config: EngineeringConfig): Check[] {
  const nest = nestParts(model.parts, getMaterial, { kerfMm: config.kerfMm, trimMarginMm: config.trimMarginMm });
  const unplaced = nest.flatMap((g) => g.unplaced);
  if (unplaced.length) {
    const partIds = [...new Set(unplaced.map((u) => u.partId))];
    return [
      {
        id: 'manufacturing.oversize',
        category: 'manufacturing',
        status: 'RED',
        componentIds: model.parts.filter((pt) => partIds.includes(pt.id)).flatMap((pt) => pt.componentIds),
        title: 'חלקים גדולים מהלוח',
        explanation: `${partIds.join(', ')}: ${unplaced[0].reason}. ייצוא חסום.`,
        assumptions: [`שולי ניקוי ${config.trimMarginMm} מ"מ מכל צד`],
        sources: [],
        fixes: [],
      },
    ];
  }
  const sheets = nest.reduce((a, g) => a + g.sheets.length, 0);
  return [
    {
      id: 'manufacturing.nesting',
      category: 'manufacturing',
      status: 'GREEN',
      componentIds: [],
      title: 'כל החלקים נכנסים ללוחות',
      explanation: `${model.parts.reduce((a, pt) => a + pt.quantity, 0)} חלקים על ${sheets} לוחות, עם להב ${config.kerfMm} מ"מ ושוליים ${config.trimMarginMm} מ"מ.`,
      assumptions: ['חיתוך גיליוטינה (מסור פאנלים)', 'כיוון סיבים לאורך הלוח'],
      sources: [],
      fixes: [],
    },
  ];
}

function assemblyCheck(model: FurnitureModel): Check {
  return {
    id: 'assembly.sequence',
    category: 'assembly',
    status: 'GREEN',
    componentIds: [],
    title: 'רצף הרכבה נוצר',
    explanation: `רצף הרכבה נגזר מ-${model.components.length} רכיבים. זו בדיקה תוכנתית של שלמות — לא אימות מעשי.`,
    assumptions: [],
    sources: [],
    fixes: [],
  };
}

function safetyCheck(): Check {
  return {
    id: 'safety.physical',
    category: 'safety',
    status: 'YELLOW',
    componentIds: [],
    title: 'נדרש אימות פיזי',
    explanation: 'תקני ריהוט (למשל EN 14749, EN 16122) דורשים בדיקות פיזיות של חוזק ויציבות. המערכת לא טוענת לעמידה בתקן.',
    assumptions: [],
    sources: [],
    requiredVerification: 'בדיקה פיזית / אישור איש מקצוע',
    fixes: [],
  };
}

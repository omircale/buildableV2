import { CONFIG_SOURCES, DEFAULT_CONFIG, type EngineeringConfig } from '../config';
import { GAMMA_M, KDEF_SC1, KMOD_LONG_TERM_SC1, SOURCES, allMaterials, ec5ClassFor, getMaterial, propertiesFor, supplierProductFor } from '../materials';
import { finishName, localizeSource, localizedNote, materialName, noteText, productDescription, productTitle, tr } from '../i18n';
import { buildSupplierQuote, type QuoteIssueCode } from '../suppliers/quote';
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
import { buildModel, rangeLabel, templateFor } from '../templates/registry';
import { isOpenShelf, type Check, type CheckCategory, type Component, type DesignChange, type DesignParams, type FurnitureModel, type OpenShelfParams, type ProjectedFix, type Status, type ValidationReport } from '../types';

const SEVERITY: Record<Status, number> = { GREEN: 0, YELLOW: 1, GREY: 2, RED: 3 };

export function worst(statuses: Status[]): Status {
  return statuses.reduce<Status>((w, s) => (SEVERITY[s] > SEVERITY[w] ? s : w), 'GREEN');
}

const CATEGORIES: CheckCategory[] = ['geometry', 'materials', 'structure', 'connections', 'stability', 'manufacturing', 'assembly', 'safety'];

const KIND_HE: Record<string, string> = { mean: 'ממוצע', characteristic: 'אופייני', standard_minimum: 'מינימום תקן', manufacturer: 'יצרן', user_provided: 'משתמש', assumption: 'הנחה' };
const KIND_EN: Record<string, string> = { mean: 'mean', characteristic: 'characteristic', standard_minimum: 'standard minimum', manufacturer: 'manufacturer', user_provided: 'user provided', assumption: 'assumption' };
/** Value-kind label; like the original Hebrew table, kinds without a label render as "undefined". */
const kindLabel = (kind: string) => tr(KIND_HE[kind], KIND_EN[kind]);

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

  const shelf = isOpenShelf(p);
  const templateChecks = (shelf ? [] : (templateFor(p).checks?.(model) ?? [])).map((c) => ({ ...c, sources: c.sources.map((x) => localizeSource(x)) }));
  checks.push(...geometryChecks(model, config));
  checks.push(...templateChecks.filter((c) => c.category === 'geometry'));
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
      title: tr('בדיקה מבנית לא בוצעה', 'Structural check not performed'),
      explanation: tr('יש לתקן קודם את שגיאות הגאומטריה.', 'Fix the geometry errors first.'),
      assumptions: [],
      sources: [],
      fixes: [],
    });
  }
  if (shelf) checks.push(...stabilityChecks(p));
  if (shelf && p.shelfMounting === 'pins' && p.shelfCount > 0) checks.push(shelfPinCheck(model));
  checks.push(...templateChecks.filter((c) => c.category !== 'geometry'));
  checks.push(assemblyCheck(model));
  if (shelf) checks.push(safetyCheck());

  const coverage = Object.fromEntries(
    CATEGORIES.map((cat) => {
      const list = checks.filter((c) => c.category === cat);
      return [cat, list.length ? worst(list.map((c) => c.status)) : 'GREY'];
    }),
  ) as Record<CheckCategory, Status>;

  const blocking: CheckCategory[] = ['geometry', 'materials', 'structure', 'manufacturing', 'safety'];
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
  dividerCount: [0, 6],
} as const;

const MIN_CLEAR_GAP_MM = 120;

function geometryChecks(model: FurnitureModel, config: EngineeringConfig): Check[] {
  const p = model.params;
  const out: Check[] = [];
  const values = p as unknown as Record<string, number>;
  for (const limit of templateFor(p).limits) {
    const { key, min, max } = limit;
    const label = rangeLabel(limit);
    const v = values[key];
    if (!Number.isFinite(v) || v < min || v > max) {
      out.push({
        id: `geometry.range.${key}`,
        category: 'geometry',
        status: 'RED',
        componentIds: [],
        title: tr(`${label} מחוץ לטווח הנתמך`, `${label} is outside the supported range`),
        explanation: tr(`הערך ${fmt(v, 0)} אינו בטווח ${min}–${max}. הטווח הוא מגבלת גרסה זו של המערכת.`, `The value ${fmt(v, 0)} is not within ${min}–${max}. The range is a limitation of this version of the system.`),
        assumptions: [tr('טווחי מידות הם החלטת מוצר לשלב 1', 'Dimension ranges are a Phase 1 product decision')],
        sources: [],
        fixes: [],
      });
    }
  }

  if (p.thicknessMm < config.minPanelThicknessMm) {
    out.push({
      id: 'geometry.thickness_min',
      category: 'geometry',
      status: 'RED',
      componentIds: [],
      title: tr('עובי לוח קטן מהמינימום', 'Board thickness below the minimum'),
      explanation: tr(
        `עובי ${p.thicknessMm} מ"מ קטן מהמינימום המוגדר (${config.minPanelThicknessMm} מ"מ) לחיבורי ברגים בקצה הלוח.`,
        `A thickness of ${p.thicknessMm} mm is below the configured minimum (${config.minPanelThicknessMm} mm) for screw joints into the board edge.`,
      ),
      assumptions: [tr('מינימום עובי הוא החלטת מוצר', 'The minimum thickness is a product decision')],
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
      title: tr('רכיבים במידה אפסית או שלילית', 'Components with zero or negative size'),
      explanation: tr('הרכיבים לא נכנסים בתוך מידות הרהיט. הקטינו מספר מדפים/מחיצות או הגדילו את המידות.', 'The components do not fit within the furniture dimensions. Reduce the number of shelves/dividers or increase the dimensions.'),
      assumptions: [],
      sources: [],
      fixes: [],
    });
  }

  const overlapping = findOverlaps(model.components.filter((c) => !c.reference && !c.rotationZDeg));
  if (overlapping.length) {
    out.push({
      id: 'geometry.overlap',
      category: 'geometry',
      status: 'RED',
      componentIds: [...new Set(overlapping.flat())],
      title: tr('רכיבים חופפים', 'Overlapping components'),
      explanation: tr(
        `${overlapping.length} זוגות לוחות תופסים את אותו מקום (למשל ${overlapping[0].join(' ו-')}). אין מספיק מקום למספר המדפים/המחיצות.`,
        `${overlapping.length} pairs of boards occupy the same space (e.g. ${overlapping[0].join(' and ')}). There is not enough room for the number of shelves/dividers.`,
      ),
      assumptions: [],
      sources: [],
      fixes: isOpenShelf(p) && p.shelfCount > 0 ? [{ change: { label: tr('הפחתת מדף אחד', 'Remove one shelf'), set: { shelfCount: p.shelfCount - 1 } }, projectedStatus: 'YELLOW', projectedDetail: tr('לבדוק שוב', 'Re-check') }] : [],
    });
  }

  const horizontals = isOpenShelf(p) ? model.components.filter((c) => c.role === 'shelf' || c.role === 'bottom' || c.role === 'top') : [];
  // Loose shelves are narrower and centred in their bay, so bays are matched by centre, not by left edge.
  const centre = (c: Component) => c.origin.x + c.size.x / 2;
  const firstCentre = horizontals.length ? Math.min(...horizontals.map(centre)) : 0;
  const firstBay = horizontals.filter((c) => Math.abs(centre(c) - firstCentre) < 1).sort((a, b) => a.origin.y - b.origin.y);
  const gaps = firstBay.slice(1).map((c, i) => c.origin.y - (firstBay[i].origin.y + firstBay[i].size.y));
  const minGap = gaps.length ? Math.min(...gaps) : Infinity;
  if (Number.isFinite(minGap) && minGap > 0 && minGap < MIN_CLEAR_GAP_MM) {
    out.push({
      id: 'geometry.shelf_gap',
      category: 'geometry',
      status: 'YELLOW',
      componentIds: firstBay.map((c) => c.id),
      title: tr('מרווח קטן בין מדפים', 'Small gap between shelves'),
      explanation: tr(
        `המרווח הפנוי בין מדפים הוא ${fmt(minGap, 0)} מ"מ — פחות מ-${MIN_CLEAR_GAP_MM} מ"מ, קשה לשימוש.`,
        `The clear gap between shelves is ${fmt(minGap, 0)} mm — less than ${MIN_CLEAR_GAP_MM} mm, which is hard to use.`,
      ),
      assumptions: [tr(`${MIN_CLEAR_GAP_MM} מ"מ הוא סף שימושיות — החלטת מוצר`, `${MIN_CLEAR_GAP_MM} mm is a usability threshold — a product decision`)],
      sources: [],
      fixes: isOpenShelf(p) ? [{ change: { label: tr('הפחתת מדף אחד', 'Remove one shelf'), set: { shelfCount: Math.max(0, p.shelfCount - 1) } }, projectedStatus: 'GREEN', projectedDetail: tr('מגדיל את המרווח', 'Increases the gap') }] : [],
    });
  }

  if (model.orderStepMm > 0) {
    const { requested: r, overall: o } = model;
    if (Math.abs(r.x - o.x) > 0.01 || Math.abs(r.y - o.y) > 0.01 || Math.abs(r.z - o.z) > 0.01) {
      out.push({
        id: 'geometry.order_step',
        category: 'geometry',
        status: 'YELLOW',
        componentIds: [],
        title: tr('המידות הותאמו להזמנה בס"מ שלמים', 'Dimensions adjusted to order in whole centimetres'),
        explanation: tr(
          `הלוחות נחתכים בס"מ שלמים, ולכן כל חלק עוגל כלפי מטה והרהיט נבנה סביב החלקים. מידות בפועל: ${fmt(o.x, 1)}×${fmt(o.y, 1)}×${fmt(o.z, 1)} מ"מ (התבקש ${fmt(r.x, 1)}×${fmt(r.y, 1)}×${fmt(r.z, 1)}).`,
          `Boards are cut to whole centimetres, so every part was rounded down and the unit is built around the parts. Actual dimensions: ${fmt(o.x, 1)}×${fmt(o.y, 1)}×${fmt(o.z, 1)} mm (requested ${fmt(r.x, 1)}×${fmt(r.y, 1)}×${fmt(r.z, 1)}).`,
        ),
        assumptions: [tr('חיתוך בדיוק של ס"מ שלם', 'Cutting accuracy of one whole centimetre')],
        sources: [],
        fixes:
          p.template === 'open_shelf' || p.template === 'table'
            ? [{ change: { label: tr('לקבע את המידות בפועל', 'Lock the actual dimensions'), set: { widthMm: o.x, heightMm: o.y, depthMm: o.z } }, projectedStatus: 'GREEN', projectedDetail: tr('המידות יתאימו בדיוק להזמנה', 'The dimensions will match the order exactly') }]
            : [],
      });
    }
    const top = model.components.find((c) => c.role === 'top');
    const dividerGaps = model.components.filter((c) => c.role === 'divider').map((c) => (top ? top.origin.y - (c.origin.y + c.size.y) : 0));
    const maxDividerGap = dividerGaps.length ? Math.max(...dividerGaps) : 0;
    if (maxDividerGap > 0.5) {
      out.push({
        id: 'geometry.divider_gap',
        category: 'geometry',
        status: 'YELLOW',
        componentIds: model.components.filter((c) => c.role === 'divider').map((c) => c.id),
        title: tr(`המחיצות קצרות ב-${fmt(maxDividerGap, 1)} מ"מ`, `The dividers are ${fmt(maxDividerGap, 1)} mm short`),
        explanation: tr(
          'הגובה הפנימי אינו בס"מ שלמים (עובי הלוח × 2 אינו כפולה של 10 מ"מ), ולכן המחיצה המוזמנת קצרה מעט ממנו. המחיצה תחובר לתחתית ויישאר מרווח מתחת לגג.',
          'The interior height is not a whole number of centimetres (board thickness × 2 is not a multiple of 10 mm), so the ordered divider is slightly shorter. The divider is fixed to the bottom, leaving a gap under the top.',
        ),
        assumptions: [],
        sources: [],
        requiredVerification: tr('לוודא שהמרווח מקובל עיצובית, או לחבר את המחיצה לגג בעזרת זווית', 'Confirm the gap is acceptable visually, or fix the divider to the top with an angle bracket'),
        fixes: [],
      });
    }
    const plinth = isOpenShelf(p) ? model.components.find((c) => c.role === 'plinth') : undefined;
    const innerW = model.overall.x - 2 * p.thicknessMm;
    if (plinth && innerW - plinth.size.x > 0.5) {
      out.push({
        id: 'geometry.plinth_gap',
        category: 'geometry',
        status: 'YELLOW',
        componentIds: ['plinth'],
        title: tr(`הסוקל קצר ב-${fmt(innerW - plinth.size.x, 1)} מ"מ`, `The plinth is ${fmt(innerW - plinth.size.x, 1)} mm short`),
        explanation: tr('הרוחב הפנימי אינו בס"מ שלמים, ולכן הסוקל המוזמן קצר מעט וממורכז.', 'The interior width is not a whole number of centimetres, so the ordered plinth is slightly short and centred.'),
        assumptions: [],
        sources: [],
        fixes: [],
      });
    }
  }

  if (!out.length) {
    out.push({
      id: 'geometry.ok',
      category: 'geometry',
      status: 'GREEN',
      componentIds: [],
      title: tr('גאומטריה תקינה', 'Geometry is valid'),
      explanation: tr(`כל ${model.components.length} הרכיבים בעלי מידות חיוביות ובתוך מעטפת הרהיט.`, `All ${model.components.length} components have positive dimensions and lie within the furniture envelope.`),
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

function materialChecks(p: DesignParams): Check[] {
  const out: Check[] = [];
  const m = getMaterial(p.materialId);
  if (!m) {
    return [
      {
        id: 'materials.missing',
        category: 'materials',
        status: 'RED',
        componentIds: [],
        title: tr('חומר לא קיים בספרייה', 'Material not in the library'),
        explanation: tr(`החומר "${p.materialId}" לא נמצא.`, `The material "${p.materialId}" was not found.`),
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
      title: tr('עובי לא קיים לחומר זה', 'Thickness not available for this material'),
      explanation: tr(`${m.nameHe} מוגדר בעוביים: ${m.thicknessesMm.join(', ')} מ"מ.`, `${materialName(m, 'en')} is defined in thicknesses: ${m.thicknessesMm.join(', ')} mm.`),
      assumptions: [tr('רשימת העוביים טרם אומתה מול ספק', 'The list of thicknesses has not yet been confirmed with a supplier')],
      sources: [],
      fixes: m.thicknessesMm.map((t) => ({ change: { label: tr(`עובי ${t} מ"מ`, `Thickness ${t} mm`), set: { thicknessMm: t } }, projectedStatus: 'GREEN' as Status, projectedDetail: tr('עובי קיים', 'Available thickness') })),
    });
  }
  if (!m.structuralUse) {
    out.push({
      id: 'materials.not_structural',
      category: 'materials',
      status: 'RED',
      componentIds: [],
      title: tr('חומר לא מיועד לרכיבים נושאים', 'Material not intended for load-bearing members'),
      explanation: tr(`${m.nameHe} מוגדר ללוחות גב בלבד.`, `${materialName(m, 'en')} is defined for back panels only.`),
      assumptions: [],
      sources: [],
      fixes: [],
    });
  }
  if (isOpenShelf(p) && p.hasBack) {
    const b = getMaterial(p.backMaterialId);
    if (!b || !b.thicknessesMm.includes(p.backThicknessMm)) {
      out.push({
        id: 'materials.back',
        category: 'materials',
        status: 'RED',
        componentIds: ['back'],
        title: tr('חומר או עובי גב לא תקינים', 'Invalid back panel material or thickness'),
        explanation: b
          ? tr(`עוביים זמינים ל-${b.nameHe}: ${b.thicknessesMm.join(', ')} מ"מ.`, `Available thicknesses for ${materialName(b, 'en')}: ${b.thicknessesMm.join(', ')} mm.`)
          : tr('חומר הגב לא נמצא.', 'The back panel material was not found.'),
        assumptions: [],
        sources: [],
        fixes: [],
      });
    }
  }
  const sp = supplierProductFor(m);
  if (sp) {
    const finish = sp.product.finishes.find((f) => f.id === p.finishId);
    out.push({
      id: 'materials.availability',
      category: 'materials',
      status: finish ? 'GREEN' : 'RED',
      componentIds: [],
      title: finish
        ? tr(`זמין להזמנה: ${sp.product.titleHe} — ${finish.nameHe}`, `Available to order: ${productTitle(sp.product, 'en')} — ${finishName(finish, 'en')}`)
        : tr(`הגוון "${p.finishId}" לא קיים ב${sp.product.titleHe}`, `The finish "${p.finishId}" does not exist for ${productTitle(sp.product, 'en')}`),
      explanation: finish
        ? tr(
            `₪${finish.pricePerSqm} למ"ר, חיתוך לפי מידה עד ${sp.product.limits.maxLongMm / 10}×${sp.product.limits.maxShortMm / 10} ס"מ.`,
            `₪${finish.pricePerSqm} per m², cut to size up to ${sp.product.limits.maxLongMm / 10}×${sp.product.limits.maxShortMm / 10} cm.`,
          )
        : tr(`הגוונים הזמינים: ${sp.product.finishes.map((f) => f.nameHe).join(', ')}.`, `Available finishes: ${sp.product.finishes.map((f) => finishName(f, 'en')).join(', ')}.`),
      assumptions: [],
      sources: [],
      fixes: finish
        ? []
        : sp.product.finishes.map((f) => ({
            change: { label: tr(`גוון ${f.nameHe}`, `Finish: ${finishName(f, 'en')}`), set: { finishId: f.id } },
            projectedStatus: 'GREEN' as Status,
            projectedDetail: tr(`₪${f.pricePerSqm} למ"ר`, `₪${f.pricePerSqm} per m²`),
          })),
    });
    if (isOpenShelf(p) && p.hasBack) {
      const bp = supplierProductFor(getMaterial(p.backMaterialId));
      if (bp && !bp.product.finishes.some((f) => f.id === p.backFinishId)) {
        out.push({
          id: 'materials.back_finish',
          category: 'materials',
          status: 'RED',
          componentIds: ['back'],
          title: tr(`הגוון "${p.backFinishId}" לא קיים ב${bp.product.titleHe}`, `The finish "${p.backFinishId}" does not exist for ${productTitle(bp.product, 'en')}`),
          explanation: tr(`הגוונים הזמינים: ${bp.product.finishes.map((f) => f.nameHe).join(', ')}.`, `Available finishes: ${bp.product.finishes.map((f) => finishName(f, 'en')).join(', ')}.`),
          assumptions: [],
          sources: [],
          fixes: bp.product.finishes.map((f) => ({
            change: { label: tr(`גוון גב ${f.nameHe}`, `Back panel finish: ${finishName(f, 'en')}`), set: { backFinishId: f.id } },
            projectedStatus: 'GREEN' as Status,
            projectedDetail: tr('זמין', 'Available'),
          })),
        });
      }
    }
    const overrides = [...Object.values(p.roleFinishes ?? {}), ...Object.values(p.partFinishes ?? {})].filter((id): id is string => Boolean(id));
    const missing = [...new Set(overrides.filter((id) => !sp.product.finishes.some((f) => f.id === id)))];
    if (missing.length) {
      out.push({
        id: 'materials.part_finish',
        category: 'materials',
        status: 'RED',
        componentIds: [],
        title: tr(`גוון לחלק שלא קיים ב${sp.product.titleHe}`, `A part decor that does not exist for ${productTitle(sp.product, 'en')}`),
        explanation: tr(`הגוונים ${missing.join(', ')} נבחרו לחלקים, אבל הלוח הנוכחי לא מגיע בהם.`, `The decors ${missing.join(', ')} were chosen for parts, but the current board does not come in them.`),
        assumptions: [],
        sources: [],
        fixes: [{ change: { label: tr('כל החלקים בגוון הרהיט', 'All parts in the main decor'), set: { roleFinishes: {}, partFinishes: {} } }, projectedStatus: 'GREEN', projectedDetail: '' }],
      });
    }
    if (m.equivalence && !m.equivalence.confirmed) {
      const ref = getMaterial(m.equivalence.referenceMaterialId);
      out.push({
        id: 'materials.equivalence',
        category: 'materials',
        status: 'YELLOW',
        componentIds: [],
        title: tr('נתוני החוזק מושאלים מחומר ייחוס', 'Strength data borrowed from a reference material'),
        explanation: tr(
          `החישוב המבני משתמש בנתונים של "${ref?.nameHe}". ${m.equivalence.noteHe}`,
          `The structural calculation uses the data of "${ref ? materialName(ref, 'en') : undefined}". ${noteText(m.equivalence, 'en')}`,
        ),
        assumptions: [],
        sources: (ref?.properties[0]?.eBendingMpa.sources ?? []).map((x) => localizeSource(x)),
        requiredVerification: tr('דף מפרט של יצרן הלוח (דרגה, תקן, מודול אלסטיות)', "Board manufacturer's datasheet (grade, standard, modulus of elasticity)"),
        fixes: [],
      });
    }
    if (!m.properties.length && m.structuralUse) {
      out.push({
        id: 'materials.no_engineering',
        category: 'materials',
        status: 'GREY',
        componentIds: [],
        title: tr('אין נתונים הנדסיים למוצר זה', 'No engineering data for this product'),
        explanation: tr(
          `למוצר "${sp.product.titleHe}" אין במערכת נתוני חוזק ממקור מוסמך. ${sp.product.descriptionHe}`,
          `The system has no strength data from an authoritative source for "${productTitle(sp.product, 'en')}". ${productDescription(sp.product, 'en')}`,
        ),
        assumptions: [],
        sources: [],
        requiredVerification: tr('דף מפרט של יצרן הלוח או בדיקת עומס פיזית', "Board manufacturer's datasheet or a physical load test"),
        fixes: [],
      });
    }
    return out;
  }

  const stockAssumed = m.stock.every((s) => s.kind === 'assumption');
  out.push({
    id: 'materials.availability',
    category: 'materials',
    status: stockAssumed ? 'YELLOW' : 'GREEN',
    componentIds: [],
    title: stockAssumed ? tr('זמינות ומידות לוח לא אומתו מול ספק', 'Availability and sheet sizes not confirmed with a supplier') : tr('זמינות אומתה', 'Availability confirmed'),
    explanation: stockAssumed
      ? tr(
          `מידות הלוח (${m.stock.map((s) => `${s.lengthMm}×${s.widthMm}`).join(', ')}) הן מידות מקובלות שטרם אומתו מול מחסן עצים.`,
          `The sheet sizes (${m.stock.map((s) => `${s.lengthMm}×${s.widthMm}`).join(', ')}) are common sizes not yet confirmed with a timber merchant.`,
        )
      : tr('מידות הלוח אומתו מול ספק.', 'Sheet sizes confirmed with a supplier.'),
    assumptions: stockAssumed ? [tr('מידות לוח סטנדרטיות', 'Standard sheet sizes')] : [],
    sources: [],
    requiredVerification: stockAssumed ? tr('לאשר מידות לוח ועובי בפועל', 'Confirm actual sheet sizes and thickness') : undefined,
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
        ? tr('החומר לא נמצא.', 'The material was not found.')
        : E == null
          ? tr(
              `אין במערכת מודול אלסטיות מאומת ל-${m.nameHe} בעובי ${c.thicknessMm} מ"מ. לא בוצע חישוב — לא מנחשים ערכים.`,
              `The system has no verified modulus of elasticity for ${materialName(m, 'en')} at ${c.thicknessMm} mm. No calculation was made — values are never guessed.`,
            )
          : tr(`אין צפיפות ידועה ל-${m.nameHe}.`, `No known density for ${materialName(m, 'en')}.`),
      assumptions: [],
      sources: [],
      requiredVerification: tr('להוסיף נתון הנדסי ממקור מוסמך לעובי זה, או לבצע בדיקת עומס פיזית', 'Add engineering data from an authoritative source for this thickness, or carry out a physical load test'),
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
  const isShelf = c.role === 'shelf' || c.role === 'bottom';
  const assumptions: string[] = [
    isShelf
      ? tr('המדף מחושב כקורה פשוטה על שתי סמכות (שמרני ביחס לחיבור קשיח)', 'The shelf is calculated as a simply supported beam on two supports (conservative compared with a rigid joint)')
      : tr('הרכיב מחושב כקורה פשוטה על שתי סמכות (שמרני ביחס לחיבור קשיח)', 'The member is calculated as a simply supported beam on two supports (conservative compared with a rigid joint)'),
    ...(c.loadAssumption ? [c.loadAssumption] : []),
    load?.distribution === 'point_center'
      ? tr('העומס מרוכז במרכז המפתח', 'Point load at mid-span')
      : tr('העומס מפוזר באחידות לאורך המפתח', 'Uniformly distributed load along the span'),
    tr('כל העומס נחשב קבוע לאורך זמן (ψ2 = 1) — שמרני', 'The entire load is treated as permanent (ψ2 = 1) — conservative'),
    isShelf
      ? tr('רוחב החתך = עומק הלוח המלא; השפעת גב מחובר לא נלקחת בחשבון', 'Section width = full board depth; the stiffening effect of an attached back panel is ignored')
      : tr(`רוחב החתך = ${fmt(c.size.z, 0)} מ"מ (רוחב הלוח)`, `Section width = ${fmt(c.size.z, 0)} mm (board width)`),
  ];
  const sources = [SOURCES.ec5, ...props!.eBendingMpa.sources, ...(props!.fBendingMpa.sources ?? []), ...m.densityKgM3.sources].map((x) => localizeSource(x));
  if (props!.eBendingMpa.kind === 'standard_minimum')
    assumptions.push(tr('E הוא ערך מינימום של תקן המוצר — שמרני ביחס לממוצע', 'E is the minimum value from the product standard — conservative compared with the mean'));
  if (m.densityKgM3.kind === 'assumption') assumptions.push(localizedNote(m.densityKgM3) ?? tr('צפיפות מונחת', 'Assumed density'));
  if (m.hasGrain)
    assumptions.push(
      m.supplier
        ? tr('כיוון סיבי שכבת הפנים מקביל למפתח — מצוין ברשימת החלקים', 'Face-ply grain direction parallel to the span — stated in the parts list')
        : tr('כיוון הסיבים (או סיבי שכבת הפנים) מקביל למפתח — נאכף ברשימת החיתוך', 'Grain direction (or face-ply grain) parallel to the span — enforced in the cut list'),
    );

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
      capYellowReason = tr(
        `${m.nameHe} אינו מכוסה ב-Eurocode 5; מקדמי זחילה ומשך עומס נלקחו באנלוגיה (${ec5.cls}).`,
        `${materialName(m, 'en')} is not covered by Eurocode 5; the creep factor k_def and modification factor k_mod were taken by analogy (${ec5.cls}).`,
      );
      assumptions.push(capYellowReason);
    }
    if (m.densityKgM3.kind === 'assumption') capYellowReason ??= tr('צפיפות החומר מונחת ולא מאומתת.', 'the material density is assumed, not verified.');
    if (m.equivalence && !m.equivalence.confirmed) {
      capYellowReason ??= tr('נתוני החוזק מבוססים על חומר דומה ולא על מפרט הלוח עצמו.', "the strength data are based on a comparable material, not on the board's own datasheet.");
      assumptions.push(tr(`נתוני חוזק מושאלים: ${m.equivalence.noteHe}`, `Borrowed strength data: ${noteText(m.equivalence, 'en')}`));
    }

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
      [tr('מפתח L', 'Span L')]: tr(`${fmt(L, 0)} מ"מ`, `${fmt(L, 0)} mm`),
      [tr('עומק b', 'Depth b')]: tr(`${fmt(b, 0)} מ"מ`, `${fmt(b, 0)} mm`),
      [tr('עובי h', 'Thickness h')]: tr(`${h} מ"מ`, `${h} mm`),
      E: `${E.toLocaleString('he-IL')} MPa (${kindLabel(props!.eBendingMpa.kind)})`,
      'f_m': f != null ? `${f} MPa (${kindLabel(props!.fBendingMpa.kind)})` : tr('לא ידוע', 'unknown'),
      [tr('עומס', 'Load')]: tr(`${massKg} ק"ג`, `${massKg} kg`),
      [tr('משקל עצמי', 'Self-weight')]: tr(`${fmt((rho * b * h * L) / 1e9, 2)} ק"ג`, `${fmt((rho * b * h * L) / 1e9, 2)} kg`),
      k_def: kdefVal != null ? String(kdefVal) : tr('לא ידוע', 'unknown'),
    },
    result:
      finalMm != null
        ? tr(
            `δ_inst = ${fmt(instMm, 2)} מ"מ, δ_fin = ${fmt(finalMm, 2)} מ"מ (ירוק ≤ ${fmt(limitGreenMm, 2)}, אדום > ${fmt(limitRedMm, 2)})`,
            `δ_inst = ${fmt(instMm, 2)} mm, δ_fin = ${fmt(finalMm, 2)} mm (green ≤ ${fmt(limitGreenMm, 2)}, red > ${fmt(limitRedMm, 2)})`,
          ) + (stressRatio != null ? tr(`; ניצולת חוזק ${fmt(stressRatio * 100, 0)}%`, `; bending utilisation ${fmt(stressRatio * 100, 0)}%`) : '')
        : tr(`δ_inst = ${fmt(instMm, 2)} מ"מ; זחילה לא ידועה`, `δ_inst = ${fmt(instMm, 2)} mm; creep unknown`),
  };

  let explanation: string;
  if (status === 'RED') {
    explanation =
      stressRatio != null && stressRatio > 1
        ? tr(`${isShelf ? 'המדף' : 'הרכיב'} חורג מחוזק הכפיפה המחושב (ניצולת ${fmt(stressRatio * 100, 0)}%).`, `${isShelf ? 'The shelf' : 'The member'} exceeds its design bending strength (utilisation ${fmt(stressRatio * 100, 0)}%).`)
        : tr(
            `השקיעה הצפויה לאורך זמן (${fmt(finalMm!, 1)} מ"מ) חורגת מסף הכשל L/${config.deflectionRedRatio} = ${fmt(limitRedMm, 1)} מ"מ.`,
            `The expected long-term deflection (${fmt(finalMm!, 1)} mm) exceeds the failure limit L/${config.deflectionRedRatio} = ${fmt(limitRedMm, 1)} mm.`,
          );
  } else if (status === 'YELLOW') {
    explanation =
      finalMm != null && finalMm > limitGreenMm
        ? tr(
            `השקיעה הצפויה לאורך זמן (${fmt(finalMm, 1)} מ"מ) עוברת את יעד L/${config.deflectionGreenRatio} = ${fmt(limitGreenMm, 1)} מ"מ.`,
            `The expected long-term deflection (${fmt(finalMm, 1)} mm) exceeds the target L/${config.deflectionGreenRatio} = ${fmt(limitGreenMm, 1)} mm.`,
          )
        : tr(`החישוב עומד בספים, אך ${capYellowReason ?? 'חלק מהנתונים חסרים'}`, `The calculation is within the limits, but ${capYellowReason ?? 'some data are missing'}`);
  } else if (status === 'GREY') {
    explanation = tr('אין מקדמי Eurocode 5 לחומר זה — לא ניתן להעריך זחילה לאורך זמן.', 'No Eurocode 5 factors for this material — long-term creep cannot be estimated.');
  } else {
    explanation = tr(
      `עומד בכללי הבדיקה המוגדרים: δ_fin = ${fmt(finalMm!, 1)} מ"מ ≤ ${fmt(limitGreenMm, 1)} מ"מ, ניצולת חוזק ${fmt((stressRatio ?? 0) * 100, 0)}%.`,
      `Meets the configured check rules: δ_fin = ${fmt(finalMm!, 1)} mm ≤ ${fmt(limitGreenMm, 1)} mm, bending utilisation ${fmt((stressRatio ?? 0) * 100, 0)}%.`,
    );
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
    sources: [...new Map([...sources, ...CONFIG_SOURCES.deflection.map((x) => localizeSource(x))].map((s) => [s.title, s])).values()],
    requiredVerification: isShelf
      ? tr('בדיקת עומס פיזית על מדף לדוגמה (למשל לפי EN 16122) לפני ייצור סדרתי', 'Physical load test on a sample shelf (e.g. per EN 16122) before series production')
      : tr('בדיקת עומס פיזית על אב-טיפוס לפני שימוש', 'Physical load test on a prototype before use'),
  };
}

function structureChecks(model: FurnitureModel, config: EngineeringConfig, withFixes: boolean): Check[] {
  const loaded = model.components.filter((c) => !c.reference && c.spanMm != null && c.load && c.load.massKg > 0);
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
  const fixes = withFixes && governing && governing.a.status !== 'GREEN' ? projectStructureFixes(model.params, config) : [];
  const p = model.params;

  for (const { key, comps, a } of analyses) {
    const levels = [...new Set(comps.map((c) => c.name.replace(/ \((?:תא|bay) \d+\)$/, '')))];
    const name = levels.length > 1 ? tr(`${levels.join(', ')} (${comps.length} לוחות זהים)`, `${levels.join(', ')} (${comps.length} identical boards)`) : levels[0];
    out.push({
      id: `structure.deflection.${comps[0].id}`,
      category: 'structure',
      status: a.status,
      componentIds: comps.map((c) => c.id),
      title: `${name}: ${
        a.status === 'GREEN'
          ? tr('עומד בבדיקה', 'passes the check')
          : a.status === 'GREY'
            ? tr('לא ניתן לאמת', 'cannot be verified')
            : a.status === 'RED'
              ? tr('לא עומד בעומס המבוקש', 'does not carry the requested load')
              : tr('אזהרה', 'warning')
      }`,
      explanation: a.explanation,
      calculation: a.calculation,
      assumptions: a.assumptions,
      sources: a.sources,
      requiredVerification: a.requiredVerification,
      fixes: governing?.key === key ? fixes : [],
    });
  }
  if (!loaded.length && isOpenShelf(p)) {
    out.push({
      id: 'structure.no_load',
      category: 'structure',
      status: 'YELLOW',
      componentIds: [],
      title: tr('לא הוגדר עומס', 'No load defined'),
      explanation: tr('העומס למדף הוא 0 ק"ג — הבדיקה המבנית לא מייצגת שימוש אמיתי.', 'The load per shelf is 0 kg — the structural check does not represent real use.'),
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
    title: tr('חוזק חיבורים לא מחושב', 'Joint strength not calculated'),
    explanation: tr('כמות הברגים נקבעת לפי כלל אצבע מוצהר. עמידות החיבור בעומס לא מחושבת בגרסה זו.', 'The number of screws follows a stated rule of thumb. Joint load capacity is not calculated in this version.'),
    assumptions: [],
    sources: [],
    requiredVerification: tr('שימוש בברגים לפי הנחיות היצרן ובדיקת אב-טיפוס', "Use screws per the manufacturer's instructions and test a prototype"),
    fixes: [],
  });
  return out;
}

/** Deterministic fix search: every candidate is re-validated with the full engine before it is offered. */
export function projectStructureFixes(p: DesignParams, config: EngineeringConfig): ProjectedFix[] {
  const candidates: DesignChange[] = [...(isOpenShelf(p) ? [] : (templateFor(p).fixCandidates?.(p) ?? []))];
  const m = getMaterial(p.materialId);
  if (m) {
    for (const t of m.thicknessesMm.filter((t) => t > p.thicknessMm && propertiesFor(m, t))) {
      candidates.push({ label: tr(`הגדלת עובי ל-${t} מ"מ`, `Increase thickness to ${t} mm`), set: { thicknessMm: t } });
    }
  }
  if (isOpenShelf(p)) {
    // The two nearest divider counts, plus the smallest count up to the maximum that actually passes —
    // a wide unit with a heavy load may need more than two extra dividers.
    const max = LIMITS.dividerCount[1];
    const counts = new Set<number>();
    for (let d = p.dividerCount + 1; d <= Math.min(p.dividerCount + 2, max); d++) counts.add(d);
    for (let d = p.dividerCount + 3; d <= max; d++) {
      if (governingShelf({ ...p, dividerCount: d }, config)?.passesLimits) {
        counts.add(d);
        break;
      }
    }
    for (const d of counts) {
      const added = d - p.dividerCount;
      candidates.push({
        label: added === 1 ? tr(`הוספת מחיצה אנכית (${d} סה"כ)`, `Add a vertical divider (${d} in total)`) : tr(`הוספת ${added} מחיצות אנכיות (${d} סה"כ)`, `Add ${added} vertical dividers (${d} in total)`),
        set: { dividerCount: d },
      });
    }
  }
  const pool = m?.supplier
    ? allMaterials().filter((x) => x.supplier?.supplierId === m.supplier!.supplierId && x.structuralUse && x.properties.length > 0)
    : allMaterials().filter((x) => !x.supplier && x.structuralUse && x.verified);
  for (const alt of pool.filter((x) => x.id !== p.materialId)) {
    const t = alt.thicknessesMm.filter((t) => propertiesFor(alt, t)).sort((a, b) => Math.abs(a - p.thicknessMm) - Math.abs(b - p.thicknessMm))[0];
    const altFinish = supplierProductFor(alt)?.product.finishes[0];
    if (t != null)
      candidates.push({
        label: alt.supplier ? tr(`החלפה ל${alt.nameHe}`, `Switch to ${materialName(alt, 'en')}`) : tr(`החלפת חומר ל-${alt.nameHe} ${t} מ"מ`, `Change material to ${materialName(alt, 'en')} ${t} mm`),
        set: { materialId: alt.id, thicknessMm: t, ...(altFinish ? { finishId: altFinish.id } : {}) } });
  }

  const run = (set: DesignChange['set']) => governingShelf({ ...p, ...set } as DesignParams, config);
  const passes = (set: DesignChange['set']) => run(set)?.passesLimits ?? false;

  const out: ProjectedFix[] = [];
  const partial: ProjectedFix[] = [];
  for (const change of candidates) {
    const g = run(change.set);
    if (g?.passesLimits) out.push({ change, projectedStatus: g.status, projectedDetail: g.status === 'GREEN' ? tr('עומד בבדיקות המבנה', 'Passes the structural checks') : tr('עומד בספים; נשארת אזהרת נתונים', 'Within the limits; a data warning remains') });
    else if (g && g.status !== 'RED' && g.status !== 'GREY')
      partial.push({ change, projectedStatus: 'YELLOW', projectedDetail: tr('יוצא מכשל, אבל השקיעה עדיין מעל היעד', 'No longer fails, but the deflection is still above the target') });
  }
  // Open shelves always get width/load limits that pass; other templates show changes that at least leave failure.
  if (!out.length && !isOpenShelf(p)) out.push(...partial);

  const rank = (f: ProjectedFix) => (f.projectedStatus === 'GREEN' ? 0 : 1);
  if (!isOpenShelf(p)) return out.sort((a, b) => rank(a) - rank(b)).slice(0, 6);
  const bestWidth = searchMax(LIMITS.widthMm[0], p.widthMm - 10, 10, (w) => passes({ widthMm: w }));
  if (bestWidth != null) {
    const s = run({ widthMm: bestWidth })!.status;
    out.push({ change: { label: tr(`הקטנת רוחב ל-${bestWidth} מ"מ`, `Reduce width to ${bestWidth} mm`), set: { widthMm: bestWidth } }, projectedStatus: s, projectedDetail: tr('הרוחב המרבי שעומד בספים', 'The maximum width within the limits') });
  }
  const bestLoad = searchMax(1, p.loadPerShelf.massKg - 1, 1, (kg) => passes({ loadPerShelf: { ...p.loadPerShelf, massKg: kg } }));
  if (bestLoad != null) {
    const set = { loadPerShelf: { ...p.loadPerShelf, massKg: bestLoad } };
    out.push({ change: { label: tr(`הגבלת עומס ל-${bestLoad} ק"ג למדף`, `Limit load to ${bestLoad} kg per shelf`), set }, projectedStatus: run(set)!.status, projectedDetail: tr('העומס המרבי שעומד בספים', 'The maximum load within the limits') });
  }

  return out.sort((a, b) => rank(a) - rank(b)).slice(0, 6);
}

/** Worst loaded horizontal member of a design; `passesLimits` ignores data-quality caps. */
export function governingShelf(p: DesignParams, config: EngineeringConfig): (ShelfAnalysis & { passesLimits: boolean }) | null {
  const model = buildModel(p);
  if (model.components.some((c) => c.size.x <= 0 || c.size.y <= 0 || c.size.z <= 0)) return null;
  const loaded = model.components.filter((c) => !c.reference && c.spanMm != null && c.load);
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
      title: tr('יציבות נגד התהפכות לא מחושבת', 'Tip-over stability not calculated'),
      explanation: tr(
        `יחס גובה לעומק ${fmt(p.heightMm / p.depthMm, 1)}. בגרסה זו המערכת לא מחשבת התהפכות. יש לעגן לקיר.`,
        `Height-to-depth ratio ${fmt(p.heightMm / p.depthMm, 1)}. This version does not calculate tip-over. Anchor the unit to the wall.`,
      ),
      assumptions: [],
      sources: [],
      requiredVerification: tr('עיגון לקיר עם ערכת נגד-התהפכות המתאימה לסוג הקיר', 'Wall anchoring with an anti-tip kit suited to the wall type'),
      fixes: [],
    },
  ];
  if (!p.hasBack) {
    out.push({
      id: 'stability.racking',
      category: 'stability',
      status: 'YELLOW',
      componentIds: [],
      title: tr('אין גב — אין התנגדות לעיוות צידי', 'No back panel — no resistance to racking'),
      explanation: tr(
        'בלי גב או חיזוק אלכסוני, היחידה עלולה להתעוות לצדדים (racking) כי חיבורי ברגים לבדם אינם קשיחים.',
        'Without a back panel or diagonal bracing the unit may distort sideways (racking), because screw joints alone are not rigid.',
      ),
      assumptions: [],
      sources: [],
      fixes: [{ change: { label: tr('הוספת גב', 'Add a back panel'), set: { hasBack: true } }, projectedStatus: 'GREEN', projectedDetail: tr('גב מחובר מקשיח את המסגרת', 'An attached back panel stiffens the frame') }],
    });
  }
  return out;
}

function shelfPinCheck(model: FurnitureModel): Check {
  const shelves = model.components.filter((c) => c.role === 'shelf');
  const bottom = model.components.find((c) => c.role === 'bottom');
  const clearance = shelves.length && bottom ? (bottom.size.x - shelves[0].size.x) / 2 : 0;
  return {
    id: 'assembly.shelf_pins',
    category: 'assembly',
    status: 'YELLOW',
    componentIds: shelves.map((c) => c.id),
    title: tr(`מדפים מתכווננים: מרווח ${fmt(clearance, 1)} מ"מ מכל צד`, `Adjustable shelves: ${fmt(clearance, 1)} mm clearance each side`),
    explanation: tr(
      `המדף מוזמן בס"מ שלמים, ולכן קצר מהתא ב-${fmt(clearance * 2, 0)} מ"מ. תומך המדף צריך לבלוט מהדופן יותר מ-${fmt(clearance, 1)} מ"מ כדי שהמדף יישען עליו. הקידוחים לפי שיטת 32 מ"מ.`,
      `The shelf is ordered in whole centimetres, so it is ${fmt(clearance * 2, 0)} mm shorter than the bay. The shelf support must stick out from the panel by more than ${fmt(clearance, 1)} mm for the shelf to rest on it. Holes follow the 32 mm system.`,
    ),
    assumptions: [
      tr('מדף מתכוונן מחושב כקורה פשוטה בין התומכים', 'An adjustable shelf is calculated as a simple beam between its supports'),
      tr('שורה אחורית במרחק 37 מ"מ מהקצה האחורי — סימטרי לשורה הקדמית (החלטת מוצר)', 'Back row 37 mm from the back edge — mirrors the front row (product decision)'),
    ],
    sources: [localizeSource(SOURCES.system32)],
    requiredVerification: tr('לבחור תומך מדף לפי מפרט היצרן ולבדוק שהמדף יציב עליו', 'Choose a shelf support from its maker’s datasheet and check the shelf sits firmly on it'),
    fixes: [],
  };
}

function supplierOrderCheck(model: FurnitureModel): Check | null {
  const quote = buildSupplierQuote(model);
  if (!quote) return null;
  const p = model.params;
  if (!quote.issues.length) {
    return {
      id: 'manufacturing.supplier',
      category: 'manufacturing',
      status: 'GREEN',
      componentIds: [],
      title: tr('כל החלקים ניתנים להזמנה', 'All parts can be ordered'),
      explanation: tr(
        `${quote.lines.length} שורות הזמנה, בס"מ שלמים ובתוך מגבלות החיתוך. עלות משוערת ₪${quote.totalIls.toLocaleString('he-IL')} כולל משלוח.`,
        `${quote.lines.length} order lines, in whole centimetres and within the cutting limits. Estimated cost ₪${quote.totalIls.toLocaleString('he-IL')} including shipping.`,
      ),
      assumptions: quote.assumptions,
      sources: [],
      fixes: [],
    };
  }
  const fixes: ProjectedFix[] = [];
  // Issue codes keep fix detection independent of the output language.
  const hasIssue = (code: QuoteIssueCode) => quote.lines.some((l) => l.issueCodes.includes(code));
  if (hasIssue('edge_unavailable'))
    fixes.push({ change: { label: tr('ללא קנטים', 'No edge banding'), set: { edgeOption: 'none' } }, projectedStatus: 'GREEN', projectedDetail: tr('חומר זה נמכר ללא קנט', 'This material is sold without edge banding') });
  if (hasIssue('too_small') && isOpenShelf(p) && p.plinthHeightMm > 0) {
    fixes.push({ change: { label: tr('סוקל בגובה 10 ס"מ', 'Plinth 10 cm high'), set: { plinthHeightMm: 100 } }, projectedStatus: 'GREEN', projectedDetail: tr('המינימום לחיתוך', 'The minimum cut size') });
    fixes.push({ change: { label: tr('ללא סוקל', 'No plinth'), set: { plinthHeightMm: 0 } }, projectedStatus: 'GREEN', projectedDetail: '' });
  }
  if (hasIssue('too_large') && isOpenShelf(p)) {
    const maxLong = quote.supplier.products[0]?.limits.maxLongMm ?? 2400;
    if (p.heightMm > maxLong) fixes.push({ change: { label: tr(`גובה ${maxLong / 10} ס"מ (המקסימום לחיתוך)`, `Height ${maxLong / 10} cm (the maximum cut)`), set: { heightMm: maxLong } }, projectedStatus: 'GREEN', projectedDetail: '' });
    if (p.widthMm > maxLong) fixes.push({ change: { label: tr(`רוחב ${maxLong / 10} ס"מ (המקסימום לחיתוך)`, `Width ${maxLong / 10} cm (the maximum cut)`), set: { widthMm: maxLong } }, projectedStatus: 'GREEN', projectedDetail: '' });
    fixes.push({ change: { label: tr('רוחב 118 ס"מ (הגב נכנס בחתיכה אחת)', 'Width 118 cm (back panel fits in one piece)'), set: { widthMm: 1180 } }, projectedStatus: 'YELLOW', projectedDetail: tr('לבדוק שוב', 'Re-check') });
    if (p.hasBack)
      fixes.push({ change: { label: tr('ללא גב (פחות קשיחות לצדדים — ראו יציבות)', 'No back panel (less sideways stiffness — see stability)'), set: { hasBack: false } }, projectedStatus: 'YELLOW', projectedDetail: tr('מוריד קשיחות', 'Reduces stiffness') });
  }
  // Offer only changes that really make every part orderable (re-quoted, not guessed).
  const verified = fixes.filter((f) => {
    const after = buildSupplierQuote(buildModel({ ...p, ...f.change.set, template: p.template } as DesignParams));
    return after != null && after.issues.length === 0;
  });
  return {
    id: 'manufacturing.supplier',
    category: 'manufacturing',
    status: 'RED',
    componentIds: model.parts.filter((pt) => quote.issues.some((i) => i.startsWith(`${pt.id}:`))).flatMap((pt) => pt.componentIds),
    title: tr('חלקים שלא ניתן להזמין', 'Parts that cannot be ordered'),
    explanation: quote.issues.join(' · '),
    assumptions: [],
    sources: [],
    fixes: verified,
  };
}

function manufacturingChecks(model: FurnitureModel, config: EngineeringConfig): Check[] {
  const supplierCheck = supplierOrderCheck(model);
  if (supplierCheck) return [supplierCheck];
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
        title: tr('חלקים גדולים מהלוח', 'Parts larger than the sheet'),
        explanation: tr(`${partIds.join(', ')}: ${unplaced[0].reason}. ייצוא חסום.`, `${partIds.join(', ')}: ${unplaced[0].reason}. Export is blocked.`),
        assumptions: [tr(`שולי ניקוי ${config.trimMarginMm} מ"מ מכל צד`, `Trim margin of ${config.trimMarginMm} mm on every edge`)],
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
      title: tr('כל החלקים נכנסים ללוחות', 'All parts fit on the sheets'),
      explanation: tr(
        `${model.parts.reduce((a, pt) => a + pt.quantity, 0)} חלקים על ${sheets} לוחות, עם להב ${config.kerfMm} מ"מ ושוליים ${config.trimMarginMm} מ"מ.`,
        `${model.parts.reduce((a, pt) => a + pt.quantity, 0)} parts on ${sheets} sheets, with a ${config.kerfMm} mm kerf and ${config.trimMarginMm} mm trim margins.`,
      ),
      assumptions: [tr('חיתוך גיליוטינה (מסור פאנלים)', 'Guillotine cutting (panel saw)'), tr('כיוון סיבים לאורך הלוח', 'Grain direction along the sheet length')],
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
    title: tr('רצף הרכבה נוצר', 'Assembly sequence generated'),
    explanation: tr(
      `רצף הרכבה נגזר מ-${model.components.length} רכיבים. זו בדיקה תוכנתית של שלמות — לא אימות מעשי.`,
      `The assembly sequence was derived from ${model.components.length} components. This is a software completeness check — not a practical verification.`,
    ),
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
    title: tr('נדרש אימות פיזי', 'Physical verification required'),
    explanation: tr(
      'תקני ריהוט (למשל EN 14749, EN 16122) דורשים בדיקות פיזיות של חוזק ויציבות. המערכת לא טוענת לעמידה בתקן.',
      'Furniture standards (e.g. EN 14749, EN 16122) require physical strength and stability tests. The system does not claim compliance with any standard.',
    ),
    assumptions: [],
    sources: [],
    requiredVerification: tr('בדיקה פיזית / אישור איש מקצוע', 'Physical test / approval by a qualified professional'),
    fixes: [],
  };
}

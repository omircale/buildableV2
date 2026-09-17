import { DEFAULT_CONFIG, type EngineeringConfig } from './config';
import { tr, withEngineLocale, type EngineLocale } from './i18n';
import { buildBom, type Bom } from './manufacturing/bom';
import { nestParts, type NestingGroupResult } from './manufacturing/nesting';
import { getMaterial } from './materials';
import { buildSupplierQuote, type SupplierQuote } from './suppliers/quote';
import { buildModel, templateFor } from './templates/registry';
import { isOpenShelf, type AssemblyStep, type Component, type DesignChange, type DesignParams, type FurnitureModel, type ValidationReport } from './types';
import { validate } from './validation/validate';

export const ENGINE_VERSION = '0.1.0';

export interface DesignResult {
  model: FurnitureModel;
  report: ValidationReport;
  nesting: NestingGroupResult[];
  bom: Bom;
  assembly: AssemblyStep[];
  quote: SupplierQuote | null;
}

/**
 * The single pure pipeline: params → geometry → validation → manufacturing. Used by UI, exports and tests.
 * `locale` selects the language of every human-readable string in the result (default Hebrew); the
 * previous engine locale is restored when the run ends.
 */
export function runDesign(params: DesignParams, config: EngineeringConfig = DEFAULT_CONFIG, locale: EngineLocale = 'he'): DesignResult {
  return withEngineLocale(locale, () => {
    const model = buildModel(params);
    const report = validate(model, { config });
    const nesting = nestParts(model.parts, getMaterial, { kerfMm: config.kerfMm, trimMarginMm: config.trimMarginMm });
    return { model, report, nesting, bom: buildBom(model, nesting, getMaterial), assembly: assemblySequence(model), quote: buildSupplierQuote(model) };
  });
}

export function applyChange<P extends DesignParams>(params: P, change: DesignChange): P {
  return { ...params, ...change.set, template: params.template } as P;
}

export function assemblySequence(model: FurnitureModel): AssemblyStep[] {
  const p = model.params;
  if (!isOpenShelf(p)) return templateFor(p).assembly?.(model) ?? [];
  const by = (role: Component['role']) => model.components.filter((c) => c.role === role).map((c) => c.id);
  const steps: Omit<AssemblyStep, 'n'>[] = [];
  if (p.plinthHeightMm > 0) steps.push({ title: tr('חיבור הסוקל לדופן אחת', 'Attach the plinth to one side panel'), componentIds: [...by('plinth'), 'side_l'], hardware: ['joint_screw'] });
  steps.push({ title: tr('חיבור התחתית לדופן השמאלית (הדופן שוכבת על הרצפה)', 'Attach the bottom to the left side panel (with the side panel lying on the floor)'), componentIds: [...by('bottom'), 'side_l'], hardware: ['joint_screw'] });
  steps.push({ title: tr('חיבור הגג לדופן השמאלית', 'Attach the top to the left side panel'), componentIds: [...by('top'), 'side_l'], hardware: ['joint_screw'] });
  if (by('divider').length) steps.push({ title: tr('הצבת המחיצות בין התחתית לגג', 'Fit the dividers between the bottom and the top'), componentIds: by('divider'), hardware: ['joint_screw'] });
  const pins = p.shelfMounting === 'pins';
  if (!pins) steps.push({ title: tr('הצבת המדפים במקומם', 'Fit the shelves in place'), componentIds: by('shelf'), hardware: ['joint_screw'] });
  steps.push({ title: tr('סגירה עם הדופן הימנית', 'Close the carcass with the right side panel'), componentIds: ['side_r'], hardware: ['joint_screw'] });
  if (by('door').length) steps.push({ title: tr('הרכבת הצירים ותליית הדלתות, כיוון המרווחים', 'Fit the hinges, hang the doors and adjust the gaps'), componentIds: by('door'), hardware: ['hinge', 'handle'] });
  if (p.hasBack)
    steps.push({
      title: tr('יישור לזווית ישרה (מדידת אלכסונים שווים) וקיבוע הגב', 'Square the carcass (equal diagonals) and fix the back panel'),
      componentIds: by('back'),
      hardware: ['back_fixing'],
      warning: tr('הגב הוא שקובע את הריבועיות — למדוד אלכסונים לפני הברגה', 'The back panel sets the squareness — measure the diagonals before screwing'),
    });
  if (pins && by('shelf').length)
    steps.push({ title: tr('הכנסת תומכי המדף בגובה הרצוי והנחת המדפים', 'Push the shelf supports in at the height you want and lay the shelves on them'), componentIds: by('shelf'), hardware: ['shelf_pin'], warning: tr('4 תומכים לכל מדף, באותו גובה', '4 supports per shelf, at the same height') });
  steps.push({
    title: tr('העמדה ועיגון לקיר', 'Stand the unit up and anchor it to the wall'),
    componentIds: [],
    hardware: ['wall_anchor'],
    warning: tr('אין להעמיס את היחידה לפני עיגון', 'Do not load the unit before it is anchored'),
  });
  return steps.map((s, i) => ({ ...s, n: i + 1 }));
}

export interface ChangeImpact {
  changedParams: string[];
  addedComponents: string[];
  removedComponents: string[];
  resizedComponents: string[];
  cutListChanged: boolean;
  sheetsBefore: number;
  sheetsAfter: number;
  statusChanges: { category: string; from: string; to: string }[];
}

export function changeImpact(before: DesignResult, after: DesignResult): ChangeImpact {
  const b = new Map(before.model.components.map((c) => [c.id, c]));
  const a = new Map(after.model.components.map((c) => [c.id, c]));
  const same = (x: Component, y: Component) => JSON.stringify([x.origin, x.size, x.materialId]) === JSON.stringify([y.origin, y.size, y.materialId]);
  const bp = before.model.params as unknown as Record<string, unknown>;
  const ap = after.model.params as unknown as Record<string, unknown>;
  const sheets = (r: DesignResult) => r.nesting.reduce((s, g) => s + g.sheets.length, 0);
  return {
    changedParams: Object.keys(ap).filter((k) => JSON.stringify(ap[k]) !== JSON.stringify(bp[k])),
    addedComponents: [...a.keys()].filter((k) => !b.has(k)),
    removedComponents: [...b.keys()].filter((k) => !a.has(k)),
    resizedComponents: [...a.keys()].filter((k) => b.has(k) && !same(a.get(k)!, b.get(k)!)),
    cutListChanged: JSON.stringify(before.model.parts.map(({ id: _id, ...r }) => r)) !== JSON.stringify(after.model.parts.map(({ id: _id, ...r }) => r)),
    sheetsBefore: sheets(before),
    sheetsAfter: sheets(after),
    statusChanges: Object.entries(after.report.coverage)
      .filter(([k, v]) => before.report.coverage[k as keyof ValidationReport['coverage']] !== v)
      .map(([k, v]) => ({ category: k, from: before.report.coverage[k as keyof ValidationReport['coverage']], to: v })),
  };
}

export * from './types';
export {
  ENGINE_LOCALES,
  addonName,
  edgeOptionName,
  finishName,
  getEngineLocale,
  localizeSource,
  localized,
  localizedNote,
  materialDescription,
  materialName,
  noteText,
  productDescription,
  productTitle,
  setEngineLocale,
  supplierName,
  tr,
  withEngineLocale,
} from './i18n';
export type { EngineLocale } from './i18n';
export { DEFAULT_CONFIG } from './config';
export type { EngineeringConfig } from './config';
export { DEFAULT_OPEN_SHELF, buildOpenShelf, hingesForDoor } from './templates/openShelf';
export { finishFor } from './templates/common';
export { DEFAULT_SINGLE_BED, DEFAULT_DOUBLE_BED, DEFAULT_FLOOR_BED, bedLayout } from './templates/bed';
export { DEFAULT_DESK, DEFAULT_BENCH, DEFAULT_COFFEE_TABLE, DEFAULT_NIGHTSTAND } from './templates/table';
export { DEFAULT_CHAIR, DEFAULT_KIDS_CHAIR } from './templates/chair';
export { DEFAULT_PULLUP } from './templates/pullup';
export { TEMPLATES, buildModel, templateFor, withDefaults } from './templates/registry';
export { MATERIAL_LIBRARY, SUPPLIERS, SUPPLIER_MATERIALS, allMaterials, getMaterial, propertiesFor, setCustomMaterials, supplierProductFor, SOURCES } from './materials';
export type { SupplierQuote, QuoteLine, QuoteIssueCode } from './suppliers/quote';
export type { Supplier, SupplierProduct } from './suppliers/types';
export { HAYOZRIM_EXCLUDED, FINISH_NAMES_EN, finishDisplayName } from './suppliers/hayozrim';
export { cutListCsv } from './manufacturing/bom';
export type { Bom } from './manufacturing/bom';
export type { NestingGroupResult } from './manufacturing/nesting';

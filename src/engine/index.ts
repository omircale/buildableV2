import { DEFAULT_CONFIG, type EngineeringConfig } from './config';
import { buildBom, type Bom } from './manufacturing/bom';
import { nestParts, type NestingGroupResult } from './manufacturing/nesting';
import { getMaterial } from './materials';
import { buildOpenShelf } from './templates/openShelf';
import type { Component, DesignChange, FurnitureModel, OpenShelfParams, ValidationReport } from './types';
import { validate } from './validation/validate';

export const ENGINE_VERSION = '0.1.0';

export interface DesignResult {
  model: FurnitureModel;
  report: ValidationReport;
  nesting: NestingGroupResult[];
  bom: Bom;
  assembly: AssemblyStep[];
}

/** The single pure pipeline: params → geometry → validation → manufacturing. Used by UI, exports and tests. */
export function runDesign(params: OpenShelfParams, config: EngineeringConfig = DEFAULT_CONFIG): DesignResult {
  const model = buildOpenShelf(params);
  const report = validate(model, { config });
  const nesting = nestParts(model.parts, getMaterial, { kerfMm: config.kerfMm, trimMarginMm: config.trimMarginMm });
  return { model, report, nesting, bom: buildBom(model, nesting, getMaterial), assembly: assemblySequence(model) };
}

export function applyChange(params: OpenShelfParams, change: DesignChange): OpenShelfParams {
  return { ...params, ...change.set, template: 'open_shelf' };
}

export interface AssemblyStep {
  n: number;
  title: string;
  componentIds: string[];
  hardware: string[];
  warning?: string;
}

export function assemblySequence(model: FurnitureModel): AssemblyStep[] {
  const by = (role: Component['role']) => model.components.filter((c) => c.role === role).map((c) => c.id);
  const steps: Omit<AssemblyStep, 'n'>[] = [];
  const p = model.params;
  if (p.plinthHeightMm > 0) steps.push({ title: 'חיבור הסוקל לדופן אחת', componentIds: [...by('plinth'), 'side_l'], hardware: ['joint_screw'] });
  steps.push({ title: 'חיבור התחתית לדופן השמאלית (הדופן שוכבת על הרצפה)', componentIds: [...by('bottom'), 'side_l'], hardware: ['joint_screw'] });
  steps.push({ title: 'חיבור הגג לדופן השמאלית', componentIds: [...by('top'), 'side_l'], hardware: ['joint_screw'] });
  if (by('divider').length) steps.push({ title: 'הצבת המחיצות בין התחתית לגג', componentIds: by('divider'), hardware: ['joint_screw'] });
  steps.push({ title: 'הצבת המדפים במקומם', componentIds: by('shelf'), hardware: ['joint_screw'] });
  steps.push({ title: 'סגירה עם הדופן הימנית', componentIds: ['side_r'], hardware: ['joint_screw'] });
  if (p.hasBack)
    steps.push({
      title: 'יישור לזווית ישרה (מדידת אלכסונים שווים) וקיבוע הגב',
      componentIds: by('back'),
      hardware: ['back_screw'],
      warning: 'הגב הוא שקובע את הריבועיות — למדוד אלכסונים לפני הברגה',
    });
  steps.push({ title: 'העמדה ועיגון לקיר', componentIds: [], hardware: ['wall_anchor'], warning: 'אין להעמיס את היחידה לפני עיגון' });
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
export { DEFAULT_CONFIG } from './config';
export type { EngineeringConfig } from './config';
export { DEFAULT_OPEN_SHELF, buildOpenShelf } from './templates/openShelf';
export { MATERIAL_LIBRARY, allMaterials, getMaterial, propertiesFor, setCustomMaterials, SOURCES } from './materials';
export { cutListCsv } from './manufacturing/bom';
export type { Bom } from './manufacturing/bom';
export type { NestingGroupResult } from './manufacturing/nesting';

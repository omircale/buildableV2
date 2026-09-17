import { tr } from '../i18n';
import type { AssemblyStep, BedParams, ChairParams, Check, DesignChange, DesignParams, FurnitureModel, OpenShelfParams, PullUpParams, TableParams, TemplateId } from '../types';
import { BED_LIMITS, DEFAULT_SINGLE_BED, bedAssembly, bedChecks, bedFixCandidates, buildBed } from './bed';
import { CHAIR_LIMITS, DEFAULT_CHAIR, buildChair, chairAssembly, chairChecks, chairFixCandidates } from './chair';
import { DEFAULT_OPEN_SHELF, buildOpenShelf } from './openShelf';
import { DEFAULT_PULLUP, PULLUP_LIMITS, buildPullUp, pullUpAssembly, pullUpChecks } from './pullup';
import { DEFAULT_DESK, TABLE_LIMITS, buildTable, tableAssembly, tableChecks, tableFixCandidates } from './table';

export interface RangeLimit {
  key: string;
  min: number;
  max: number;
  he: string;
  en: string;
}

export interface TemplateDef<P extends DesignParams = DesignParams> {
  id: TemplateId;
  defaults: P;
  limits: readonly RangeLimit[];
  build(p: P): FurnitureModel;
  /** Template-specific geometry, stability and safety checks (open shelf keeps its own in validate.ts). */
  checks?(model: FurnitureModel): Check[];
  /** Candidate changes re-validated by the generic structural fix search. */
  fixCandidates?(p: P): DesignChange[];
  assembly?(model: FurnitureModel): AssemblyStep[];
}

const OPEN_SHELF_LIMITS: readonly RangeLimit[] = [
  { key: 'widthMm', min: 200, max: 2400, he: 'רוחב', en: 'Width' },
  { key: 'heightMm', min: 200, max: 2700, he: 'גובה', en: 'Height' },
  { key: 'depthMm', min: 150, max: 800, he: 'עומק', en: 'Depth' },
  { key: 'shelfCount', min: 0, max: 12, he: 'מספר מדפים', en: 'Number of shelves' },
  { key: 'dividerCount', min: 0, max: 6, he: 'מספר מחיצות', en: 'Number of dividers' },
  { key: 'plinthHeightMm', min: 0, max: 200, he: 'גובה סוקל', en: 'Plinth height' },
];

export const TEMPLATES: { [K in TemplateId]: TemplateDef<Extract<DesignParams, { template: K }>> } = {
  open_shelf: { id: 'open_shelf', defaults: DEFAULT_OPEN_SHELF, limits: OPEN_SHELF_LIMITS, build: buildOpenShelf },
  bed: { id: 'bed', defaults: DEFAULT_SINGLE_BED, limits: BED_LIMITS, build: buildBed, checks: bedChecks, fixCandidates: bedFixCandidates, assembly: bedAssembly },
  table: { id: 'table', defaults: DEFAULT_DESK, limits: TABLE_LIMITS, build: buildTable, checks: tableChecks, fixCandidates: tableFixCandidates, assembly: tableAssembly },
  chair: { id: 'chair', defaults: DEFAULT_CHAIR, limits: CHAIR_LIMITS, build: buildChair, checks: chairChecks, fixCandidates: chairFixCandidates, assembly: chairAssembly },
  pullup: { id: 'pullup', defaults: DEFAULT_PULLUP, limits: PULLUP_LIMITS, build: buildPullUp, checks: pullUpChecks, assembly: pullUpAssembly },
};

export function templateFor(p: DesignParams): TemplateDef {
  return TEMPLATES[p.template] as unknown as TemplateDef;
}

export function buildModel(p: DesignParams): FurnitureModel {
  return templateFor(p).build(p);
}

/** Fills fields missing from stored/imported params with the template's defaults; null for unknown templates. */
export function withDefaults(raw: unknown): DesignParams | null {
  const p = raw as Partial<DesignParams> | null;
  if (!p || typeof p !== 'object' || !p.template || !(p.template in TEMPLATES)) return null;
  const d = TEMPLATES[p.template as TemplateId].defaults;
  const defined = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
  return { ...d, ...defined, finish: { ...d.finish, ...(p.finish ?? {}) } } as DesignParams;
}

export function rangeLabel(l: RangeLimit): string {
  return tr(l.he, l.en);
}

export type { BedParams, ChairParams, OpenShelfParams, PullUpParams, TableParams };

// All lengths in millimetres, masses in kg, forces in N, stresses/moduli in MPa (N/mm²).

export type Status = 'GREEN' | 'YELLOW' | 'RED' | 'GREY';

export type ValueKind =
  | 'mean' // mean value from test data / strength class table
  | 'characteristic' // 5th-percentile value used for design
  | 'standard_minimum' // minimum requirement from a product standard (conservative)
  | 'manufacturer' // manufacturer datasheet
  | 'user_provided' // entered by a user, unverified
  | 'assumption'; // product decision, not a physical claim

export interface Source {
  title: string;
  reference: string; // table / clause
  url?: string;
}

export interface SourcedValue {
  value: number | null; // null = UNKNOWN, never guessed
  kind: ValueKind;
  sources: Source[];
  note?: string;
}

export type MaterialCategory = 'mdf' | 'particleboard' | 'plywood' | 'osb' | 'solid_softwood' | 'solid_hardwood' | 'custom';

/** Eurocode 5 behaviour class used to look up kmod / kdef / gammaM. */
export type Ec5Class = 'solid_timber' | 'plywood' | 'osb3' | 'particleboard_p4' | 'particleboard_p6' | 'mdf_la' | 'not_covered';

export interface StockSize {
  lengthMm: number;
  widthMm: number;
  kind: ValueKind;
  note?: string;
}

/** Mechanical properties are only valid for the thickness range they were published for. */
export interface ThicknessProperties {
  minMm: number; // exclusive lower bound, as in EN 622-5 / EN 312 ranges (">12–19")
  maxMm: number; // inclusive upper bound
  /** Bending modulus along the span direction (parallel to grain / face grain). */
  eBendingMpa: SourcedValue;
  /** Bending strength along the span direction. */
  fBendingMpa: SourcedValue;
}

export interface Material {
  id: string;
  nameHe: string;
  nameEn: string;
  descriptionHe: string;
  category: MaterialCategory;
  ec5Class: Ec5Class;
  /** EC5 class borrowed for creep / duration factors when the material is not covered by EC5. */
  ec5AnalogyClass?: Exclude<Ec5Class, 'not_covered'>;
  thicknessesMm: number[];
  densityKgM3: SourcedValue;
  properties: ThicknessProperties[];
  structuralUse: boolean; // false → back panels etc., never used as a loaded member
  hasGrain: boolean;
  stock: StockSize[];
  defaultColor: string;
  verified: boolean;
}

export type LoadDistribution = 'uniform' | 'point_center';

export interface ShelfLoad {
  label: string;
  massKg: number;
  distribution: LoadDistribution;
}

/** Parameters of the Phase-1 open shelf unit. The model is always derived from these. */
export interface OpenShelfParams {
  template: 'open_shelf';
  widthMm: number;
  heightMm: number;
  depthMm: number;
  materialId: string;
  thicknessMm: number;
  shelfCount: number; // intermediate shelves (excludes top & bottom)
  dividerCount: number; // vertical dividers splitting the span
  hasBack: boolean;
  backMaterialId: string;
  backThicknessMm: number;
  plinthHeightMm: number; // 0 = no plinth
  loadPerShelf: ShelfLoad;
  edgeBandMm: number; // 0 = none; applied to front edges
  finish: FinishSpec;
}

export interface FinishSpec {
  type: 'natural' | 'stained' | 'painted' | 'lacquered';
  sheen: 'matte' | 'satin' | 'gloss';
  color: string; // presentation only — never affects structure
}

export type ComponentRole = 'side' | 'top' | 'bottom' | 'shelf' | 'divider' | 'back' | 'plinth';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * A physical board. Geometry is an axis-aligned box: `origin` is its min corner in furniture space
 * (x = width, y = height, z = depth; z=0 is the back plane), `size` its extents.
 */
export interface Component {
  id: string;
  name: string;
  role: ComponentRole;
  materialId: string;
  thicknessMm: number;
  origin: Vec3;
  size: Vec3;
  /** For horizontal members: the unsupported span along x. */
  spanMm?: number;
  load?: ShelfLoad;
  grainAxis?: 'x' | 'y' | 'z';
}

export interface Part {
  id: string;
  componentIds: string[];
  name: string;
  materialId: string;
  thicknessMm: number;
  lengthMm: number; // along grain when material has grain
  widthMm: number;
  quantity: number;
  grainLocked: boolean;
  edgeBanding: { length1: number; length2: number; width1: number; width2: number };
}

export interface HardwareLine {
  id: string;
  name: string;
  spec: string;
  quantity: number;
  basis: string; // why this quantity — rule or assumption
}

export interface FurnitureModel {
  params: OpenShelfParams;
  components: Component[];
  parts: Part[];
  hardware: HardwareLine[];
  overall: Vec3;
}

export type CheckCategory = 'geometry' | 'materials' | 'structure' | 'connections' | 'stability' | 'manufacturing' | 'assembly' | 'safety';

export interface Calculation {
  formula: string;
  inputs: Record<string, string>;
  result: string;
}

export interface DesignChange {
  label: string;
  set: Partial<Omit<OpenShelfParams, 'template'>>;
}

export interface ProjectedFix {
  change: DesignChange;
  projectedStatus: Status;
  projectedDetail: string;
}

export interface Check {
  id: string;
  category: CheckCategory;
  status: Status;
  componentIds: string[];
  title: string;
  explanation: string;
  calculation?: Calculation;
  assumptions: string[];
  sources: Source[];
  requiredVerification?: string;
  fixes: ProjectedFix[];
}

export interface ValidationReport {
  checks: Check[];
  coverage: Record<CheckCategory, Status>;
  overall: Status;
  exportBlocked: boolean;
  physicalVerificationRequired: boolean;
}

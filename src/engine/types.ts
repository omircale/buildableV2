// All lengths in millimetres, masses in kg, forces in N, stresses/moduli in MPa (N/mm²).

export type Status = 'GREEN' | 'YELLOW' | 'RED' | 'GREY';

export type ValueKind =
  | 'mean' // mean value from test data / strength class table
  | 'characteristic' // 5th-percentile value used for design
  | 'standard_minimum' // minimum requirement from a product standard (conservative)
  | 'manufacturer' // manufacturer datasheet
  | 'supplier' // published by the supplier's ordering system
  | 'user_provided' // entered by a user, unverified
  | 'assumption'; // product decision, not a physical claim

export interface Source {
  title: string;
  reference: string; // table / clause
  url?: string;
  /** English title / reference when `title` / `reference` are not already English. */
  titleEn?: string;
  referenceEn?: string;
}

export interface SourcedValue {
  value: number | null; // null = UNKNOWN, never guessed
  kind: ValueKind;
  sources: Source[];
  note?: string;
  noteEn?: string;
}

export type MaterialCategory = 'mdf' | 'particleboard' | 'plywood' | 'osb' | 'solid_softwood' | 'solid_hardwood' | 'custom';

/** Eurocode 5 behaviour class used to look up kmod / kdef / gammaM. */
export type Ec5Class = 'solid_timber' | 'plywood' | 'osb3' | 'particleboard_p4' | 'particleboard_p6' | 'mdf_la' | 'not_covered';

export interface StockSize {
  lengthMm: number;
  widthMm: number;
  kind: ValueKind;
  note?: string;
  noteEn?: string;
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
  descriptionEn?: string;
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
  /** Present when the material is an orderable supplier product. */
  supplier?: { supplierId: string; handle: string; role: 'board' | 'back' };
  /** Engineering properties borrowed from a reference material; unconfirmed → results capped at YELLOW. */
  equivalence?: { referenceMaterialId: string; confirmed: boolean; noteHe: string; noteEn?: string };
}

export type LoadDistribution = 'uniform' | 'point_center';

export interface ShelfLoad {
  label: string;
  massKg: number;
  distribution: LoadDistribution;
}

/** Fields every furniture template shares: one body board, its decor, edges and after-delivery finish. */
export interface CommonParams {
  materialId: string;
  thicknessMm: number;
  /** Supplier decor / variant of the body material (e.g. "לבן מט"). */
  finishId: string;
  edgeOption: EdgeOption;
  finish: FinishSpec;
  /** Decor per part type (tier 1), overriding `finishId`; same board product, so structure is unchanged. */
  roleFinishes?: Partial<Record<ComponentRole, string>>;
  /** Decor for one specific component id (tier 2), overriding its part type's decor. */
  partFinishes?: Record<string, string>;
}

export type TemplateId = 'open_shelf' | 'bed' | 'table' | 'chair' | 'pullup';

/** Parameters of the open shelf / carcass family (bookcase, shoe cabinet, TV unit, cube organizer). */
export interface OpenShelfParams extends CommonParams {
  template: 'open_shelf';
  widthMm: number;
  heightMm: number;
  depthMm: number;
  shelfCount: number; // intermediate shelves (excludes top & bottom)
  dividerCount: number; // vertical dividers splitting the span
  /** Full-overlay hinged doors, one or two per bay. */
  doors: 'none' | 'hinged';
  /** Intermediate shelves screwed in place, or loose on shelf supports in 32 mm line-bored holes. */
  shelfMounting: 'fixed' | 'pins';
  hasBack: boolean;
  backMaterialId: string;
  backThicknessMm: number;
  backFinishId: string;
  backNails: 'none' | '50_nails' | '100_nails';
  plinthHeightMm: number; // 0 = no plinth
  loadPerShelf: ShelfLoad;
}

/**
 * Box bed built entirely from cut boards: rails and end boards stand on the floor, slats rest on
 * floor-standing support boards, so slat loads reach the floor without relying on screws in shear.
 * The mattress size is the user's choice and drives every other dimension.
 */
export interface BedParams extends CommonParams {
  template: 'bed';
  mattressWidthMm: number;
  mattressLengthMm: number;
  mattressThicknessMm: number;
  /** Clearance between the mattress and the frame on each side. */
  mattressGapMm: number;
  /** Height of the side rails / end boards from the floor. */
  railHeightMm: number;
  /** Top of the slats from the floor. */
  deckHeightMm: number;
  slatWidthMm: number;
  /** Target clear gap between slats; the actual gap is reported. */
  slatGapMm: number;
  /** Two boards along the middle, standing on the floor, so slats span half the width. */
  centerSupport: boolean;
  /** 0 = no headboard; otherwise the head end board rises to this height from the floor. */
  headboardHeightMm: number;
  sleepers: 1 | 2;
  sleeperMassKg: number;
  mattressMassKg: number;
  /** Applies the child-safety rules (entrapment openings, mattress gap, edges, coatings). */
  childBed: boolean;
  /** 0 = closed rail; otherwise an entry opening in the right-hand side rail. */
  entryOpeningMm: number;
  houseFrame: boolean;
  /** Height of the house-frame posts from the floor (roof pitch is 45°). */
  houseWallHeightMm: number;
}

/** Slab-end table / desk / bench / coffee table: two full-depth side panels carry a top board. */
export interface TableParams extends CommonParams {
  template: 'table';
  widthMm: number;
  heightMm: number;
  depthMm: number;
  topLoadKg: number;
  topLoadDistribution: LoadDistribution;
  /** Third full-depth panel under the middle of the top, halving its span. */
  middleSupport: boolean;
  /** Back rail under the top between the side panels; resists racking. */
  hasApron: boolean;
  apronHeightMm: number;
  /** 0 = no lower shelf; otherwise its height from the floor. */
  lowerShelfHeightMm: number;
  lowerShelfLoadKg: number;
}

/** Box chair: side panels up to the backrest, seat and backrest between them, front rail under the seat. */
export interface ChairParams extends CommonParams {
  template: 'chair';
  seatWidthMm: number;
  seatHeightMm: number;
  depthMm: number;
  backHeightMm: number;
  userMassKg: number;
}

/** Freestanding pull-up frame: two upright boards on foot boards with a header; the steel bar is bought separately. */
export interface PullUpParams extends CommonParams {
  template: 'pullup';
  widthMm: number;
  heightMm: number;
  footLengthMm: number;
  uprightWidthMm: number;
  userMassKg: number;
}

export type DesignParams = OpenShelfParams | BedParams | TableParams | ChairParams | PullUpParams;

type Patch<P> = Partial<Omit<P, 'template'>>;
/** A partial update valid for any template (field names never conflict across templates). */
export type ParamsPatch = Patch<OpenShelfParams> & Patch<BedParams> & Patch<TableParams> & Patch<ChairParams> & Patch<PullUpParams>;

export const isOpenShelf = (p: DesignParams): p is OpenShelfParams => p.template === 'open_shelf';

/** Edge banding applied to sides, horizontals and dividers. */
export type EdgeOption = 'none' | 'front' | 'all';

export interface FinishSpec {
  /** 'supplier' = the decor ordered from the supplier; the others are applied after delivery. */
  type: 'supplier' | 'natural' | 'stained' | 'painted' | 'lacquered';
  sheen: 'matte' | 'satin' | 'gloss';
  color: string; // presentation only — never affects structure
}

export type ComponentRole =
  | 'side'
  | 'top'
  | 'bottom'
  | 'shelf'
  | 'divider'
  | 'back'
  | 'plinth'
  | 'door'
  | 'rail'
  | 'end'
  | 'headboard'
  | 'support'
  | 'slat'
  | 'post'
  | 'rafter'
  | 'ridge'
  | 'seat'
  | 'backrest'
  | 'apron'
  | 'upright'
  | 'foot'
  | 'header'
  | 'mattress'
  | 'bar';

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
  /** Load-model assumption for this member, shown with its structural check (already localized). */
  loadAssumption?: string;
  grainAxis?: 'x' | 'y' | 'z';
  /** Rotation about the z axis through the box centre (degrees). */
  rotationZDeg?: number;
  /**
   * Ends cut at an angle instead of square, in degrees from square, measured in the xy plane.
   * `start` is the low-x end and `end` the high-x end, before rotation; a positive angle leaves the
   * +y side of the board long. `size` stays the length between the cuts at the board's centre line,
   * so the board ordered is longer than the body by the material the angles take.
   */
  endCutDeg?: { start?: number; end?: number };
  /** Shown for context only (mattress, steel bar): never cut, ordered, priced or overlap-checked. */
  reference?: boolean;
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
  /** Which edges are banded. long = along lengthMm. Band thickness is not specified by the supplier. */
  edges: { long1: boolean; long2: boolean; short1: boolean; short2: boolean };
  finishId: string;
  /** Machining the supplier's straight cut does not include (drilling, angle cuts). */
  machining?: string[];
}

export interface HardwareLine {
  id: string;
  name: string;
  spec: string;
  quantity: number;
  basis: string; // why this quantity — rule or assumption
}

export interface FurnitureModel {
  params: DesignParams;
  /** Dimension step imposed by the supplier's order form (0 = exact millimetres). */
  orderStepMm: number;
  /** Requested vs built overall size; they differ when parts are snapped to the order step. */
  requested: Vec3;
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
  set: ParamsPatch;
}

export interface AssemblyStep {
  n: number;
  title: string;
  componentIds: string[];
  hardware: string[];
  warning?: string;
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

import {
  DEFAULT_BENCH,
  DEFAULT_CHAIR,
  DEFAULT_COFFEE_TABLE,
  DEFAULT_DESK,
  DEFAULT_DOUBLE_BED,
  DEFAULT_FLOOR_BED,
  DEFAULT_KIDS_CHAIR,
  DEFAULT_NIGHTSTAND,
  DEFAULT_OPEN_SHELF,
  DEFAULT_PULLUP,
  DEFAULT_SINGLE_BED,
  type DesignParams,
  type OpenShelfParams,
} from '../engine';

export type FurnitureKind =
  | 'open_shelf'
  | 'shoe_cabinet'
  | 'shoe_rack'
  | 'tv_unit'
  | 'cube_organizer'
  | 'cabinet_doors'
  | 'floor_bed'
  | 'bed'
  | 'desk'
  | 'bench'
  | 'coffee_table'
  | 'nightstand'
  | 'chair'
  | 'kids_chair'
  | 'pullup'
  | 'wall_shelf'
  | 'cabinet_shelf';

export interface SpaceCm {
  w: number | null;
  h: number | null;
  d: number | null;
}

export interface FurnitureType {
  kind: FurnitureKind;
  /** Only types with an engine template can be opened; the rest are shown as upcoming. */
  available: boolean;
  isNew?: boolean;
  /** Smallest outer size (cm) the template can produce, used to filter by the user's space. */
  minCm: { w: number; h: number; d: number };
  /** Starting design for this type, sized to the user's space where the template has plain W/H/D fields. */
  preset?: (space: SpaceCm) => DesignParams;
}

const shelf = (over: Partial<OpenShelfParams>) => (space: SpaceCm): DesignParams => ({
  ...DEFAULT_OPEN_SHELF,
  ...over,
  ...(space.w ? { widthMm: space.w * 10 } : {}),
  ...(space.h ? { heightMm: space.h * 10 } : {}),
  ...(space.d ? { depthMm: space.d * 10 } : {}),
});

const fixed = (p: DesignParams) => () => p;

/**
 * One bed, not two. Single and double were never different furniture — the same frame with a wider
 * mattress and a centre support under the slats — so the catalog offers a bed and the mattress size
 * decides the rest. A space wide enough for a double starts there; everything is editable after.
 */
const bed = (space: SpaceCm): DesignParams =>
  space.w != null && space.w * 10 >= DEFAULT_DOUBLE_BED.mattressWidthMm + 2 * DEFAULT_DOUBLE_BED.thicknessMm ? DEFAULT_DOUBLE_BED : DEFAULT_SINGLE_BED;

const light = { label: 'חפצי נוי', massKg: 8, distribution: 'uniform' as const };

export const FURNITURE_TYPES: FurnitureType[] = [
  { kind: 'open_shelf', available: true, minCm: { w: 20, h: 20, d: 15 }, preset: shelf({}) },
  { kind: 'floor_bed', available: true, isNew: true, minCm: { w: 64, h: 20, d: 124 }, preset: fixed(DEFAULT_FLOOR_BED) },
  { kind: 'bed', available: true, isNew: true, minCm: { w: 64, h: 20, d: 124 }, preset: bed },
  { kind: 'shoe_cabinet', available: true, isNew: true, minCm: { w: 30, h: 40, d: 25 }, preset: shelf({ widthMm: 800, heightMm: 1000, depthMm: 350, shelfCount: 2, doors: 'hinged', loadPerShelf: light }) },
  { kind: 'shoe_rack', available: true, isNew: true, minCm: { w: 30, h: 25, d: 20 }, preset: shelf({ widthMm: 800, heightMm: 500, depthMm: 300, shelfCount: 1, hasBack: false, loadPerShelf: light }) },
  { kind: 'tv_unit', available: true, minCm: { w: 80, h: 30, d: 30 }, preset: shelf({ widthMm: 1600, heightMm: 450, depthMm: 400, shelfCount: 0, dividerCount: 2, loadPerShelf: light }) },
  { kind: 'cube_organizer', available: true, minCm: { w: 35, h: 35, d: 30 }, preset: shelf({ widthMm: 1100, heightMm: 1100, depthMm: 350, shelfCount: 2, dividerCount: 2 }) },
  { kind: 'cabinet_doors', available: true, isNew: true, minCm: { w: 40, h: 40, d: 30 }, preset: shelf({ widthMm: 900, heightMm: 1800, depthMm: 450, shelfCount: 4, doors: 'hinged' }) },
  { kind: 'desk', available: true, isNew: true, minCm: { w: 60, h: 60, d: 40 }, preset: fixed(DEFAULT_DESK) },
  { kind: 'bench', available: true, isNew: true, minCm: { w: 60, h: 35, d: 30 }, preset: fixed(DEFAULT_BENCH) },
  { kind: 'coffee_table', available: true, isNew: true, minCm: { w: 60, h: 30, d: 40 }, preset: fixed(DEFAULT_COFFEE_TABLE) },
  { kind: 'nightstand', available: true, isNew: true, minCm: { w: 35, h: 40, d: 30 }, preset: fixed(DEFAULT_NIGHTSTAND) },
  { kind: 'chair', available: true, isNew: true, minCm: { w: 30, h: 50, d: 30 }, preset: fixed(DEFAULT_CHAIR) },
  { kind: 'kids_chair', available: true, isNew: true, minCm: { w: 30, h: 40, d: 25 }, preset: fixed(DEFAULT_KIDS_CHAIR) },
  { kind: 'pullup', available: true, isNew: true, minCm: { w: 70, h: 150, d: 60 }, preset: fixed(DEFAULT_PULLUP) },
  { kind: 'wall_shelf', available: false, minCm: { w: 30, h: 2, d: 12 } },
  { kind: 'cabinet_shelf', available: false, minCm: { w: 20, h: 2, d: 20 } },
];

/** Table-like templates take the user's space as their width/height/depth when it fits the defaults. */
export function presetFor(type: FurnitureType, space: SpaceCm): DesignParams | null {
  if (!type.preset) return null;
  const p = type.preset(space);
  if (p.template === 'table')
    return { ...p, ...(space.w ? { widthMm: Math.min(p.widthMm, space.w * 10) } : {}), ...(space.h ? { heightMm: Math.min(p.heightMm, space.h * 10) } : {}), ...(space.d ? { depthMm: Math.min(p.depthMm, space.d * 10) } : {}) };
  return p;
}

/** Which catalog illustration represents a design (for the continue card and summary). */
export function artKindFor(p: DesignParams): FurnitureKind {
  switch (p.template) {
    case 'open_shelf':
      return p.doors === 'hinged' ? 'cabinet_doors' : 'open_shelf';
    case 'bed':
      return p.childBed ? 'floor_bed' : 'bed';
    case 'table':
      return p.topLoadDistribution === 'point_center' ? 'bench' : 'desk';
    case 'chair':
      return 'chair';
    case 'pullup':
      return 'pullup';
  }
}

export function fitsSpace(t: FurnitureType, space: SpaceCm): boolean {
  return (space.w == null || space.w >= t.minCm.w) && (space.h == null || space.h >= t.minCm.h) && (space.d == null || space.d >= t.minCm.d);
}

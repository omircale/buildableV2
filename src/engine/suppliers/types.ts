import type { Source } from '../types';

export type EdgeSide = 'width' | 'depth'; // supplier terms: width = long side (10–240 cm), depth = short side (10–120 cm)

export interface SupplierEdgeOption {
  id: string;
  nameHe: string;
  nameEn?: string;
  edges: EdgeSide[];
}

export interface SupplierFinish {
  id: string; // supplier variant title
  nameHe: string;
  nameEn?: string;
  pricePerSqm: number; // ILS
  /** Presentation colour for the 3D view; approximated by Buildable, not supplied by the supplier. */
  color: string;
}

export interface SupplierAddonOption {
  id: string;
  nameHe: string;
  nameEn?: string;
  price: number;
}

export interface SupplierProduct {
  handle: string;
  titleHe: string;
  titleEn?: string;
  url: string;
  thicknessMm: number;
  role: 'board' | 'back';
  finishes: SupplierFinish[];
  limits: { minLongMm: number; maxLongMm: number; minShortMm: number; maxShortMm: number; stepMm: number };
  minPricePerPiece: number;
  edgeBanding: { pricePerMeter: number; options: SupplierEdgeOption[] } | null;
  nails?: SupplierAddonOption[];
  weightKgPerSqm: number;
  descriptionHe: string;
  descriptionEn?: string;
  /** Link to engineering reference data. `confirmed: false` caps structural results at YELLOW. */
  engineering: { referenceMaterialId: string; confirmed: boolean; noteHe: string; noteEn?: string } | null;
  hasGrain: boolean;
  pickupOnly: boolean;
}

export interface Supplier {
  id: string;
  nameHe: string;
  nameEn?: string;
  url: string;
  capturedAt: string;
  source: Source;
  shippingIls: { amount: number; noteHe: string; noteEn?: string };
  leadTimeHe: string;
  leadTimeEn?: string;
  policyHe: string[];
  policyEn?: string[];
  products: SupplierProduct[];
}

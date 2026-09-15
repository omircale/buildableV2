import type { Source } from './types';

/** Product decisions (not physical facts). Editable from the admin panel. */
export interface EngineeringConfig {
  /** Final (creep-included) deflection must be ≤ span / greenRatio for GREEN. */
  deflectionGreenRatio: number;
  /** Above span / redRatio → RED. Between the two → YELLOW. */
  deflectionRedRatio: number;
  /** Partial factor applied to all shelf loads in the strength check (conservative: self-weight treated like imposed load). */
  loadPartialFactor: number;
  kerfMm: number;
  trimMarginMm: number;
  minPanelThicknessMm: number;
}

export const DEFAULT_CONFIG: EngineeringConfig = {
  deflectionGreenRatio: 300,
  deflectionRedRatio: 150,
  loadPartialFactor: 1.5,
  kerfMm: 4,
  trimMarginMm: 10,
  minPanelThicknessMm: 12,
};

export const CONFIG_SOURCES: Record<string, Source[]> = {
  deflection: [
    {
      title: 'EN 1995-1-1 (Eurocode 5), §7.2',
      reference: 'Table 7.2 — recommended ranges for beams on two supports: w_fin between L/150 and L/300',
    },
  ],
  loadFactor: [{ title: 'EN 1990 (Eurocode 0)', reference: 'Recommended partial factor for variable actions γQ = 1.5' }],
};

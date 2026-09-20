import catalogData from '../../data/decorCatalog.json';

export interface CatalogDecor {
  code: string;
  nameHe: string;
  materialType: string | null;
  family: string | null;
  finish: string | null;
  collection: string;
  isNew: boolean;
  availability: string | null;
  /** Path under the site root; the image is served by us, never hot-linked. */
  image: string;
  sourceUrl: string;
  imageSourceUrl: string;
}

export interface DecorCatalog {
  source: string;
  catalogIndexUrl: string;
  retrievedAt: string;
  imagesImportedAt: string;
  permission: string;
  attribution: string;
  count: number;
  decors: CatalogDecor[];
}

/**
 * Finishes published by the panel distributor, with their own photographs (used with permission, 2026-09-20).
 * These are that distributor's products — they are **not** the decors of the boards the price is currently
 * calculated from, so the catalog is for choosing a direction and previewing, not for ordering yet.
 *
 * Removing an image later is deliberate and simple: delete the file from `public/decors` and its entry here.
 */
export const DECOR_CATALOG = catalogData as DecorCatalog;

export type DecorFilters = {
  materialType?: string | null;
  family?: string | null;
  finish?: string | null;
  query?: string;
};

const norm = (s: string) => s.replace(/[֑-ׇ]/g, '').toLowerCase();

export function filterDecors(decors: CatalogDecor[], filters: DecorFilters): CatalogDecor[] {
  const q = filters.query ? norm(filters.query.trim()) : '';
  return decors.filter((d) => {
    if (filters.materialType && d.materialType !== filters.materialType) return false;
    if (filters.family && d.family !== filters.family) return false;
    if (filters.finish && d.finish !== filters.finish) return false;
    if (!q) return true;
    return [d.code, d.nameHe, d.finish ?? '', d.family ?? '', d.materialType ?? ''].some((t) => norm(t).includes(q));
  });
}

/** Distinct values of one field, most common first, for the filter chips. */
export function decorFacets(decors: CatalogDecor[], key: 'materialType' | 'family' | 'finish'): string[] {
  const counts = new Map<string, number>();
  for (const d of decors) {
    const v = d[key];
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

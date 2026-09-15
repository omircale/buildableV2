import type { Material, Part, StockSize } from '../types';

export interface NestingOptions {
  kerfMm: number;
  trimMarginMm: number; // removed from every sheet edge before cutting
}

export const DEFAULT_NESTING: NestingOptions = { kerfMm: 4, trimMarginMm: 10 };

export interface Placement {
  partId: string;
  instance: number;
  x: number; // along sheet length
  y: number; // along sheet width
  lengthMm: number; // extent along sheet length
  widthMm: number;
  rotated: boolean;
}

export interface SheetLayout {
  index: number;
  stock: StockSize;
  placements: Placement[];
  usedAreaMm2: number;
  wastePercent: number;
}

export interface NestingGroupResult {
  materialId: string;
  thicknessMm: number;
  sheets: SheetLayout[];
  unplaced: { partId: string; instance: number; reason: string }[];
}

interface FreeRect {
  x: number;
  y: number;
  l: number;
  w: number;
}

interface Piece {
  partId: string;
  instance: number;
  l: number;
  w: number;
  grainLocked: boolean;
}

/**
 * Guillotine bin packing (best-area-fit placement, max-area split), per material + thickness.
 * Several part orderings are tried and the result with the fewest sheets wins.
 * Guillotine cuts match how panel saws work. Kerf is reserved on the right/top of every piece.
 * Grain-locked parts keep their length along the sheet length (sheets are assumed to have grain along length).
 */
export function nestParts(parts: Part[], materials: (id: string) => Material | undefined, opts: NestingOptions = DEFAULT_NESTING): NestingGroupResult[] {
  const groups = new Map<string, Part[]>();
  for (const p of parts) {
    const key = `${p.materialId}|${p.thicknessMm}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const results: NestingGroupResult[] = [];
  for (const [key, groupParts] of groups) {
    const [materialId, t] = key.split('|');
    const material = materials(materialId);
    results.push(nestGroup(materialId, Number(t), groupParts, material, opts));
  }
  return results;
}

// Free rectangles are always bounded by the trim line or by an already-reserved kerf, so a piece
// may end exactly on a free-rectangle edge.
function fits(piece: Piece, rect: FreeRect, rotated: boolean): boolean {
  const l = rotated ? piece.w : piece.l;
  const w = rotated ? piece.l : piece.w;
  return l <= rect.l && w <= rect.w;
}

function nestGroup(materialId: string, thicknessMm: number, parts: Part[], material: Material | undefined, opts: NestingOptions): NestingGroupResult {
  const pieces: Piece[] = [];
  for (const p of parts) {
    for (let i = 0; i < p.quantity; i++) pieces.push({ partId: p.id, instance: i + 1, l: p.lengthMm, w: p.widthMm, grainLocked: p.grainLocked });
  }
  const orderings: ((a: Piece, b: Piece) => number)[] = [
    (a, b) => b.l * b.w - a.l * a.w || b.l - a.l,
    (a, b) => b.l - a.l || b.w - a.w,
    (a, b) => b.w - a.w || b.l - a.l,
    (a, b) => Math.max(b.l, b.w) - Math.max(a.l, a.w) || b.l * b.w - a.l * a.w,
  ];
  let best: NestingGroupResult | null = null;
  for (const order of orderings) {
    const attempt = packOnce(materialId, thicknessMm, [...pieces].sort(order), material, opts);
    const score = (r: NestingGroupResult) => [r.unplaced.length, r.sheets.length, r.sheets.at(-1)?.usedAreaMm2 ?? 0] as const;
    if (!best) best = attempt;
    else {
      const [u1, s1, last1] = score(attempt);
      const [u2, s2, last2] = score(best);
      // Fewer unplaced, then fewer sheets, then an emptier last sheet (a larger usable offcut).
      if (u1 < u2 || (u1 === u2 && (s1 < s2 || (s1 === s2 && last1 < last2)))) best = attempt;
    }
  }
  return best!;
}

function packOnce(materialId: string, thicknessMm: number, pieces: Piece[], material: Material | undefined, opts: NestingOptions): NestingGroupResult {
  const unplaced: NestingGroupResult['unplaced'] = [];
  const stock = material?.stock ?? [];
  if (stock.length === 0) {
    return { materialId, thicknessMm, sheets: [], unplaced: pieces.map((p) => ({ partId: p.partId, instance: p.instance, reason: 'אין מידות לוח ידועות לחומר' })) };
  }

  const usable = (s: StockSize) => ({ l: s.lengthMm - 2 * opts.trimMarginMm, w: s.widthMm - 2 * opts.trimMarginMm });
  const canEverFit = (pc: Piece, s: StockSize) => {
    const u = usable(s);
    return (pc.l <= u.l && pc.w <= u.w) || (!pc.grainLocked && pc.w <= u.l && pc.l <= u.w);
  };

  const sheets: (SheetLayout & { free: FreeRect[] })[] = [];

  for (const pc of pieces) {
    let placed = false;
    for (const sheet of sheets) {
      if (tryPlace(sheet, pc, opts.kerfMm)) {
        placed = true;
        break;
      }
    }
    if (placed) continue;
    const chosen = stock.find((s) => canEverFit(pc, s));
    if (!chosen) {
      unplaced.push({
        partId: pc.partId,
        instance: pc.instance,
        reason: pc.grainLocked ? 'החלק גדול מהלוח בכיוון הסיבים (סיבוב אסור)' : 'החלק גדול מכל מידת לוח ידועה',
      });
      continue;
    }
    const u = usable(chosen);
    const sheet = { index: sheets.length + 1, stock: chosen, placements: [], usedAreaMm2: 0, wastePercent: 100, free: [{ x: opts.trimMarginMm, y: opts.trimMarginMm, l: u.l, w: u.w }] };
    sheets.push(sheet);
    if (!tryPlace(sheet, pc, opts.kerfMm)) {
      unplaced.push({ partId: pc.partId, instance: pc.instance, reason: 'לא נמצא מקום בלוח חדש' });
    }
  }

  for (const s of sheets) {
    const area = s.stock.lengthMm * s.stock.widthMm;
    s.usedAreaMm2 = s.placements.reduce((a, p) => a + p.lengthMm * p.widthMm, 0);
    s.wastePercent = Math.round(((area - s.usedAreaMm2) / area) * 1000) / 10;
  }

  return { materialId, thicknessMm, sheets: sheets.map(({ free: _free, ...rest }) => rest), unplaced };
}

function tryPlace(sheet: SheetLayout & { free: FreeRect[] }, pc: Piece, kerf: number): boolean {
  let best: { idx: number; rotated: boolean; score: number } | null = null;
  sheet.free.forEach((r, idx) => {
    for (const rotated of pc.grainLocked ? [false] : [false, true]) {
      if (!fits(pc, r, rotated)) continue;
      const score = r.l * r.w;
      if (!best || score < best.score) best = { idx, rotated, score };
    }
  });
  if (!best) return false;
  const { idx, rotated } = best as { idx: number; rotated: boolean };
  const r = sheet.free[idx];
  const l = rotated ? pc.w : pc.l;
  const w = rotated ? pc.l : pc.w;
  sheet.placements.push({ partId: pc.partId, instance: pc.instance, x: r.x, y: r.y, lengthMm: l, widthMm: w, rotated });

  const usedL = Math.min(r.l, l + kerf);
  const usedW = Math.min(r.w, w + kerf);
  const leftoverL = r.l - usedL;
  const leftoverW = r.w - usedW;
  const next: FreeRect[] = [];
  // Choose the guillotine cut that leaves the largest single free rectangle (max-area split).
  const alongLength = [leftoverL * usedW, r.l * leftoverW];
  const alongWidth = [leftoverL * r.w, usedL * leftoverW];
  if (Math.max(...alongLength) >= Math.max(...alongWidth)) {
    if (leftoverL > 0) next.push({ x: r.x + usedL, y: r.y, l: leftoverL, w: usedW });
    if (leftoverW > 0) next.push({ x: r.x, y: r.y + usedW, l: r.l, w: leftoverW });
  } else {
    if (leftoverL > 0) next.push({ x: r.x + usedL, y: r.y, l: leftoverL, w: r.w });
    if (leftoverW > 0) next.push({ x: r.x, y: r.y + usedW, l: usedL, w: leftoverW });
  }
  sheet.free.splice(idx, 1, ...next);
  return true;
}

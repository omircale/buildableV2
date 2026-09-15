import type { FurnitureModel, HardwareLine, Material, Part } from '../types';
import type { NestingGroupResult } from './nesting';

export interface SheetLine {
  materialId: string;
  materialName: string;
  thicknessMm: number;
  sheetSize: string;
  sheets: number;
  wastePercent: number;
  sizeIsAssumption: boolean;
}

export interface EdgeBandLine {
  thicknessMm: number;
  lengthM: number;
  basis: string;
}

export interface Bom {
  sheets: SheetLine[];
  edgeBanding: EdgeBandLine[];
  hardware: HardwareLine[];
  totalMassKg: number | null;
}

export const EDGE_BAND_WASTE_FACTOR = 1.1;

export function buildBom(model: FurnitureModel, nesting: NestingGroupResult[], materials: (id: string) => Material | undefined): Bom {
  const sheets: SheetLine[] = nesting.flatMap((g) => {
    const m = materials(g.materialId);
    const bySize = new Map<string, typeof g.sheets>();
    for (const s of g.sheets) {
      const k = `${s.stock.lengthMm}×${s.stock.widthMm}`;
      bySize.set(k, [...(bySize.get(k) ?? []), s]);
    }
    return [...bySize.entries()].map(([size, list]) => {
      const area = list.reduce((a, s) => a + s.stock.lengthMm * s.stock.widthMm, 0);
      const used = list.reduce((a, s) => a + s.usedAreaMm2, 0);
      return {
        materialId: g.materialId,
        materialName: m?.nameHe ?? g.materialId,
        thicknessMm: g.thicknessMm,
        sheetSize: size,
        sheets: list.length,
        wastePercent: Math.round(((area - used) / area) * 1000) / 10,
        sizeIsAssumption: list.some((s) => s.stock.kind === 'assumption'),
      };
    });
  });

  const bandByThickness = new Map<number, number>();
  for (const p of model.parts) {
    const e = p.edgeBanding;
    const mm = (e.length1 ? p.lengthMm : 0) + (e.length2 ? p.lengthMm : 0) + (e.width1 ? p.widthMm : 0) + (e.width2 ? p.widthMm : 0);
    const t = Math.max(e.length1, e.length2, e.width1, e.width2);
    if (t > 0) bandByThickness.set(t, (bandByThickness.get(t) ?? 0) + mm * p.quantity);
  }
  const edgeBanding = [...bandByThickness.entries()].map(([t, mm]) => ({
    thicknessMm: t,
    lengthM: Math.ceil((mm / 1000) * EDGE_BAND_WASTE_FACTOR * 10) / 10,
    basis: 'אורך נטו + 10% פחת (הנחה)',
  }));

  return { sheets, edgeBanding, hardware: model.hardware, totalMassKg: estimateMass(model.parts, materials) };
}

export function estimateMass(parts: Part[], materials: (id: string) => Material | undefined): number | null {
  let total = 0;
  for (const p of parts) {
    const rho = materials(p.materialId)?.densityKgM3.value;
    if (rho == null) return null;
    total += ((p.lengthMm * p.widthMm * p.thicknessMm) / 1e9) * rho * p.quantity;
  }
  return Math.round(total * 10) / 10;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function cutListCsv(parts: Part[], materials: (id: string) => Material | undefined): string {
  const header = ['Part_ID', 'Description', 'Material', 'Thickness_mm', 'Length_mm', 'Width_mm', 'Quantity', 'Grain_Locked', 'Edge_L1_mm', 'Edge_L2_mm', 'Edge_W1_mm', 'Edge_W2_mm'];
  const rows = parts.map((p) => [
    p.id,
    p.name,
    materials(p.materialId)?.nameEn ?? p.materialId,
    p.thicknessMm,
    p.lengthMm,
    p.widthMm,
    p.quantity,
    p.grainLocked ? 1 : 0,
    p.edgeBanding.length1,
    p.edgeBanding.length2,
    p.edgeBanding.width1,
    p.edgeBanding.width2,
  ]);
  // BOM prefix makes Excel open Hebrew text correctly.
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

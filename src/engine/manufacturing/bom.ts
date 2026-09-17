import { materialName, tr, type EngineLocale } from '../i18n';
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
        materialName: m ? materialName(m) : g.materialId,
        thicknessMm: g.thicknessMm,
        sheetSize: size,
        sheets: list.length,
        wastePercent: Math.round(((area - used) / area) * 1000) / 10,
        sizeIsAssumption: list.some((s) => s.stock.kind === 'assumption'),
      };
    });
  });

  const bandMm = model.parts.reduce((a, p) => a + (Number(p.edges.long1) + Number(p.edges.long2)) * p.lengthMm * p.quantity + (Number(p.edges.short1) + Number(p.edges.short2)) * p.widthMm * p.quantity, 0);
  const edgeBanding = bandMm > 0 ? [{ lengthM: Math.ceil((bandMm / 1000) * EDGE_BAND_WASTE_FACTOR * 10) / 10, basis: tr('אורך נטו + 10% פחת (הנחה). כשהקנט מודבק במפעל — כלול בהזמנה.', 'Net length + 10% waste (assumption). When edge banding is applied at the factory it is included in the order.') }] : [];

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

/** `locale` selects the material name language (default: current engine locale, Hebrew unless changed). */
export function cutListCsv(parts: Part[], materials: (id: string) => Material | undefined, locale?: EngineLocale): string {
  const header = ['Part_ID', 'Description', 'Material', 'Finish', 'Thickness_mm', 'Length_mm', 'Width_mm', 'Quantity', 'Grain_Locked', 'Edge_Long_1', 'Edge_Long_2', 'Edge_Short_1', 'Edge_Short_2', 'Machining'];
  const rows = parts.map((p) => [
    p.id,
    p.name,
    (() => {
      const m = materials(p.materialId);
      return m ? materialName(m, locale) : p.materialId;
    })(),
    p.finishId,
    p.thicknessMm,
    p.lengthMm,
    p.widthMm,
    p.quantity,
    p.grainLocked ? 1 : 0,
    Number(p.edges.long1),
    Number(p.edges.long2),
    Number(p.edges.short1),
    Number(p.edges.short2),
    (p.machining ?? []).join(' | '),
  ]);
  // BOM prefix makes Excel open Hebrew text correctly.
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

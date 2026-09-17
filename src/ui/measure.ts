import type { Component, FurnitureModel, Part } from '../engine';

/** Millimetres → centimetres text with no rounding beyond 0.01 cm (0.1 mm), trailing zeros dropped. */
export function formatCm(mm: number): string {
  return String(Math.round(mm * 10) / 100);
}

export function partFor(model: FurnitureModel, componentId: string): Part | undefined {
  return model.parts.find((p) => p.componentIds.includes(componentId));
}

export interface ComponentDims {
  /** Box extents along the component's own axes, exactly as modelled and drawn. */
  x: number;
  y: number;
  z: number;
  /** The cut size ordered for this component (same numbers as the cut list), when it is a manufactured part. */
  cut?: { lengthMm: number; widthMm: number; thicknessMm: number; partId: string };
}

export function componentDims(model: FurnitureModel, c: Component): ComponentDims {
  const part = c.reference ? undefined : partFor(model, c.id);
  return {
    x: c.size.x,
    y: c.size.y,
    z: c.size.z,
    cut: part && { lengthMm: part.lengthMm, widthMm: part.widthMm, thicknessMm: part.thicknessMm, partId: part.id },
  };
}

export interface PartLabelWords {
  width: string;
  height: string;
  depth: string;
  thickness: string;
  part: string;
  cm: string;
}

/** The exact texts drawn on an isolated part in the dimensions view (one per axis, plus the cut size). */
export function partMeasureLabels(model: FurnitureModel, c: Component, w: PartLabelWords): { x: string; y: string; z: string; cut?: string } {
  const d = componentDims(model, c);
  const axis = (word: string, mm: number) => `${mm === c.thicknessMm ? w.thickness : word} ${formatCm(mm)} ${w.cm}`;
  return {
    x: axis(w.width, d.x),
    y: axis(w.height, d.y),
    z: axis(w.depth, d.z),
    cut: d.cut && `${d.cut.partId} · ${w.part}: ${formatCm(d.cut.lengthMm)} × ${formatCm(d.cut.widthMm)} × ${formatCm(d.cut.thicknessMm)} ${w.cm}`,
  };
}

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
  /** Prefixes the length the board actually occupies, when an angled end makes it shorter than the board ordered. */
  inFrame: string;
}

/** The exact texts drawn on an isolated part in the dimensions view (one per axis, plus the cut size). */
export function partMeasureLabels(
  model: FurnitureModel,
  c: Component,
  w: PartLabelWords,
): { x: string; y: string; z: string; cut?: string; cutParts?: { id: string; label: string; dims: string } } {
  const d = componentDims(model, c);
  const axis = (word: string, mm: number) => `${mm === c.thicknessMm ? w.thickness : word} ${formatCm(mm)} ${w.cm}`;
  // The label is also returned in pieces so the view can keep the words in the reading direction of
  // the interface while the measurements stay left-to-right, which is what bidi text needs.
  const cutParts = d.cut
    ? {
        id: d.cut.partId,
        label: w.part,
        dims: `${formatCm(d.cut.lengthMm)} × ${formatCm(d.cut.widthMm)} × ${formatCm(d.cut.thicknessMm)} ${w.cm}${
          c.endCutDeg ? ` (${w.inFrame} ${formatCm(Math.max(d.x, d.y, d.z))} ${w.cm})` : ''
        }`,
      }
    : undefined;

  return {
    x: axis(w.width, d.x),
    y: axis(w.height, d.y),
    z: axis(w.depth, d.z),
    ...(cutParts ? { cutParts } : {}),
    // For a board with angled ends the two numbers genuinely differ: the frame holds the body, the
    // order has to carry the material the angle cuts away. Showing only one of them would mislead.
    cut:
      d.cut &&
      `${d.cut.partId} · ${w.part}: ${formatCm(d.cut.lengthMm)} × ${formatCm(d.cut.widthMm)} × ${formatCm(d.cut.thicknessMm)} ${w.cm}` +
        (c.endCutDeg ? ` (${w.inFrame} ${formatCm(Math.max(d.x, d.y, d.z))} ${w.cm})` : ''),
  };
}

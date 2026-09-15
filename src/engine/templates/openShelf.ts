import type { Component, FurnitureModel, HardwareLine, OpenShelfParams, Part } from '../types';
import { getMaterial } from '../materials';

export const DEFAULT_OPEN_SHELF: OpenShelfParams = {
  template: 'open_shelf',
  widthMm: 800,
  heightMm: 1800,
  depthMm: 300,
  materialId: 'birch_plywood',
  thicknessMm: 18,
  shelfCount: 3,
  dividerCount: 0,
  hasBack: true,
  backMaterialId: 'birch_plywood',
  backThicknessMm: 6.5,
  plinthHeightMm: 0,
  loadPerShelf: { label: 'ספרים', massKg: 20, distribution: 'uniform' },
  edgeBandMm: 0,
  finish: { type: 'natural', sheen: 'matte', color: '#d9b98c' },
};

/**
 * Construction (Phase 1, documented so geometry, cut list and 3D stay one source of truth):
 * - Sides run full height. Top, bottom and shelves sit between the sides (butt joints, screwed).
 * - Back panel (if any) is surface-mounted on the rear edges, full width × full height.
 * - Every other board sits in front of the back: depth = D − back thickness, so overall depth stays D.
 * - Optional plinth: a front kick board between the sides; the bottom sits on top of it.
 * - Dividers run between bottom and top, splitting every horizontal board into equal bays.
 *   Shelves are then separate boards per bay.
 */
export function buildOpenShelf(p: OpenShelfParams): FurnitureModel {
  const T = p.thicknessMm;
  const back = p.hasBack ? p.backThicknessMm : 0;
  const innerW = p.widthMm - 2 * T;
  const boardDepth = p.depthMm - back;
  const bays = p.dividerCount + 1;
  const bayW = (innerW - p.dividerCount * T) / bays;
  const bottomY = p.plinthHeightMm;
  const topY = p.heightMm - T;
  const interiorH = topY - (bottomY + T);
  const shelfGap = (interiorH - p.shelfCount * T) / (p.shelfCount + 1);

  const components: Component[] = [];
  const zFront = back;

  components.push(
    { id: 'side_l', name: 'דופן שמאל', role: 'side', materialId: p.materialId, thicknessMm: T, origin: { x: 0, y: 0, z: zFront }, size: { x: T, y: p.heightMm, z: boardDepth }, grainAxis: 'y' },
    { id: 'side_r', name: 'דופן ימין', role: 'side', materialId: p.materialId, thicknessMm: T, origin: { x: p.widthMm - T, y: 0, z: zFront }, size: { x: T, y: p.heightMm, z: boardDepth }, grainAxis: 'y' },
  );

  const horizontal = (idBase: string, name: string, role: 'top' | 'bottom' | 'shelf', y: number, loaded: boolean) => {
    for (let b = 0; b < bays; b++) {
      const x = T + b * (bayW + T);
      components.push({
        id: bays > 1 ? `${idBase}_b${b + 1}` : idBase,
        name: bays > 1 ? `${name} (תא ${b + 1})` : name,
        role,
        materialId: p.materialId,
        thicknessMm: T,
        origin: { x, y, z: zFront },
        size: { x: bayW, y: T, z: boardDepth },
        spanMm: bayW,
        load: loaded ? p.loadPerShelf : undefined,
        grainAxis: 'x',
      });
    }
  };

  horizontal('bottom', 'תחתית', 'bottom', bottomY, true);
  for (let s = 0; s < p.shelfCount; s++) {
    const y = bottomY + T + shelfGap * (s + 1) + T * s;
    horizontal(`shelf_${s + 1}`, `מדף ${s + 1}`, 'shelf', y, true);
  }
  horizontal('top', 'גג', 'top', topY, false);

  for (let d = 0; d < p.dividerCount; d++) {
    const x = T + (d + 1) * bayW + d * T;
    components.push({
      id: `divider_${d + 1}`,
      name: `מחיצה ${d + 1}`,
      role: 'divider',
      materialId: p.materialId,
      thicknessMm: T,
      origin: { x, y: bottomY + T, z: zFront },
      size: { x: T, y: interiorH, z: boardDepth },
      grainAxis: 'y',
    });
  }

  if (p.plinthHeightMm > 0) {
    components.push({
      id: 'plinth',
      name: 'סוקל',
      role: 'plinth',
      materialId: p.materialId,
      thicknessMm: T,
      origin: { x: T, y: 0, z: p.depthMm - T },
      size: { x: innerW, y: p.plinthHeightMm, z: T },
      grainAxis: 'x',
    });
  }

  if (p.hasBack) {
    components.push({
      id: 'back',
      name: 'גב',
      role: 'back',
      materialId: p.backMaterialId,
      thicknessMm: back,
      origin: { x: 0, y: 0, z: 0 },
      size: { x: p.widthMm, y: p.heightMm, z: back },
      grainAxis: 'y',
    });
  }

  return {
    params: p,
    components,
    parts: derivePartsFromComponents(components, p),
    hardware: deriveHardware(p, components),
    overall: { x: p.widthMm, y: p.heightMm, z: p.depthMm },
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Parts are grouped from components with identical cut geometry, so cut list and 3D cannot diverge. */
export function derivePartsFromComponents(components: Component[], p: OpenShelfParams): Part[] {
  const groups = new Map<string, Part>();
  for (const c of components) {
    const material = getMaterial(c.materialId);
    const dims = [c.size.x, c.size.y, c.size.z].sort((a, b) => b - a);
    const face = dims.slice(0, 2);
    // Face dimensions = the two extents that are not the thickness.
    const extents = { x: c.size.x, y: c.size.y, z: c.size.z };
    const thicknessAxis = (Object.keys(extents) as Array<'x' | 'y' | 'z'>).find((k) => Math.abs(extents[k] - c.thicknessMm) < 1e-6);
    let lengthMm = face[0];
    let widthMm = face[1];
    if (thicknessAxis) {
      const others = (['x', 'y', 'z'] as const).filter((k) => k !== thicknessAxis);
      const grain = c.grainAxis && others.includes(c.grainAxis) ? c.grainAxis : null;
      if (grain) {
        lengthMm = extents[grain];
        widthMm = extents[others.find((k) => k !== grain)!];
      } else {
        lengthMm = Math.max(extents[others[0]], extents[others[1]]);
        widthMm = Math.min(extents[others[0]], extents[others[1]]);
      }
    }
    const frontBanded = p.edgeBandMm > 0 && c.role !== 'back' && c.role !== 'plinth';
    // Front edge runs along the component's length for horizontals and dividers' height for sides.
    const edgeBanding = {
      length1: frontBanded && (c.role === 'side' || c.role === 'divider' || c.role === 'shelf' || c.role === 'top' || c.role === 'bottom') ? p.edgeBandMm : 0,
      length2: 0,
      width1: 0,
      width2: 0,
    };
    const part: Omit<Part, 'id' | 'quantity' | 'componentIds' | 'name'> = {
      materialId: c.materialId,
      thicknessMm: c.thicknessMm,
      lengthMm: round1(lengthMm),
      widthMm: round1(widthMm),
      grainLocked: material?.hasGrain ?? false,
      edgeBanding,
    };
    const key = JSON.stringify([c.role === 'top' || c.role === 'bottom' || c.role === 'shelf' ? 'horizontal' : c.role, part]);
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.componentIds.push(c.id);
    } else {
      groups.set(key, { ...part, id: `P${groups.size + 1}`, name: partName(c.role), quantity: 1, componentIds: [c.id] });
    }
  }
  return [...groups.values()];
}

function partName(role: Component['role']): string {
  switch (role) {
    case 'side':
      return 'דופן';
    case 'top':
    case 'bottom':
    case 'shelf':
      return 'לוח אופקי (גג/תחתית/מדף)';
    case 'divider':
      return 'מחיצה';
    case 'back':
      return 'גב';
    case 'plinth':
      return 'סוקל';
  }
}

/**
 * Phase-1 hardware is deliberately generic: screw joints + back fixings.
 * Quantities follow explicit rules shown to the user; they are assumptions, not engineering results.
 */
export function deriveHardware(p: OpenShelfParams, components: Component[]): HardwareLine[] {
  const horizontals = components.filter((c) => c.role === 'top' || c.role === 'bottom' || c.role === 'shelf');
  const joints = horizontals.length * 2 + components.filter((c) => c.role === 'divider').length * 2 + (p.plinthHeightMm > 0 ? 2 : 0);
  const screwsPerJoint = Math.max(2, Math.ceil((p.depthMm - (p.hasBack ? p.backThicknessMm : 0)) / 150));
  const lines: HardwareLine[] = [
    {
      id: 'joint_screw',
      name: 'בורג חיבור לעץ (קונפירמט)',
      spec: `ל-${p.thicknessMm} מ"מ — מידה לפי יצרן הבורג`,
      quantity: joints * screwsPerJoint,
      basis: `${joints} חיבורים × ${screwsPerJoint} ברגים (כלל: בורג לכל 150 מ"מ עומק, מינימום 2). הנחה — לא חישוב חוזק חיבור.`,
    },
  ];
  if (p.hasBack) {
    const perimeter = 2 * (p.widthMm + p.heightMm);
    const internalRuns = horizontals.length > 0 ? p.shelfCount * p.widthMm : 0;
    lines.push({
      id: 'back_screw',
      name: 'בורג קיבוע גב',
      spec: 'בורג עץ קצר, ראש שטוח',
      quantity: Math.ceil((perimeter + internalRuns) / 200),
      basis: 'בורג כל 200 מ"מ לאורך ההיקף ולאורך המדפים. הנחה.',
    });
  }
  lines.push({
    id: 'wall_anchor',
    name: 'ערכת עיגון לקיר (נגד התהפכות)',
    spec: 'מתאימה לסוג הקיר — לבחור לפי הקיר בפועל',
    quantity: 2,
    basis: 'מומלץ לכל יחידת אחסון עומדת. היציבות לא מחושבת בגרסה זו.',
  });
  return lines;
}

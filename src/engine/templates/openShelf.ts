import type { Component, FurnitureModel, HardwareLine, OpenShelfParams, Opening } from '../types';
import { tr } from '../i18n';
import { getMaterial, supplierProductFor } from '../materials';
import { derivePartsFromComponents, floorToStep } from './common';

export { derivePartsFromComponents, floorToStep } from './common';

/** 32 mm system (Hettich System 32, see SOURCES.system32). */
export const SYSTEM32 = { pitchMm: 32, holeDiameterMm: 5, setbackMm: 37, holeDepthMm: [12, 14] as const };
/** Product decision: the first shelf-support hole sits this far above the bottom board. */
export const FIRST_PIN_HOLE_MM = 64;

/** Edge-to-edge clearance left between door leaves and around each door. */
export const DOOR_GAP_MM = 3;
/** Bays wider than this get two door leaves instead of one. */
export const MAX_SINGLE_DOOR_MM = 600;

export const DEFAULT_OPEN_SHELF: OpenShelfParams = {
  template: 'open_shelf',
  widthMm: 800,
  heightMm: 1800,
  depthMm: 300,
  materialId: 'hayozrim:birch-18mm',
  thicknessMm: 18,
  finishId: 'ליבנה גלוי',
  shelfCount: 3,
  dividerCount: 0,
  doors: 'none',
  shelfMounting: 'fixed',
  hasBack: true,
  backMaterialId: 'hayozrim:plywood-formica-4-6mm',
  backThicknessMm: 5.5,
  backFinishId: 'לבן מט',
  backNails: '50_nails',
  plinthHeightMm: 0,
  loadPerShelf: { label: 'ספרים', massKg: 20, distribution: 'uniform' },
  edgeOption: 'none',
  finish: { type: 'supplier', sheen: 'matte', color: '#d9b98c' },
};

/**
 * Construction (Phase 1, documented so geometry, cut list and 3D stay one source of truth):
 * - Sides run full height. Top, bottom and shelves sit between the sides (butt joints, screwed).
 * - Back panel (if any) is surface-mounted on the rear edges.
 * - Every other board sits in front of the back.
 * - Optional plinth: a front kick board between the sides; the bottom sits on top of it.
 * - Dividers run between bottom and top, splitting every horizontal board into equal bays.
 *
 * When the body material is ordered from a supplier whose form accepts whole centimetres only, every
 * ordered part is rounded down to that step and the carcass is built around the ordered parts:
 * bay widths and board depth are floored, so overall width/depth shrink by a few millimetres rather
 * than leaving gaps at structural joints. Parts that cannot absorb the difference (dividers, plinth,
 * back) are floored and the remaining gap is reported by validation.
 */
export function buildOpenShelf(p: OpenShelfParams): FurnitureModel {
  const body = supplierProductFor(getMaterial(p.materialId));
  const step = body?.product.limits.stepMm ?? 0;
  const snap = (v: number) => floorToStep(v, step);

  const T = p.thicknessMm;
  const back = p.hasBack ? p.backThicknessMm : 0;
  const doorT = p.doors === 'hinged' ? T : 0;
  const bays = p.dividerCount + 1;
  const bayW = snap((p.widthMm - 2 * T - p.dividerCount * T) / bays);
  const innerW = bays * bayW + p.dividerCount * T;
  const W = innerW + 2 * T;
  const boardDepth = snap(p.depthMm - back - doorT);
  const D = boardDepth + back;
  const H = snap(p.heightMm);
  const plinthH = snap(p.plinthHeightMm);
  const bottomY = plinthH;
  const topY = H - T;
  const interiorH = topY - (bottomY + T);
  const shelfGap = (interiorH - p.shelfCount * T) / (p.shelfCount + 1);

  const components: Component[] = [];
  const zFront = back;

  components.push(
    { id: 'side_l', name: tr('דופן שמאל', 'Left side panel'), role: 'side', materialId: p.materialId, thicknessMm: T, origin: { x: 0, y: 0, z: zFront }, size: { x: T, y: H, z: boardDepth }, grainAxis: 'y' },
    { id: 'side_r', name: tr('דופן ימין', 'Right side panel'), role: 'side', materialId: p.materialId, thicknessMm: T, origin: { x: W - T, y: 0, z: zFront }, size: { x: T, y: H, z: boardDepth }, grainAxis: 'y' },
  );

  // Loose shelves on supports need side clearance; with whole-centimetre ordering that is one full step.
  const pinShelfW = step ? bayW - step : bayW - 2;
  const horizontal = (idBase: string, name: string, role: 'top' | 'bottom' | 'shelf', y: number, loaded: boolean) => {
    const loose = role === 'shelf' && p.shelfMounting === 'pins';
    const width = loose ? pinShelfW : bayW;
    for (let b = 0; b < bays; b++) {
      components.push({
        id: bays > 1 ? `${idBase}_b${b + 1}` : idBase,
        name: bays > 1 ? tr(`${name} (תא ${b + 1})`, `${name} (bay ${b + 1})`) : name,
        role,
        materialId: p.materialId,
        thicknessMm: T,
        origin: { x: T + b * (bayW + T) + (bayW - width) / 2, y, z: zFront },
        size: { x: width, y: T, z: boardDepth },
        // A loose shelf spans between the supports on the bay faces.
        spanMm: bayW,
        load: loaded ? p.loadPerShelf : undefined,
        grainAxis: 'x',
      });
    }
  };

  horizontal('bottom', tr('תחתית', 'Bottom'), 'bottom', bottomY, true);
  for (let s = 0; s < p.shelfCount; s++) {
    horizontal(`shelf_${s + 1}`, tr(`מדף ${s + 1}`, `Shelf ${s + 1}`), 'shelf', bottomY + T + shelfGap * (s + 1) + T * s, true);
  }
  horizontal('top', tr('גג', 'Top'), 'top', topY, false);

  const dividerH = snap(interiorH);
  for (let d = 0; d < p.dividerCount; d++) {
    components.push({
      id: `divider_${d + 1}`,
      name: tr(`מחיצה ${d + 1}`, `Divider ${d + 1}`),
      role: 'divider',
      materialId: p.materialId,
      thicknessMm: T,
      origin: { x: T + (d + 1) * bayW + d * T, y: bottomY + T, z: zFront },
      size: { x: T, y: dividerH, z: boardDepth },
      grainAxis: 'y',
    });
  }

  if (plinthH > 0) {
    const plinthL = snap(innerW);
    components.push({
      id: 'plinth',
      name: tr('סוקל', 'Plinth'),
      role: 'plinth',
      materialId: p.materialId,
      thicknessMm: T,
      origin: { x: T + (innerW - plinthL) / 2, y: 0, z: D - T },
      size: { x: plinthL, y: plinthH, z: T },
      grainAxis: 'x',
    });
  }

  if (p.hasBack) {
    const backStep = supplierProductFor(getMaterial(p.backMaterialId))?.product.limits.stepMm ?? 0;
    const backW = floorToStep(W, backStep);
    const backH = floorToStep(H, backStep);
    components.push({
      id: 'back',
      name: tr('גב', 'Back panel'),
      role: 'back',
      materialId: p.backMaterialId,
      thicknessMm: back,
      origin: { x: (W - backW) / 2, y: (H - backH) / 2, z: 0 },
      size: { x: backW, y: backH, z: back },
      grainAxis: 'y',
    });
  }

  if (p.doors === 'hinged') {
    const doorH = snap(H - plinthH - DOOR_GAP_MM);
    let n = 0;
    for (let b = 0; b < bays; b++) {
      // Full overlay: each bay's doors cover the bay and half of the board on either side of it.
      const x0 = b === 0 ? 0 : T + b * (bayW + T) - T / 2;
      const x1 = b === bays - 1 ? W : T + b * (bayW + T) + bayW + T / 2;
      const leaves = x1 - x0 > MAX_SINGLE_DOOR_MM ? 2 : 1;
      const leafW = snap((x1 - x0 - leaves * DOOR_GAP_MM) / leaves);
      const used = leaves * leafW + (leaves - 1) * DOOR_GAP_MM;
      for (let l = 0; l < leaves; l++) {
        n++;
        components.push({
          id: `door_${n}`,
          name: tr(`דלת ${n}`, `Door ${n}`),
          role: 'door',
          materialId: p.materialId,
          thicknessMm: T,
          origin: { x: x0 + (x1 - x0 - used) / 2 + l * (leafW + DOOR_GAP_MM), y: plinthH + (H - plinthH - doorH) / 2, z: D },
          size: { x: leafW, y: doorH, z: T },
          grainAxis: 'y',
        });
      }
    }
  }

  // Every void between two horizontal boards, in every bay, is somewhere a component can be added.
  const levelYs = [bottomY, ...Array.from({ length: p.shelfCount }, (_, i) => bottomY + T + shelfGap * (i + 1) + T * i), topY];
  const openings: Opening[] = [];
  for (let b = 0; b < bays; b++) {
    for (let l = 0; l < levelYs.length - 1; l++) {
      const y = levelYs[l] + T;
      const height = levelYs[l + 1] - y;
      if (height <= 0) continue;
      const suffix = bays > 1 ? `_b${b + 1}` : '';
      const below = l === 0 ? `bottom${suffix}` : `shelf_${l}${suffix}`;
      const above = l === levelYs.length - 2 ? `top${suffix}` : `shelf_${l + 1}${suffix}`;
      const left = b === 0 ? 'side_l' : `divider_${b}`;
      const right = b === bays - 1 ? 'side_r' : `divider_${b + 1}`;
      openings.push({
        id: `bay${b + 1}_level${l + 1}`,
        name: bays > 1 ? tr(`תא ${b + 1}, מפלס ${l + 1}`, `Bay ${b + 1}, level ${l + 1}`) : tr(`מפלס ${l + 1}`, `Level ${l + 1}`),
        origin: { x: T + b * (bayW + T), y, z: zFront },
        size: { x: bayW, y: height, z: boardDepth },
        boundedBy: [below, above, left, right].filter((id) => components.some((c) => c.id === id)),
      });
    }
  }

  return {
    params: p,
    orderStepMm: step,
    requested: { x: p.widthMm, y: p.heightMm, z: p.depthMm },
    openings,
    components,
    parts: derivePartsFromComponents(components, p, (c) => [...(doorMachining(c, p) ?? []), ...(pinMachining(c, p, bottomY + T, interiorH) ?? [])]),
    hardware: deriveHardware(p, components),
    overall: { x: W, y: H, z: D + doorT },
  };
}

/** Hinges per door by height — a common rule of thumb, to be confirmed against the hinge maker's table (door weight and width also matter). */
export function hingesForDoor(heightMm: number): number {
  if (heightMm <= 900) return 2;
  if (heightMm <= 1600) return 3;
  if (heightMm <= 2000) return 4;
  return 5;
}

/** Shelf-support hole positions along the interior height (from the top face of the bottom board). */
export function pinHoleCount(interiorHMm: number): number {
  return Math.max(0, Math.floor((interiorHMm - 2 * FIRST_PIN_HOLE_MM) / SYSTEM32.pitchMm) + 1);
}

function pinMachining(c: Component, p: OpenShelfParams, _interiorBottom: number, interiorH: number): string[] | undefined {
  if (p.shelfMounting !== 'pins' || p.shelfCount === 0 || (c.role !== 'side' && c.role !== 'divider')) return undefined;
  const n = pinHoleCount(interiorH);
  const base = tr(
    `2 שורות קדחים Ø${SYSTEM32.holeDiameterMm} מ"מ לתומכי מדף, ${n} חורים בשורה כל ${SYSTEM32.pitchMm} מ"מ, החור הראשון ${FIRST_PIN_HOLE_MM} מ"מ מעל התחתית; שורה קדמית ${SYSTEM32.setbackMm} מ"מ מהקצה הקדמי ושורה אחורית ${SYSTEM32.setbackMm} מ"מ מהקצה האחורי; עומק ${SYSTEM32.holeDepthMm[0]}–${SYSTEM32.holeDepthMm[1]} מ"מ`,
    `2 rows of Ø${SYSTEM32.holeDiameterMm} mm shelf-support holes, ${n} holes per row at ${SYSTEM32.pitchMm} mm, first hole ${FIRST_PIN_HOLE_MM} mm above the bottom; front row ${SYSTEM32.setbackMm} mm from the front edge, back row ${SYSTEM32.setbackMm} mm from the back edge; depth ${SYSTEM32.holeDepthMm[0]}–${SYSTEM32.holeDepthMm[1]} mm`,
  );
  if (c.role === 'side') return [tr(`${base} — בצד הפנימי בלבד`, `${base} — inner face only`)];
  // Two 12–14 mm holes from opposite faces of an 18 mm divider would meet, so the faces are offset by half a pitch.
  return [
    tr(
      `${base} — בשני הצדדים, כשהשורות בצד השני מוסטות ב-${SYSTEM32.pitchMm / 2} מ"מ כדי שהקדחים לא ייפגשו`,
      `${base} — on both faces, with the second face's rows offset by ${SYSTEM32.pitchMm / 2} mm so the holes do not meet`,
    ),
  ];
}

function doorMachining(c: Component, p: OpenShelfParams): string[] | undefined {
  if (p.doors !== 'hinged') return undefined;
  if (c.role === 'door')
    return [
      tr(
        `${hingesForDoor(c.size.y)} קידוחי כוס ציר Ø35 מ"מ בצד הפנימי, לאורך צד הציר — מרחק מהקצה ועומק לפי דגם הציר`,
        `${hingesForDoor(c.size.y)} Ø35 mm hinge-cup bores on the inner face along the hinge edge — edge distance and depth per the hinge model`,
      ),
    ];
  if (c.role === 'side' || c.role === 'divider')
    return [tr('קידוח לפלטות ציר מול כל כוס ציר — לפי דגם הציר', 'Holes for the hinge mounting plates opposite each hinge cup — per the hinge model')];
  return undefined;
}

function looseShelvesCount(p: OpenShelfParams, components: Component[]): number {
  return p.shelfMounting === 'pins' ? components.filter((c) => c.role === 'shelf').length : 0;
}

/**
 * Phase-1 hardware is deliberately generic: screw joints + back fixings.
 * Quantities follow explicit rules shown to the user; they are assumptions, not engineering results.
 */
export function deriveHardware(p: OpenShelfParams, components: Component[]): HardwareLine[] {
  const horizontals = components.filter((c) => c.role === 'top' || c.role === 'bottom' || c.role === 'shelf');
  const joints = (horizontals.length - looseShelvesCount(p, components)) * 2 + components.filter((c) => c.role === 'divider').length * 2 + (p.plinthHeightMm > 0 ? 2 : 0);
  const doors = components.filter((c) => c.role === 'door');
  const looseShelves = p.shelfMounting === 'pins' ? components.filter((c) => c.role === 'shelf').length : 0;
  const boardDepth = horizontals[0]?.size.z ?? p.depthMm;
  const screwsPerJoint = Math.max(2, Math.ceil(boardDepth / 150));
  const lines: HardwareLine[] = [
    {
      id: 'joint_screw',
      name: tr('בורג חיבור לעץ (קונפירמט)', 'Wood joint screw (confirmat)'),
      spec: tr(`ל-${p.thicknessMm} מ"מ — מידה לפי יצרן הבורג`, `For ${p.thicknessMm} mm boards — size per the screw manufacturer`),
      quantity: joints * screwsPerJoint,
      basis: tr(
        `${joints} חיבורים × ${screwsPerJoint} ברגים (כלל: בורג לכל 150 מ"מ עומק, מינימום 2). הנחה — לא חישוב חוזק חיבור.`,
        `${joints} joints × ${screwsPerJoint} screws (rule: one screw per 150 mm of depth, minimum 2). Assumption — not a joint strength calculation.`,
      ),
    },
  ];
  if (p.hasBack) {
    const back = components.find((c) => c.role === 'back');
    const perimeter = back ? 2 * (back.size.x + back.size.y) : 0;
    const internalRuns = p.shelfCount * (back?.size.x ?? p.widthMm);
    lines.push({
      id: 'back_fixing',
      name: tr('מסמר/בורג קיבוע גב', 'Back panel nail/screw'),
      spec: tr('מסמר או בורג עץ קצר', 'Nail or short wood screw'),
      quantity: Math.ceil((perimeter + internalRuns) / 150),
      basis: tr('אחד כל 150 מ"מ לאורך ההיקף ולאורך המדפים. הנחה.', 'One every 150 mm along the perimeter and along the shelves. Assumption.'),
    });
  }
  if (looseShelves) {
    lines.push({
      id: 'shelf_pin',
      name: tr(`תומך מדף לחור Ø${SYSTEM32.holeDiameterMm} מ"מ`, `Shelf support for a Ø${SYSTEM32.holeDiameterMm} mm hole`),
      spec: tr('שהמשטח התומך שלו בולט מהדופן יותר ממרווח המדף — לפי מפרט היצרן', 'Its supporting ledge must stick out from the panel further than the shelf clearance — per the maker’s datasheet'),
      quantity: looseShelves * 4,
      basis: tr('4 לכל מדף מתכוונן.', '4 per adjustable shelf.'),
    });
  }
  if (doors.length) {
    lines.push(
      {
        id: 'hinge',
        name: tr('ציר כוס 35 מ"מ לדלת חופפת מלאה, כולל פלטה', '35 mm cup hinge for full-overlay doors, with mounting plate'),
        spec: tr(`לדלת ${p.thicknessMm} מ"מ, פתיחה 110° — דגם לפי יצרן`, `For ${p.thicknessMm} mm doors, 110° opening — model per manufacturer`),
        quantity: doors.reduce((a, d) => a + hingesForDoor(d.size.y), 0),
        basis: tr(
          'לפי גובה הדלת: עד 90 ס"מ — 2, עד 160 — 3, עד 200 — 4, מעל — 5. כלל אצבע מקובל; לאמת מול טבלת יצרן הציר לפי משקל ורוחב הדלת.',
          'By door height: up to 90 cm — 2, up to 160 — 3, up to 200 — 4, above — 5. Common rule of thumb; confirm against the hinge maker’s table for door weight and width.',
        ),
      },
      {
        id: 'handle',
        name: tr('ידית או כפתור', 'Handle or knob'),
        spec: tr('לבחירה; או חריץ אחיזה בעיבוד CNC (בהמשך)', 'Your choice; or a CNC finger pull (later)'),
        quantity: doors.length,
        basis: tr('אחת לכל כנף.', 'One per door leaf.'),
      },
    );
  }
  lines.push({
    id: 'wall_anchor',
    name: tr('ערכת עיגון לקיר (נגד התהפכות)', 'Wall anchor kit (anti-tip)'),
    spec: tr('מתאימה לסוג הקיר — לבחור לפי הקיר בפועל', 'Suited to the wall type — choose according to the actual wall'),
    quantity: 2,
    basis: tr('מומלץ לכל יחידת אחסון עומדת. היציבות לא מחושבת בגרסה זו.', 'Recommended for every free-standing storage unit. Stability is not calculated in this version.'),
  });
  return lines;
}

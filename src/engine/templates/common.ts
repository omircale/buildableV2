import { angledEndAllowanceMm } from '../geometry';
import { tr } from '../i18n';
import { getMaterial, supplierProductFor } from '../materials';
import { isOpenShelf, type Component, type DesignParams, type HardwareLine, type Part } from '../types';

/** Decor of one component: its own override, then its part type's, then the back panel's or the body's. */
export function finishFor(c: Pick<Component, 'id' | 'role'>, p: DesignParams): string {
  return p.partFinishes?.[c.id] ?? p.roleFinishes?.[c.role] ?? (c.role === 'back' && isOpenShelf(p) ? p.backFinishId : p.finishId);
}

/** Largest multiple of `step` not exceeding `v` (step 0 = unchanged). */
export function floorToStep(v: number, step: number): number {
  if (!step) return v;
  return Math.floor(v / step + 1e-9) * step;
}

/** Smallest multiple of `step` not below `v` (step 0 = unchanged). */
export function ceilToStep(v: number, step: number): number {
  if (!step) return v;
  return Math.ceil(v / step - 1e-9) * step;
}

/** Dimension step imposed by the supplier's order form for a material (0 = exact millimetres). */
export function orderStepFor(materialId: string): number {
  return supplierProductFor(getMaterial(materialId))?.product.limits.stepMm ?? 0;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

const HORIZONTAL_ROLES: Component['role'][] = ['top', 'bottom', 'shelf'];
const UNBANDED_ROLES: Component['role'][] = ['back', 'plinth', 'support', 'slat', 'box_side', 'box_back', 'box_bottom'];

/**
 * Parts are grouped from components with identical cut geometry, so cut list and 3D cannot diverge.
 * `machiningFor` attaches drilling / angle-cut notes that the supplier's straight cut does not cover.
 */
export function derivePartsFromComponents(components: Component[], p: DesignParams, machiningFor?: (c: Component) => string[] | undefined): Part[] {
  const groups = new Map<string, Part>();
  for (const c of components) {
    if (c.reference) continue;
    const material = getMaterial(c.materialId);
    // An angled end eats into the rectangle the supplier delivers, so the board ordered is longer than
    // the body between the cuts, and rounded up to a whole ordering step like every other part.
    // Ordering the body length would arrive short.
    const allowance = angledEndAllowanceMm(c);
    const extents = { x: allowance > 0 ? ceilToStep(c.size.x + allowance, orderStepFor(c.materialId)) : c.size.x, y: c.size.y, z: c.size.z };
    const thicknessAxis = (['x', 'y', 'z'] as const).find((k) => Math.abs(extents[k] - c.thicknessMm) < 1e-6);
    const faceAxes = (['x', 'y', 'z'] as const).filter((k) => k !== thicknessAxis).slice(0, 2);
    const grain = c.grainAxis && faceAxes.includes(c.grainAxis) ? c.grainAxis : null;
    let lengthMm: number;
    let widthMm: number;
    if (grain) {
      lengthMm = extents[grain];
      widthMm = extents[faceAxes.find((k) => k !== grain)!];
    } else {
      lengthMm = Math.max(extents[faceAxes[0]], extents[faceAxes[1]]);
      widthMm = Math.min(extents[faceAxes[0]], extents[faceAxes[1]]);
    }

    const banded = !UNBANDED_ROLES.includes(c.role);
    // Doors show every edge; other boards band the visible (front / top) long edge first.
    const allRound = c.role === 'door' ? p.edgeOption !== 'none' : p.edgeOption === 'all';
    const edges = {
      long1: banded && p.edgeOption !== 'none',
      long2: banded && allRound,
      short1: banded && allRound,
      short2: banded && allRound,
    };
    const angleNote = c.endCutDeg
      ? [
          tr(
            `חיתוך בזווית ${[c.endCutDeg.start, c.endCutDeg.end].filter((d) => d).map((d) => `${Math.abs(d!)}°`).join(' ו-')} בקצוות — הספק חותך ישר בלבד, לבצע בבית. האורך המוזמן כולל את תוספת החומר לזווית.`,
            `${[c.endCutDeg.start, c.endCutDeg.end].filter((d) => d).map((d) => `${Math.abs(d!)}°`).join(' and ')} angled end cuts — the supplier cuts straight only, do these at home. The ordered length already includes the material the angle takes.`,
          ),
        ]
      : [];
    const machining = [...angleNote, ...(machiningFor?.(c) ?? [])];
    const part: Omit<Part, 'id' | 'quantity' | 'componentIds' | 'name'> = {
      materialId: c.materialId,
      thicknessMm: c.thicknessMm,
      lengthMm: round1(lengthMm),
      widthMm: round1(widthMm),
      grainLocked: material?.hasGrain ?? false,
      edges,
      finishId: finishFor(c, p),
      ...(machining.length ? { machining } : {}),
    };
    const key = JSON.stringify([HORIZONTAL_ROLES.includes(c.role) ? 'horizontal' : c.role, part]);
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

export function partName(role: Component['role']): string {
  switch (role) {
    case 'side':
      return tr('דופן', 'Side panel');
    case 'top':
    case 'bottom':
    case 'shelf':
      return tr('לוח אופקי (גג/תחתית/מדף)', 'Horizontal board (top/bottom/shelf)');
    case 'divider':
      return tr('מחיצה', 'Divider');
    case 'back':
      return tr('גב', 'Back panel');
    case 'plinth':
      return tr('סוקל', 'Plinth');
    case 'door':
      return tr('דלת', 'Door');
    case 'rail':
      return tr('דופן אורך', 'Side rail');
    case 'end':
      return tr('דופן רוחב', 'End board');
    case 'headboard':
      return tr('ראש מיטה', 'Headboard');
    case 'support':
      return tr('לוח תמיכה לדקים', 'Slat support board');
    case 'slat':
      return tr('דק', 'Slat');
    case 'post':
      return tr('עמוד', 'Post');
    case 'rafter':
      return tr('קורת גג', 'Roof rafter');
    case 'ridge':
      return tr('קורת רכס', 'Ridge board');
    case 'seat':
      return tr('מושב', 'Seat');
    case 'backrest':
      return tr('משענת', 'Backrest');
    case 'apron':
      return tr('קורת חיזוק', 'Rail');
    case 'upright':
      return tr('עמוד אנכי', 'Upright');
    case 'foot':
      return tr('רגל בסיס', 'Foot board');
    case 'header':
      return tr('קורה עליונה', 'Header');
    case 'mattress':
      return tr('מזרן', 'Mattress');
    case 'bar':
      return tr('מוט', 'Bar');
    case 'drawer_front':
      return tr('חזית מגירה', 'Drawer front');
    case 'box_side':
      return tr('דופן ארגז', 'Box side');
    case 'box_back':
      return tr('דופן קדמית/אחורית של ארגז', 'Box front/back');
    case 'box_bottom':
      return tr('תחתית ארגז', 'Box bottom');
  }
}

/** One screw joint rule shared by all templates: one screw per 150 mm of joint length, minimum 2. */
export function jointScrews(joints: { lengthMm: number }[], thicknessMm: number): HardwareLine {
  const count = joints.reduce((a, j) => a + Math.max(2, Math.ceil(j.lengthMm / 150)), 0);
  return {
    id: 'joint_screw',
    name: tr('בורג חיבור לעץ (קונפירמט)', 'Wood joint screw (confirmat)'),
    spec: tr(`ל-${thicknessMm} מ"מ — מידה לפי יצרן הבורג`, `For ${thicknessMm} mm boards — size per the screw manufacturer`),
    quantity: count,
    basis: tr(
      `${joints.length} חיבורים (כלל: בורג לכל 150 מ"מ אורך חיבור, מינימום 2). הנחה — לא חישוב חוזק חיבור.`,
      `${joints.length} joints (rule: one screw per 150 mm of joint length, minimum 2). Assumption — not a joint strength calculation.`,
    ),
  };
}

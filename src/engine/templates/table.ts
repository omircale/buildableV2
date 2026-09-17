import { tr } from '../i18n';
import type { AssemblyStep, Check, Component, DesignChange, FurnitureModel, TableParams } from '../types';
import { derivePartsFromComponents, floorToStep, jointScrews, orderStepFor } from './common';

const BASE: Omit<TableParams, 'widthMm' | 'heightMm' | 'depthMm' | 'topLoadKg' | 'topLoadDistribution' | 'middleSupport' | 'hasApron' | 'lowerShelfHeightMm' | 'lowerShelfLoadKg'> = {
  template: 'table',
  materialId: 'hayozrim:birch-18mm',
  thicknessMm: 18,
  finishId: 'ליבנה גלוי',
  edgeOption: 'none',
  finish: { type: 'supplier', sheen: 'matte', color: '#d9b98c' },
  apronHeightMm: 150,
};

export const DEFAULT_DESK: TableParams = { ...BASE, widthMm: 1200, heightMm: 750, depthMm: 600, topLoadKg: 30, topLoadDistribution: 'uniform', middleSupport: false, hasApron: true, lowerShelfHeightMm: 0, lowerShelfLoadKg: 0 };
export const DEFAULT_BENCH: TableParams = { ...BASE, widthMm: 1000, heightMm: 450, depthMm: 350, topLoadKg: 110, topLoadDistribution: 'point_center', middleSupport: true, hasApron: true, lowerShelfHeightMm: 100, lowerShelfLoadKg: 10 };
export const DEFAULT_COFFEE_TABLE: TableParams = { ...BASE, widthMm: 1000, heightMm: 400, depthMm: 550, topLoadKg: 20, topLoadDistribution: 'uniform', middleSupport: false, hasApron: false, lowerShelfHeightMm: 100, lowerShelfLoadKg: 10 };
export const DEFAULT_NIGHTSTAND: TableParams = { ...BASE, widthMm: 450, heightMm: 550, depthMm: 400, topLoadKg: 10, topLoadDistribution: 'uniform', middleSupport: false, hasApron: true, lowerShelfHeightMm: 150, lowerShelfLoadKg: 8 };

export const TABLE_LIMITS = [
  { key: 'widthMm', min: 300, max: 2400, he: 'רוחב', en: 'Width' },
  { key: 'heightMm', min: 250, max: 1100, he: 'גובה', en: 'Height' },
  { key: 'depthMm', min: 250, max: 1200, he: 'עומק', en: 'Depth' },
  { key: 'topLoadKg', min: 0, max: 250, he: 'עומס על המשטח', en: 'Load on the top' },
  { key: 'apronHeightMm', min: 100, max: 400, he: 'גובה קורת חיזוק', en: 'Rail height' },
  { key: 'lowerShelfHeightMm', min: 0, max: 800, he: 'גובה מדף תחתון', en: 'Lower shelf height' },
  { key: 'lowerShelfLoadKg', min: 0, max: 100, he: 'עומס מדף תחתון', en: 'Lower shelf load' },
] as const;

/**
 * Slab-end table (x = width, y = up, z = depth, z=0 at the back):
 * - Two full-depth side panels stand on the floor; the top lies on them across the full width.
 * - Optional back rail (apron) between the sides right under the top — the only racking resistance.
 * - Optional lower shelf between the sides, in front of nothing, at its own height.
 */
export function buildTable(p: TableParams): FurnitureModel {
  const step = orderStepFor(p.materialId);
  const snap = (v: number) => floorToStep(v, step);
  const T = p.thicknessMm;
  const W = snap(p.widthMm);
  const D = snap(p.depthMm);
  // Side panels are cut in whole centimetres; the top sits on them, so the height follows the parts.
  const sideH = snap(p.heightMm - T);
  const H = sideH + T;
  const innerW = W - 2 * T;
  const bays = p.middleSupport ? 2 : 1;
  // Clear width of each bay between the panels, in whole centimetres, centred in its bay.
  const bayW = (innerW - (bays - 1) * T) / bays;
  const clear = snap(bayW);
  const bayX = (b: number) => T + b * (bayW + T) + (bayW - clear) / 2;
  const m = p.materialId;
  const components: Component[] = [];
  const board = (c: Omit<Component, 'materialId' | 'thicknessMm'>) => components.push({ ...c, materialId: m, thicknessMm: T });

  board({ id: 'side_l', name: tr('דופן שמאל', 'Left side panel'), role: 'side', origin: { x: 0, y: 0, z: 0 }, size: { x: T, y: sideH, z: D }, grainAxis: 'y' });
  board({ id: 'side_r', name: tr('דופן ימין', 'Right side panel'), role: 'side', origin: { x: W - T, y: 0, z: 0 }, size: { x: T, y: sideH, z: D }, grainAxis: 'y' });
  board({
    id: 'top',
    name: tr('משטח', 'Top'),
    role: 'top',
    origin: { x: 0, y: H - T, z: 0 },
    size: { x: W, y: T, z: D },
    // The top rests on the panels: span between the centres of two neighbouring bearings.
    spanMm: bayW + T,
    load: p.topLoadKg > 0 ? { label: tr('עומס על המשטח', 'Load on the top'), massKg: p.topLoadKg, distribution: p.topLoadDistribution } : undefined,
    loadAssumption: tr('המשטח נשען על שתי הדפנות ומחושב כקורה פשוטה בין מרכזי הדפנות', 'The top rests on both side panels and is calculated as a simple beam between their centres'),
    grainAxis: 'x',
  });
  if (p.middleSupport) {
    board({ id: 'middle', name: tr('דופן אמצעית', 'Middle panel'), role: 'divider', origin: { x: T + bayW, y: 0, z: 0 }, size: { x: T, y: sideH, z: D }, grainAxis: 'y' });
  }
  const suffix = (b: number) => (bays > 1 ? `_b${b + 1}` : '');
  const nameSuffix = (b: number) => (bays > 1 ? tr(` (תא ${b + 1})`, ` (bay ${b + 1})`) : '');
  for (let b = 0; b < bays; b++) {
    if (p.hasApron) {
      const apronH = Math.min(snap(p.apronHeightMm), sideH);
      board({ id: `apron${suffix(b)}`, name: tr('קורת חיזוק אחורית', 'Back rail') + nameSuffix(b), role: 'apron', origin: { x: bayX(b), y: sideH - apronH, z: 0 }, size: { x: clear, y: apronH, z: T }, grainAxis: 'x' });
    }
    if (p.lowerShelfHeightMm > 0) {
      board({
        id: `shelf_low${suffix(b)}`,
        name: tr('מדף תחתון', 'Lower shelf') + nameSuffix(b),
        role: 'shelf',
        origin: { x: bayX(b), y: snap(p.lowerShelfHeightMm), z: 0 },
        size: { x: clear, y: T, z: D },
        spanMm: clear,
        load: p.lowerShelfLoadKg > 0 ? { label: tr('מדף תחתון', 'Lower shelf'), massKg: p.lowerShelfLoadKg, distribution: 'uniform' } : undefined,
        grainAxis: 'x',
      });
    }
  }

  const overall = { x: W, y: H, z: D };
  const panels = bays + 1;
  const joints = [
    ...Array.from({ length: panels }, () => ({ lengthMm: D })),
    ...(p.hasApron ? Array.from({ length: bays * 2 }, () => ({ lengthMm: p.apronHeightMm })).concat({ lengthMm: W }) : []),
    ...(p.lowerShelfHeightMm > 0 ? Array.from({ length: bays * 2 }, () => ({ lengthMm: D })) : []),
  ];
  return {
    params: p,
    orderStepMm: step,
    requested: { x: p.widthMm, y: p.heightMm, z: p.depthMm },
    components,
    parts: derivePartsFromComponents(components, p),
    hardware: [jointScrews(joints, T)],
    overall,
  };
}

export function tableChecks(model: FurnitureModel): Check[] {
  const p = model.params as TableParams;
  const out: Check[] = [];
  if (p.lowerShelfHeightMm > 0 && p.lowerShelfHeightMm + p.thicknessMm >= p.heightMm - p.thicknessMm - (p.hasApron ? p.apronHeightMm : 0)) {
    out.push({
      id: 'geometry.lower_shelf',
      category: 'geometry',
      status: 'RED',
      componentIds: model.components.filter((c) => c.id.startsWith('shelf_low')).map((c) => c.id),
      title: tr('המדף התחתון גבוה מדי', 'The lower shelf is too high'),
      explanation: tr('המדף התחתון מתנגש במשטח או בקורת החיזוק.', 'The lower shelf collides with the top or the back rail.'),
      assumptions: [],
      sources: [],
      fixes: [
        // A low shelf only helps when there is room under the top for it; otherwise the honest fix is no shelf.
        ...(100 + 2 * p.thicknessMm < p.heightMm - p.thicknessMm - (p.hasApron ? p.apronHeightMm : 0)
          ? [{ change: { label: tr('מדף בגובה 10 ס"מ', 'Shelf at 10 cm'), set: { lowerShelfHeightMm: 100 } }, projectedStatus: 'GREEN' as const, projectedDetail: '' }]
          : []),
        { change: { label: tr('בלי מדף תחתון', 'No lower shelf'), set: { lowerShelfHeightMm: 0 } }, projectedStatus: 'GREEN', projectedDetail: '' },
      ],
    });
  }
  out.push(
    p.hasApron
      ? {
          id: 'stability.racking',
          category: 'stability',
          status: 'GREY',
          componentIds: model.components.filter((c) => c.role === 'apron').map((c) => c.id),
          title: tr('קשיחות צידית לא חושבה', 'Sideways stiffness not calculated'),
          explanation: tr('קורת החיזוק האחורית מתנגדת לעיוות צידי, אך המערכת לא מחשבת כמה.', 'The back rail resists sideways distortion, but the system does not calculate how much.'),
          assumptions: [],
          sources: [],
          requiredVerification: tr('לנער את הרהיט אחרי ההרכבה ולוודא שאינו מתנדנד', 'Shake the piece after assembly and confirm it does not sway'),
          fixes: [],
        }
      : {
          id: 'stability.racking',
          category: 'stability',
          status: 'YELLOW',
          componentIds: [],
          title: tr('אין קורת חיזוק — אין התנגדות לעיוות צידי', 'No back rail — no resistance to racking'),
          explanation: tr(
            'בלי קורת חיזוק, רק הברגים בין המשטח לדפנות מחזיקים את הזווית, והרהיט עלול להתנדנד לצדדים.',
            'Without a back rail only the screws between top and sides hold the angle, and the piece may wobble sideways.',
          ),
          assumptions: [],
          sources: [],
          fixes: [{ change: { label: tr('הוספת קורת חיזוק', 'Add a back rail'), set: { hasApron: true } }, projectedStatus: 'GREEN', projectedDetail: tr('מקשיח את המסגרת', 'Stiffens the frame') }],
        },
  );
  out.push({
    id: 'safety.physical',
    category: 'safety',
    status: 'YELLOW',
    componentIds: [],
    title: tr('נדרש אימות פיזי', 'Physical verification required'),
    explanation: tr(
      'שולחנות וספסלים נבדקים פיזית לחוזק ויציבות לפי תקני ריהוט. אם יושבים או עומדים על הרהיט, יש להגדיר את משקל האדם כעומס מרוכז. המערכת לא טוענת לעמידה בתקן.',
      'Tables and benches are physically tested for strength and stability under furniture standards. If people sit or stand on the piece, set their mass as a point load. The system does not claim compliance.',
    ),
    assumptions: [],
    sources: [],
    requiredVerification: tr('בדיקה פיזית / אישור איש מקצוע', 'Physical test / approval by a qualified professional'),
    fixes: [],
  });
  return out;
}

export function tableFixCandidates(p: TableParams): DesignChange[] {
  const out: DesignChange[] = [];
  if (!p.middleSupport) out.push({ label: tr('הוספת דופן אמצעית', 'Add a middle panel'), set: { middleSupport: true } });
  if (p.lowerShelfHeightMm > 0 && p.lowerShelfLoadKg > 5) out.push({ label: tr('הגבלת עומס מדף תחתון ל-5 ק"ג', 'Limit the lower shelf to 5 kg'), set: { lowerShelfLoadKg: 5 } });
  return out;
}

export function tableAssembly(model: FurnitureModel): AssemblyStep[] {
  const p = model.params as TableParams;
  const steps: Omit<AssemblyStep, 'n'>[] = [];
  const ids = (pred: (c: Component) => boolean) => model.components.filter(pred).map((c) => c.id);
  if (p.hasApron)
    steps.push({ title: tr('חיבור קורות החיזוק בין הדפנות', 'Fit the back rails between the panels'), componentIds: [...ids((c) => c.role === 'apron'), ...ids((c) => c.role === 'side' || c.id === 'middle')], hardware: ['joint_screw'] });
  if (p.lowerShelfHeightMm > 0) steps.push({ title: tr('חיבור המדף התחתון בין הדפנות', 'Fit the lower shelf between the side panels'), componentIds: model.components.filter((c) => c.id.startsWith('shelf_low')).map((c) => c.id), hardware: ['joint_screw'] });
  steps.push({
    title: tr('יישור לזווית ישרה והברגת המשטח מלמעלה', 'Square the frame and screw the top on from above'),
    componentIds: ['top'],
    hardware: ['joint_screw'],
    warning: tr('למדוד אלכסונים שווים לפני ההברגה', 'Measure equal diagonals before screwing'),
  });
  return steps.map((s, i) => ({ ...s, n: i + 1 }));
}

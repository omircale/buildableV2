import { tr } from '../i18n';
import type { AssemblyStep, Check, Component, FurnitureModel, PullUpParams } from '../types';
import { derivePartsFromComponents, floorToStep, jointScrews, orderStepFor } from './common';

const HEADER_MM = 150;
const FOOT_WIDTH_MM = 200;
const BAR_MM = 32;

export const DEFAULT_PULLUP: PullUpParams = {
  template: 'pullup',
  materialId: 'hayozrim:birch-24mm',
  thicknessMm: 24,
  finishId: 'ליבנה גלוי',
  edgeOption: 'none',
  finish: { type: 'supplier', sheen: 'matte', color: '#d9b98c' },
  widthMm: 1100,
  heightMm: 2200,
  footLengthMm: 1100,
  uprightWidthMm: 250,
  userMassKg: 90,
};

export const PULLUP_LIMITS = [
  { key: 'widthMm', min: 700, max: 1500, he: 'רוחב', en: 'Width' },
  { key: 'heightMm', min: 1500, max: 2400, he: 'גובה', en: 'Height' },
  { key: 'footLengthMm', min: 600, max: 1600, he: 'אורך רגלי בסיס', en: 'Foot length' },
  { key: 'uprightWidthMm', min: 150, max: 400, he: 'רוחב עמוד', en: 'Upright width' },
  { key: 'userMassKg', min: 20, max: 150, he: 'משקל משתמש', en: 'User mass' },
] as const;

/**
 * Pull-up frame (x = width, y = up, z = depth):
 * - Two upright boards stand on flat foot boards; a header board joins their tops.
 * - The bar is a steel tube bought separately (shown for context only, never ordered or calculated).
 */
export function buildPullUp(p: PullUpParams): FurnitureModel {
  const step = orderStepFor(p.materialId);
  const snap = (v: number) => floorToStep(v, step);
  const T = p.thicknessMm;
  const W = snap(p.widthMm);
  const upH = snap(p.heightMm - T);
  const H = upH + T;
  const footL = snap(p.footLengthMm);
  const upW = snap(p.uprightWidthMm);
  const upZ = (footL - upW) / 2;
  // The foot boards are wider than the uprights; shift everything so the footprint starts at x = 0.
  const off = FOOT_WIDTH_MM / 2 - T / 2;
  const m = p.materialId;
  const components: Component[] = [];
  const board = (c: Omit<Component, 'materialId' | 'thicknessMm'>) => components.push({ ...c, materialId: m, thicknessMm: T });

  for (const [side, x] of [['l', off], ['r', off + W - T]] as const) {
    const he = side === 'l' ? 'שמאל' : 'ימין';
    const en = side === 'l' ? 'left' : 'right';
    board({ id: `foot_${side}`, name: tr(`רגל בסיס ${he}`, `Foot board ${en}`), role: 'foot', origin: { x: x + T / 2 - FOOT_WIDTH_MM / 2, y: 0, z: 0 }, size: { x: FOOT_WIDTH_MM, y: T, z: footL }, grainAxis: 'z' });
    board({ id: `upright_${side}`, name: tr(`עמוד ${he}`, `Upright ${en}`), role: 'upright', origin: { x, y: T, z: upZ }, size: { x: T, y: upH, z: upW }, grainAxis: 'y' });
  }
  const headerL = snap(W - 2 * T);
  board({ id: 'header', name: tr('קורה עליונה', 'Header'), role: 'header', origin: { x: off + T + (W - 2 * T - headerL) / 2, y: H - HEADER_MM, z: footL / 2 - T / 2 }, size: { x: headerL, y: HEADER_MM, z: T }, grainAxis: 'x' });
  components.push({
    id: 'bar',
    name: tr('מוט מתח מפלדה (נרכש בנפרד)', 'Steel pull-up bar (bought separately)'),
    role: 'bar',
    materialId: '',
    thicknessMm: BAR_MM,
    origin: { x: off - 40, y: H - HEADER_MM - BAR_MM - 40, z: footL / 2 + T },
    size: { x: W + 80, y: BAR_MM, z: BAR_MM },
    reference: true,
  });

  const overall = { x: W + 2 * off, y: H, z: footL };
  return {
    params: p,
    orderStepMm: step,
    requested: { x: p.widthMm + 2 * off, y: p.heightMm, z: p.footLengthMm },
    components,
    parts: derivePartsFromComponents(components, p),
    openings: [],
    hardware: [
      jointScrews([{ lengthMm: upW }, { lengthMm: upW }, { lengthMm: HEADER_MM }, { lengthMm: HEADER_MM }], T),
      {
        id: 'pullup_bar',
        name: tr('מוט מתח מפלדה עם תושבות', 'Steel pull-up bar with brackets'),
        spec: tr('דגם עם דירוג עומס מפורסם של היצרן', 'A model with a published load rating from its maker'),
        quantity: 1,
        basis: tr('לא מסופק מהספק; המערכת לא בודקת את המוט.', 'Not supplied by the board supplier; the system does not check the bar.'),
      },
    ],
    overall,
  };
}

export function pullUpChecks(model: FurnitureModel): Check[] {
  const p = model.params as PullUpParams;
  return [
    {
      id: 'structure.life_safety',
      category: 'structure',
      status: 'RED',
      componentIds: model.components.filter((c) => !c.reference).map((c) => c.id),
      title: tr('מתקן לתליית אדם — ההזמנה חסומה עד אישור מהנדס', 'Equipment that holds a person — ordering is blocked until an engineer approves it'),
      explanation: tr(
        `משתמש של ${p.userMassKg} ק"ג שנתלה ומתנדנד יוצר עומס דינמי חוזר על העמודים, החיבורים והמוט. אין במערכת נתונים ממקור מוסמך לחיבורי ברגים בעומס כזה, לעמודי לוח בכפיפה על הקנט, או למוט — ולכן לא ניתן לאשר את המבנה. כשל עלול לגרום לפציעה קשה.`,
        `A ${p.userMassKg} kg user hanging and swinging puts a repeated dynamic load on the uprights, joints and bar. The system has no authoritative data for screw joints under such a load, for board uprights bending on edge, or for the bar — so the structure cannot be approved. A failure could cause serious injury.`,
      ),
      assumptions: [tr('זהו כלל בטיחות של המערכת: ציוד שנושא אדם באוויר לא מאושר בלי חישוב מקצועי', 'This is a system safety rule: equipment that holds a person off the ground is not approved without a professional calculation')],
      sources: [],
      requiredVerification: tr('חישוב ואישור בכתב של מהנדס מבנים, מוט עם דירוג עומס של יצרן, ועיגון לקיר או לרצפה', "A written calculation and approval by a structural engineer, a bar with a maker's load rating, and anchoring to the wall or floor"),
      fixes: [],
    },
    {
      id: 'stability.pullup',
      category: 'stability',
      status: 'GREY',
      componentIds: model.components.filter((c) => c.role === 'foot').map((c) => c.id),
      title: tr('התהפכות בהתנדנדות לא חושבה', 'Tipping while swinging not calculated'),
      explanation: tr(
        `רגלי הבסיס באורך ${p.footLengthMm / 10} ס"מ. התנדנדות יוצרת כוח אופקי שהמערכת לא מחשבת.`,
        `The feet are ${p.footLengthMm / 10} cm long. Swinging creates a horizontal force the system does not calculate.`,
      ),
      assumptions: [],
      sources: [],
      requiredVerification: tr('עיגון לקיר או לרצפה לפי המהנדס', 'Anchor to the wall or floor as the engineer specifies'),
      fixes: [],
    },
  ];
}

export function pullUpAssembly(): AssemblyStep[] {
  return [
    { n: 1, title: tr('חיבור כל עמוד לרגל הבסיס שלו', 'Fix each upright to its foot board'), componentIds: ['upright_l', 'foot_l', 'upright_r', 'foot_r'], hardware: ['joint_screw'] },
    { n: 2, title: tr('חיבור הקורה העליונה בין העמודים', 'Fit the header between the uprights'), componentIds: ['header'], hardware: ['joint_screw'] },
    { n: 3, title: tr('התקנת המוט ועיגון לפי הוראות המהנדס', "Install the bar and anchor per the engineer's instructions"), componentIds: ['bar'], hardware: ['pullup_bar'], warning: tr('לא להשתמש לפני אישור מהנדס', 'Do not use before engineer approval') },
  ];
}

import { tr } from '../i18n';
import type { AssemblyStep, ChairParams, Check, Component, DesignChange, FurnitureModel } from '../types';
import { derivePartsFromComponents, floorToStep, jointScrews, orderStepFor } from './common';
import { SAFETY_SOURCES } from './sources';

/** Height of the front rail under the seat (the supplier's minimum cut is 10 cm). */
const FRONT_RAIL_MM = 100;

const BASE = {
  template: 'chair' as const,
  materialId: 'hayozrim:birch-18mm',
  thicknessMm: 18,
  finishId: 'ליבנה גלוי',
  edgeOption: 'none' as const,
  finish: { type: 'supplier' as const, sheen: 'matte' as const, color: '#d9b98c' },
};

export const DEFAULT_CHAIR: ChairParams = { ...BASE, seatWidthMm: 450, seatHeightMm: 450, depthMm: 480, backHeightMm: 800, userMassKg: 110 };
/** Montessori-height child chair; the design mass stays an adult who sits on it anyway. */
export const DEFAULT_KIDS_CHAIR: ChairParams = { ...BASE, seatWidthMm: 300, seatHeightMm: 260, depthMm: 300, backHeightMm: 500, userMassKg: 110 };

export const CHAIR_LIMITS = [
  { key: 'seatWidthMm', min: 250, max: 700, he: 'רוחב מושב', en: 'Seat width' },
  { key: 'seatHeightMm', min: 200, max: 700, he: 'גובה מושב', en: 'Seat height' },
  { key: 'depthMm', min: 250, max: 700, he: 'עומק', en: 'Depth' },
  { key: 'backHeightMm', min: 300, max: 1100, he: 'גובה משענת', en: 'Backrest height' },
  { key: 'userMassKg', min: 10, max: 150, he: 'משקל יושב', en: 'Sitter mass' },
] as const;

/**
 * Box chair (x = width, y = up, z = depth, z=0 at the back):
 * - Two full-depth side panels rise to the backrest height.
 * - Backrest between the sides at the back, from the seat up; seat between the sides in front of it.
 * - A 10 cm front rail under the seat ties the sides together.
 */
export function buildChair(p: ChairParams): FurnitureModel {
  const step = orderStepFor(p.materialId);
  const snap = (v: number) => floorToStep(v, step);
  const T = p.thicknessMm;
  const seatW = snap(p.seatWidthMm);
  const W = seatW + 2 * T;
  const D = snap(p.depthMm);
  const H = snap(p.backHeightMm);
  const seatTop = snap(p.seatHeightMm);
  const m = p.materialId;
  const components: Component[] = [];
  const board = (c: Omit<Component, 'materialId' | 'thicknessMm'>) => components.push({ ...c, materialId: m, thicknessMm: T });

  board({ id: 'side_l', name: tr('דופן שמאל', 'Left side panel'), role: 'side', origin: { x: 0, y: 0, z: 0 }, size: { x: T, y: H, z: D }, grainAxis: 'y' });
  board({ id: 'side_r', name: tr('דופן ימין', 'Right side panel'), role: 'side', origin: { x: W - T, y: 0, z: 0 }, size: { x: T, y: H, z: D }, grainAxis: 'y' });
  const backH = snap(H - (seatTop - T));
  board({ id: 'backrest', name: tr('משענת', 'Backrest'), role: 'backrest', origin: { x: T, y: H - backH, z: 0 }, size: { x: seatW, y: backH, z: T }, grainAxis: 'x' });
  const seatD = snap(D - T);
  board({
    id: 'seat',
    name: tr('מושב', 'Seat'),
    role: 'seat',
    origin: { x: T, y: seatTop - T, z: T },
    size: { x: seatW, y: T, z: seatD },
    spanMm: seatW,
    load: { label: tr('אדם יושב', 'Person sitting'), massKg: p.userMassKg, distribution: 'point_center' },
    loadAssumption: tr(
      `כל משקל היושב (${p.userMassKg} ק"ג) נחשב כעומס מרוכז במרכז המושב — שמרני. ישיבה בנפילה יוצרת עומס דינמי שלא חושב.`,
      `The sitter's full mass (${p.userMassKg} kg) is taken as a point load at mid-seat — conservative. Dropping onto the seat creates a dynamic load that is not calculated.`,
    ),
    grainAxis: 'x',
  });
  const railY = Math.max(0, seatTop - T - FRONT_RAIL_MM);
  board({ id: 'apron', name: tr('קורה קדמית', 'Front rail'), role: 'apron', origin: { x: T, y: railY, z: D - T }, size: { x: seatW, y: Math.min(FRONT_RAIL_MM, seatTop - T), z: T }, grainAxis: 'x' });

  const overall = { x: W, y: H, z: D };
  return {
    params: p,
    orderStepMm: step,
    requested: { x: p.seatWidthMm + 2 * T, y: p.backHeightMm, z: p.depthMm },
    components,
    parts: derivePartsFromComponents(components, p),
    hardware: [jointScrews([{ lengthMm: seatD }, { lengthMm: seatD }, { lengthMm: backH }, { lengthMm: backH }, { lengthMm: FRONT_RAIL_MM }, { lengthMm: FRONT_RAIL_MM }, { lengthMm: seatW }], T)],
    overall,
  };
}

export function chairChecks(model: FurnitureModel): Check[] {
  const p = model.params as ChairParams;
  const out: Check[] = [];
  if (p.backHeightMm <= p.seatHeightMm + 100) {
    out.push({
      id: 'geometry.backrest',
      category: 'geometry',
      status: 'RED',
      componentIds: ['backrest'],
      title: tr('המשענת נמוכה מדי', 'The backrest is too low'),
      explanation: tr('המשענת צריכה להתנשא לפחות 10 ס"מ מעל המושב.', 'The backrest must rise at least 10 cm above the seat.'),
      assumptions: [],
      sources: [],
      fixes: [{ change: { label: tr(`משענת בגובה ${(p.seatHeightMm + 350) / 10} ס"מ`, `Backrest ${(p.seatHeightMm + 350) / 10} cm high`), set: { backHeightMm: p.seatHeightMm + 350 } }, projectedStatus: 'GREEN', projectedDetail: '' }],
    });
  }
  out.push(
    {
      id: 'connections.chair',
      category: 'connections',
      status: 'GREY',
      componentIds: ['backrest', 'seat', 'apron'],
      title: tr('עמידות החיבורים בישיבה ובהישענות לא חושבה', 'Joint strength under sitting and leaning not calculated'),
      explanation: tr(
        'בכיסא החיבורים נושאים כוחות חוזרים (הישענות לאחור, התנדנדות). המערכת לא מחשבת חוזק ועייפות של חיבורי ברגים.',
        'In a chair the joints take repeated forces (leaning back, rocking). The system does not calculate the strength or fatigue of screw joints.',
      ),
      assumptions: [],
      sources: [SAFETY_SOURCES.seating],
      requiredVerification: tr('בדיקת אב-טיפוס: ישיבה, הישענות לאחור והתנדנדות חוזרות', 'Prototype test: repeated sitting, leaning back and rocking'),
      fixes: [],
    },
    {
      id: 'stability.chair',
      category: 'stability',
      status: 'GREY',
      componentIds: [],
      title: tr('יציבות לאחור ולצדדים לא חושבה', 'Backward and sideways stability not calculated'),
      explanation: tr(
        `עומק הבסיס ${p.depthMm / 10} ס"מ. יציבות כיסא נבדקת פיזית (EN 1022); המערכת לא מחשבת אותה.`,
        `Base depth ${p.depthMm / 10} cm. Seating stability is tested physically (EN 1022); the system does not calculate it.`,
      ),
      assumptions: [],
      sources: [SAFETY_SOURCES.seating],
      requiredVerification: tr('לבדוק שהכיסא לא מתהפך כשנשענים לאחור בכוח', 'Check the chair does not tip when leaning back hard'),
      fixes: [],
    },
    {
      id: 'safety.physical',
      category: 'safety',
      status: 'YELLOW',
      componentIds: [],
      title: tr('נדרשת בדיקה פיזית לפני שימוש', 'Physical test required before use'),
      explanation: tr(
        'כיסאות נבדקים לחוזק, עמידות ויציבות לפי EN 12520 ו-EN 1022. החישוב כאן מכסה רק את כפיפת המושב.',
        'Chairs are tested for strength, durability and stability to EN 12520 and EN 1022. The calculation here only covers seat bending.',
      ),
      assumptions: [],
      sources: [SAFETY_SOURCES.seating],
      requiredVerification: tr('בדיקה פיזית / אישור איש מקצוע', 'Physical test / approval by a qualified professional'),
      fixes: [],
    },
  );
  return out;
}

export function chairFixCandidates(p: ChairParams): DesignChange[] {
  return p.seatWidthMm > 350 ? [{ label: tr('מושב ברוחב 35 ס"מ', 'Seat 35 cm wide'), set: { seatWidthMm: 350 } }] : [];
}

export function chairAssembly(): AssemblyStep[] {
  return [
    { n: 1, title: tr('חיבור המשענת והקורה הקדמית לדופן השמאלית', 'Fit the backrest and front rail to the left side panel'), componentIds: ['side_l', 'backrest', 'apron'], hardware: ['joint_screw'] },
    { n: 2, title: tr('הנחת המושב והברגתו לדופן השמאלית', 'Fit the seat and screw it to the left side panel'), componentIds: ['seat'], hardware: ['joint_screw'] },
    { n: 3, title: tr('סגירה עם הדופן הימנית', 'Close with the right side panel'), componentIds: ['side_r'], hardware: ['joint_screw'], warning: tr('לא לשבת לפני שכל הברגים מהודקים', 'Do not sit before every screw is tight') },
  ];
}

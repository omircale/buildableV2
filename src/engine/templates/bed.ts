import { tr } from '../i18n';
import type { AssemblyStep, BedParams, Check, Component, DesignChange, FurnitureModel, HardwareLine } from '../types';
import { ceilToStep, derivePartsFromComponents, floorToStep, jointScrews, orderStepFor } from './common';
import { SAFETY_SOURCES } from './sources';

/** Length of bed over which one sleeper's full mass is assumed to act (torso and hips) — a stated product assumption. */
export const BODY_ZONE_MM = 600;
/** Width of the house-frame posts, rafters and ridge (the supplier's minimum cut is 10 cm). */
export const HOUSE_MEMBER_MM = 100;
const ENTRAPMENT_MIN_MM = 89;
const ENTRAPMENT_MAX_MM = 230;
const MATTRESS_GAP_CHILD_MM = 25;
const SLAT_GAP_GUIDANCE_MM = 76;
const HIGH_BED_MATTRESS_MM = 600;
const GUARD_ABOVE_MATTRESS_MM = 127;

const BASE: Omit<BedParams, 'mattressWidthMm' | 'mattressLengthMm' | 'mattressThicknessMm' | 'railHeightMm' | 'deckHeightMm' | 'centerSupport' | 'headboardHeightMm' | 'sleepers' | 'mattressMassKg' | 'childBed' | 'houseFrame'> = {
  template: 'bed',
  materialId: 'hayozrim:birch-18mm',
  thicknessMm: 18,
  finishId: 'ליבנה גלוי',
  edgeOption: 'none',
  finish: { type: 'supplier', sheen: 'matte', color: '#d9b98c' },
  mattressGapMm: 10,
  slatWidthMm: 100,
  slatGapMm: 50,
  sleeperMassKg: 110,
  entryOpeningMm: 0,
  houseWallHeightMm: 1100,
};

export const DEFAULT_SINGLE_BED: BedParams = {
  ...BASE,
  mattressWidthMm: 900,
  mattressLengthMm: 1900,
  mattressThicknessMm: 200,
  railHeightMm: 350,
  deckHeightMm: 300,
  centerSupport: true,
  headboardHeightMm: 800,
  sleepers: 1,
  mattressMassKg: 20,
  childBed: false,
  houseFrame: false,
};

export const DEFAULT_DOUBLE_BED: BedParams = {
  ...DEFAULT_SINGLE_BED,
  mattressWidthMm: 1600,
  slatWidthMm: 200,
  slatGapMm: 30,
  mattressLengthMm: 2000,
  centerSupport: true,
  headboardHeightMm: 900,
  sleepers: 2,
  mattressMassKg: 35,
};

/** Montessori floor bed: low deck, child rules on; the design load stays an adult lying next to the child. */
export const DEFAULT_FLOOR_BED: BedParams = {
  ...BASE,
  mattressWidthMm: 700,
  mattressLengthMm: 1600,
  mattressThicknessMm: 100,
  railHeightMm: 300,
  deckHeightMm: 140,
  centerSupport: true,
  headboardHeightMm: 0,
  sleepers: 1,
  mattressMassKg: 8,
  childBed: true,
  entryOpeningMm: 500,
  houseFrame: true,
};

export const BED_LIMITS = [
  { key: 'mattressWidthMm', min: 500, max: 1800, he: 'רוחב מזרן', en: 'Mattress width' },
  { key: 'mattressLengthMm', min: 1000, max: 2100, he: 'אורך מזרן', en: 'Mattress length' },
  { key: 'mattressThicknessMm', min: 50, max: 350, he: 'עובי מזרן', en: 'Mattress thickness' },
  { key: 'mattressGapMm', min: 0, max: 50, he: 'מרווח סביב המזרן', en: 'Gap around the mattress' },
  { key: 'railHeightMm', min: 150, max: 600, he: 'גובה דפנות', en: 'Rail height' },
  { key: 'deckHeightMm', min: 118, max: 500, he: 'גובה משטח הדקים', en: 'Slat deck height' },
  { key: 'slatWidthMm', min: 100, max: 200, he: 'רוחב דק', en: 'Slat width' },
  { key: 'slatGapMm', min: 10, max: 120, he: 'מרווח בין דקים', en: 'Gap between slats' },
  { key: 'headboardHeightMm', min: 0, max: 1200, he: 'גובה ראש מיטה', en: 'Headboard height' },
  { key: 'sleeperMassKg', min: 5, max: 150, he: 'משקל ישן', en: 'Sleeper mass' },
  { key: 'mattressMassKg', min: 0, max: 80, he: 'משקל מזרן', en: 'Mattress mass' },
  { key: 'entryOpeningMm', min: 0, max: 1200, he: 'פתח כניסה', en: 'Entry opening' },
  { key: 'houseWallHeightMm', min: 600, max: 1600, he: 'גובה קירות הבית', en: 'House wall height' },
] as const;

/** Derived dimensions the checks need; computed once by the builder. */
export interface BedLayout {
  W: number;
  L: number;
  innerW: number;
  innerL: number;
  railH: number;
  supportH: number;
  deckTop: number;
  mattressTop: number;
  gapWidthSide: number;
  gapLengthSide: number;
  slatCount: number;
  slatGap: number;
  slatLen: number;
  openingMm: number;
  zOff: number;
}

export function bedLayout(p: BedParams): BedLayout {
  const step = orderStepFor(p.materialId);
  const snap = (v: number) => floorToStep(v, step);
  const up = (v: number) => ceilToStep(v, step);
  const T = p.thicknessMm;
  const innerW = up(p.mattressWidthMm + 2 * p.mattressGapMm);
  const L = up(p.mattressLengthMm + 2 * p.mattressGapMm + 2 * T);
  const innerL = L - 2 * T;
  const W = innerW + 2 * T;
  const railH = snap(p.railHeightMm);
  const supportH = snap(p.deckHeightMm - T);
  const deckTop = supportH + T;
  const slatW = snap(p.slatWidthMm);
  const slatCount = Math.max(1, Math.ceil((innerL - p.slatGapMm) / (slatW + p.slatGapMm)));
  const slatGap = (innerL - slatCount * slatW) / (slatCount + 1);
  const slatLen = p.centerSupport ? snap(innerW / 2) : innerW;
  const openingMm = p.entryOpeningMm > 0 ? L - 2 * snap((L - p.entryOpeningMm) / 2) : 0;
  return {
    W,
    L,
    innerW,
    innerL,
    railH,
    supportH,
    deckTop,
    mattressTop: deckTop + p.mattressThicknessMm,
    gapWidthSide: (innerW - p.mattressWidthMm) / 2,
    gapLengthSide: (innerL - p.mattressLengthMm) / 2,
    slatCount,
    slatGap,
    slatLen,
    openingMm,
    zOff: p.houseFrame ? T : 0,
  };
}

/**
 * Construction (x = across the bed, y = up, z = head → foot):
 * - Two side rails run the full length on the floor; head and foot boards sit between them.
 * - Support boards stand on the floor inside each rail (and two along the middle when `centerSupport`);
 *   slats rest on their top edges, so slat loads go straight to the floor.
 * - An entry opening splits the right-hand rail into two equal segments, each screwed to its support board.
 * - The optional house frame adds four posts on the head and foot faces, 45° rafters and a ridge board.
 * Every ordered length is a whole centimetre; the interior is rounded up so the mattress always fits.
 */
export function buildBed(p: BedParams): FurnitureModel {
  const step = orderStepFor(p.materialId);
  const snap = (v: number) => floorToStep(v, step);
  const T = p.thicknessMm;
  const lay = bedLayout(p);
  const { W, L, innerW, innerL, railH, supportH, zOff } = lay;
  const m = p.materialId;
  const components: Component[] = [];
  const board = (c: Omit<Component, 'materialId' | 'thicknessMm'>) => components.push({ ...c, materialId: m, thicknessMm: T });

  board({ id: 'rail_l', name: tr('דופן אורך שמאל', 'Left side rail'), role: 'rail', origin: { x: 0, y: 0, z: zOff }, size: { x: T, y: railH, z: L }, grainAxis: 'z' });
  if (lay.openingMm > 0) {
    const seg = (L - lay.openingMm) / 2;
    board({ id: 'rail_r_head', name: tr('דופן אורך ימין (צד הראש)', 'Right side rail (head end)'), role: 'rail', origin: { x: W - T, y: 0, z: zOff }, size: { x: T, y: railH, z: seg }, grainAxis: 'z' });
    board({ id: 'rail_r_foot', name: tr('דופן אורך ימין (צד הרגליים)', 'Right side rail (foot end)'), role: 'rail', origin: { x: W - T, y: 0, z: zOff + seg + lay.openingMm }, size: { x: T, y: railH, z: seg }, grainAxis: 'z' });
  } else {
    board({ id: 'rail_r', name: tr('דופן אורך ימין', 'Right side rail'), role: 'rail', origin: { x: W - T, y: 0, z: zOff }, size: { x: T, y: railH, z: L }, grainAxis: 'z' });
  }

  const headH = p.headboardHeightMm > 0 ? Math.max(railH, snap(p.headboardHeightMm)) : railH;
  board({
    id: 'end_head',
    name: p.headboardHeightMm > 0 ? tr('ראש מיטה', 'Headboard') : tr('דופן ראש', 'Head end board'),
    role: p.headboardHeightMm > 0 ? 'headboard' : 'end',
    origin: { x: T, y: 0, z: zOff },
    size: { x: innerW, y: headH, z: T },
    grainAxis: 'x',
  });
  board({ id: 'end_foot', name: tr('דופן רגליים', 'Foot end board'), role: 'end', origin: { x: T, y: 0, z: zOff + L - T }, size: { x: innerW, y: railH, z: T }, grainAxis: 'x' });

  const supportLen = snap(innerL);
  const supportZ = zOff + T + (innerL - supportLen) / 2;
  const support = (id: string, name: string, x: number) =>
    board({ id, name, role: 'support', origin: { x, y: 0, z: supportZ }, size: { x: T, y: supportH, z: supportLen }, grainAxis: 'z' });
  support('support_l', tr('לוח תמיכה שמאל', 'Left slat support'), T);
  support('support_r', tr('לוח תמיכה ימין', 'Right slat support'), W - 2 * T);
  if (p.centerSupport) {
    support('support_c1', tr('תמיכה מרכזית 1', 'Centre support 1'), W / 2 - T);
    support('support_c2', tr('תמיכה מרכזית 2', 'Centre support 2'), W / 2);
  }

  const slatW = snap(p.slatWidthMm);
  const halves = p.centerSupport ? 2 : 1;
  const spanMm = lay.slatLen - T;
  const personsOnSpan = p.centerSupport ? 1 : p.sleepers;
  const pitch = slatW + lay.slatGap;
  const massKg = Math.round((personsOnSpan * p.sleeperMassKg * Math.min(1, pitch / BODY_ZONE_MM) + p.mattressMassKg * (pitch / innerL) * (lay.slatLen / innerW)) * 10) / 10;
  const loadAssumption = tr(
    `עומס לדק: ${personsOnSpan === 1 ? 'ישן אחד' : `${personsOnSpan} ישנים`} במשקל ${p.sleeperMassKg} ק"ג כל אחד, שמשקלו כולו נחשב כפועל על ${BODY_ZONE_MM} מ"מ מאורך המיטה (אזור הגו והאגן), ועוד חלק יחסי ממשקל המזרן (${p.mattressMassKg} ק"ג). זו הנחת מוצר שמרנית — לא ערך מתקן. קפיצה יוצרת עומס דינמי שלא חושב.`,
    `Load per slat: ${personsOnSpan === 1 ? 'one sleeper' : `${personsOnSpan} sleepers`} of ${p.sleeperMassKg} kg each, whose full mass is taken to act over ${BODY_ZONE_MM} mm of the bed length (torso and hips), plus a pro-rata share of the mattress (${p.mattressMassKg} kg). This is a conservative product assumption — not a value from a standard. Jumping creates a dynamic load that is not calculated.`,
  );
  for (let i = 0; i < lay.slatCount; i++) {
    const z = zOff + T + lay.slatGap + i * pitch;
    for (let h = 0; h < halves; h++) {
      const x = halves === 1 ? T : h === 0 ? W / 2 - lay.slatLen : W / 2;
      const id = halves === 1 ? `slat_${i + 1}` : `slat_${i + 1}_${h === 0 ? 'l' : 'r'}`;
      board({
        id,
        name: halves === 1 ? tr(`דק ${i + 1}`, `Slat ${i + 1}`) : tr(`דק ${i + 1} (${h === 0 ? 'שמאל' : 'ימין'})`, `Slat ${i + 1} (${h === 0 ? 'left' : 'right'})`),
        role: 'slat',
        origin: { x, y: supportH, z },
        size: { x: lay.slatLen, y: T, z: slatW },
        spanMm,
        load: { label: tr('ישן ומזרן', 'Sleeper and mattress'), massKg, distribution: 'uniform' },
        loadAssumption,
        grainAxis: 'x',
      });
    }
  }

  components.push({
    id: 'mattress',
    name: tr(`מזרן ${p.mattressWidthMm / 10}×${p.mattressLengthMm / 10}`, `Mattress ${p.mattressWidthMm / 10}×${p.mattressLengthMm / 10}`),
    role: 'mattress',
    materialId: '',
    thicknessMm: p.mattressThicknessMm,
    origin: { x: T + lay.gapWidthSide, y: lay.deckTop, z: zOff + T + lay.gapLengthSide },
    size: { x: p.mattressWidthMm, y: p.mattressThicknessMm, z: p.mattressLengthMm },
    reference: true,
  });

  let overallY = Math.max(headH, lay.mattressTop);
  let overallZ = L;
  if (p.houseFrame) {
    const wallH = snap(p.houseWallHeightMm);
    // The ridge board stands on edge between the two gables and each rafter butts into its side face,
    // the way a roof is actually framed. The rafter's foot is cut level and bears on top of the post.
    const ridgeFaceX = W / 2 - T / 2;
    // A level cut across a board held at 45° reaches half a width times √2 sideways from its centre
    // line. Starting the rafter that far in from the post's outer face leaves the frame flush instead
    // of letting a corner hang outside the bed.
    const eave = (HOUSE_MEMBER_MM / 2) * Math.SQRT2;
    const run = ridgeFaceX - eave;
    // Length of the rafter body between the two cuts, along its centre line. This is geometry, not an
    // order size: rounding it to a whole centimetre here would drive the rafter into the ridge.
    const rafterBodyMm = Math.SQRT2 * run;
    const apexY = wallH + run;
    for (const [end, z] of [['head', 0], ['foot', L + T]] as const) {
      const endHe = end === 'head' ? 'ראש' : 'רגליים';
      for (const [side, x] of [['l', 0], ['r', W - HOUSE_MEMBER_MM]] as const) {
        board({
          id: `post_${end}_${side}`,
          name: tr(`עמוד ${endHe} ${side === 'l' ? 'שמאל' : 'ימין'}`, `${end === 'head' ? 'Head' : 'Foot'} post ${side === 'l' ? 'left' : 'right'}`),
          role: 'post',
          origin: { x, y: 0, z },
          size: { x: HOUSE_MEMBER_MM, y: wallH, z: T },
          grainAxis: 'y',
        });
      }
      for (const side of ['l', 'r'] as const) {
        // Centre line: from the centre of the post top up at 45° to the face of the ridge.
        const footX = side === 'l' ? eave : W - eave;
        const headX = side === 'l' ? ridgeFaceX : W - ridgeFaceX;
        board({
          id: `rafter_${end}_${side}`,
          name: tr(`קורת גג ${endHe} ${side === 'l' ? 'שמאל' : 'ימין'}`, `${end === 'head' ? 'Head' : 'Foot'} rafter ${side === 'l' ? 'left' : 'right'}`),
          role: 'rafter',
          origin: { x: (footX + headX) / 2 - rafterBodyMm / 2, y: (wallH + apexY) / 2 - HOUSE_MEMBER_MM / 2, z },
          size: { x: rafterBodyMm, y: HOUSE_MEMBER_MM, z: T },
          rotationZDeg: side === 'l' ? 45 : -45,
          // The two cuts tilt opposite ways: level at the foot so it seats on the post, plumb at the
          // head so it lands flat on the ridge face.
          endCutDeg: { start: -45, end: 45 },
          grainAxis: 'x',
        });
      }
    }
    const ridgeLen = snap(L + 2 * T);
    // The rafters' plumb cuts leave a slot between them at the peak; the ridge fills it flush with
    // their top corners, so the roof reads as solid instead of notched.
    const rafterTopY = apexY + (HOUSE_MEMBER_MM / 2) * Math.SQRT2;
    board({
      id: 'ridge',
      name: tr('קורת רכס', 'Ridge board'),
      role: 'ridge',
      origin: { x: W / 2 - T / 2, y: rafterTopY - HOUSE_MEMBER_MM, z: (L + 2 * T - ridgeLen) / 2 },
      size: { x: T, y: HOUSE_MEMBER_MM, z: ridgeLen },
      grainAxis: 'z',
    });
    // The rafters stand proud of the ridge: a 45° plumb cut leaves the top corner half a width above it.
    overallY = Math.max(overallY, apexY + (HOUSE_MEMBER_MM / 2) * Math.SQRT2);
    overallZ = L + 2 * T;
  }

  const overall = { x: W, y: overallY, z: overallZ };
  return {
    params: p,
    orderStepMm: step,
    requested: overall,
    components,
    parts: derivePartsFromComponents(components, p),
    openings: [],
    hardware: bedHardware(p, components),
    overall,
  };
}

function bedHardware(p: BedParams, components: Component[]): HardwareLine[] {
  const len = (role: Component['role']) => components.filter((c) => c.role === role);
  const joints = [
    ...[...len('end'), ...len('headboard')].flatMap((c) => [{ lengthMm: Math.min(c.size.y, p.railHeightMm) }, { lengthMm: Math.min(c.size.y, p.railHeightMm) }]),
    ...len('support').filter((c) => c.id === 'support_l' || c.id === 'support_r').map((c) => ({ lengthMm: c.size.z })),
    ...len('post').map((c) => ({ lengthMm: Math.min(c.size.y, p.railHeightMm) })),
    // Each rafter is fastened twice: its foot seats on a post, its head is screwed to the ridge.
    ...len('rafter').flatMap(() => [{ lengthMm: HOUSE_MEMBER_MM }, { lengthMm: HOUSE_MEMBER_MM }]),
  ];
  const slats = len('slat');
  const lines: HardwareLine[] = [
    jointScrews(joints, p.thicknessMm),
    {
      id: 'slat_screw',
      name: tr('בורג עץ לקיבוע דקים', 'Wood screw to fix the slats'),
      spec: tr(`קצר מ-${2 * p.thicknessMm} מ"מ — מידה לפי יצרן`, `Shorter than ${2 * p.thicknessMm} mm — size per manufacturer`),
      quantity: slats.length * 2,
      basis: tr('בורג אחד בכל קצה דק כדי שלא יזוז. הדקים נושאים על לוחות התמיכה, לא על הברגים. הנחה.', 'One screw at each slat end so it cannot shift. Slats bear on the support boards, not on the screws. Assumption.'),
    },
  ];
  if (p.centerSupport)
    lines.push({
      id: 'support_bolt',
      name: tr('ברגים לחיבור שתי התמיכות המרכזיות זו לזו', 'Screws joining the two centre supports'),
      spec: tr('כל 300 מ"מ', 'Every 300 mm'),
      quantity: Math.ceil((components.find((c) => c.id === 'support_c1')?.size.z ?? 0) / 300),
      basis: tr('הנחה.', 'Assumption.'),
    });
  return lines;
}

const mk = (c: Omit<Check, 'assumptions' | 'sources' | 'fixes'> & Partial<Pick<Check, 'assumptions' | 'sources' | 'fixes'>>): Check => ({ assumptions: [], sources: [], fixes: [], ...c });
const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString('he-IL');

export function bedChecks(model: FurnitureModel): Check[] {
  const p = model.params as BedParams;
  const lay = bedLayout(p);
  const out: Check[] = [];

  if (p.deckHeightMm > p.railHeightMm) {
    out.push(
      mk({
        id: 'geometry.bed_deck',
        category: 'geometry',
        status: 'RED',
        componentIds: model.components.filter((c) => c.role === 'slat').map((c) => c.id),
        title: tr('משטח הדקים גבוה מהדפנות', 'The slat deck is higher than the rails'),
        explanation: tr(
          `הדקים (${p.deckHeightMm} מ"מ) צריכים לשבת בתוך המסגרת, מתחת לגובה הדפנות (${p.railHeightMm} מ"מ).`,
          `The slats (${p.deckHeightMm} mm) must sit inside the frame, below the rail height (${p.railHeightMm} mm).`,
        ),
        fixes: [{ change: { label: tr(`דפנות בגובה ${p.deckHeightMm + 50} מ"מ`, `Rails ${p.deckHeightMm + 50} mm high`), set: { railHeightMm: p.deckHeightMm + 50 } }, projectedStatus: 'GREEN', projectedDetail: '' }],
      }),
    );
  }

  const slatIds = model.components.filter((c) => c.role === 'slat').map((c) => c.id);
  out.push(
    lay.slatGap > SLAT_GAP_GUIDANCE_MM
      ? mk({
          id: 'geometry.slat_gap',
          category: 'geometry',
          status: 'YELLOW',
          componentIds: slatIds,
          title: tr(`מרווח ${fmt(lay.slatGap)} מ"מ בין הדקים`, `${fmt(lay.slatGap)} mm between slats`),
          explanation: tr(
            `יצרני מזרנים ממליצים בדרך כלל על מרווח של עד ${SLAT_GAP_GUIDANCE_MM} מ"מ (למזרני קצף עד 70) כדי שהמזרן לא ישקע. זו הנחיית יצרן, לא תקן — כדאי לבדוק מול יצרן המזרן.`,
            `Mattress makers usually recommend a gap of up to ${SLAT_GAP_GUIDANCE_MM} mm (70 for foam) so the mattress does not sag. This is maker guidance, not a standard — check with your mattress maker.`,
          ),
          sources: [SAFETY_SOURCES.slatSpacing],
          fixes: [{ change: { label: tr('מרווח יעד 50 מ"מ', 'Target gap 50 mm'), set: { slatGapMm: 50 } }, projectedStatus: 'GREEN', projectedDetail: tr('מוסיף דקים', 'Adds slats') }],
        })
      : mk({
          id: 'geometry.slat_gap',
          category: 'geometry',
          status: 'GREEN',
          componentIds: [],
          title: tr(`${lay.slatCount} דקים, מרווח ${fmt(lay.slatGap)} מ"מ`, `${lay.slatCount} slats, ${fmt(lay.slatGap)} mm apart`),
          explanation: tr(`בטווח המקובל אצל יצרני מזרנים (עד ${SLAT_GAP_GUIDANCE_MM} מ"מ; הנחיית יצרן, לא תקן).`, `Within the range mattress makers commonly give (up to ${SLAT_GAP_GUIDANCE_MM} mm; maker guidance, not a standard).`),
          sources: [SAFETY_SOURCES.slatSpacing],
        }),
  );

  out.push(
    mk({
      id: 'stability.bed',
      category: 'stability',
      status: p.houseFrame ? 'GREY' : 'GREEN',
      componentIds: p.houseFrame ? model.components.filter((c) => c.role === 'post' || c.role === 'rafter' || c.role === 'ridge').map((c) => c.id) : [],
      title: p.houseFrame ? tr('יציבות מסגרת הבית לא חושבה', 'House-frame stability not calculated') : tr('המיטה עומדת על הרצפה לכל אורכה', 'The bed stands on the floor along its full length'),
      explanation: p.houseFrame
        ? tr(
            'העמודים מחוברים לדפנות הראש והרגליים בברגים. המערכת לא מחשבת עומס צידי על המסגרת (דחיפה, טיפוס, תלייה).',
            'The posts are screwed to the head and foot boards. The system does not calculate sideways loads on the frame (pushing, climbing, hanging).',
          )
        : tr('בסיס רחב ונמוך הנשען על הרצפה; לא בוצע חישוב התהפכות.', 'A wide, low base resting on the floor; no tip-over calculation was made.'),
      requiredVerification: p.houseFrame ? tr('לנער את המסגרת ידנית אחרי ההרכבה ולוודא שאינה מתנדנדת', 'Shake the frame by hand after assembly and confirm it does not sway') : undefined,
    }),
  );

  if (p.childBed) out.push(...childChecks(p, lay, model));
  else
    out.push(
      mk({
        id: 'safety.bed',
        category: 'safety',
        status: 'YELLOW',
        componentIds: [],
        title: tr('נדרש אימות פיזי', 'Physical verification required'),
        explanation: tr(
          'מיטות ביתיות נבדקות פיזית לפי EN 1725 (חוזק, עמידות ובטיחות). המערכת לא טוענת לעמידה בתקן. משקל הישן בברירת המחדל (110 ק"ג) הוא משקל המשתמש שהתקן מניח.',
          'Domestic beds are physically tested to EN 1725 (strength, durability and safety). The system does not claim compliance. The default sleeper mass (110 kg) is the user mass that standard assumes.',
        ),
        sources: [SAFETY_SOURCES.en1725],
        requiredVerification: tr('בדיקה פיזית / אישור איש מקצוע', 'Physical test / approval by a qualified professional'),
      }),
    );
  return out;
}

function childChecks(p: BedParams, lay: BedLayout, model: FurnitureModel): Check[] {
  const out: Check[] = [];
  const railIds = model.components.filter((c) => c.role === 'rail').map((c) => c.id);

  if (lay.openingMm > 0) {
    const trap = lay.openingMm > ENTRAPMENT_MIN_MM && lay.openingMm < ENTRAPMENT_MAX_MM;
    out.push(
      mk({
        id: 'safety.entrapment_opening',
        category: 'safety',
        status: trap ? 'RED' : 'GREEN',
        componentIds: railIds,
        title: trap
          ? tr(`פתח הכניסה (${fmt(lay.openingMm)} מ"מ) בטווח סכנת לכידת ראש`, `The entry opening (${fmt(lay.openingMm)} mm) is in the head-entrapment range`)
          : tr(`פתח הכניסה ${fmt(lay.openingMm)} מ"מ — מחוץ לטווח הלכידה`, `Entry opening ${fmt(lay.openingMm)} mm — outside the entrapment range`),
        explanation: tr(
          `פתח ברוחב ${ENTRAPMENT_MIN_MM}–${ENTRAPMENT_MAX_MM} מ"מ עלול לאפשר לגוף הילד לעבור בלי שהראש יעבור. הטווח לקוח מהנחיית CPSC למתקני משחקים ומשמש כאן ככלל תכנון שמרני; מיטות רצפה הוחזרו בריקול בגלל מרווחים כאלה.`,
          `An opening ${ENTRAPMENT_MIN_MM}–${ENTRAPMENT_MAX_MM} mm wide may let a child's body pass while the head does not. The range comes from CPSC guidance for play equipment and is used here as a conservative design rule; floor beds have been recalled over gaps like this.`,
        ),
        assumptions: [tr('אין תקן שחל ישירות על מיטות רצפה — הכלל מוחל מרצון', 'No standard applies directly to floor beds — the rule is applied voluntarily')],
        sources: [SAFETY_SOURCES.cpscEntrapment, SAFETY_SOURCES.zipadeeRecall],
        fixes: trap
          ? [
              { change: { label: tr('פתח 50 ס"מ', 'Opening 50 cm'), set: { entryOpeningMm: 500 } }, projectedStatus: 'GREEN', projectedDetail: tr('רחב מספיק למעבר כל הגוף', 'Wide enough for the whole body') },
              { change: { label: tr('בלי פתח', 'No opening'), set: { entryOpeningMm: 0 } }, projectedStatus: 'GREEN', projectedDetail: '' },
            ]
          : [],
      }),
    );
  }

  const gap = Math.max(lay.gapWidthSide, lay.gapLengthSide);
  out.push(
    mk({
      id: 'safety.mattress_gap',
      category: 'safety',
      status: gap > MATTRESS_GAP_CHILD_MM ? 'YELLOW' : 'GREEN',
      componentIds: [],
      title: tr(`מרווח עד ${fmt(gap)} מ"מ בין המזרן למסגרת`, `Up to ${fmt(gap)} mm between mattress and frame`),
      explanation: tr(
        `בעריסות נהוג מרווח של עד 30 מ"מ (EN 716-1, מסיכום משני) וכלל אצבע של "שתי אצבעות" (~${MATTRESS_GAP_CHILD_MM} מ"מ). מיטת רצפה אינה עריסה — הערכים מוצגים להשוואה.`,
        `Cots commonly allow up to 30 mm (EN 716-1, from a secondary summary) and a "two fingers" rule of thumb (~${MATTRESS_GAP_CHILD_MM} mm). A floor bed is not a cot — the values are shown for comparison.`,
      ),
      sources: [SAFETY_SOURCES.en716Gap],
      fixes: gap > MATTRESS_GAP_CHILD_MM ? [{ change: { label: tr('מרווח 10 מ"מ', 'Gap 10 mm'), set: { mattressGapMm: 10 } }, projectedStatus: 'GREEN', projectedDetail: '' }] : [],
    }),
  );

  const high = lay.mattressTop >= HIGH_BED_MATTRESS_MM;
  const above = lay.railH - lay.mattressTop;
  out.push(
    mk({
      id: 'safety.fall_height',
      category: 'safety',
      status: high ? 'RED' : 'GREEN',
      componentIds: [],
      title: high
        ? tr(`המזרן בגובה ${fmt(lay.mattressTop)} מ"מ — זו כבר מיטה גבוהה`, `The mattress is ${fmt(lay.mattressTop)} mm high — that is a high bed`)
        : tr(`מזרן בגובה ${fmt(lay.mattressTop)} מ"מ מהרצפה`, `Mattress ${fmt(lay.mattressTop)} mm above the floor`),
      explanation: high
        ? tr(
            `ממזרן בגובה ${HIGH_BED_MATTRESS_MM} מ"מ חלים כללי מיטות קומתיים וגבוהות (EN 747), כולל מעקות. התבנית הזו מתוכננת למיטת רצפה בלבד.`,
            `From a mattress height of ${HIGH_BED_MATTRESS_MM} mm the bunk/high-bed rules apply (EN 747), including guardrails. This template is designed for floor beds only.`,
          )
        : tr(
            `מתחת לסף ${HIGH_BED_MATTRESS_MM} מ"מ שבו חלים כללי מיטות גבוהות. הדופן ${above >= 0 ? `בולטת ${fmt(above)} מ"מ מעל` : `נמוכה ב-${fmt(-above)} מ"מ מ`}המזרן; לשם השוואה, במיטות קומתיים בארה"ב נדרש מעקה של לפחות ${GUARD_ABOVE_MATTRESS_MM} מ"מ — במיטת רצפה זה משפיע רק על התגלגלות.`,
            `Below the ${HIGH_BED_MATTRESS_MM} mm threshold where high-bed rules apply. The rail is ${above >= 0 ? `${fmt(above)} mm above` : `${fmt(-above)} mm below`} the mattress top; for comparison, US bunk beds need a guardrail of at least ${GUARD_ABOVE_MATTRESS_MM} mm — on a floor bed this only affects rolling out.`,
          ),
      sources: [SAFETY_SOURCES.en747Scope, SAFETY_SOURCES.cfr1213Guard],
      fixes: high ? [{ change: { label: tr('משטח דקים בגובה 14 ס"מ', 'Slat deck at 14 cm'), set: { deckHeightMm: 140 } }, projectedStatus: 'GREEN', projectedDetail: '' }] : [],
    }),
  );

  out.push(
    mk({
      id: 'safety.edges',
      category: 'safety',
      status: 'YELLOW',
      componentIds: [],
      title: tr('לעגל ולשייף קצוות ופינות נגישים', 'Round and sand accessible edges and corners'),
      explanation: tr(
        'בתקן העריסות קצוות נגישים צריכים להיות מעוגלים או משופעים וללא שבבים; לא נמצא רדיוס מספרי. החיתוך אצל הספק ישר — העיגול נעשה בבית.',
        'The cot standard requires accessible edges to be rounded or chamfered and free of burrs; no numeric radius was found. The supplier cuts square edges — rounding is done at home.',
      ),
      sources: [SAFETY_SOURCES.en716Edges],
      requiredVerification: tr('ליטוש ועיגול כל פינה וקצה שהילד נוגע בהם', 'Sand and round every corner and edge the child can touch'),
    }),
  );

  const painted = p.finish.type === 'painted' || p.finish.type === 'stained' || p.finish.type === 'lacquered';
  out.push(
    mk({
      id: 'safety.materials_emissions',
      category: 'safety',
      status: 'YELLOW',
      componentIds: [],
      title: painted ? tr('לוודא צבע ולוחות שמתאימים לחדר ילדים', 'Confirm paint and boards suitable for a child’s room') : tr('לוודא פליטת פורמלדהיד של הלוחות', 'Confirm the boards’ formaldehyde emission class'),
      explanation: painted
        ? tr(
            'ציפויים במוצרי ילדים נבדקים לנדידת מתכות (EN 71-3), ולוחות עץ מסווגים לפי פליטת פורמלדהיד (E1 באירופה, CARB P2 / TSCA בארה"ב).',
            'Coatings on children’s products are tested for metal migration (EN 71-3), and wood panels are classed by formaldehyde emission (E1 in Europe, CARB P2 / TSCA in the US).',
          )
        : tr('לוחות עץ מסווגים לפי פליטת פורמלדהיד (E1 באירופה, CARB P2 / TSCA בארה"ב). הספק לא מפרסם את הדרגה.', 'Wood panels are classed by formaldehyde emission (E1 in Europe, CARB P2 / TSCA in the US). The supplier does not publish the class.'),
      sources: painted ? [SAFETY_SOURCES.en71Coatings, SAFETY_SOURCES.formaldehyde] : [SAFETY_SOURCES.formaldehyde],
      requiredVerification: painted
        ? tr('לבקש מיצרן הצבע אישור EN 71-3, ומהספק את דרגת הפליטה של הלוח', 'Ask the paint maker for EN 71-3 confirmation and the supplier for the board’s emission class')
        : tr('לבקש מהספק את דרגת הפליטה של הלוח', 'Ask the supplier for the board’s emission class'),
    }),
  );

  if (p.houseFrame)
    out.push(
      mk({
        id: 'safety.house_frame',
        category: 'safety',
        status: 'YELLOW',
        componentIds: model.components.filter((c) => c.role === 'post' || c.role === 'rafter' || c.role === 'ridge').map((c) => c.id),
        title: tr('מסגרת הבית לא מיועדת לטיפוס או לתלייה', 'The house frame is not meant for climbing or hanging'),
        explanation: tr('המערכת לא חישבה את המסגרת לעומס של ילד שמטפס או נתלה עליה.', 'The system did not calculate the frame for a child climbing or hanging on it.'),
        requiredVerification: tr('בדיקה פיזית של המסגרת לפני שימוש', 'Physically check the frame before use'),
      }),
    );
  return out;
}

export function bedFixCandidates(p: BedParams): DesignChange[] {
  const out: DesignChange[] = [];
  if (!p.centerSupport) out.push({ label: tr('הוספת תמיכה מרכזית', 'Add a centre support'), set: { centerSupport: true } });
  if (p.slatWidthMm < 150) out.push({ label: tr('דקים ברוחב 15 ס"מ', 'Slats 15 cm wide'), set: { slatWidthMm: 150 } });
  if (p.slatGapMm > 30) out.push({ label: tr('מרווח דקים 30 מ"מ', 'Slat gap 30 mm'), set: { slatGapMm: 30 } });
  return out;
}

export function bedAssembly(model: FurnitureModel): AssemblyStep[] {
  const p = model.params as BedParams;
  const ids = (role: Component['role']) => model.components.filter((c) => c.role === role).map((c) => c.id);
  const steps: Omit<AssemblyStep, 'n'>[] = [
    { title: tr('חיבור דפנות הראש והרגליים לדופן האורך השמאלית', 'Join the head and foot boards to the left side rail'), componentIds: ['rail_l', ...ids('end'), ...ids('headboard')], hardware: ['joint_screw'] },
    { title: tr('הצבת לוחות התמיכה על הרצפה והברגתם לדפנות', 'Stand the support boards on the floor and screw them to the rails'), componentIds: ids('support'), hardware: ['joint_screw', ...(p.centerSupport ? ['support_bolt'] : [])] },
    { title: tr('סגירת המסגרת עם הדופן הימנית', 'Close the frame with the right side rail'), componentIds: ids('rail').filter((id) => id !== 'rail_l'), hardware: ['joint_screw'] },
    {
      title: tr('פריסת הדקים במרווחים שווים והברגתם', 'Lay the slats at equal gaps and screw them down'),
      componentIds: ids('slat'),
      hardware: ['slat_screw'],
      warning: tr('לוודא שכל דק נשען על לוחות התמיכה בשני קצותיו', 'Make sure every slat bears on the support boards at both ends'),
    },
  ];
  if (p.houseFrame)
    steps.push({
      title: tr('חיבור העמודים, קורות הגג וקורת הרכס', 'Fit the posts, rafters and ridge board'),
      componentIds: [...ids('post'), ...ids('rafter'), ...ids('ridge')],
      hardware: ['joint_screw'],
      warning: tr('לא לתלות ולא לטפס על המסגרת', 'Do not hang from or climb the frame'),
    });
  steps.push({ title: tr('הנחת המזרן', 'Place the mattress'), componentIds: ['mattress'], hardware: [] });
  return steps.map((s, i) => ({ ...s, n: i + 1 }));
}

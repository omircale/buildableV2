import { tr } from '../i18n';
import { floorToStep, jointScrews, orderStepFor } from '../templates/common';
import type { Addon, AddonKind, Check, Component, DesignParams, HardwareLine, Opening } from '../types';

/**
 * Components a person adds into a piece, rather than ones a template derives from its parameters.
 *
 * A template describes a kind of furniture; this describes a part anyone might want inside one. That
 * split is what lets the same drawer go into a bookcase, a bench and the space under a bed, instead
 * of every template growing its own drawer parameter.
 *
 * Each kind builds into an `Opening` the host template declared, so an addon never has to know what
 * it is inside — only how big the hole is.
 */

/** Gap left around a drawer box for its runners, per side. An assumption until a runner is chosen. */
export const RUNNER_SIDE_CLEARANCE_MM = 13;
/** Gap around a door leaf and between a drawer front and its neighbours. */
export const FRONT_GAP_MM = 3;
/** A box shallower than its opening so it does not foul the back panel. */
export const BOX_BACK_CLEARANCE_MM = 10;

export interface AddonBuild {
  components: Component[];
  hardware: HardwareLine[];
  checks: Check[];
}

export interface AddonDef {
  kind: AddonKind;
  /** Smallest opening the component can be built into, in mm. */
  minOpeningMm: { x: number; y: number; z: number };
  build(opening: Opening, p: DesignParams, addon: Addon): AddonBuild;
}

type Ctx = { T: number; materialId: string; step: number; fastenedTo: string[] };

const ctx = (p: DesignParams, opening: Opening): Ctx => ({
  T: p.thicknessMm,
  materialId: p.materialId,
  step: orderStepFor(p.materialId),
  fastenedTo: opening.boundedBy,
});

/**
 * An added board is ordered from the same supplier under the same rules as every other board, so its
 * face dimensions are floored to the order step here rather than left as whatever the arithmetic
 * produced. The leftover becomes clearance at the far edge, which a component inside an opening wants
 * anyway.
 */
function board(
  id: string,
  name: string,
  role: Component['role'],
  c: Ctx,
  origin: Component['origin'],
  size: Component['size'],
  grainAxis: Component['grainAxis'],
  fastened?: boolean,
): Component {
  const fitted = { ...size };
  for (const k of ['x', 'y', 'z'] as const) {
    if (Math.abs(size[k] - c.T) < 1e-6) continue;
    fitted[k] = Math.max(c.step || 1, floorToStep(size[k], c.step));
  }
  return {
    id,
    name,
    role,
    materialId: c.materialId,
    thicknessMm: c.T,
    origin,
    size: fitted,
    grainAxis,
    ...(fastened ? { fastenedTo: c.fastenedTo } : {}),
  };
}

/**
 * Four sides and a bottom, sitting inside `box` (already inset for whatever clearance the caller
 * needs). Shared by the drawer and the bedding box, which differ in what goes on the front and in
 * how they are held, not in how the carcase of the box is made.
 */
function openBox(idPrefix: string, label: string, c: Ctx, box: { origin: Component['origin']; size: Component['size'] }): Component[] {
  const { origin: o, size: s } = box;
  return [
    board(`${idPrefix}_left`, tr(`${label} — דופן שמאל`, `${label} — left side`), 'box_side', c, { x: o.x, y: o.y, z: o.z }, { x: c.T, y: s.y, z: s.z }, 'z'),
    board(`${idPrefix}_right`, tr(`${label} — דופן ימין`, `${label} — right side`), 'box_side', c, { x: o.x + s.x - c.T, y: o.y, z: o.z }, { x: c.T, y: s.y, z: s.z }, 'z'),
    board(`${idPrefix}_back`, tr(`${label} — גב`, `${label} — back`), 'box_back', c, { x: o.x + c.T, y: o.y, z: o.z }, { x: s.x - 2 * c.T, y: s.y, z: c.T }, 'x'),
    board(`${idPrefix}_front`, tr(`${label} — חזית פנימית`, `${label} — inner front`), 'box_back', c, { x: o.x + c.T, y: o.y, z: o.z + s.z - c.T }, { x: s.x - 2 * c.T, y: s.y, z: c.T }, 'x'),
    board(`${idPrefix}_bottom`, tr(`${label} — תחתית`, `${label} — bottom`), 'box_bottom', c, { x: o.x + c.T, y: o.y, z: o.z + c.T }, { x: s.x - 2 * c.T, y: c.T, z: s.z - 2 * c.T }, 'x'),
  ];
}

function boxJoints(c: Ctx, s: Component['size']): HardwareLine {
  return jointScrews(
    [
      { lengthMm: s.y },
      { lengthMm: s.y },
      { lengthMm: s.y },
      { lengthMm: s.y },
      { lengthMm: s.x },
      { lengthMm: s.z },
    ],
    c.T,
  );
}

export const ADDONS: Record<AddonKind, AddonDef> = {
  /**
   * One more board across an opening. The structural check treats it exactly like a template shelf,
   * because it is one: same span, same load model, same material.
   */
  shelf: {
    kind: 'shelf',
    minOpeningMm: { x: 100, y: 80, z: 100 },
    build(opening, p, addon) {
      const c = ctx(p, opening);
      const y = opening.origin.y + (opening.size.y - c.T) / 2;
      return {
        components: [
          {
            ...board(addon.id, tr('מדף נוסף', 'Added shelf'), 'shelf', c, { x: opening.origin.x, y, z: opening.origin.z }, { x: opening.size.x, y: c.T, z: opening.size.z }, 'x'),
            spanMm: opening.size.x,
            load: 'loadPerShelf' in p ? p.loadPerShelf : undefined,
          },
        ],
        hardware: [jointScrews([{ lengthMm: opening.size.z }, { lengthMm: opening.size.z }], c.T)],
        checks: [],
      };
    },
  },

  /**
   * A box that lifts out. No runners, no hardware beyond its own screws, so unlike a drawer it can
   * be checked all the way to GREEN — which is why it is worth offering separately.
   */
  bedding_box: {
    kind: 'bedding_box',
    minOpeningMm: { x: 200, y: 120, z: 200 },
    build(opening, p, addon) {
      const c = ctx(p, opening);
      const size = { x: opening.size.x - 2 * FRONT_GAP_MM, y: opening.size.y - FRONT_GAP_MM, z: opening.size.z - BOX_BACK_CLEARANCE_MM };
      const origin = { x: opening.origin.x + FRONT_GAP_MM, y: opening.origin.y, z: opening.origin.z + BOX_BACK_CLEARANCE_MM };
      return {
        components: openBox(addon.id, tr('ארגז מצעים', 'Bedding box'), c, { origin, size }),
        hardware: [boxJoints(c, size)],
        checks: [],
      };
    },
  },

  /**
   * A box on runners behind a front panel.
   *
   * The runners are the whole difficulty: their length, their load rating and the gap they need at
   * each side all come from a specific product, and no runner datasheet is in the library. The box
   * is built to a stated clearance and the check says plainly that the clearance is an assumption,
   * so the drawer can be drawn and priced in wood while staying honest about what is not known.
   */
  drawer: {
    kind: 'drawer',
    minOpeningMm: { x: 200, y: 100, z: 250 },
    build(opening, p, addon) {
      const c = ctx(p, opening);
      const frontT = c.T;
      const boxSize = {
        x: opening.size.x - 2 * RUNNER_SIDE_CLEARANCE_MM,
        y: opening.size.y - FRONT_GAP_MM,
        z: opening.size.z - BOX_BACK_CLEARANCE_MM - frontT,
      };
      const boxOrigin = {
        x: opening.origin.x + RUNNER_SIDE_CLEARANCE_MM,
        y: opening.origin.y,
        z: opening.origin.z + BOX_BACK_CLEARANCE_MM,
      };
      const front = board(
        `${addon.id}_face`,
        tr('חזית מגירה', 'Drawer front'),
        'drawer_front',
        c,
        { x: opening.origin.x + FRONT_GAP_MM / 2, y: opening.origin.y, z: boxOrigin.z + boxSize.z },
        { x: opening.size.x - FRONT_GAP_MM, y: opening.size.y - FRONT_GAP_MM, z: frontT },
        'y',
        true,
      );
      return {
        components: [...openBox(addon.id, tr('מגירה', 'Drawer'), c, { origin: boxOrigin, size: boxSize }), front],
        hardware: [
          boxJoints(c, boxSize),
          {
            id: `${addon.id}_runner`,
            name: tr('זוג מסילות למגירה', 'Pair of drawer runners'),
            spec: tr(
              `אורך לפי עומק הארגז ${Math.round(boxSize.z)} מ"מ — לבחור דגם ולאמת מול היצרן`,
              `Length to suit the ${Math.round(boxSize.z)} mm box — pick a model and confirm with its maker`,
            ),
            quantity: 1,
            basis: tr('לא נבחר דגם מסילה; הכמות היא זוג אחד למגירה.', 'No runner model chosen; the quantity is one pair per drawer.'),
          },
        ],
        checks: [
          {
            id: `connections.drawer_runner.${addon.id}`,
            category: 'connections',
            status: 'GREY',
            componentIds: [`${addon.id}_left`, `${addon.id}_right`],
            title: tr('מסילות המגירה לא נבחרו', 'Drawer runners not chosen'),
            explanation: tr(
              `הארגז נבנה עם מרווח של ${RUNNER_SIDE_CLEARANCE_MM} מ"מ בכל צד — מידה מקובלת למסילות כדוריות, לא נתון של דגם מסוים. כמה המגירה נושאת וכמה היא נפתחת נקבעים על ידי המסילה, ואין בספרייה דף נתונים של מסילה.`,
              `The box is built with ${RUNNER_SIDE_CLEARANCE_MM} mm clearance per side — a common figure for ball-bearing runners, not a figure from a chosen product. How much the drawer carries and how far it opens are set by the runner, and no runner datasheet is in the library.`,
            ),
            assumptions: [
              tr(`מרווח ${RUNNER_SIDE_CLEARANCE_MM} מ"מ לצד לכל מסילה.`, `${RUNNER_SIDE_CLEARANCE_MM} mm side clearance per runner.`),
            ],
            sources: [],
            fixes: [],
            requiredVerification: tr(
              'לבחור דגם מסילה ולאמת מול היצרן את המרווח לצד, האורך והעומס המותר.',
              'Choose a runner model and confirm its side clearance, length and rated load with the maker.',
            ),
          },
        ],
      };
    },
  },

  /**
   * A leaf across one opening, for pieces whose template does not already carry doors. Hinges follow
   * the same rule of thumb the carcass doors use, and carry the same caveat.
   */
  door: {
    kind: 'door',
    minOpeningMm: { x: 120, y: 120, z: 100 },
    build(opening, p, addon) {
      const c = ctx(p, opening);
      const leaf = board(
        addon.id,
        tr('דלת', 'Door'),
        'door',
        c,
        { x: opening.origin.x + FRONT_GAP_MM / 2, y: opening.origin.y + FRONT_GAP_MM / 2, z: opening.origin.z + opening.size.z },
        { x: opening.size.x - FRONT_GAP_MM, y: opening.size.y - FRONT_GAP_MM, z: c.T },
        'y',
        true,
      );
      const hinges = leaf.size.y <= 900 ? 2 : leaf.size.y <= 1600 ? 3 : 4;
      return {
        components: [leaf],
        hardware: [
          {
            id: `${addon.id}_hinge`,
            name: tr('ציר סמוי Ø35', 'Ø35 concealed hinge'),
            spec: tr('קידוח כוס Ø35 בחזית הדלת', 'Ø35 cup bore in the door leaf'),
            quantity: hinges,
            basis: tr(
              `${hinges} צירים לפי גובה דלת ${Math.round(leaf.size.y)} מ"מ — כלל אצבע, לאמת מול יצרן הציר.`,
              `${hinges} hinges for a ${Math.round(leaf.size.y)} mm leaf — rule of thumb, confirm with the hinge maker.`,
            ),
          },
        ],
        checks: [],
      };
    },
  },
};

/** Openings big enough for a given component, so the picker never offers one that cannot be built. */
export function openingsFor(kind: AddonKind, openings: Opening[]): Opening[] {
  const min = ADDONS[kind].minOpeningMm;
  return openings.filter((o) => o.size.x >= min.x && o.size.y >= min.y && o.size.z >= min.z);
}

/** Builds every addon in `p` into the host model's openings, skipping any whose opening is gone. */
export function buildAddons(p: DesignParams, openings: Opening[]): AddonBuild {
  const out: AddonBuild = { components: [], hardware: [], checks: [] };
  for (const addon of p.addons ?? []) {
    const opening = openings.find((o) => o.id === addon.openingId);
    if (!opening) continue;
    const built = ADDONS[addon.kind].build(opening, p, addon);
    out.components.push(...built.components);
    out.hardware.push(...built.hardware);
    out.checks.push(...built.checks);
  }
  return out;
}

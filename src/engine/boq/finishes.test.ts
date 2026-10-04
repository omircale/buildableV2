import { describe, expect, it } from 'vitest';
import { emptySpace, type Space } from '../space/space';
import { billProblems, type Project } from './validate';
import { byTrade, type LineLocation } from './line';
import { FINISH_CODE_PREFIX, codePrefixProblems, finishLines, measuredAreaM2, orphanVariants, timberWasteRate, type FinishScheduleSpec } from './finishes';

/**
 * The fixtures below mirror three sheets of a real hotel finish schedule issued for tender: an oak
 * floor laid in herringbone in a treatment room, the same oak laid straight in a lounge under its own
 * variant code, and a sauna timber whose specification had not been settled.
 */
const WD2: FinishScheduleSpec = {
  code: 'WD-2',
  category: 'wood',
  itemNameEn: 'Timber Floor @ Treatment Room',
  itemNameHe: 'רצפת עץ — חדר טיפולים',
  surface: 'floor',
  pattern: 'Italian Herringbone 90°',
  product: { type: 'Classica Oak', color: 'Grigio-Marino', finish: 'Matt', sizeMm: { width: 90, length: 650 }, thicknessMm: 12.5, wearLayerMm: 3.5 },
  areas: ['treatment_1'],
  scope: 'supply_and_fix',
  manufacturer: { name: 'A flooring maker', contactName: 'A local agent' },
  sources: [],
};

const WD21: FinishScheduleSpec = {
  ...WD2,
  code: 'WD-2.1',
  variantOf: 'WD-2',
  itemNameEn: 'Timber Floor @ Relaxation Lounge',
  itemNameHe: 'רצפת עץ — טרקלין',
  pattern: 'Regular installation',
  product: { ...WD2.product, sizeMm: { width: 140, length: 2100 } },
  areas: ['lounge'],
};

const WD3: FinishScheduleSpec = {
  code: 'WD-3',
  category: 'wood',
  itemNameEn: 'Timber @ Sauna',
  itemNameHe: 'עץ — סאונה',
  surface: 'wall',
  product: { type: 'Thermo-Ash', color: 'Benchmark', finish: null, sizeMm: null, thicknessMm: null, wearLayerMm: null },
  toBeDevelopedBy: { he: 'ייקבע על ידי יועץ הספא יחד עם המעצב.', en: 'To be developed by the spa consultant with the designer.' },
  areas: ['sauna'],
  scope: 'unknown',
  sources: [],
};

function room(id: string, w: number, d: number, h: number | null = 2700): Space {
  return {
    ...emptySpace(id, id, id),
    footprintMm: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d },
    ],
    heightMm: h,
  };
}

const SPACES = [room('treatment_1', 4000, 3500), room('lounge', 8000, 5000), room('sauna', 2500, 2000)];
const locationOf = (spaceId: string): LineLocation => ({ buildingId: 'main', levelId: '-1', spaceId });

function lines(specs = [WD2, WD21, WD3]) {
  return finishLines({ specs, spaces: SPACES, locationOf });
}

describe('an area is a quantity this engine may produce', () => {
  it('measures a floor from the room, because an area is geometry', () => {
    // Unlike a pipe run, nobody designs an area and no licensed trade approves it.
    const line = lines().find((l) => l.id === 'finish_WD-2_treatment_1')!;
    expect(line.quantity).toBe(14); // 4.0 × 3.5
    expect(line.unit).toBe('m2');
    expect(line.trade).toBe('finishes');
  });

  it('measures a wall finish against the wall area, not the floor', () => {
    const wallSpec: FinishScheduleSpec = { ...WD3, toBeDevelopedBy: undefined, scope: 'supply_and_fix' };
    const line = finishLines({ specs: [wallSpec], spaces: SPACES, locationOf }).find((l) => l.id === 'finish_WD-3_sauna')!;
    // 2×(2.5+2.0)×2.7 = 24.3 m² of wall, not the 5 m² of floor.
    expect(line.quantity).toBe(24.3);
  });

  it('says the quantity still has to be verified by the installer', () => {
    // Every sheet in the schedule this came from carries that sentence, including the specified ones.
    const line = lines().find((l) => l.id === 'finish_WD-2_treatment_1')!;
    expect(line.assumptionHe).toContain('טעונה אימות');
    expect(line.assumptionEn).toContain('verified by the installer');
  });

  it('returns no area for a room nobody measured', () => {
    const unmeasured = [emptySpace('treatment_1', 'x', 'x')];
    const line = finishLines({ specs: [WD2], spaces: unmeasured, locationOf }).find((l) => l.id === 'finish_WD-2_treatment_1')!;
    expect(line.quantity).toBeNull();
    expect(line.unknownReasonEn).toContain('has not been measured');
  });

  it('returns no wall area when only the ceiling height is missing', () => {
    const noHeight = [room('sauna', 2500, 2000, null)];
    const wallSpec: FinishScheduleSpec = { ...WD3, toBeDevelopedBy: undefined };
    const line = finishLines({ specs: [wallSpec], spaces: noHeight, locationOf }).find((l) => l.id === 'finish_WD-3_sauna')!;
    expect(line.quantity).toBeNull();
    expect(line.unknownReasonHe).toContain('גובה התקרה');
  });

  it('measuredAreaM2 gives nothing for a surface it cannot measure', () => {
    expect(measuredAreaM2({ ...WD2, surface: 'other' }, SPACES[0])).toBeNull();
  });
});

describe('waste: a sourced assumption for timber, unknown for everything else', () => {
  it('a herringbone timber floor takes the maker-published 15%, and says whose figure it is', () => {
    const waste = lines().find((l) => l.id === 'finish_WD-2_treatment_1_waste')!;
    expect(waste.quantity).toBe(2.1); // 15% of 14 m²
    expect(waste.assumptionHe).toContain('15%');
    expect(waste.assumptionHe).toContain('לאשר מול המתקין');
    expect(waste.sources[0].url).toContain('havwoods');
  });

  it('a straight-laid timber floor takes 10%', () => {
    const waste = lines().find((l) => l.id === 'finish_WD-2.1_lounge_waste')!;
    expect(waste.quantity).toBe(4); // 10% of 40 m²
  });

  it('the rate follows the finish’s total area, as the source states it', () => {
    // 100 m² and over drops the published allowance: 12% patterned, 7% plank.
    expect(timberWasteRate(WD2, 99)?.rate).toBe(0.15);
    expect(timberWasteRate(WD2, 100)?.rate).toBe(0.12);
    expect(timberWasteRate(WD21, 99)?.rate).toBe(0.1);
    expect(timberWasteRate(WD21, 250)?.rate).toBe(0.07);
  });

  it('says nothing about anything but a timber floor, because the source does not', () => {
    expect(timberWasteRate({ ...WD2, category: 'tile' }, 50)).toBeNull();
    expect(timberWasteRate({ ...WD2, surface: 'wall' }, 50)).toBeNull();
    const tile: FinishScheduleSpec = { ...WD2, code: 'TL-1', category: 'tile' };
    const waste = finishLines({ specs: [tile], spaces: SPACES, locationOf }).find((l) => l.id === 'finish_TL-1_treatment_1_waste')!;
    expect(waste.quantity).toBeNull();
    expect(waste.unknownReasonEn).toContain("installer's figure");
  });

  it('the net area line carries no waste of its own', () => {
    const line = lines().find((l) => l.id === 'finish_WD-2_treatment_1')!;
    expect(line.assumptionHe).toContain('ללא תוספת פחת');
  });

  it('is not raised for a finish that has no measured area to waste', () => {
    expect(lines().some((l) => l.id === 'finish_WD-3_sauna_waste')).toBe(false);
  });
});

describe('written the way a published bill writes a finish', () => {
  it('opens with the room, as "אולם רב תכליתי - ריצוף…" does', () => {
    const named = finishLines({ specs: [WD2], spaces: SPACES, locationOf, placeName: () => ({ he: 'חדר טיפולים 1', en: 'Treatment room 1' }) });
    expect(named[0].descriptionHe.startsWith('חדר טיפולים 1 - WD-2')).toBe(true);
    expect(named[0].descriptionEn.startsWith('Treatment room 1 - WD-2')).toBe(true);
  });

  it('files flooring under chapter 10 and painting under chapter 11', () => {
    expect(lines().find((l) => l.id === 'finish_WD-2_treatment_1')!.chapter).toBe('10');
    const paint: FinishScheduleSpec = { ...WD3, code: 'PT-1', category: 'paint', toBeDevelopedBy: undefined };
    expect(finishLines({ specs: [paint], spaces: SPACES, locationOf })[0].chapter).toBe('11');
  });

  it('groups by surface, so flooring and wall cladding are separate sub-chapters', () => {
    expect(lines().find((l) => l.id === 'finish_WD-2_treatment_1')!.section).toBe('floor');
    expect(lines().find((l) => l.id === 'finish_WD-3_sauna')!.section).toBe('wall');
  });
});

describe('a specification nobody has settled', () => {
  it('produces a line with no quantity, naming who will settle it', () => {
    // The schedule this came from did exactly this rather than filling in a plausible board.
    const line = lines().find((l) => l.id === 'finish_WD-3_sauna')!;
    expect(line.quantity).toBeNull();
    expect(line.unknownReasonHe).toContain('יועץ הספא');
    expect(line.unknownReasonEn).toContain('spa consultant');
  });

  it('does not invent the fields the schedule left out', () => {
    expect(WD3.product.sizeMm).toBeNull();
    expect(WD3.product.thicknessMm).toBeNull();
    const line = lines().find((l) => l.id === 'finish_WD-3_sauna')!;
    expect(line.descriptionHe).not.toMatch(/\d+ מ"מ/);
  });
});

describe('the same product laid two ways is two specifications', () => {
  it('each variant keeps its own code, pattern, plank size and room', () => {
    const a = lines().find((l) => l.id === 'finish_WD-2_treatment_1')!;
    const b = lines().find((l) => l.id === 'finish_WD-2.1_lounge')!;
    expect(a.descriptionEn).toContain('Italian Herringbone 90°');
    expect(b.descriptionEn).toContain('Regular installation');
    expect(a.descriptionEn).toContain('90×650');
    expect(b.descriptionEn).toContain('140×2100');
    expect(b.quantity).toBe(40); // 8.0 × 5.0
  });

  it('a variant of a code that is not in the schedule is reported', () => {
    expect(orphanVariants([WD21])).toHaveLength(1);
    expect(orphanVariants([WD2, WD21])).toEqual([]);
  });

  it('a code whose prefix contradicts its category is reported', () => {
    expect(codePrefixProblems([WD2, WD21, WD3])).toEqual([]);
    const wrong = codePrefixProblems([{ ...WD2, code: 'ST-4' }]);
    expect(wrong).toHaveLength(1);
    expect(wrong[0].en).toContain('WD-');
  });

  it('every category has a prefix', () => {
    for (const [k, v] of Object.entries(FINISH_CODE_PREFIX)) expect(v.length, k).toBeGreaterThan(0);
  });
});

describe('two finishes on one floor', () => {
  it('refuses the area rather than splitting a room nobody drew a line across', () => {
    // The room's total is known; each finish's share of it is not. Halving it would be invention.
    const both: FinishScheduleSpec = { ...WD21, code: 'WD-4', variantOf: undefined, areas: ['treatment_1'] };
    const out = finishLines({ specs: [WD2, both], spaces: SPACES, locationOf });
    for (const id of ['finish_WD-2_treatment_1', 'finish_WD-4_treatment_1']) {
      const line = out.find((l) => l.id === id)!;
      expect(line.quantity, id).toBeNull();
      expect(line.unknownReasonEn, id).toContain('a drawn boundary is needed');
    }
  });

  it('a floor and a wall finish in the same room do not contest each other', () => {
    const wall: FinishScheduleSpec = { ...WD3, toBeDevelopedBy: undefined, areas: ['treatment_1'] };
    const out = finishLines({ specs: [WD2, wall], spaces: SPACES, locationOf });
    expect(out.find((l) => l.id === 'finish_WD-2_treatment_1')!.quantity).toBe(14);
    expect(out.find((l) => l.id === 'finish_WD-3_treatment_1')!.quantity).toBeGreaterThan(0);
  });
});

describe('the end user never sees who supplies a material', () => {
  it('no description carries the manufacturer or the agent', () => {
    // A standing rule of this system, held here because describe() is the function that would leak it.
    for (const l of lines()) {
      expect(l.descriptionHe, l.id).not.toContain('A flooring maker');
      expect(l.descriptionEn, l.id).not.toContain('A flooring maker');
      expect(l.descriptionEn, l.id).not.toContain('A local agent');
    }
  });

  it('the specification still holds the manufacturer, for the people entitled to it', () => {
    expect(WD2.manufacturer?.name).toBeTruthy();
  });
});

describe('the finishes chapters hold together', () => {
  it('every line lands in a room of the project, on its floor', () => {
    const project: Project = { levelIds: ['-1'], spaces: SPACES, buildingIds: ['main'] };
    expect(billProblems(lines(), project)).toEqual([]);
  });

  it('stone goes to the worktops chapter and wood to finishes', () => {
    const stone: FinishScheduleSpec = { ...WD2, code: 'ST-1', category: 'stone', areas: ['lounge'] };
    const groups = byTrade(finishLines({ specs: [WD2, stone], spaces: SPACES, locationOf })).map((g) => g.key);
    expect(groups).toContain('worktops');
    expect(groups).toContain('finishes');
  });

  it('a finish placed in a room that is not in the project says so', () => {
    const elsewhere: FinishScheduleSpec = { ...WD2, areas: ['gym'] };
    const line = finishLines({ specs: [elsewhere], spaces: SPACES, locationOf }).find((l) => l.id === 'finish_WD-2_gym')!;
    expect(line.quantity).toBeNull();
    expect(line.unknownReasonEn).toContain('not in the project');
  });

  it('carries no price anywhere', () => {
    for (const l of lines()) expect(l.unitPriceIls, l.id).toBeNull();
  });
});

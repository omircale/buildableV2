import { describe, expect, it } from 'vitest';
import { DEFAULT_OPEN_SHELF, runDesign } from '../index';
import { byTrade, totals, type LineLocation } from './line';
import { linesFromDesign } from './fromDesign';
import { billProblems, type Project } from './validate';
import { emptySpace } from '../space/space';

const AT: LineLocation = { buildingId: 'main', levelId: '0', spaceId: 'pool_bar' };

function bill(params = DEFAULT_OPEN_SHELF) {
  return linesFromDesign({ design: runDesign(params), location: AT, titleHe: 'יחידת בר אחורית', titleEn: 'Back bar unit' });
}

describe('the part of the bill this engine can stand behind', () => {
  it('names the piece as a lump, and the boards behind it separately', () => {
    // A bill names a bar; a contractor prices the boards. Both readings come out of one design.
    const { lines } = bill();
    const unit = lines.find((l) => l.id === 'joinery_unit')!;
    expect(unit.unit).toBe('lump');
    expect(unit.quantity).toBe(1);
    expect(unit.descriptionHe).toContain('יחידת בר אחורית');
    expect(lines.some((l) => l.section === 'boards')).toBe(true);
  });

  it('every board line carries a real sheet count and the waste it was nested at', () => {
    const boards = bill().lines.filter((l) => l.section === 'boards');
    expect(boards.length).toBeGreaterThan(0);
    for (const b of boards) {
      expect(b.quantity, b.id).toBeGreaterThan(0);
      expect(b.unit).toBe('unit');
      expect(b.descriptionHe, b.id).toMatch(/פחת [\d.]+%/);
    }
  });

  it('a sheet count nested on an unconfirmed sheet size says what it stands on', () => {
    // The honest middle state: the number is the best available, and a reader can see the assumption.
    const boards = bill().lines.filter((l) => l.section === 'boards');
    for (const b of boards) {
      const assumed = b.assumptionHe != null;
      if (assumed) {
        expect(b.quantity, b.id).toBeGreaterThan(0); // still a number, not a null
        expect(b.assumptionEn, b.id).toContain('out by one sheet');
      }
    }
  });

  it('edge banding and ironmongery come with the basis that produced them', () => {
    const { lines } = bill();
    for (const l of lines.filter((x) => x.section === 'edge_banding' || x.section === 'ironmongery')) {
      expect(l.quantity, l.id).toBeGreaterThan(0);
      expect(l.assumptionHe, l.id).toBeTruthy();
    }
  });

  it('carries no price anywhere', () => {
    const t = totals(bill().lines);
    expect(t.pricedLines).toBe(0);
    expect(t.complete).toBe(false);
  });

  it('passes the bill validator', () => {
    const project: Project = { levelIds: ['0'], spaces: [emptySpace('pool_bar', 'בר', 'Bar')], buildingIds: ['main'] };
    expect(billProblems(bill().lines, project)).toEqual([]);
  });

  it('every line lands in the room it was generated for', () => {
    for (const l of bill().lines) expect(l.location).toEqual(AT);
  });
});

describe('weight is a logistics line, not a footnote', () => {
  it('goes into the logistics chapter with the floor in its description', () => {
    // Weight decides service lift or stair, and the floor is half the question.
    const haulage = bill().lines.find((l) => l.id === 'haulage_mass')!;
    expect(haulage.trade).toBe('logistics');
    expect(haulage.unit).toBe('kg');
    expect(haulage.descriptionHe).toContain('קומה 0');
  });

  it('names the room the way the people who use it do, not by its internal id', () => {
    const named = linesFromDesign({ design: runDesign(DEFAULT_OPEN_SHELF), location: AT, placeHe: 'בר בריכה', placeEn: 'Pool bar' });
    const haulage = named.lines.find((l) => l.id === 'haulage_mass')!;
    expect(haulage.descriptionHe).toContain('אל בר בריכה');
    expect(haulage.descriptionHe).not.toContain('pool_bar');
    expect(haulage.descriptionEn).toContain('to Pool bar');
  });

  it('states that it is material weight only', () => {
    const haulage = bill().lines.find((l) => l.id === 'haulage_mass')!;
    if (haulage.quantity != null) {
      expect(haulage.assumptionEn).toContain('excludes packaging');
    } else {
      expect(haulage.unknownReasonHe).toBeTruthy();
    }
  });
});

describe('a design that does not stand up cannot be printed quietly', () => {
  it('a sound design hands back nothing blocking', () => {
    expect(bill().blockedBy).toEqual([]);
  });

  it('a failing design still produces lines, and hands the caller the failures', () => {
    // Quantities for a carcass that sags are worse than no quantities. The lines exist so the caller
    // can show what was designed; blockedBy exists so nobody can print it as if it holds.
    const tooWide = { ...DEFAULT_OPEN_SHELF, widthMm: 3000, loadPerShelfKg: 120 };
    const result = linesFromDesign({ design: runDesign(tooWide), location: AT });
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.blockedBy.length).toBeGreaterThan(0);
    for (const b of result.blockedBy) {
      expect(b.id.length).toBeGreaterThan(0);
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.explanation.length).toBeGreaterThan(0);
    }
  });
});

describe('a worktop is a different trade from a carcass', () => {
  it('reads as the chapters a bill actually has', () => {
    const groups = byTrade(bill().lines).map((g) => g.key);
    expect(groups).toContain('joinery');
    expect(groups).toContain('logistics');
    // Chapters come out in the bill's order, so joinery precedes logistics.
    expect(groups.indexOf('joinery')).toBeLessThan(groups.indexOf('logistics'));
  });
});

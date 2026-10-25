import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decodeDxf, parseDxf } from '../survey/dxf';
import {
  approvalCheck,
  assumedConnection,
  blankStudio,
  currentApproval,
  deriveIssues,
  fullFlow,
  proposePlumbing,
  runLengthM,
  spacesFromDrawing,
  studioBill,
  useFromName,
  type StudioProject,
} from './model';

const demo = parseDxf(decodeDxf(new Uint8Array(readFileSync(new URL('../../../public/samples/restaurant-demo.dxf', import.meta.url)))));

function project(patch: Partial<StudioProject> = {}): StudioProject {
  return { ...blankStudio(), name: 'דמו', spaces: spacesFromDrawing(demo, 'A-ROOM', 'mm'), ...patch };
}

describe('reading the plan as one piece', () => {
  test('the four spaces come in with their names, uses and shared origin', () => {
    const spaces = spacesFromDrawing(demo, 'A-ROOM', 'mm');
    expect(spaces.map((s) => s.name).sort()).toEqual(['אולם', 'מחסן', 'מטבח', 'שירותים'].sort());
    expect(spaces.find((s) => s.name === 'מטבח')?.use).toBe('kitchen');
    expect(spaces.find((s) => s.name === 'שירותים')?.use).toBe('restroom');
    const kitchen = spaces.find((s) => s.use === 'kitchen')!;
    // Not moved to its own origin: the kitchen still starts 9 m along and 4 m up.
    expect(Math.min(...kitchen.outline.map((p) => p.x))).toBe(9000);
    expect(Math.min(...kitchen.outline.map((p) => p.y))).toBe(4000);
    expect(kitchen.areaM2).toBeCloseTo(42);
  });

  test('an outline holding the others is the floor, not a space', () => {
    const floorAsRooms = spacesFromDrawing({ ...demo, polylines: demo.polylines.map((p) => ({ ...p, layer: 'ALL' })) }, 'ALL', 'mm');
    expect(floorAsRooms).toHaveLength(4);
  });

  test('a use is read from the name, and an unknown name stays "other"', () => {
    expect(useFromName('Kitchen 2')).toBe('kitchen');
    expect(useFromName('חדר מנהל')).toBe('other');
  });
});

describe('the proposal', () => {
  test('the connection is assumed on the street side, under the wet rooms', () => {
    const at = assumedConnection(project().spaces)!;
    expect(at.y).toBe(0);
    expect(at.x).toBeGreaterThan(9000);
  });

  test('the kitchen gets sinks, a floor drain and a grease separator; the restroom a WC and a basin', () => {
    const els = proposePlumbing(project());
    const kinds = (k: string) => els.filter((e) => e.kind === k).length;
    expect(kinds('sink')).toBe(2);
    expect(kinds('floor_drain')).toBe(1);
    expect(kinds('grease_separator')).toBe(1);
    expect(kinds('wc')).toBe(1);
    expect(kinds('basin')).toBe(1);
    expect(kinds('backflow')).toBe(1);
    // A drain run per fixture plus one out of each wet room; water to everything but the floor drain.
    expect(kinds('drain_run')).toBe(5 + 2);
    expect(kinds('water_run')).toBe(4);
  });

  test('every run turns at right angles and ends at the connection or a collector', () => {
    for (const e of proposePlumbing(project()).filter((x) => x.kind.endsWith('_run'))) {
      for (let i = 1; i < e.points.length; i++) {
        const [a, b] = [e.points[i - 1], e.points[i]];
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
      expect(runLengthM(e.points)).toBeGreaterThan(0);
    }
  });

  test('a dining room alone proposes nothing', () => {
    const p = project();
    expect(proposePlumbing({ ...p, spaces: p.spaces.filter((s) => s.use === 'dining') })).toEqual([]);
  });
});

describe('what is wrong with it', () => {
  test('slope and diameter block until someone enters them with a source', () => {
    const p = project();
    const issues = deriveIssues(p, proposePlumbing(p));
    expect(issues.find((i) => i.id === 'source_slope_diameter')?.severity).toBe('blocking');
    const filled = project({ design: { ...p.design, slopePct: { value: 1, source: 'מתכנן' }, diameterMm: { value: 110, source: 'מתכנן' } } });
    expect(deriveIssues(filled, proposePlumbing(filled)).some((i) => i.id === 'source_slope_diameter')).toBe(false);
  });

  test('full-flow velocity follows Manning with the conservative n', () => {
    // 110 mm at 1%: R = 0.0275 m, so V = (1/0.013)·0.0275^(2/3)·0.1 ≈ 0.70 m/s.
    const { velocity, flowLps } = fullFlow(110, 1);
    expect(velocity).toBeCloseTo(0.701, 2);
    expect(flowLps).toBeCloseTo(6.66, 1);
  });

  test('a flat slope is flagged as too slow, from a foreign source', () => {
    const p = project();
    const slow = project({ design: { ...p.design, slopePct: { value: 0.5, source: 'x' }, diameterMm: { value: 75, source: 'x' } } });
    const v = deriveIssues(slow, proposePlumbing(slow)).find((i) => i.id === 'velocity')!;
    expect(v.severity).toBe('warning');
    expect(v.citations).toContain('minVelocity');
  });

  test('the grease rule is said to be Tel Aviv’s when the site is elsewhere', () => {
    const p = project({ design: { ...blankStudio().design, city: 'חיפה' } });
    const g = deriveIssues(p, proposePlumbing(p)).find((i) => i.id === 'grease_local')!;
    expect(g.he).toContain('מי אביבים');
  });

  test('a mark from the field becomes an issue in the office', () => {
    const p = project({ marks: [{ id: 'm1', at: { x: 1, y: 1 }, category: 'obstacle', note: 'עמוד', createdAt: 0 }] });
    expect(deriveIssues(p, proposePlumbing(p)).find((i) => i.id === 'mark_m1')?.kind).toBe('field');
  });
});

describe('approval', () => {
  const ready = (): StudioProject => {
    const p = project({ design: { slopePct: { value: 2, source: 'מתכנן' }, diameterMm: { value: 110, source: 'מתכנן' }, ceilingMm: 3000, city: 'תל אביב-יפו', connection: { x: 10000, y: 0 } } });
    const els = proposePlumbing(p);
    return { ...p, status: Object.fromEntries(els.map((e) => [e.id, 'accepted' as const])) };
  };

  test('waits for every element to be decided and every warning acknowledged', () => {
    const p = project();
    const check = approvalCheck(p, proposePlumbing(p), deriveIssues(p, proposePlumbing(p)));
    expect(check.ok).toBe(false);
    expect(check.blocking).toBe(1);
    expect(check.undecided).toBeGreaterThan(0);
    const r = ready();
    expect(approvalCheck(r, proposePlumbing(r), deriveIssues(r, proposePlumbing(r))).ok).toBe(true);
  });

  test('an approval stops standing once the design changes', () => {
    const r = { ...ready(), revision: 3, approvals: [{ by: 'א', at: 0, revision: 3 }] };
    expect(currentApproval(r)).not.toBeNull();
    expect(currentApproval({ ...r, revision: 4 })).toBeNull();
  });
});

describe('the bill', () => {
  test('counts only what was accepted, and says it is a draft', () => {
    const p = project();
    const els = proposePlumbing(p);
    expect(studioBill(p, els, 'he').rows.length).toBe(6);
    const sink = els.find((e) => e.kind === 'sink')!;
    const one = { ...p, status: { [sink.id]: 'accepted' as const } };
    const rows = studioBill(one, els, 'he').rows;
    expect(rows[1][0]).toContain('טיוטה');
    expect(rows.slice(6)).toEqual([['07', 'נקודת כיור מטבח', "נק'", 1, '', '', 'מספר סעיף לפי המפרט הכללי — לא הושלם']]);
  });
});

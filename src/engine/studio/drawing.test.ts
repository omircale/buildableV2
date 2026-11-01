import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decodeDxf, parseDxf } from '../survey/dxf';
import { dxfText, planDxf, planSheet } from './drawing';
import { blankStudio, proposePlumbing, spacesFromDrawing, type StudioProject } from './model';

const demo = parseDxf(decodeDxf(new Uint8Array(readFileSync(new URL('../../../public/samples/restaurant-demo.dxf', import.meta.url)))));
const base = (): StudioProject => ({ ...blankStudio(), name: 'מסעדה <דמו>', spaces: spacesFromDrawing(demo, 'A-ROOM', 'mm') });

describe('the DXF', () => {
  test('is plain ASCII, with Hebrew as AutoCAD escapes', () => {
    expect(dxfText('מטבח 1')).toBe('\\U+05DE\\U+05D8\\U+05D1\\U+05D7 1');
    const p = base();
    expect(/^[\x09\x0A\x0D\x20-\x7E]*$/.test(planDxf(p, proposePlumbing(p), 'he'))).toBe(true);
  });

  test('reads back: millimetres, the rooms, and the labels in Hebrew', () => {
    const p = base();
    const back = parseDxf(planDxf(p, proposePlumbing(p), 'he'));
    expect(back.units).toBe('mm');
    expect(back.polylines.filter((l) => l.layer === 'A-ROOM' && l.closed)).toHaveLength(4);
    expect(back.texts.map((t) => t.text)).toContain('מטבח');
    expect(back.texts.some((t) => t.text.includes('לא אושר'))).toBe(true);
  });

  test('a proposal goes on its own layer, an accepted element on the system layer, a rejected one nowhere', () => {
    const p = base();
    const els = proposePlumbing(p);
    const runs = els.filter((e) => e.kind === 'drain_run');
    const [accepted, rejected] = [runs[0], runs[1]];
    const decided = { ...p, status: { [accepted.id]: 'accepted' as const, [rejected.id]: 'rejected' as const } };
    const back = parseDxf(planDxf(decided, els, 'he'));
    const onLayer = (name: string) => back.polylines.filter((l) => l.layer === name && !l.closed).length;
    expect(onLayer('P-DRAIN')).toBe(1);
    expect(onLayer('P-DRAIN-PROP')).toBe(runs.length - 2);
  });
});

describe('the A3 sheet', () => {
  test('takes the largest standard scale that fits, and says so', () => {
    const p = base();
    const { svg, scale } = planSheet(p, proposePlumbing(p), 'he');
    // 16 × 10 m in a 390 × 210 mm drawing area: 1:50 fits, 1:25 does not.
    expect(scale).toBe(50);
    expect(svg).toContain('קנ&quot;מ 1:50');
  });

  test('escapes what a person typed and says it is a draft', () => {
    const p = base();
    const { svg } = planSheet(p, proposePlumbing(p), 'he');
    expect(svg).toContain('מסעדה &lt;דמו&gt;');
    expect(svg).toContain('לא לביצוע');
    expect(svg).toContain('קוטר שפכים: חסר');
  });
});

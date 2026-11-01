import { describe, expect, it } from 'vitest';
import { CHAPTERS, TRADE_CHAPTER, UNASSIGNED_CHAPTER, chapterOf } from './chapters';
import { billDocumentCsv } from './export';
import type { BoqLine, LineLocation, Trade } from './line';
import { SKN_LIMITS, chapterSummary, numberBill } from './numbering';

const BAR: LineLocation = { buildingId: 'main', levelId: '0', spaceId: 'bar' };
const KITCHEN: LineLocation = { buildingId: 'main', levelId: '-1', spaceId: 'kitchen' };

function line(id: string, trade: Trade, section: string, location: LineLocation, over: Partial<BoqLine> = {}): BoqLine {
  return { id, trade, section, descriptionHe: `שורה ${id}`, descriptionEn: `line ${id}`, unit: 'unit', quantity: 1, location, origin: { kind: 'manual', ref: id }, unitPriceIls: null, sources: [], ...over };
}

const BILL: BoqLine[] = [
  line('p1', 'plumbing', 'points', BAR),
  line('p2', 'plumbing', 'points', BAR),
  line('p3', 'plumbing', 'supply', BAR),
  line('e1', 'electrical', 'points', BAR),
  line('j1', 'joinery', 'boards', BAR),
  line('k1', 'plumbing', 'points', KITCHEN),
];

const numberOf = (id: string) => numberBill(BILL).numbered.find((n) => n.line.id === id)!.number;

describe('item numbers read structure.chapter.sub-chapter.item', () => {
  it('the first room is structure 01 and plumbing is chapter 07', () => {
    expect(numberOf('p1')).toBe('01.07.01.0010');
  });

  it('items step by ten, so one can be inserted later without renumbering its neighbours', () => {
    expect(numberOf('p2')).toBe('01.07.01.0020');
  });

  it('a different section of the same chapter is the next sub-chapter', () => {
    expect(numberOf('p3')).toBe('01.07.02.0010');
  });

  it('each trade lands in its Blue Book chapter', () => {
    expect(numberOf('e1')).toBe('01.08.01.0010');
    expect(numberOf('j1')).toBe('01.06.01.0010');
  });

  it('a second room is structure 02, and its numbering starts again', () => {
    expect(numberOf('k1')).toBe('02.07.01.0010');
  });

  it('a zone inside a room does not make it a different structure', () => {
    const zoned = numberBill([line('a', 'plumbing', 'points', { ...BAR, zoneId: 'front' }), line('b', 'plumbing', 'points', { ...BAR, zoneId: 'back' })]);
    expect(zoned.structures).toHaveLength(1);
    expect(zoned.numbered.map((n) => n.number)).toEqual(['01.07.01.0010', '01.07.01.0020']);
  });

  it('every number fits the widths the interchange format allows', () => {
    for (const n of numberBill(BILL).numbered) expect(n.number, n.line.id).toMatch(/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/);
  });

  it('no line is lost or numbered twice', () => {
    const { numbered } = numberBill(BILL);
    expect(numbered.map((n) => n.line.id).sort()).toEqual(BILL.map((l) => l.id).sort());
    expect(new Set(numbered.map((n) => n.number)).size).toBe(BILL.length);
  });
});

describe('the chapters are the Blue Book’s, not this engine’s', () => {
  it('every chapter carries the source it was read from', () => {
    for (const c of Object.values(CHAPTERS)) {
      expect(c.source.url, c.code).toBeTruthy();
      expect(c.he.length, c.code).toBeGreaterThan(0);
    }
  });

  it('every trade that has a chapter points at one that exists', () => {
    for (const [trade, code] of Object.entries(TRADE_CHAPTER)) expect(CHAPTERS[code!], trade).toBeDefined();
  });

  it('a data point is filed under chapter 18, communications infrastructure', () => {
    expect(numberBill([line('d1', 'communications', 'points', BAR)]).numbered[0].number).toBe('01.18.01.0010');
    expect(CHAPTERS['18'].he).toBe('תשתיות תקשורת');
  });

  it('a trade with no chapter anyone could cite is filed as unassigned, and the bill says so', () => {
    // No source read so far says where a cooking-gas point belongs. Filing it under plumbing because
    // it is nearby would be exactly the kind of plausible guess this engine does not make.
    const gas = line('g1', 'gas', 'points', BAR);
    expect(chapterOf(gas)).toBe(UNASSIGNED_CHAPTER);
    const { problems } = numberBill([gas]);
    expect(problems.map((p) => p.code)).toEqual(['unassigned_chapter']);
  });

  it('a line can name its own chapter, as painting does', () => {
    expect(chapterOf(line('pt', 'finishes', 'wall', BAR, { chapter: '11' }))).toBe('11');
    expect(chapterOf(line('fl', 'finishes', 'floor', BAR))).toBe('10');
  });

  it('summarises the chapters a bill touches across all its rooms', () => {
    const summary = chapterSummary(BILL);
    expect(summary.map((c) => c.code)).toEqual(['06', '07', '08']);
    expect(summary.find((c) => c.code === '07')).toMatchObject({ he: 'מתקני תברואה', lines: 4, sourced: true });
  });
});

describe('what the interchange format would reject is reported', () => {
  it('a quantity wider than the format allows', () => {
    const { problems } = numberBill([line('big', 'finishes', 'floor', BAR, { quantity: SKN_LIMITS.quantity + 1 })]);
    expect(problems.map((p) => p.code)).toEqual(['quantity_too_large']);
  });

  it('more rooms than two digits can number', () => {
    const many = Array.from({ length: 100 }, (_, i) => line(`l${i}`, 'plumbing', 'points', { levelId: '0', spaceId: `room_${i}` }));
    expect(numberBill(many).problems.map((p) => p.code)).toContain('too_many_structures');
  });
});

describe('the document, in the industry’s own columns', () => {
  const csv = billDocumentCsv(BILL, { roomName: (l) => (l.spaceId === 'bar' ? 'בר בריכה' : 'מטבח') });
  const rows = csv.replace('﻿', '').split('\r\n');

  it('carries the seven columns of a published bill, in their order', () => {
    expect(rows[0].split(',').slice(0, 7)).toEqual(['סעיף', 'מקור הסעיף', 'תאור', "יח'", 'כמות', 'מחיר', '"סה""כ"']);
  });

  it('is laid out room, chapter, sub-chapter, item', () => {
    const firstCells = rows.map((r) => r.split(',')[0]).filter(Boolean);
    expect(firstCells.slice(1, 5)).toEqual(['01', '01.06', '01.06.01', '01.06.01.0010']);
  });

  it('heads each room with the name its people use', () => {
    expect(csv).toContain('בר בריכה · קומה 0');
    expect(csv).toContain('מטבח · קומה -1');
  });

  it('closes each sub-chapter, chapter and room the way a bill does', () => {
    expect(csv).toContain('סה""כ לנקודות');
    expect(csv).toContain('סה""כ למתקני תברואה');
    expect(csv).toContain('סה""כ לבר בריכה');
    expect(csv).toContain('סה""כ לכתב הכמויות');
  });

  it('leaves a total empty where not every line under it is priced, and says how far it got', () => {
    // A partial sum in the total column would be read as the total.
    const closing = rows.find((r) => r.includes('סה""כ למתקני תברואה'))!;
    expect(closing).toContain('0 מתוך 3 שורות מתומחרות');
    expect(closing.split(',')[6]).toBe('');
  });

  it('writes a real total once everything under it is priced', () => {
    const priced = BILL.map((l) => ({ ...l, unitPriceIls: 100, sources: [{ title: 'הצעת קבלן', reference: 'x' }] }));
    const closing = billDocumentCsv(priced).replace('﻿', '').split('\r\n').find((r) => r.includes('סה""כ לכתב הכמויות'))!;
    expect(closing.split(',')[6]).toBe('600');
  });

  it('a package for one trade keeps the numbers the whole bill gave its lines', () => {
    const plumbing = billDocumentCsv(BILL, { only: (l) => l.trade === 'plumbing' });
    expect(plumbing).toContain('02.07.01.0010');
    expect(plumbing).not.toContain('01.06');
    expect(plumbing).not.toContain('01.08');
  });

  it('puts the source of an item in its own column', () => {
    const sourced = billDocumentCsv([line('s', 'finishes', 'floor', BAR, { sources: [{ title: 'מחירון לדוגמה', reference: 'r' }] })]);
    const row = sourced.split('\r\n').find((r) => r.startsWith('01.10.01.0010'))!;
    expect(row.split(',')[1]).toBe('מחירון לדוגמה');
  });
});

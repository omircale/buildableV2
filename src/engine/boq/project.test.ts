import { describe, expect, it } from 'vitest';
import { billDocumentCsv } from './export';
import type { BoqLine } from './line';
import { DRAFT_NOTICE, timesRooms, unknownEquipment, withPrices } from './project';
import { billWorkbook, sheetName } from './workbook';

const line = (over: Partial<BoqLine> = {}): BoqLine => ({
  id: 'room_1:mep_electrical_points',
  trade: 'electrical',
  section: 'points',
  descriptionHe: 'נקודת חשמל חדשה',
  descriptionEn: 'New electrical point',
  unit: 'point',
  quantity: 3,
  location: { buildingId: 'main', levelId: '2', spaceId: 'room_1' },
  origin: { kind: 'service_point', ref: 'electrical' },
  unitPriceIls: null,
  sources: [],
  ...over,
});

describe('forty identical rooms as one entry', () => {
  it('multiplies the quantity and says both figures', () => {
    const [l] = timesRooms([line()], 40);
    expect(l.quantity).toBe(120);
    expect(l.assumptionHe).toContain('לחדר אחד: 3');
    expect(l.assumptionHe).toContain('×40 חדרים זהים');
    expect(l.assumptionEn).toContain('Per room: 3');
  });

  it('keeps what the line already said it rests on', () => {
    const [l] = timesRooms([line({ assumptionHe: 'עבור: עמדת עבודה.' })], 2);
    expect(l.assumptionHe).toContain('עבור: עמדת עבודה.');
  });

  it('forty times unknown is unknown', () => {
    const [l] = timesRooms([line({ quantity: null, unknownReasonHe: 'לא נמדד' })], 40);
    expect(l.quantity).toBeNull();
    expect(l.assumptionHe).toContain('×40');
  });

  it('one room is left exactly as it was', () => {
    const input = [line()];
    expect(timesRooms(input, 1)).toBe(input);
  });
});

describe('a price on a line', () => {
  it('arrives with its source, and the source reaches the document', () => {
    const [l] = withPrices([line()], { 'room_1:mep_electrical_points': { unitPriceIls: 420, source: 'הצעת מחיר, חשמלאי, 2026-10-01', date: '2026-10-11' } });
    expect(l.unitPriceIls).toBe(420);
    expect(l.sources[0].title).toContain('הצעת מחיר');
    expect(billDocumentCsv([l])).toContain('הצעת מחיר');
  });

  it('never arrives without one, whatever the store was handed', () => {
    const [l] = withPrices([line()], { 'room_1:mep_electrical_points': { unitPriceIls: 420, source: '   ', date: '' } });
    expect(l.unitPriceIls).toBeNull();
  });

  it('touches no other line', () => {
    const other = line({ id: 'room_2:x' });
    expect(withPrices([other], { 'room_1:mep_electrical_points': { unitPriceIls: 1, source: 'q', date: '' } })[0]).toBe(other);
  });
});

describe('equipment the catalogue does not know', () => {
  it('is named, once each, instead of vanishing', () => {
    expect(unknownEquipment(['workstation', 'pizza_oven', 'pizza_oven', 'tandoor'])).toEqual(['pizza_oven', 'tandoor']);
    expect(unknownEquipment(['workstation'])).toEqual([]);
  });
});

describe('what the document says it is', () => {
  it('the CSV ends by saying it is a draft for review', () => {
    const csv = billDocumentCsv([line()]);
    expect(csv.trimEnd().split('\r\n').pop()).toContain('טיוטת דרישות וכתב כמויות לבדיקת יועץ');
    expect(DRAFT_NOTICE.he).toContain('אינו תכנון');
  });
});

describe('the bill as a workbook', () => {
  const lines = [line(), line({ id: 'room_1:mep_water_cold_points', trade: 'plumbing', descriptionHe: 'נקודת מים קרים', quantity: null, unknownReasonHe: 'לא נמדד' }), line({ id: 'room_2:mep_electrical_points', location: { levelId: '2', spaceId: 'room_2' } })];

  it('opens with a summary that says what the document is, then one sheet per chapter', () => {
    const sheets = billWorkbook(lines);
    expect(sheets.map((s) => s.name)).toEqual(['סיכום', '07 מתקני תברואה', '08 מתקני חשמל']);
    expect(sheets[0].rows[0][0]).toContain('טיוטה לבדיקת יועץ');
    expect(String(sheets[0].rows[1][0])).toContain('אינו תכנון');
  });

  it('a chapter sheet holds that chapter from every room, under the bill’s own numbers', () => {
    const electrical = billWorkbook(lines)[2];
    const numbers = electrical.rows.map((r) => r[0]).filter((v) => typeof v === 'string' && /^\d\d\.08\.\d\d\.\d{4}$/.test(v));
    expect(numbers).toEqual(['01.08.01.0010', '02.08.01.0010']);
    expect(electrical.rows.flat().join(' ')).not.toContain('מים קרים');
  });

  it('gives no total while anything is unpriced, and gives one when everything is', () => {
    const open = billWorkbook(lines)[0].rows;
    expect(open.at(-1)![5]).toBe('');
    expect(String(open.at(-1)![6])).toContain('אין סכום');
    const priced = [line({ unitPriceIls: 100 })];
    expect(billWorkbook(priced)[0].rows.at(-1)![5]).toBe(300);
  });

  it('sheet names are ones Excel accepts, and never collide', () => {
    const taken = new Set<string>();
    expect(sheetName('08 חשמל: [לוחות]/קווים?', taken)).toBe('08 חשמל לוחות קווים');
    expect(sheetName('a'.repeat(40), taken)).toHaveLength(31);
    expect(sheetName('a'.repeat(40), taken)).toMatch(/\(2\)$/);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_OPEN_SHELF, runDesign } from '../index';
import { emptySpace, type Space } from '../space/space';
import type { ServiceSource } from '../space/supply';
import { billCsv, billSummary, tenderPackages } from './export';
import { linesFromDesign } from './fromDesign';
import { mepLines } from './mep';
import type { BoqLine, LineLocation } from './line';

const AT: LineLocation = { buildingId: 'main', levelId: '0', spaceId: 'pool_bar' };

function poolBar(): Space {
  return {
    ...emptySpace('pool_bar', 'בר בריכה', 'Pool bar'),
    footprintMm: [
      { x: 0, y: 0 },
      { x: 7200, y: 0 },
      { x: 7200, y: 3600 },
      { x: 0, y: 3600 },
    ],
    heightMm: 2700,
    connections: [{ id: 'wc1', kind: 'water_cold', atMm: { x: 6800, y: 600, z: 3400 }, existing: true, fedBy: 'main_w' }],
  };
}

const SOURCES: ServiceSource[] = [
  { id: 'main_w', kind: 'water_cold', nameHe: 'ראשי מים', nameEn: 'Water main', atMm: { x: 7100, y: 400, z: 3550 }, spareWays: null },
];

/** A whole room: the joinery the engine designed, plus the MEP it counted. */
function wholeRoom(): BoqLine[] {
  return [
    ...linesFromDesign({ design: runDesign(DEFAULT_OPEN_SHELF), location: AT, titleHe: 'יחידת בר אחורית', titleEn: 'Back bar unit' }).lines,
    ...mepLines({ space: poolBar(), sources: SOURCES, equipmentIds: ['bar_sink_single', 'undercounter_fridge'], location: AT }),
  ];
}

describe('the bill as a file', () => {
  it('opens in Excel with Hebrew intact', () => {
    // Without the byte order mark every Hebrew cell arrives as mojibake, which makes the file useless.
    expect(billCsv(wholeRoom()).startsWith('﻿')).toBe(true);
  });

  it('is grouped with a subtotal after each chapter, not a flat table', () => {
    const csv = billCsv(wholeRoom(), 'trade');
    expect(csv).toContain('נגרות');
    expect(csv).toContain('אינסטלציה');
    expect(csv).toContain('סיכום נגרות');
    expect(csv).toContain('סיכום הפרוייקט');
  });

  it('the same lines come out grouped by location on the other axis', () => {
    const csv = billCsv(wholeRoom(), 'location');
    expect(csv).toContain('main · קומה 0 · pool_bar');
    // Every line still appears; the axis changes the order, not the content.
    const lines = wholeRoom();
    for (const l of lines) expect(csv, l.id).toContain(l.descriptionHe.slice(0, 20));
  });

  it('writes an empty quantity rather than a zero, and says why it is empty', () => {
    // A zero would be priced as nothing. An empty cell with a reason is a question somebody can answer.
    const csv = billCsv(wholeRoom());
    const row = csv.split('\r\n').find((r) => r.includes('הבאת אספקת מים חמים'))!;
    expect(row).toBeTruthy();
    expect(row).toContain('אין מקור');
    expect(row).not.toMatch(/,0,/);
  });

  it('every subtotal says how many of its lines it could not price', () => {
    const csv = billCsv(wholeRoom());
    expect(csv).toMatch(/סיכום חלקי — 0 מתוך \d+ שורות מתומחרות/);
  });

  it('comes out in English on request', () => {
    const csv = billCsv(wholeRoom(), 'trade', 'en');
    expect(csv).toContain('Joinery');
    expect(csv).toContain('Plumbing');
    expect(csv).toMatch(/Partial — 0 of \d+ lines priced/);
    expect(csv).not.toContain('נגרות');
  });

  it('escapes a description containing a comma instead of breaking the row', () => {
    const csv = billCsv(wholeRoom());
    for (const row of csv.split('\r\n').filter(Boolean)) {
      // Every row has the same column count once quoted fields are accounted for.
      const unquoted = row.replace(/"(?:[^"]|"")*"/g, 'X');
      expect(unquoted.split(',').length, row.slice(0, 40)).toBeLessThanOrEqual(11);
    }
  });
});

describe('what the bill is waiting on', () => {
  it('lists every unpriced and unquantified line with its reason', () => {
    const summary = billSummary(wholeRoom());
    expect(summary.pending.length).toBe(summary.totals.missingQuantity + summary.totals.missingPrice);
    for (const p of summary.pending) {
      expect(p.he.length, p.lineId).toBeGreaterThan(0);
      expect(p.en.length, p.lineId).toBeGreaterThan(0);
    }
  });

  it('distinguishes a missing quantity from a missing price', () => {
    const summary = billSummary(wholeRoom());
    expect(summary.pending.some((p) => p.en.includes('waiting on a quote'))).toBe(true);
    expect(summary.pending.some((p) => p.en.includes('source reaches this room'))).toBe(true);
  });

  it('reports the same money on both axes', () => {
    const summary = billSummary(wholeRoom());
    const byTradeSum = summary.trades.reduce((a, t) => a + t.totals.pricedIls, 0);
    const byLocationSum = summary.locations.reduce((a, t) => a + t.totals.pricedIls, 0);
    expect(byTradeSum).toBe(summary.totals.pricedIls);
    expect(byLocationSum).toBe(summary.totals.pricedIls);
  });

  it('an unpriced bill is never complete, whatever its line count', () => {
    const summary = billSummary(wholeRoom());
    expect(summary.totals.lines).toBeGreaterThan(5);
    expect(summary.totals.pricedIls).toBe(0);
    expect(summary.totals.complete).toBe(false);
  });

  it('an empty bill produces a header and a project subtotal, and nothing else', () => {
    const csv = billCsv([]);
    const rows = csv.split('\r\n').filter(Boolean);
    expect(rows).toHaveLength(2);
    expect(billSummary([]).pending).toEqual([]);
  });
});

describe('what goes out to tender', () => {
  it('cuts the bill into one package per trade, losing and duplicating nothing', () => {
    const lines = wholeRoom();
    const packages = tenderPackages(lines);
    expect(packages.map((p) => p.trade)).toEqual(['joinery', 'plumbing', 'electrical', 'logistics']);
    const ids = packages.flatMap((p) => p.lines.map((l) => l.id)).sort();
    expect(ids).toEqual(lines.map((l) => l.id).sort());
  });

  it('flags every package whose trade needs a licensed professional, and only those', () => {
    const byTrade = Object.fromEntries(tenderPackages(wholeRoom()).map((p) => [p.trade, p.licensed]));
    expect(byTrade).toEqual({ joinery: false, plumbing: true, electrical: true, logistics: false });
  });

  it('each package carries its own honest totals', () => {
    for (const p of tenderPackages(wholeRoom())) {
      expect(p.totals.lines, p.trade).toBe(p.lines.length);
      expect(p.totals.complete, p.trade).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { billDocumentCsv } from './boq/export';
import type { BoqLine } from './boq/line';
import { csvCell } from './csv';

describe('a cell a spreadsheet would run is written as text', () => {
  it.each(['=HYPERLINK("http://x","y")', '+cmd|calc', '-2+3', '@SUM(A1)', '\tx', '\rx'])('%j', (value) => {
    const cell = csvCell(value);
    expect(cell.replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('leaves ordinary text alone', () => {
    expect(csvCell('בר בריכה')).toBe('בר בריכה');
    expect(csvCell('WD-2 — רצפת עץ')).toBe('WD-2 — רצפת עץ');
  });

  it('leaves a number alone, so a negative quantity stays a number', () => {
    expect(csvCell(-3.5)).toBe('-3.5');
    expect(csvCell(0)).toBe('0');
  });

  it('still quotes commas, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });
});

describe('the bill a contractor opens', () => {
  const line: BoqLine = {
    id: 'x',
    trade: 'finishes',
    section: 'floor',
    descriptionHe: '=HYPERLINK("http://evil.example","לחץ")',
    descriptionEn: 'x',
    unit: 'm2',
    quantity: 1,
    location: { levelId: '0', spaceId: 'r' },
    origin: { kind: 'manual', ref: 'x' },
    unitPriceIls: null,
    sources: [],
  };

  it('carries no cell that begins with a formula character, whatever a room or a finish was named', () => {
    // Found by audit: a room named "=…" reached the exported file as a live formula.
    const csv = billDocumentCsv([line], { roomName: () => '+cmd|calc' }).replace('﻿', '');
    for (const row of csv.split('\r\n')) {
      for (const cell of row.split(',')) expect(cell.replace(/^"/, ''), row.slice(0, 50)).not.toMatch(/^[=+@]/);
    }
  });
});

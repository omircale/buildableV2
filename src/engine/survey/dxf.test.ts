import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanText, decodeDxf, dxfEncoding, layerSummary, likelyUnit, parseDxf, roomsFromDrawing } from './dxf';

const text = readFileSync(new URL('./fixtures/sample.dxf', import.meta.url), 'utf8');
const d = parseDxf(text);

describe('reading a surveyor’s drawing', () => {
  it('takes the units the drawing declares', () => {
    expect(d.units).toBe('mm');
  });

  it('reads closed outlines, old-style polylines and labels, each on its layer', () => {
    expect(d.polylines.filter((p) => p.layer === 'A-ROOM' && p.closed)).toHaveLength(3);
    expect(d.polylines.find((p) => p.layer === 'OLD')?.points).toHaveLength(4);
    expect(d.polylines.find((p) => p.layer === 'A-WALL')?.closed).toBe(false);
    expect(d.texts.map((t) => t.text)).toEqual(['מטבח ראשי', 'STORE']);
  });

  it('lists layers with the most room outlines first', () => {
    expect(layerSummary(d)[0]).toEqual({ name: 'A-ROOM', closed: 3, texts: 0 });
    expect(layerSummary(d).find((l) => l.name === 'A-WALL')?.closed).toBe(0);
  });
});

describe('rooms out of the drawing', () => {
  const rooms = roomsFromDrawing(d, 'A-ROOM', 'mm');

  it('keeps outlines a room could be, and leaves out the door symbol and the open wall run', () => {
    expect(rooms).toHaveLength(2);
  });

  it('measures the true outline, not its bounding box — the L-shaped kitchen is 42 m², not 48', () => {
    const kitchen = rooms.find((r) => r.name === 'מטבח ראשי')!;
    expect(kitchen.areaM2).toBeCloseTo(42, 6);
    expect(kitchen.footprintMm).toHaveLength(6);
    expect(Math.min(...kitchen.footprintMm.map((p) => p.x))).toBe(0);
  });

  it('names each room by the label inside it, and says when an edge was an arc', () => {
    const store = rooms.find((r) => r.name === 'STORE')!;
    expect(store.areaM2).toBeCloseTo(7.5, 6);
    expect(store.hadArcs).toBe(true);
  });

  it('reads the same drawing in other units when a person says so', () => {
    expect(roomsFromDrawing(d, 'A-ROOM', 'cm').find((r) => r.name === 'STORE')!.areaM2).toBeCloseTo(750, 6);
  });
});

describe('a drawing that does not say its units', () => {
  it('offers the unit that makes its rooms room-sized', () => {
    const noUnits = parseDxf(text.replace('9\n$INSUNITS\n70\n4\n', ''));
    expect(noUnits.units).toBe('unknown');
    expect(likelyUnit(noUnits, 'A-ROOM')).toBe('mm');
    expect(likelyUnit(noUnits, 'nothing here')).toBeNull();
  });
});

describe('the text in a drawing', () => {
  it('decodes escapes and drops formatting codes', () => {
    expect(cleanText('{\\fArial|b1;\\U+05D7\\U+05D3\\U+05E8}\\P1')).toBe('חדר 1');
    expect(cleanText('%%c50')).toBe('50');
  });

  it('reads an older Hebrew drawing in its own code page, and a newer one as UTF-8', () => {
    const enc = new TextEncoder();
    expect(dxfEncoding(enc.encode('9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nANSI_1255\n'))).toBe('windows-1255');
    expect(dxfEncoding(enc.encode('9\n$ACADVER\n1\nAC1027\n9\n$DWGCODEPAGE\n3\nANSI_1255\n'))).toBe('utf-8');
  });

  it('a file that is not a drawing gives no rooms rather than an error', () => {
    const junk = parseDxf('hello\nworld');
    expect(junk.polylines).toEqual([]);
    expect(layerSummary(junk)).toEqual([]);
  });

  it('reads the labels right whichever encoding the bytes are actually in', () => {
    // Found in testing: a file naming Windows-1255 but saved as UTF-8 came out as rubbish.
    const declared = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nANSI_1255\n0\nENDSEC\n';
    const body = '0\nSECTION\n2\nENTITIES\n0\nTEXT\n8\nT\n10\n1\n20\n1\n1\nמטבח ראשי\n0\nENDSEC\n0\nEOF\n';
    const utf8 = new TextEncoder().encode(declared + body);
    expect(parseDxf(decodeDxf(utf8)).texts[0].text).toBe('מטבח ראשי');
    // The same text as Windows-1255 bytes: Hebrew letters א–ת are 0xE0–0xFA.
    const cp1255 = Uint8Array.from([...(declared + body)].map((ch) => (ch >= 'א' && ch <= 'ת' ? 0xe0 + ch.charCodeAt(0) - 0x5d0 : ch.charCodeAt(0))));
    expect(parseDxf(decodeDxf(cp1255)).texts[0].text).toBe('מטבח ראשי');
  });
});

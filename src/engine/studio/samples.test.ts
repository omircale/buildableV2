import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decodeDxf, layerSummary, likelyUnit, parseDxf, roomsFromDrawing } from '../survey/dxf';
import { labelPoint, spacesFromDrawing } from './model';

/**
 * The sample plans in public/samples (written by scripts/make-samples.py) open the way a real file
 * does: the rooms layer is the one offered first, the unit is read from the file, and every room comes
 * out once, with its own name — in the studio and in the room survey alike.
 */
const SAMPLES: Record<string, { rooms: number; uses?: Record<string, string> }> = {
  'hotel-pool-bar': { rooms: 9, uses: { 'בר בריכה': 'other', 'מטבחון בר': 'kitchen', 'שירותים נשים': 'restroom', 'מקלחות חוץ': 'bathroom' } },
  'hotel-spa': { rooms: 15, uses: { מקלחות: 'bathroom', 'מקלחת חדר זוגי': 'bathroom', 'חדר מנוחה': 'other' } },
  'hotel-guest-rooms': { rooms: 11, uses: { 'חדר רחצה 101': 'bathroom', 'חדר אירוח 101': 'other' } },
  'hotel-lobby': { rooms: 12, uses: { 'שירותי נכים': 'restroom', 'מטבחון בר לובי': 'kitchen' } },
  're-typical-floor': { rooms: 24, uses: { 'מטבח דירה 1': 'kitchen', 'סלון ופינת אוכל דירה 2': 'dining', 'שירותי אורחים דירה 2': 'restroom' } },
  're-retail-ground-floor': { rooms: 13, uses: { 'מטבח בית קפה': 'kitchen', 'בית קפה - אזור ישיבה': 'dining', 'שירותים חנות 2': 'restroom' } },
  're-office-floor': { rooms: 12, uses: { 'מטבחון משרד': 'kitchen', מחסן: 'storage' } },
};

const read = (name: string) => parseDxf(decodeDxf(new Uint8Array(readFileSync(new URL(`../../../public/samples/${name}.dxf`, import.meta.url)))));

describe('sample plans', () => {
  for (const [name, expected] of Object.entries(SAMPLES)) {
    test(name, () => {
      const d = read(name);
      expect(d.units).toBe('mm');
      const layer = layerSummary(d).filter((l) => l.closed > 0)[0].name;
      expect(layer).toBe('A-ROOM');
      expect(likelyUnit(d, layer)).toBe('mm');

      const spaces = spacesFromDrawing(d, layer, 'mm');
      expect(spaces).toHaveLength(expected.rooms);
      expect(new Set(spaces.map((s) => s.name)).size).toBe(expected.rooms);
      expect(spaces.every((s) => s.name)).toBe(true);
      for (const [room, use] of Object.entries(expected.uses ?? {})) expect(spaces.find((s) => s.name === room)?.use, room).toBe(use);

      const rooms = roomsFromDrawing(d, layer, 'mm');
      expect(rooms.map((r) => r.name).sort()).toEqual(spaces.map((s) => s.name).sort());
    });
  }

  test('a room wrapped around another keeps its own name, not its neighbour’s', () => {
    const spaces = spacesFromDrawing(read('hotel-pool-bar'), 'A-ROOM', 'mm');
    expect(spaces.find((s) => s.name === 'דק בריכה')?.areaM2).toBeCloseTo(16.5 * 10 - 12.5 * 6, 6);
    expect(spaces.find((s) => s.name === 'בריכה')?.areaM2).toBeCloseTo(75, 6);
  });
});

describe('where a room’s name goes', () => {
  const inPoly = (poly: { x: number; y: number }[], p: { x: number; y: number }) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };

  test('a rectangle keeps it in the middle', () => {
    expect(labelPoint([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }])).toEqual({ x: 2000, y: 1500 });
  });

  test('every room of every sample has it inside the room, not in the room it wraps around', () => {
    for (const name of Object.keys(SAMPLES)) {
      for (const s of spacesFromDrawing(read(name), 'A-ROOM', 'mm')) expect(inPoly(s.outline, labelPoint(s.outline)), `${name}: ${s.name}`).toBe(true);
    }
  });
});

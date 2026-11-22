import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeDxf, layerSummary, parseDxf, roomsFromDrawing } from '../../engine';
import { EXAMPLE_TEMPLATE, HOTEL_ROOM_TEMPLATE } from '../../state/templateStore';
import { defaultEquipmentRoom } from './equipmentRoom';

const named = (...names: string[]) => names.map((name) => ({ name }));
const hotel = HOTEL_ROOM_TEMPLATE.equipmentIds;
const kitchen = EXAMPLE_TEMPLATE.equipmentIds;

/** The rooms of one of the site's own sample plans, read the way the import reads them. */
function sample(file: string) {
  const bytes = readFileSync(new URL(`../../../public/samples/${file}`, import.meta.url));
  const d = parseDxf(decodeDxf(new Uint8Array(bytes)));
  return roomsFromDrawing(d, layerSummary(d).filter((l) => l.closed > 0)[0].name, d.units === 'unknown' ? 'mm' : d.units);
}

describe('which room takes the equipment by default', () => {
  it('a guest room’s is placed nowhere by itself in a floor of guest rooms and a corridor', () => {
    const rooms = sample('hotel-guest-rooms.dxf');
    expect(rooms).toHaveLength(11);
    expect(defaultEquipmentRoom(rooms, HOTEL_ROOM_TEMPLATE.roomName!, hotel)).toBeNull();
  });

  it('no sample plan ever has a guest room’s equipment in a corridor, a pool or a store', () => {
    for (const file of ['hotel-guest-rooms.dxf', 'hotel-lobby.dxf', 'hotel-pool-bar.dxf', 'hotel-spa.dxf']) expect(defaultEquipmentRoom(sample(file), 'חדר אירוח', hotel), file).toBeNull();
  });

  it('a kitchen’s goes to the one room called a kitchen', () => {
    const rooms = sample('restaurant-demo.dxf');
    const at = defaultEquipmentRoom(rooms, 'מטבח', kitchen);
    expect(at == null ? null : rooms[at].name).toBe('מטבח');
    expect(defaultEquipmentRoom(named('Hall', 'Kitchen'), 'Regular branch', kitchen)).toBe(1);
  });

  it('a room is matched by whole words: a kitchenette is not a kitchen', () => {
    expect(defaultEquipmentRoom(named('מטבחון בר', 'מחסן'), 'מטבח', kitchen)).toBeNull();
    expect(defaultEquipmentRoom(named('מסדרון', 'חדר אירוח 101'), 'חדר אירוח', hotel)).toBe(1);
  });

  it('nothing is suggested when no name says it, several do, or rooms have no name', () => {
    expect(defaultEquipmentRoom(named('אולם', 'מחסן'), 'מטבח', kitchen)).toBeNull();
    expect(defaultEquipmentRoom(named('מטבח חם', 'מטבח קר'), 'מטבח', kitchen)).toBeNull();
    expect(defaultEquipmentRoom([{ name: null }, { name: null }], '', hotel)).toBeNull();
  });
});

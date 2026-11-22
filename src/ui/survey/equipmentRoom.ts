import { EQUIPMENT } from '../../engine';

const words = (name: string) => name.trim().toLowerCase().split(/[\s,.\-–—/()]+/).filter(Boolean);

/**
 * Which of a survey's rooms the open room's equipment most plainly belongs in: the only one whose name
 * says it — a room called what the open room is called, or, for cooking equipment, the kitchen.
 *
 * None when no name says it, and none when several do: a guest room's furniture put in the largest room
 * lands in the corridor, and four guest rooms are the person's to choose between. Whole words, so a
 * kitchenette is not a kitchen.
 */
export function defaultEquipmentRoom(rooms: { name: string | null }[], openRoomName: string, equipmentIds: string[]): number | null {
  const only = (wanted: string[]): number | null => {
    if (!wanted.length) return null;
    const hits = rooms.map((r, i) => ({ i, has: words(r.name ?? '') })).filter(({ has }) => wanted.every((w) => has.includes(w)));
    return hits.length === 1 ? hits[0].i : null;
  };
  const byName = only(words(openRoomName));
  if (byName != null) return byName;
  const cooks = equipmentIds.some((id) => EQUIPMENT.find((e) => e.id === id)?.category === 'cooking');
  return cooks ? (only(['מטבח']) ?? only(['kitchen'])) : null;
}

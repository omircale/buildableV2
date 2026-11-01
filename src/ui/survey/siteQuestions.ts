import { equipmentById, servicesFor, type ServiceKind } from '../../engine';
import type { Dict } from '../../i18n';
import type { Survey } from '../../state/spaceStore';
import { refinementQuestions, type Question } from './questions';
import { serviceName } from './services';

/**
 * What still has to be measured, looked at or asked before a room's bill is whole.
 *
 * "I don't know, ask on site" stops a question being repeated on screen; it does not answer it. So the
 * list a person carries out of the office is every question the model still cannot answer, whether or
 * not somebody already said "later" to it. An answer that settled something — "there is none in the
 * room", "every wall is built" — keeps its question off the list.
 */
const DEFERRED = new Set(['ask_on_site', 'not_stated']);

export function siteQuestions(room: Pick<Survey, 'space' | 'sources' | 'equipmentIds' | 'widthMm' | 'depthMm' | 'answers'>): Question[] {
  const settled = Object.fromEntries(Object.entries(room.answers).filter(([, code]) => !DEFERRED.has(code)));
  return refinementQuestions({ ...room, answers: settled });
}

/** Items by name. Two of the same item are one name with a count, not the name written twice. */
export function equipmentNames(ids: string[], he: boolean): string {
  const perItem = new Map<string, number>();
  for (const id of ids) perItem.set(id, (perItem.get(id) ?? 0) + 1);
  return [...perItem]
    .map(([id, n]) => {
      const item = equipmentById(id);
      const name = item ? (he ? item.nameHe : item.nameEn) : id;
      return n > 1 ? `${name} ×${n}` : name;
    })
    .join(', ');
}

/** The items a service is wanted for, by name. */
export function askedBy(equipmentIds: string[], kind: ServiceKind, he: boolean): string {
  return equipmentNames(servicesFor(equipmentIds).find((s) => s.kind === kind)?.from ?? [], he);
}

/** A question in the words the screen asks it in. */
export function questionText(q: Question, r: Dict['journey']['refine'], he: boolean): string {
  switch (q.type) {
    case 'size':
      return r.sizeQ;
    case 'height':
      return r.heightQ;
    case 'open_sides':
      return r.openQ;
    case 'supply':
      return q.status === 'no_source' ? r.supplyNoSourceQ(serviceName(q.service, he), q.toCreate) : r.supplyUnknownQ(serviceName(q.service, he));
    case 'capacity':
      return r.capacityQ(q.sourceName, serviceName(q.service, he), q.toCreate);
  }
}

export interface SiteRoom {
  name: string;
  items: { id: string; text: string; for?: string }[];
}

export function siteList(rooms: Survey[], t: Dict, he: boolean): SiteRoom[] {
  return rooms
    .map((room) => ({
      name: (he ? room.space.nameHe : room.space.nameEn || room.space.nameHe) || t.survey.unnamed,
      items: siteQuestions(room).map((q) => ({
        id: `${room.space.id}:${q.id}`,
        text: questionText(q, t.journey.refine, he),
        for: q.type === 'supply' || q.type === 'capacity' ? askedBy(room.equipmentIds, q.service, he) || undefined : undefined,
      })),
    }))
    .filter((r) => r.items.length);
}

/** The list as plain text, with a box to tick beside each line — something to print or paste into a message. */
export function siteListText(list: SiteRoom[], t: Dict): string {
  const out: string[] = [t.survey.siteList, ''];
  for (const room of list) {
    out.push(room.name);
    for (const item of room.items) out.push(`[ ] ${item.text}${item.for ? ` (${t.survey.siteFor(item.for)})` : ''}`);
    out.push('');
  }
  return out.join('\n');
}

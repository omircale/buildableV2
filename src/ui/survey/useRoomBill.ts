import { useMemo } from 'react';
import { finishLines, linesFromDesign, mepLines, runDesign, type BoqLine, type DesignResult, type LineLocation } from '../../engine';
import { useDesign } from '../../state/designStore';
import { projectRooms, useSurvey, type Survey } from '../../state/spaceStore';
import { useUi } from '../../state/uiStore';

export interface RoomBill {
  /** Every line of the project, room after room, in bill order. */
  lines: BoqLine[];
  /** The project's rooms, the open one included, in bill order. */
  rooms: Survey[];
  /** What a room is called by the people who use it, in the current language. */
  roomName: (location: LineLocation) => string;
  /** The piece from the design editor, run through the engine — present whether or not it is in the bill. */
  design: DesignResult;
  designName: string;
  /** Blocking failures on that piece. A bill that includes a piece which does not stand up must say so. */
  designBlockedBy: { id: string; title: string; explanation: string }[];
}

/**
 * The bill for the whole project: for every room, the services it counts, the finishes laid in it and
 * — where the person has said so — the piece designed in the editor.
 *
 * This is where the halves of the product meet. The furniture editor, the room survey and the finish
 * schedule were built separately; a bill that only knew one of them would describe a room with nothing
 * built in it, a piece of joinery standing nowhere, or a floor with no room under it.
 */
export function useRoomBill(): RoomBill {
  const survey = useSurvey();
  const params = useDesign((s) => s.params);
  const config = useDesign((s) => s.config);
  const designName = useDesign((s) => s.projectName);
  const locale = useUi((s) => s.locale);
  const he = locale === 'he';

  const design = useMemo(() => runDesign(params, config, locale), [params, config, locale]);

  return useMemo(() => {
    const rooms = projectRooms(survey);
    const byId = new Map(rooms.map((r) => [r.space.id, r]));
    const locationOf = (spaceId: string): LineLocation => {
      const r = byId.get(spaceId);
      return { buildingId: r?.buildingId || undefined, levelId: r?.levelId ?? '0', spaceId };
    };
    const nameOf = (spaceId: string) => {
      const r = byId.get(spaceId);
      return { he: r?.space.nameHe || spaceId, en: r?.space.nameEn || r?.space.nameHe || spaceId };
    };

    const finishes = finishLines({ specs: survey.finishes, spaces: rooms.map((r) => r.space), locationOf, placeName: nameOf });
    // Whether the piece stands up does not depend on which room it is in, so it is checked once.
    const designBlockedBy = linesFromDesign({ design, location: locationOf(survey.space.id) }).blockedBy;
    const lines: BoqLine[] = [];

    for (const room of rooms) {
      const id = room.space.id;
      const location = locationOf(id);
      // The same line arises in every room that needs it, so its id carries the room.
      const own = (l: BoqLine): BoqLine => ({ ...l, id: `${id}:${l.id}` });

      if (room.includeDesign) {
        const name = nameOf(id);
        const fromDesign = linesFromDesign({ design, location, titleHe: designName, titleEn: designName, placeHe: name.he, placeEn: name.en });
        lines.push(...fromDesign.lines.map(own));
      }
      lines.push(...finishes.filter((l) => l.location.spaceId === id));
      lines.push(...mepLines({ space: room.space, sources: room.sources, equipmentIds: room.equipmentIds, location }).map(own));
    }

    return {
      lines,
      rooms,
      roomName: (location) => (he ? nameOf(location.spaceId).he : nameOf(location.spaceId).en),
      design,
      designName,
      designBlockedBy,
    };
  }, [survey, design, designName, he]);
}

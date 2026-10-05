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
  /** The piece open in the design editor right now — what "put in the room" would put there. */
  design: DesignResult;
  designName: string;
  /** The piece that was put in a room, as it was when it was put there. Null when the room has none. */
  pieceOf: (spaceId: string) => { name: string; result: DesignResult } | null;
  /** True when the open room holds a piece and the editor has since moved on from it. */
  pieceStale: boolean;
  /** Blocking failures on the open room's piece. A bill with a piece that does not stand up must say so. */
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
    const lines: BoqLine[] = [];

    // Forty copies of a room hold forty copies of the same piece; it is run through the engine once.
    const results = new Map<string, DesignResult>();
    const pieceOf = (spaceId: string) => {
      const piece = byId.get(spaceId)?.piece;
      if (!piece) return null;
      const key = JSON.stringify(piece.params);
      if (!results.has(key)) results.set(key, runDesign(piece.params, config, locale));
      return { name: piece.name, result: results.get(key)! };
    };

    for (const room of rooms) {
      const id = room.space.id;
      const location = locationOf(id);
      // The same line arises in every room that needs it, so its id carries the room.
      const own = (l: BoqLine): BoqLine => ({ ...l, id: `${id}:${l.id}` });

      const piece = pieceOf(id);
      if (piece) {
        const name = nameOf(id);
        lines.push(...linesFromDesign({ design: piece.result, location, titleHe: piece.name, titleEn: piece.name, placeHe: name.he, placeEn: name.en }).lines.map(own));
      }
      lines.push(...finishes.filter((l) => l.location.spaceId === id));
      lines.push(...mepLines({ space: room.space, sources: room.sources, equipmentIds: room.equipmentIds, location }).map(own));
    }

    const open = pieceOf(survey.space.id);
    return {
      lines,
      rooms,
      roomName: (location) => (he ? nameOf(location.spaceId).he : nameOf(location.spaceId).en),
      design,
      designName,
      pieceOf,
      pieceStale: survey.piece != null && JSON.stringify(survey.piece.params) !== JSON.stringify(params),
      designBlockedBy: open ? linesFromDesign({ design: open.result, location: locationOf(survey.space.id) }).blockedBy : [],
    };
  }, [survey, design, designName, he, params, config, locale]);
}

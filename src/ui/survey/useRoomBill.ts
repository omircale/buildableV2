import { useMemo } from 'react';
import { linesFromDesign, mepLines, runDesign, type BoqLine, type DesignResult } from '../../engine';
import { useDesign } from '../../state/designStore';
import { useSurvey } from '../../state/spaceStore';
import { useUi } from '../../state/uiStore';

export interface RoomBill {
  lines: BoqLine[];
  /** The piece from the design editor, run through the engine — present whether or not it is in the bill. */
  design: DesignResult;
  designName: string;
  /** Blocking failures on that piece. A bill that includes a piece which does not stand up must say so. */
  designBlockedBy: { id: string; title: string; explanation: string }[];
}

/**
 * The bill for the room being surveyed: the services it counts, and — when the person has said so —
 * the piece designed in the editor, placed in the same room.
 *
 * This is where the two halves of the product meet. The furniture editor and the room survey were
 * built separately; a bill that only knew one of them would describe either a room with nothing built
 * in it or a piece of joinery standing nowhere.
 */
export function useRoomBill(): RoomBill {
  const survey = useSurvey();
  const params = useDesign((s) => s.params);
  const config = useDesign((s) => s.config);
  const designName = useDesign((s) => s.projectName);
  const locale = useUi((s) => s.locale);

  const design = useMemo(() => runDesign(params, config, locale), [params, config, locale]);

  return useMemo(() => {
    const location = { buildingId: survey.buildingId, levelId: survey.levelId, spaceId: survey.space.id };
    const services = mepLines({ space: survey.space, sources: survey.sources, equipmentIds: survey.equipmentIds, location });
    const fromDesign = linesFromDesign({ design, location, titleHe: designName, titleEn: designName, placeHe: survey.space.nameHe, placeEn: survey.space.nameEn });
    return {
      lines: survey.includeDesign ? [...fromDesign.lines, ...services] : services,
      design,
      designName,
      designBlockedBy: fromDesign.blockedBy,
    };
  }, [survey.space, survey.sources, survey.equipmentIds, survey.buildingId, survey.levelId, survey.includeDesign, design, designName]);
}

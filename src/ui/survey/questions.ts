import { BLOCKING_SUPPLY_STATUSES, matchServices, servicesFor, supplyReport, type ServiceKind, type ServiceSource, type Space, type SupplyStatus } from '../../engine';

/**
 * The questions a room still has to answer before its bill can be quantified.
 *
 * These are not a script. Each one exists because the engine reported something it cannot compute
 * without a person — an unmeasured floor, a point nobody traced, a source whose capacity nobody stated
 * — and it disappears the moment the model has the answer. That is what keeps the refinement step
 * honest: it can only ask what actually blocks a quantity, and it can never ask something twice once
 * the answer is in the model.
 *
 * "I don't know, ask on site" is a real answer. It changes nothing in the model and the gap stays in
 * the bill, but the question is not repeated; it moves to the list the procurement manager takes out.
 */

export type Question =
  | { id: 'size'; type: 'size' }
  | { id: 'height'; type: 'height' }
  | { id: 'open_sides'; type: 'open_sides' }
  | { id: `supply:${ServiceKind}`; type: 'supply'; service: ServiceKind; status: Extract<SupplyStatus, 'no_source' | 'source_unknown'>; toCreate: number }
  | { id: `capacity:${ServiceKind}`; type: 'capacity'; service: ServiceKind; sourceId: string; sourceName: string; toCreate: number };

export interface QuestionInput {
  space: Space;
  sources: ServiceSource[];
  equipmentIds: string[];
  widthMm: number | null;
  depthMm: number | null;
  answers: Record<string, string>;
}

export function refinementQuestions({ space, sources, equipmentIds, widthMm, depthMm, answers }: QuestionInput): Question[] {
  const open: Question[] = [];
  const unanswered = (id: string) => answers[id] == null;

  if ((widthMm == null || depthMm == null) && unanswered('size')) open.push({ id: 'size', type: 'size' });
  if (space.heightMm == null && unanswered('height')) open.push({ id: 'height', type: 'height' });
  // Asked once, only when there are walls to ask about. "All walls are built" is an answer too.
  if (space.footprintMm.length >= 3 && unanswered('open_sides')) open.push({ id: 'open_sides', type: 'open_sides' });

  const needs = matchServices(space, servicesFor(equipmentIds));
  const supply = supplyReport(
    space,
    sources,
    needs.map((n) => ({ kind: n.kind, toCreate: n.toCreate })),
  );

  for (const line of supply) {
    if (!BLOCKING_SUPPLY_STATUSES.has(line.status)) continue;
    if (line.status === 'capacity_unstated') {
      const id = `capacity:${line.kind}` as const;
      const source = sources.find((s) => s.kind === line.kind);
      if (source && unanswered(id)) open.push({ id, type: 'capacity', service: line.kind, sourceId: source.id, sourceName: source.nameHe || source.nameEn || source.id, toCreate: line.toCreate });
    } else {
      const id = `supply:${line.kind}` as const;
      if (unanswered(id)) open.push({ id, type: 'supply', service: line.kind, status: line.status as 'no_source' | 'source_unknown', toCreate: line.toCreate });
    }
  }

  return open;
}

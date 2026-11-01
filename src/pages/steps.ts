/**
 * The design flow is one editing surface plus the summary.
 *
 * It used to be four steps — space, structure, look, summary — which meant answering a form before
 * seeing the piece, and made "change it" and "understand it" two different screens. Everything that
 * shapes the piece now lives in the editor beside it.
 *
 * Kept apart from the editor so routing does not pull in the 3D bundle.
 */
export const STEPS = ['edit', 'review'] as const;
export type Step = (typeof STEPS)[number];

/** Links and saved projects from the four-step flow still open the editor. */
const RETIRED: Record<string, Step> = { setup: 'edit', structure: 'edit', look: 'edit' };

export function stepFromRoute(raw: string): Step {
  if ((STEPS as readonly string[]).includes(raw)) return raw as Step;
  return RETIRED[raw] ?? 'edit';
}

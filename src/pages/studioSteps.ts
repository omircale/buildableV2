/** The studio's steps, kept out of the page so the router can read them without loading it. */
export const STUDIO_STEPS = ['start', 'building', 'plan', 'field', 'outputs'] as const;
export type StudioStep = (typeof STUDIO_STEPS)[number];

export function studioStepFromRoute(route: string): StudioStep {
  const step = route.split('/')[2];
  return (STUDIO_STEPS as readonly string[]).includes(step) ? (step as StudioStep) : 'start';
}

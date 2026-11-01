/** The property check's steps, kept apart from the page so routing does not pull the page in. */
export const CHECK_STEPS = ['start', 'tour', 'gaps', 'docs'] as const;
export type CheckStep = (typeof CHECK_STEPS)[number];

export function checkStepFromRoute(hash: string): CheckStep {
  const s = hash.split('/')[2];
  return (CHECK_STEPS as readonly string[]).includes(s) ? (s as CheckStep) : 'start';
}

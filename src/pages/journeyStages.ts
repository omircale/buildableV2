/**
 * The business track: a survey, a bill, a tender. Designing a piece of furniture and standing it in a
 * room through a phone are a separate tool and are not steps here.
 */
/** The walkthrough's steps, kept apart from the page so routing does not pull the page's 3D code in. */
export const STAGES = ['scan', 'describe', 'refine', 'edit', 'walk', 'bill', 'price', 'tender'] as const;
export type Stage = (typeof STAGES)[number];

export function stageFromRoute(hash: string): Stage {
  const s = hash.split('/')[2];
  return (STAGES as readonly string[]).includes(s) ? (s as Stage) : 'scan';
}

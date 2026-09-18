/** The four steps of the design flow. Kept apart from the editor so routing does not pull in the 3D bundle. */
export const STEPS = ['setup', 'structure', 'look', 'review'] as const;
export type Step = (typeof STEPS)[number];

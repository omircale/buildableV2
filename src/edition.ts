/**
 * Which product this build is.
 *
 * One codebase, two sites. Buildable for building contractors is the design studio; Buildable for
 * hospitality is the property check, the room-by-room bill and the client journey. The engine, the
 * accounts and the exports are shared, so a fix to either reaches both — each build only shows what
 * belongs to it. The edition is fixed when the site is built (`vite build --mode hospitality`), not
 * chosen at run time.
 */
export type Edition = 'contractors' | 'hospitality';

export const EDITION: Edition = import.meta.env.VITE_EDITION === 'hospitality' ? 'hospitality' : 'contractors';

/** The parts of the app, by their first route segment. */
export type Area = 'studio' | 'check' | 'compare' | 'journey' | 'space' | 'projects';

const AREAS: Record<Edition, readonly Area[]> = {
  contractors: ['studio'],
  hospitality: ['check', 'compare', 'journey', 'space', 'projects'],
};

/** Routes every edition has: home, sign-in, admin. */
const SHARED = new Set(['', 'login', 'admin']);

export const hasArea = (area: Area, edition: Edition = EDITION) => AREAS[edition].includes(area);

/** Whether a hash route belongs to this edition. A route that belongs to the other one is not found here. */
export function routeAllowed(route: string, edition: Edition = EDITION): boolean {
  const segment = route.replace(/^#\/?/, '').split('/')[0];
  if (SHARED.has(segment)) return true;
  return (AREAS[edition] as readonly string[]).includes(segment);
}

/** Where a person lands after signing in: the place their work is. */
export const workHome = (edition: Edition = EDITION) => (edition === 'contractors' ? '#/studio/start' : '#/projects');

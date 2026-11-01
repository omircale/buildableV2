/**
 * The parts of live AR placement that do not need a phone to be right.
 *
 * A WebXR session can only be exercised on a device, so everything that can be decided without one —
 * which path a browser gets, how a measured distance is worded, how far a turn turns — lives here,
 * where a test can hold it.
 */

export type ArPath =
  /** The browser can run a live AR session in the page: place, turn, measure. Chrome on Android today. */
  | 'live'
  /** No live session, but the system viewer can stand a model file in the room. iPhone and iPad. */
  | 'system-viewer'
  /** Neither. A desktop browser, usually. */
  | 'none';

/**
 * Which AR a browser gets. `liveSupported` is what `navigator.xr.isSessionSupported('immersive-ar')`
 * answered, or null when the browser has no WebXR at all.
 */
export function arPath(liveSupported: boolean | null, userAgent: string, maxTouchPoints = 0): ArPath {
  if (liveSupported) return 'live';
  // iPadOS reports itself as a Mac; the touch points give it away.
  const apple = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return apple ? 'system-viewer' : 'none';
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Straight-line distance between two points in the room, in metres. */
export function distanceM(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * A measured distance as it is shown: metres to the centimetre.
 *
 * Finer than a centimetre would claim more than phone tracking delivers. This reading is for judging a
 * fit by eye; a dimension that goes into a bill is taken with a tape or a laser.
 */
export function formatDistance(metres: number, he: boolean): string {
  return `${metres.toFixed(2)} ${he ? "מ'" : 'm'}`;
}

/** One press of a turn button, in radians: fifteen degrees. */
export const TURN_STEP = Math.PI / 12;

/** A yaw after a turn, kept within one revolution so it never drifts into large numbers. */
export function turned(yaw: number, direction: 1 | -1): number {
  const full = Math.PI * 2;
  return (((yaw + direction * TURN_STEP) % full) + full) % full;
}

/** Whether a piece of this footprint fits between two measured points, with nothing to spare assumed. */
export function fitsWithin(pieceWidthM: number, gapM: number): boolean {
  return pieceWidthM <= gapM;
}

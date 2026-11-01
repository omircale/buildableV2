import { describe, expect, it } from 'vitest';
import { TURN_STEP, arPath, distanceM, fitsWithin, formatDistance, turned } from './placement';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';

describe('which AR a browser gets', () => {
  it('a browser that can run a live session gets it', () => {
    expect(arPath(true, ANDROID)).toBe('live');
  });

  it('an iPhone has no live session and falls back to the system viewer', () => {
    // Safari exposes no WebXR on iOS, so the answer there is null rather than false.
    expect(arPath(null, IPHONE)).toBe('system-viewer');
    expect(arPath(false, IPHONE)).toBe('system-viewer');
  });

  it('an iPad that calls itself a Mac is still an iPad', () => {
    expect(arPath(null, MAC, 5)).toBe('system-viewer');
  });

  it('a desktop browser gets neither', () => {
    expect(arPath(null, MAC, 0)).toBe('none');
    expect(arPath(false, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0')).toBe('none');
  });

  it('an Android phone without AR support is not offered the Apple viewer', () => {
    expect(arPath(false, ANDROID)).toBe('none');
  });

  it('a live session wins even on a device that also has the system viewer', () => {
    // If Safari ever ships WebXR, or the page runs inside a WebXR launcher, live is the better path.
    expect(arPath(true, IPHONE)).toBe('live');
  });
});

describe('a distance measured in the room', () => {
  it('is the straight line between two points', () => {
    expect(distanceM({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 })).toBeCloseTo(5, 9);
    expect(distanceM({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBe(0);
  });

  it('is shown to the centimetre and no finer', () => {
    // Phone tracking does not deliver millimetres, and showing them would say that it does.
    expect(formatDistance(3.4159, true)).toBe("3.42 מ'");
    expect(formatDistance(3.4159, false)).toBe('3.42 m');
    expect(formatDistance(0, false)).toBe('0.00 m');
  });

  it('says whether a piece fits a measured gap, exactly', () => {
    expect(fitsWithin(1.8, 1.8)).toBe(true);
    expect(fitsWithin(1.81, 1.8)).toBe(false);
  });
});

describe('turning the piece', () => {
  it('turns fifteen degrees a press', () => {
    expect(TURN_STEP).toBeCloseTo((15 * Math.PI) / 180, 12);
    expect(turned(0, 1)).toBeCloseTo(TURN_STEP, 12);
  });

  it('twenty-four presses come back to where it started', () => {
    let yaw = 0;
    for (let i = 0; i < 24; i++) yaw = turned(yaw, 1);
    expect(Math.min(yaw, Math.PI * 2 - yaw)).toBeCloseTo(0, 9);
  });

  it('turning back from zero wraps instead of going negative', () => {
    const yaw = turned(0, -1);
    expect(yaw).toBeGreaterThan(0);
    expect(yaw).toBeCloseTo(Math.PI * 2 - TURN_STEP, 12);
  });
});

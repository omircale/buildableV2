import { describe, expect, test } from 'vitest';
import { hasArea, routeAllowed, workHome } from './edition';

describe('editions', () => {
  test('the contractors build has the studio and none of the hospitality pages', () => {
    expect(routeAllowed('#/studio/plan', 'contractors')).toBe(true);
    for (const r of ['#/check/start', '#/space', '#/journey/scan', '#/compare/a/b', '#/projects']) expect(routeAllowed(r, 'contractors')).toBe(false);
  });

  test('the hospitality build has the property check, the bill and the journey, and no studio', () => {
    for (const r of ['#/check/tour', '#/space', '#/journey', '#/compare/a/b', '#/projects']) expect(routeAllowed(r, 'hospitality')).toBe(true);
    expect(routeAllowed('#/studio/start', 'hospitality')).toBe(false);
  });

  test('home, sign-in and admin are in both', () => {
    for (const e of ['contractors', 'hospitality'] as const) for (const r of ['#/', '', '#/login', '#/admin']) expect(routeAllowed(r, e)).toBe(true);
  });

  test('signing in lands on the edition’s own work', () => {
    expect(workHome('contractors')).toBe('#/studio/start');
    expect(workHome('hospitality')).toBe('#/projects');
    expect(hasArea('projects', 'contractors')).toBe(false);
  });
});

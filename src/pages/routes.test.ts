import { describe, expect, it } from 'vitest';
import { isHome } from './routes';

describe('which addresses are the home page', () => {
  it('the home page itself, however the browser writes it', () => {
    for (const route of ['', '#', '#/', '#/?ref=x']) expect(isHome(route), route).toBe(true);
  });

  it('a sign-in link coming back is not a missing page', () => {
    // The auth client reads this hash. Showing "this page does not exist" over it would be wrong.
    expect(isHome('#access_token=abc&refresh_token=def&type=magiclink')).toBe(true);
    expect(isHome('#error=access_denied')).toBe(true);
  });

  it('an address shaped like a page that is not one is not home', () => {
    for (const route of ['#/nonsense', '#/spce', '#/journey', '#/space']) expect(isHome(route), route).toBe(false);
  });
});

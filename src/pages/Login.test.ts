import { describe, expect, it } from 'vitest';
import { loginError } from './Login';

describe('what the sign-in screen reports after coming back from Google', () => {
  it('names the two failures the server sends back', () => {
    expect(loginError('#/login?error=state')).toBe('state');
    expect(loginError('#/login?error=google')).toBe('google');
  });

  it('reports nothing it was not given', () => {
    expect(loginError('#/login')).toBeNull();
    expect(loginError('#/login?error=<script>')).toBeNull();
  });
});

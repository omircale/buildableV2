import { describe, expect, it } from 'vitest';
import { loginError, passwordLinkToken } from './Login';

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

describe('a password link', () => {
  it('is read from its own route only', () => {
    expect(passwordLinkToken('#/login/password?t=abc_-1')).toBe('abc_-1');
    expect(passwordLinkToken('#/login?t=abc')).toBeNull();
    expect(passwordLinkToken('#/login/password')).toBeNull();
    expect(passwordLinkToken('#/login/password?t=')).toBeNull();
  });
});

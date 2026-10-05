import { describe, expect, it } from 'vitest';
import { authErrorKey } from './Login';

describe('what the sign-in screen says when something goes wrong', () => {
  it('names the causes it knows', () => {
    expect(authErrorKey({ message: 'Invalid login credentials', status: 400 })).toBe('invalid');
    expect(authErrorKey({ message: 'Email not confirmed' })).toBe('unconfirmed');
    expect(authErrorKey({ message: 'User already registered' })).toBe('exists');
    expect(authErrorKey({ code: 'weak_password', message: 'Password should be at least 10 characters' })).toBe('weak');
    expect(authErrorKey({ status: 429, message: 'email rate limit exceeded' })).toBe('rate');
    expect(authErrorKey({ message: 'Failed to fetch' })).toBe('network');
  });

  it('does not pretend to know a cause it was not given', () => {
    expect(authErrorKey({ message: 'Database error saving new user' })).toBe('other');
    expect(authErrorKey({})).toBe('other');
  });
});

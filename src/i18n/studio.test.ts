import { describe, expect, test } from 'vitest';
import { studioDict } from './studio';

function shape(v: unknown): unknown {
  if (typeof v === 'function') return 'fn';
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape((v as Record<string, unknown>)[k])]));
  return typeof v;
}

describe('studio dictionary', () => {
  test('Hebrew and English have the same keys', () => {
    expect(shape(studioDict('he'))).toEqual(shape(studioDict('en')));
  });
  test('the two are actually translated', () => {
    expect(studioDict('he').title).not.toBe(studioDict('en').title);
    expect(studioDict('he').plan.summary(3, 1, 2)).not.toBe(studioDict('en').plan.summary(3, 1, 2));
  });
});

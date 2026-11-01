import { describe, expect, test } from 'vitest';
import { servicesDict } from './services';

function shape(v: unknown): unknown {
  if (typeof v === 'function') return 'fn';
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape((v as Record<string, unknown>)[k])]));
  return typeof v;
}

describe('the equipment screen’s words', () => {
  test('Hebrew and English have the same shape', () => {
    expect(shape(servicesDict('he'))).toEqual(shape(servicesDict('en')));
  });
});

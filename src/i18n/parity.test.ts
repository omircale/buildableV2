import { describe, expect, test } from 'vitest';
import { dictFor } from './index';

/** Recursively compares the *shape* of two objects: same keys, and each leaf is the same JS type (both strings, both functions, both arrays of the same length pattern). Catches a key added to one locale and forgotten in the other. */
function assertSameShape(a: unknown, b: unknown, path: string): void {
  if (Array.isArray(a) || Array.isArray(b)) {
    expect(Array.isArray(a), `${path}: he/en disagree on array-ness`).toBe(Array.isArray(b));
    if (Array.isArray(a) && Array.isArray(b)) expect(a.length, `${path}: array length differs`).toBe(b.length);
    return;
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const aKeys = Object.keys(a as object).sort();
    const bKeys = Object.keys(b as object).sort();
    expect(aKeys, `${path}: key sets differ`).toEqual(bKeys);
    for (const k of aKeys) assertSameShape((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    return;
  }
  expect(typeof a, `${path}: value type differs (he=${typeof a}, en=${typeof b})`).toBe(typeof b);
}

describe('i18n dictionaries', () => {
  test('he and en expose the same keys, so no UI text silently falls back to the wrong language', () => {
    assertSameShape(dictFor('he'), dictFor('en'), 'dict');
  });

  test('dir is rtl for he and ltr for en', () => {
    expect(dictFor('he').dir).toBe('rtl');
    expect(dictFor('en').dir).toBe('ltr');
  });

  test('a sample of function-valued strings actually differ between locales (guards against copy-pasted English)', () => {
    const he = dictFor('he');
    const en = dictFor('en');
    expect(he.common.back).not.toBe(en.common.back);
    expect(he.review.ready).not.toBe(en.review.ready);
    expect(he.setup.title).not.toBe(en.setup.title);
    expect(he.setup.shelvesCount(3)).not.toBe(en.setup.shelvesCount(3));
    expect(he.flow.stepOf(1, 4)).not.toBe(en.flow.stepOf(1, 4));
  });
});

import { describe, expect, test } from 'vitest';
import { matchesQuery } from './common';

describe('matchesQuery (search inside the board/decor/checks dropdowns)', () => {
  test('an empty query matches everything, so a fresh dropdown shows its full list', () => {
    expect(matchesQuery('', 'Birch plywood')).toBe(true);
    expect(matchesQuery('   ', 'Birch plywood')).toBe(true);
  });

  test('matches case-insensitively and across multiple source fields', () => {
    expect(matchesQuery('BIRCH', 'Birch plywood', '18')).toBe(true);
    expect(matchesQuery('18', 'Birch plywood', '18')).toBe(true);
  });

  test('every space-separated word must match (AND, not OR)', () => {
    expect(matchesQuery('birch 24', 'Birch plywood', '24')).toBe(true);
    expect(matchesQuery('birch 99', 'Birch plywood', '24')).toBe(false);
  });

  test('Hebrew niqqud and geresh/gershayim are ignored, so "ליבנה\'" matches "ליבנה"', () => {
    expect(matchesQuery('ליבנה', 'בירץ׳ ליבנה גלוי')).toBe(true);
    expect(matchesQuery('בירץ', 'בירץ׳ ליבנה גלוי')).toBe(true);
  });

  test('null/undefined source fields are skipped without throwing', () => {
    expect(matchesQuery('birch', 'Birch plywood', undefined, null)).toBe(true);
  });

  test('no match returns false', () => {
    expect(matchesQuery('acrylic', 'Birch plywood')).toBe(false);
  });
});

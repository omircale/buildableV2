import { describe, expect, it } from 'vitest';
import { STAGES, stageFromRoute } from './journeyStages';

describe('journey routes', () => {
  it('reads a stage out of the hash', () => {
    expect(stageFromRoute('#/journey/walk')).toBe('walk');
    expect(stageFromRoute('#/journey/ar')).toBe('ar');
  });

  it('falls back to the first step for an unknown or missing stage', () => {
    expect(stageFromRoute('#/journey')).toBe('scan');
    expect(stageFromRoute('#/journey/nonsense')).toBe('scan');
  });

  it('runs scan to AR in the order the product plan describes', () => {
    // scan → words → refine → edit → walk → bill → price → tender, with AR on site at the end.
    expect(STAGES).toEqual(['scan', 'describe', 'refine', 'edit', 'walk', 'bill', 'price', 'tender', 'ar']);
  });
});

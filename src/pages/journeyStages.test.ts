import { describe, expect, it } from 'vitest';
import { STAGES, stageFromRoute } from './journeyStages';

describe('journey routes', () => {
  it('reads a stage out of the hash', () => {
    expect(stageFromRoute('#/journey/walk')).toBe('walk');
    expect(stageFromRoute('#/journey/tender')).toBe('tender');
  });

  it('falls back to the first step for an unknown or missing stage', () => {
    expect(stageFromRoute('#/journey')).toBe('scan');
    expect(stageFromRoute('#/journey/nonsense')).toBe('scan');
  });

  it('runs survey to tender, with no furniture step in the business track', () => {
    expect(STAGES).toEqual(['scan', 'describe', 'refine', 'edit', 'walk', 'bill', 'price', 'tender']);
    expect(stageFromRoute('#/journey/ar')).toBe('scan');
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined });
const { sideOf } = await import('./Compare');

const project = (over: Record<string, unknown>) => ({
  space: { id: 'room_1', nameHe: 'מטבח', nameEn: '', footprintMm: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }], heightMm: 2800, apertures: [], obstacles: [], connections: [], zones: [] },
  equipmentIds: ['range_gas', 'extraction_hood'],
  ...over,
});

describe('a saved property read back for comparison', () => {
  it('is checked by the same rules as the walk-through', () => {
    const side = sideOf('fallback', project({ propertyName: 'דיזנגוף 100', siteChecks: { gas_supply: { answer: 'no', note: '' }, exhaust_route: { answer: 'yes', note: '' } } }))!;
    expect(side.name).toBe('דיזנגוף 100');
    expect(side.status.get('gas_supply')).toBe('gap');
    expect(side.status.get('exhaust_route')).toBe('ok');
    expect(side.status.get('electrical_supply')).toBe('unknown');
    expect(side.floorM2).toBe(24);
  });

  it('counts identical rooms, and gives no floor area when a room was never measured', () => {
    const side = sideOf('x', project({ count: 3, others: [{ space: { id: 'room_2', nameHe: 'מחסן', nameEn: '', footprintMm: [] }, equipmentIds: [] }] }))!;
    expect(side.rooms).toBe(4);
    expect(side.floorM2).toBeNull();
    expect(side.name).toBe('x');
  });

  it('something that is not a project is refused, not shown as an empty one', () => {
    expect(sideOf('x', { hello: 1 })).toBeNull();
  });
});

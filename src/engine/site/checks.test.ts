import { describe, expect, it } from 'vitest';
import { SITE_CHECKS, branchNeed, evaluateChecks, propertySummary } from './checks';
import { landlordRequirements, openQuestions } from './documents';

const kitchen = ['range_gas', 'extraction_hood', 'dishwasher_commercial', 'hand_wash_basin'];
const shop = ['pos_terminal', 'security_camera'];
const o = { locale: 'he' as const, propertyName: 'דיזנגוף 100', date: '2026-10-18' };

describe('what the branch needs', () => {
  it('adds up every room, multiplied by how many identical rooms it stands for', () => {
    const need = branchNeed([{ equipmentIds: ['workstation'], count: 40 }, { equipmentIds: ['printer_mfp'] }]);
    expect(need.points.electrical).toBe(41);
    expect(need.points.data).toBe(41);
  });
});

describe('the walk-through checks', () => {
  it('a shop is not asked about a hood, gas or a grease separator', () => {
    const ids = evaluateChecks(branchNeed([{ equipmentIds: shop }]), {}).map((e) => e.check.id);
    expect(ids).not.toContain('exhaust_route');
    expect(ids).not.toContain('gas_supply');
    expect(ids).not.toContain('grease_separator');
    expect(ids).toContain('electrical_supply');
  });

  it('a cooking kitchen is asked all of them', () => {
    const ids = evaluateChecks(branchNeed([{ equipmentIds: kitchen }]), {}).map((e) => e.check.id);
    for (const id of ['exhaust_route', 'hood_suppression', 'gas_supply', 'grease_separator', 'drain_in_space']) expect(ids, id).toContain(id);
  });

  it('nothing answered is all unknown — never fine by default', () => {
    const s = propertySummary(evaluateChecks(branchNeed([{ equipmentIds: kitchen }]), {}));
    expect(s.ok).toBe(0);
    expect(s.unknown).toBe(s.total);
  });

  it('the good answer depends on the question: a shared shaft is a gap', () => {
    const need = branchNeed([{ equipmentIds: kitchen }]);
    const e = evaluateChecks(need, { exhaust_shared: { answer: 'yes', note: '' }, exhaust_route: { answer: 'yes', note: '' } });
    expect(e.find((x) => x.check.id === 'exhaust_shared')!.status).toBe('gap');
    expect(e.find((x) => x.check.id === 'exhaust_route')!.status).toBe('ok');
  });

  it('a gap goes to its default owner unless someone moved it', () => {
    const need = branchNeed([{ equipmentIds: kitchen }]);
    const e = evaluateChecks(need, { gas_supply: { answer: 'no', note: '', owner: 'us' }, electrical_supply: { answer: 'no', note: '' } });
    expect(e.find((x) => x.check.id === 'gas_supply')!.owner).toBe('us');
    expect(e.find((x) => x.check.id === 'electrical_supply')!.owner).toBe('landlord');
    expect(propertySummary(e).byOwner.us.map((x) => x.check.id)).toContain('gas_supply');
  });

  it('a check that cites a requirement cites a real public document', () => {
    for (const c of SITE_CHECKS) for (const s of c.sources) expect(s.url, c.id).toMatch(/^https:\/\//);
    expect(SITE_CHECKS.find((c) => c.id === 'gas_supply')!.sources[0].reference).toContain('158');
  });

  it('says nothing about compliance anywhere in its wording', () => {
    for (const c of SITE_CHECKS) {
      expect(c.he, c.id).not.toMatch(/עומד בתקן|תואם לתקן|מאושר לפי/);
      expect(c.en, c.id).not.toMatch(/complies|compliant/i);
    }
  });
});

describe('what the walk-through produces', () => {
  const need = branchNeed([{ equipmentIds: kitchen }]);
  const e = evaluateChecks(need, {
    electrical_supply: { answer: 'no', note: 'חיבור 3x40A' },
    gas_supply: { answer: 'unknown', note: '' },
    exhaust_route: { answer: 'yes', note: 'פיר קיים' },
    exhaust_shared: { answer: 'yes', note: '' },
  });

  it('the landlord list holds only the landlord’s open items, with how many points and what was found', () => {
    const doc = landlordRequirements(e, need, o);
    expect(doc).toContain('דיזנגוף 100');
    expect(doc).toContain('גודל חיבור החשמל');
    expect(doc).toContain('חיבור 3x40A');
    expect(doc).toMatch(/הסניף צריך: \d+ נק' חשמל/);
    expect(doc).toContain('ת"י 158');
    expect(doc).not.toContain('יש דרך להוציא פליטה');
    expect(doc).not.toContain('משותף לדיירים');
    expect(doc).toContain('אינה תכנון');
  });

  it('the questions list holds everything unknown and the consultant’s gaps, with a box to tick', () => {
    const doc = openQuestions(e, need, o, ['מה גובה התקרה?']);
    expect(doc).toContain('[ ] יש אספקת גז לנכס');
    expect(doc).toContain('[ ] פיר הפליטה משותף');
    expect(doc).toContain('[ ] מה גובה התקרה?');
    expect(doc).not.toContain('גודל חיבור החשמל');
  });
});

describe('a building of one’s own', () => {
  const room = ['wc', 'vanity_basin', 'shower', 'fan_coil', 'guest_tv'];
  const own = branchNeed([{ equipmentIds: room, count: 40 }], 'own');

  it('is not asked about a landlord, a handover or a previous tenant', () => {
    const ids = evaluateChecks(own, {}).map((e) => e.check.id);
    for (const id of ['landlord_annex', 'handover_date', 'previous_tenant']) expect(ids).not.toContain(id);
    // What the rooms need is still asked.
    expect(ids).toEqual(expect.arrayContaining(['electrical_supply', 'water_supply']));
  });

  it('gives no gap to a landlord it does not have, not even one moved there while it was rented', () => {
    const evaluated = evaluateChecks(own, { electrical_supply: { answer: 'no', note: '' }, water_supply: { answer: 'no', note: '', owner: 'landlord' } });
    const { byOwner, gaps } = propertySummary(evaluated);
    expect(byOwner.landlord).toEqual([]);
    // Moved, not lost: every gap is still on somebody's list.
    expect(gaps).toBe(2);
    expect(byOwner.us.map((e) => e.check.id)).toEqual(expect.arrayContaining(['electrical_supply', 'water_supply']));
  });

  it('a property is rented unless it is said not to be, whatever its rooms hold', () => {
    for (const ids of [room, kitchen, []]) expect(evaluateChecks(branchNeed([{ equipmentIds: ids }]), {}).map((e) => e.check.id)).toContain('landlord_annex');
  });

  it('only questions about renting are left out, and each of them is marked so', () => {
    expect(SITE_CHECKS.filter((c) => c.leaseOnly).map((c) => c.id).sort()).toEqual(['handover_date', 'landlord_annex', 'previous_tenant']);
  });
});

import { describe, expect, it } from 'vitest';
import { EQUIPMENT, LICENSED_TRADES, SECTORS, SERVICE_LABEL, SERVICE_TRADE, clearancesFor, equipmentById, equipmentFor, servicesFor } from './catalog';

describe('the equipment catalogue', () => {
  it('states no size, mass or price it has not been given', () => {
    // A "standard" 600 mm sink that turns out to be 550 mm is a hole cut in the wrong place. Until a
    // model is chosen these are unknown, and the catalogue says so rather than filling them in.
    for (const item of EQUIPMENT) {
      expect(item.sizeMm.width, `${item.id} width`).toBeNull();
      expect(item.massKg, `${item.id} mass`).toBeNull();
      expect(item.priceIls, `${item.id} price`).toBeNull();
    }
  });

  it('still knows what each item needs brought to it', () => {
    // The services do not depend on the model: a sink needs water and a drain whichever one you buy.
    const sink = equipmentById('bar_sink_single');
    expect(sink?.services.map((s) => s.kind).sort()).toEqual(['drain', 'water_cold', 'water_hot']);
  });

  it('every service note is written for the trade, in both languages', () => {
    for (const item of EQUIPMENT) {
      for (const s of item.services) {
        expect(s.noteHe.length, `${item.id} ${s.kind}`).toBeGreaterThan(0);
        expect(s.noteEn.length, `${item.id} ${s.kind}`).toBeGreaterThan(0);
        expect(s.quantity).toBeGreaterThan(0);
      }
    }
  });
});

describe('services roll up into trade quantities', () => {
  it('adds up the points a bar needs and says which item asked for each', () => {
    const services = servicesFor(['bar_sink_single', 'ice_maker', 'undercounter_fridge']);
    const drain = services.find((s) => s.kind === 'drain');
    expect(drain?.quantity).toBe(2);
    expect(drain?.from.sort()).toEqual(['bar_sink_single', 'ice_maker']);

    const power = services.find((s) => s.kind === 'electrical');
    expect(power?.quantity).toBe(2);
  });

  it('counts nothing for equipment that adds no points of its own', () => {
    expect(servicesFor(['bar_tap'])).toEqual([]);
  });

  it('ignores an unknown id rather than inventing an item for it', () => {
    expect(servicesFor(['no_such_thing'])).toEqual([]);
  });

  it('a tap beside a sink does not double the water points', () => {
    const withTap = servicesFor(['bar_sink_single', 'bar_tap']);
    const alone = servicesFor(['bar_sink_single']);
    expect(withTap).toEqual(alone);
  });
});

describe('the licensed line', () => {
  it('every service belongs to a trade', () => {
    for (const item of EQUIPMENT) {
      for (const s of item.services) expect(SERVICE_TRADE[s.kind], `${item.id} ${s.kind}`).toBeTruthy();
    }
  });

  it('water, power, gas and air are licensed trades; data is the one this engine does not call licensed', () => {
    // Rule 02 made testable — with its one honest exception. Nothing read so far says low-voltage
    // cabling needs a licence, so the engine neither claims it nor denies it: it says "designed".
    const licensed = Object.entries(SERVICE_TRADE).filter(([, trade]) => LICENSED_TRADES.has(trade)).map(([kind]) => kind);
    expect(licensed.sort()).toEqual(['drain', 'electrical', 'gas', 'ventilation', 'water_cold', 'water_hot']);
    expect(SERVICE_TRADE.data).toBe('communications');
    expect(LICENSED_TRADES.has('communications')).toBe(false);
  });
});

describe('the catalogue beyond the bar', () => {
  it('has something to offer every kind of place', () => {
    for (const sector of SECTORS) expect(equipmentFor(sector).length, sector).toBeGreaterThanOrEqual(8);
  });

  it('every item belongs somewhere, and no id is used twice', () => {
    for (const item of EQUIPMENT) expect(item.sectors.length, item.id).toBeGreaterThan(0);
    expect(new Set(EQUIPMENT.map((e) => e.id)).size).toBe(EQUIPMENT.length);
  });

  it('every item is named in both languages', () => {
    for (const item of EQUIPMENT) {
      expect(item.nameHe.length, item.id).toBeGreaterThan(0);
      expect(item.nameEn.length, item.id).toBeGreaterThan(0);
    }
  });

  it('every service kind an item can ask for has a name and a trade', () => {
    for (const item of EQUIPMENT) {
      for (const s of item.services) {
        expect(SERVICE_LABEL[s.kind], `${item.id} ${s.kind}`).toBeDefined();
        expect(SERVICE_TRADE[s.kind], `${item.id} ${s.kind}`).toBeDefined();
      }
    }
  });

  it('a desk is one power point and one data point', () => {
    const needs = servicesFor(['workstation']);
    expect(needs.map((n) => [n.kind, n.quantity]).sort()).toEqual([
      ['data', 1],
      ['electrical', 1],
    ]);
  });

  it('twelve desks are twelve of each', () => {
    const needs = servicesFor(Array<string>(12).fill('workstation'));
    expect(needs.find((n) => n.kind === 'data')!.quantity).toBe(12);
    expect(needs.find((n) => n.kind === 'electrical')!.quantity).toBe(12);
  });

  it('the fuel decides the point: a gas range asks for gas, an induction range for power', () => {
    expect(servicesFor(['range_gas']).map((n) => n.kind)).toEqual(['gas']);
    expect(servicesFor(['range_induction']).map((n) => n.kind)).toEqual(['electrical']);
  });

  it('a combi oven needs water and a drain whichever fuel it burns, and says where that comes from', () => {
    for (const id of ['oven_combi_electric', 'oven_combi_gas']) {
      const kinds = servicesFor([id]).map((n) => n.kind);
      expect(kinds, id).toContain('water_cold');
      expect(kinds, id).toContain('drain');
      expect(equipmentById(id)!.sources[0].url, id).toContain('fermag.com');
    }
    expect(servicesFor(['oven_combi_gas']).map((n) => n.kind)).toContain('gas');
  });

  it('a hood is the only thing in the kitchen that asks for a duct', () => {
    // A cooking appliance does not pull a hood in by itself: whether one is needed is a consultant's
    // call, so the hood is its own item and the appliance's note says so.
    const ducts = EQUIPMENT.filter((e) => e.services.some((s) => s.kind === 'ventilation' && (s.form ?? 'point') === 'point')).map((e) => e.id);
    expect(ducts).toEqual(['extraction_hood']);
    expect(equipmentById('range_gas')!.noteHe).toContain('קולט אדים');
  });

  it('refrigeration leaves a clearance, never a ventilation point', () => {
    for (const id of ['upright_fridge', 'display_fridge', 'prep_counter_refrigerated']) {
      expect(servicesFor([id]).some((n) => n.kind === 'ventilation'), id).toBe(false);
      expect(clearancesFor([id]).map((c) => c.kind), id).toEqual(['ventilation']);
    }
  });

  it('an item whose water depends on the model says so instead of deciding', () => {
    for (const id of ['dishwasher_commercial', 'glasswasher', 'kitchenette_dishwasher']) expect(equipmentById(id)!.noteHe, id).toContain('לפי הדגם');
  });
});

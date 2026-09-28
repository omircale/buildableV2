import { describe, expect, it } from 'vitest';
import { EQUIPMENT, LICENSED_TRADES, SERVICE_TRADE, equipmentById, servicesFor } from './catalog';

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

  it('every trade a service pulls in is one that needs a licensed professional', () => {
    // This is rule 02 made testable: everything equipment drags in is plumbing, electrical, gas or
    // ventilation — all of which this engine counts and never certifies.
    for (const trade of Object.values(SERVICE_TRADE)) {
      expect(LICENSED_TRADES.has(trade), trade).toBe(true);
    }
  });
});

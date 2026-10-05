import { describe, expect, it } from 'vitest';
import { EQUIPMENT } from '../../engine';
import { EQUIPMENT_TERMS, interpretSpace, type SpaceClaim } from './interpretSpace';

const equipment = (claims: SpaceClaim[]) =>
  claims.flatMap((c) => (c.field === 'equipment' ? [[c.equipmentId, c.count] as const] : [])).sort((a, b) => a[0].localeCompare(b[0]));

describe('what goes in the room', () => {
  it('reads a pool bar the way a manager would say it', () => {
    const { claims } = interpretSpace('בר בריכה עם כיור, מכונת קרח ושני מקררים מתחת לדלפק');
    expect(equipment(claims)).toEqual([
      ['bar_sink_single', 1],
      ['ice_maker', 1],
      ['undercounter_fridge', 2],
    ]);
  });

  it('takes a count in words or digits', () => {
    expect(equipment(interpretSpace('שלושה כיורים').claims)).toEqual([['bar_sink_single', 3]]);
    expect(equipment(interpretSpace('2 מקררים').claims)).toEqual([['undercounter_fridge', 2]]);
    expect(equipment(interpretSpace('two fridges and a sink').claims)).toEqual([
      ['bar_sink_single', 1],
      ['undercounter_fridge', 2],
    ]);
  });

  it('strips the Hebrew prefixes a sentence puts on a word', () => {
    // "ומכונת", "והכיור", "ובמקרר" are the same items with a letter in front.
    expect(equipment(interpretSpace('כיור ומכונת קרח והמקרר').claims)).toEqual([
      ['bar_sink_single', 1],
      ['ice_maker', 1],
      ['undercounter_fridge', 1],
    ]);
  });

  it('adds the same item mentioned twice rather than keeping the last', () => {
    expect(equipment(interpretSpace('כיור ליד הדלת ועוד כיור בפינה').claims)).toEqual([['bar_sink_single', 2]]);
  });

  it('keeps the words each item came from, so the person can see the mapping', () => {
    const fridge = interpretSpace('שני מקררים מתחת לדלפק').claims.find((c) => c.field === 'equipment');
    expect(fridge).toMatchObject({ source: 'שני מקררים מתחת לדלפק' });
  });

  it('every catalogue item can be named, and its first phrase reads back to it alone', () => {
    // An item the lexicon cannot reach is an item nobody can describe their way to.
    for (const item of EQUIPMENT) {
      const terms = EQUIPMENT_TERMS[item.id];
      expect(terms?.length, item.id).toBeGreaterThan(0);
      expect(equipment(interpretSpace(terms[0].join(' ')).claims), `${item.id}: "${terms[0].join(' ')}"`).toEqual([[item.id, 1]]);
    }
  });

  it('the lexicon names nothing that is not in the catalogue', () => {
    const ids = new Set(EQUIPMENT.map((e) => e.id));
    for (const id of Object.keys(EQUIPMENT_TERMS)) expect(ids.has(id), id).toBe(true);
  });
});

describe('never a number nobody said', () => {
  it('reads a size with its unit', () => {
    const size = interpretSpace('חדר 7.2 על 3.6 מטר').claims.find((c) => c.field === 'size');
    expect(size).toMatchObject({ widthMm: 7200, depthMm: 3600, unitStated: true });
  });

  it('reads centimetres as centimetres', () => {
    expect(interpretSpace('720 על 360 ס"מ').claims.find((c) => c.field === 'size')).toMatchObject({ widthMm: 7200, depthMm: 3600, unitStated: true });
  });

  it('takes a size said without a unit, and says the unit was inferred', () => {
    // The numbers were said; the unit was not. The claim is kept and flagged, not silently trusted.
    expect(interpretSpace('7 על 4').claims.find((c) => c.field === 'size')).toMatchObject({ widthMm: 7000, depthMm: 4000, unitStated: false });
  });

  it('reads a ceiling height', () => {
    expect(interpretSpace('גובה תקרה 2.7 מטר').claims.find((c) => c.field === 'height')).toMatchObject({ heightMm: 2700, unitStated: true });
  });

  it('a room described with no numbers gets no dimensions', () => {
    const { claims } = interpretSpace('בר בריכה גדול עם כיור');
    expect(claims.some((c) => c.field === 'size' || c.field === 'height')).toBe(false);
  });

  it('a word like "big" is handed back, not turned into a size', () => {
    expect(interpretSpace('בר בריכה גדול עם כיור').unread).toEqual(['גדול']);
  });
});

describe('what it could not place is handed back', () => {
  it('returns the phrases it did not understand, in order', () => {
    const { unread } = interpretSpace('כיור, טוסטר לחיצה ומכונת קפה');
    expect(unread).toEqual(['טוסטר לחיצה', 'ומכונת קפה']);
  });

  it('keeps "no" — "אין מים חמים" means something and must not vanish', () => {
    expect(interpretSpace('כיור, אין מים חמים').unread).toEqual(['אין מים חמים']);
  });

  it('drops only the words that carry nothing', () => {
    expect(interpretSpace('אנחנו צריכים כיור').unread).toEqual([]);
  });

  it('an empty description yields nothing and invents nothing', () => {
    expect(interpretSpace('')).toEqual({ claims: [], unread: [] });
  });
});

describe('the room itself', () => {
  it('takes the room type as a name', () => {
    expect(interpretSpace('בר בריכה עם כיור').claims.find((c) => c.field === 'name')).toMatchObject({ name: 'בר בריכה' });
  });

  it('notices an open side, without guessing which wall', () => {
    const open = interpretSpace('בר פתוח לבריכה').claims.find((c) => c.field === 'open');
    expect(open).toMatchObject({ source: 'פתוח לבריכה' });
  });
});

describe('an office, a restaurant and a shop, described in words', () => {
  it('an office: desks by the dozen, a printer and a kitchenette', () => {
    const { claims } = interpretSpace('משרד עם 12 עמדות עבודה, מדפסת, ארון תקשורת וכיור מטבחון');
    expect(equipment(claims)).toEqual([
      ['kitchenette_sink', 1],
      ['network_cabinet', 1],
      ['printer_mfp', 1],
      ['workstation', 12],
    ]);
    expect(claims.find((c) => c.field === 'name')).toMatchObject({ name: 'משרד' });
  });

  it('a restaurant kitchen: the fuel is part of the name', () => {
    const { claims } = interpretSpace('מטבח עם כיריים גז, תנור קומבי חשמלי, קולט אדים ומדיח כלים');
    expect(equipment(claims)).toEqual([
      ['dishwasher_commercial', 1],
      ['extraction_hood', 1],
      ['oven_combi_electric', 1],
      ['range_gas', 1],
    ]);
  });

  it('a range with no fuel named is handed back, not assigned one', () => {
    // Gas and induction need different points. Picking one for the person would be a guess.
    const { claims, unread } = interpretSpace('מטבח עם כיריים');
    expect(equipment(claims)).toEqual([]);
    expect(unread).toEqual(['כיריים']);
  });

  it('a shop: tills, cameras and a shutter', () => {
    const { claims } = interpretSpace('חנות עם שתי קופות, ארבע מצלמות אבטחה, שלט מואר ותריס חשמלי');
    expect(equipment(claims)).toEqual([
      ['electric_shutter', 1],
      ['illuminated_sign', 1],
      ['pos_terminal', 2],
      ['security_camera', 4],
    ]);
  });

  it('the longer phrase wins: a display fridge is not an under-counter one', () => {
    expect(equipment(interpretSpace('מקרר תצוגה').claims)).toEqual([['display_fridge', 1]]);
    expect(equipment(interpretSpace('מדיח כוסות').claims)).toEqual([['glasswasher', 1]]);
    expect(equipment(interpretSpace('עמדת קופה').claims)).toEqual([['pos_terminal', 1]]);
  });

  it('reads the same in English', () => {
    expect(equipment(interpretSpace('office with ten desks, two printers and a network cabinet').claims)).toEqual([
      ['network_cabinet', 1],
      ['printer_mfp', 2],
      ['workstation', 10],
    ]);
  });
});

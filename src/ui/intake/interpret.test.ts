import { describe, expect, it } from 'vitest';
import { gapsIn, kindFrom, readDescription, spaceFrom, intendedUse } from './interpret';

const read = (text: string) => readDescription(text);

describe('what the text actually says', () => {
  it('takes a labelled size in metres', () => {
    const r = read('ספרייה ברוחב 2 מטר');
    expect(kindFrom(r.claims)).toBe('open_shelf');
    expect(spaceFrom(r.claims).w).toBe(200);
  });

  it('takes a labelled size in centimetres', () => {
    expect(spaceFrom(read('מדפים בגובה 180 ס"מ').claims).h).toBe(180);
  });

  it('takes a bare number as centimetres, the way furniture sizes are written', () => {
    expect(spaceFrom(read('ארון עומק 60').claims).d).toBe(60);
  });

  it('reads the label after the number too', () => {
    expect(spaceFrom(read('שולחן כתיבה, 140 ס"מ רוחב').claims).w).toBe(140);
  });

  it('reads a written triple', () => {
    const s = spaceFrom(read('ספרייה 200x80x30').claims);
    expect([s.w, s.h, s.d]).toEqual([200, 80, 30]);
  });

  it('reads English', () => {
    const r = read('a bookcase 180 cm wide for books');
    expect(kindFrom(r.claims)).toBe('open_shelf');
    expect(spaceFrom(r.claims).w).toBe(180);
    expect(intendedUse(r.claims)).toBe('books');
  });

  it('prefers the most specific piece named', () => {
    expect(kindFrom(read('מיטת רצפה מונטסורית לילד').claims)).toBe('floor_bed');
    expect(kindFrom(read('מיטה זוגית').claims)).toBe('bed');
    expect(kindFrom(read('כיסא ילדים').claims)).toBe('kids_chair');
  });

  it('keeps the words each claim came from, so a person can see why', () => {
    const r = read('ספרייה ברוחב 2 מטר');
    for (const c of r.claims) expect(c.source.length).toBeGreaterThan(0);
  });
});

describe('what it refuses to make up', () => {
  it('a big bookcase is a bookcase and no size', () => {
    const r = read('ספרייה גדולה');
    expect(kindFrom(r.claims)).toBe('open_shelf');
    expect(spaceFrom(r.claims)).toEqual({ w: null, h: null, d: null });
  });

  it('names the vague phrase instead of dropping it', () => {
    const r = read('מדפים לסלון, גובה עד התקרה');
    expect(r.unread.map((u) => u.phrase)).toContain('עד התקרה');
    expect(spaceFrom(r.claims).h).toBeNull();
  });

  it('asks for the size a vague phrase was meant to give', () => {
    const r = read('ספרייה גדולה');
    expect(gapsIn(r.claims, r.unread)).toEqual(['width']);
  });

  it('asks only about the measurement the vague phrase was attached to', () => {
    const r = read('מדפים לספרים, רוחב 2 מטר, גובה עד התקרה');
    expect(r.unread[0].axis).toBe('height');
    // Height is asked; depth is not, because nobody claimed to have given it.
    expect(gapsIn(r.claims, r.unread)).toEqual(['height']);
  });

  it('asks which piece when none is named', () => {
    const r = read('משהו לסלון ברוחב 120 ס"מ');
    expect(gapsIn(r.claims, r.unread)).toContain('kind');
    expect(spaceFrom(r.claims).w).toBe(120);
  });

  it('a clear sentence leaves nothing to ask', () => {
    const r = read('ספרייה לספרים, רוחב 200 ס"מ');
    expect(r.unread).toEqual([]);
    expect(gapsIn(r.claims, r.unread)).toEqual([]);
  });

  it('empty text claims nothing', () => {
    const r = read('');
    expect(r.claims).toEqual([]);
    expect(gapsIn(r.claims, r.unread)).toEqual(['kind']);
  });

  it('a number inside a size it already read is not also a vague phrase', () => {
    const r = read('ספרייה 200x80x30 גדולה');
    // "גדולה" is still unread — it is a real word the text used that we did not act on.
    expect(r.unread.map((u) => u.phrase)).toContain('גדולה');
    // But the triple was read, so no size is missing.
    expect(gapsIn(r.claims, r.unread)).toEqual([]);
  });
});

describe('use', () => {
  it('reads what will stand on it', () => {
    expect(intendedUse(read('מדפים לספרים').claims)).toBe('books');
    expect(intendedUse(read('מדף לצמחים').claims)).toBe('decor');
    expect(intendedUse(read('מזנון לטלוויזיה').claims)).toBe('heavy');
  });

  it('says nothing about use when the text does not', () => {
    expect(intendedUse(read('ארון ברוחב 90 ס"מ').claims)).toBeNull();
  });
});

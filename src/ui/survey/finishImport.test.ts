import { describe, expect, it } from 'vitest';
import { finishTemplate, parseFinishTable, parseTable } from './finishImport';

const ROOMS = [
  { id: 'room_1', nameHe: 'חדר טיפולים', nameEn: 'Treatment room' },
  { id: 'room_2', nameHe: 'טרקלין', nameEn: 'Lounge' },
];

describe('reading a table', () => {
  it('takes commas, and rows pasted from Excel as tabs', () => {
    expect(parseTable('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseTable('a\tb\r\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps a comma that sits inside quotes', () => {
    expect(parseTable('name,size\n"Oak, grey","90, 650"')).toEqual([['name', 'size'], ['Oak, grey', '90, 650']]);
  });

  it('drops empty rows and a byte order mark', () => {
    expect(parseTable('﻿a,b\n\n1,2\n,\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('a finish schedule from a table', () => {
  it('reads the three sheets of a real schedule', () => {
    const { specs, problems } = parseFinishTable(
      [
        'code,surface,name,pattern,type,color,width,length,thickness,rooms',
        'WD-2,floor,Timber Floor @ Treatment Room,Italian Herringbone 90°,Classica Oak,Grigio-Marino,90,650,12.5,Treatment room',
        'WD-2.1,floor,Timber Floor @ Relaxation Lounge,Regular installation,Classica Oak,Grigio-Marino,140,2100,12.5,Lounge',
        'WD-3,wall,Timber @ Sauna,,Thermo-Ash,,,,,',
      ].join('\n'),
      ROOMS,
    );
    expect(problems).toEqual([]);
    expect(specs.map((s) => s.code)).toEqual(['WD-2', 'WD-2.1', 'WD-3']);
    expect(specs[0]).toMatchObject({ category: 'wood', surface: 'floor', areas: ['room_1'], product: { sizeMm: { width: 90, length: 650 }, thicknessMm: 12.5 } });
    expect(specs[1].variantOf).toBe('WD-2');
  });

  it('takes the category from the code when the column is missing', () => {
    const { specs } = parseFinishTable('code,surface\nST-4,floor\nPT-1,wall', ROOMS);
    expect(specs.map((s) => s.category)).toEqual(['stone', 'paint']);
  });

  it('reads Hebrew headings and Hebrew values', () => {
    const { specs, problems } = parseFinishTable('קוד\tקטגוריה\tמשטח\tשם\tחדרים\nWD-2\tעץ\tרצפה\tרצפת עץ\tחדר טיפולים; טרקלין', ROOMS);
    expect(problems).toEqual([]);
    expect(specs[0]).toMatchObject({ category: 'wood', surface: 'floor', itemNameHe: 'רצפת עץ', areas: ['room_1', 'room_2'] });
  });
});

describe('an empty cell stays unknown', () => {
  it('leaves size and thickness null rather than filling them in', () => {
    // The schedule this format was modelled on left these rows out entirely for an unsettled spec.
    const { specs } = parseFinishTable('code,surface,width,length,thickness\nWD-3,wall,,,', ROOMS);
    expect(specs[0].product).toMatchObject({ sizeMm: null, thicknessMm: null, type: null, color: null });
  });

  it('a cell that is not a number is not turned into one', () => {
    const { specs } = parseFinishTable('code,surface,thickness\nWD-2,floor,tbc', ROOMS);
    expect(specs[0].product.thicknessMm).toBeNull();
  });

  it('every imported finish starts with its scope undecided', () => {
    const { specs } = parseFinishTable('code,surface\nWD-2,floor', ROOMS);
    expect(specs[0].scope).toBe('unknown');
  });
});

describe('what it cannot place is reported, with the row', () => {
  it('a row with no code', () => {
    const { specs, problems } = parseFinishTable('code,surface\n,floor\nWD-2,floor', ROOMS);
    expect(specs).toHaveLength(1);
    expect(problems).toEqual([expect.objectContaining({ row: 2 })]);
  });

  it('a surface that was not given — the finish cannot be measured without it', () => {
    const { specs, problems } = parseFinishTable('code,name\nWD-2,Timber', ROOMS);
    expect(specs).toEqual([]);
    expect(problems[0].he).toContain('אי אפשר למדוד');
  });

  it('a code whose material nobody can tell', () => {
    const { problems } = parseFinishTable('code,surface\nXX-9,floor', ROOMS);
    expect(problems[0].en).toContain('cannot tell what material');
  });

  it('a room that is not in the project is named, not matched to the nearest one', () => {
    const { specs, problems } = parseFinishTable('code,surface,rooms\nWD-2,floor,Treatment room; Gym', ROOMS);
    expect(specs[0].areas).toEqual(['room_1']);
    expect(problems[0].en).toContain('"Gym" is not in the project');
  });

  it('the same code twice in one file', () => {
    const { specs, problems } = parseFinishTable('code,surface\nWD-2,floor\nWD-2,wall', ROOMS);
    expect(specs).toHaveLength(1);
    expect(problems[0].row).toBe(3);
  });

  it('a file with no code column, or no rows', () => {
    expect(parseFinishTable('name,surface\nx,floor', ROOMS).problems[0].en).toContain('No "code" column');
    expect(parseFinishTable('code,surface', ROOMS).problems).toHaveLength(1);
  });
});

describe('the template', () => {
  it('imports cleanly, in both languages', () => {
    for (const he of [true, false]) {
      const { specs, problems } = parseFinishTable(finishTemplate(he), ROOMS);
      expect(problems, String(he)).toEqual([]);
      expect(specs.map((s) => s.code)).toEqual(['WD-2', 'PT-1']);
    }
  });
});

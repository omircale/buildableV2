import { FINISH_CODE_PREFIX, type FinishCategory, type FinishScheduleSpec, type FinishSurface } from '../../engine';

/**
 * Reads a finish schedule out of a table — a CSV file, or rows pasted straight from Excel.
 *
 * A real schedule runs to dozens of pages, one finish per page, and typing sixty of them into a form
 * is not something anyone will do. But an import is also where invented data gets in quietly, so this
 * one follows the engine's rule: a cell that is empty stays unknown, a row it cannot place is reported
 * with its row number rather than skipped in silence, and a room name it does not recognise is said
 * out loud instead of being matched to the nearest one.
 */

export interface ImportProblem {
  row: number;
  he: string;
  en: string;
}

export interface FinishImport {
  specs: FinishScheduleSpec[];
  problems: ImportProblem[];
}

export interface KnownRoom {
  id: string;
  nameHe: string;
  nameEn: string;
}

type Column = 'code' | 'category' | 'surface' | 'name' | 'pattern' | 'type' | 'color' | 'finish' | 'width' | 'length' | 'thickness' | 'rooms';

/** Every heading a column may arrive under, in either language. */
const HEADINGS: Record<Column, string[]> = {
  code: ['code', 'קוד', 'סימון'],
  category: ['category', 'קטגוריה', 'סוג חומר'],
  surface: ['surface', 'משטח', 'מיקום בחדר'],
  name: ['name', 'item name', 'שם', 'תיאור', 'שם הפריט'],
  pattern: ['pattern', 'דוגמה', 'דוגמת הנחה', 'הנחה'],
  type: ['type', 'product', 'סוג', 'מוצר'],
  color: ['color', 'colour', 'גוון', 'צבע'],
  finish: ['finish', 'גימור', 'גמר'],
  width: ['width', 'width mm', 'רוחב', 'רוחב מ"מ'],
  length: ['length', 'length mm', 'אורך', 'אורך מ"מ'],
  thickness: ['thickness', 'thickness mm', 'עובי', 'עובי מ"מ'],
  rooms: ['rooms', 'areas', 'חדרים', 'חללים', 'אזורים'],
};

const CATEGORY_WORDS: Record<string, FinishCategory> = {
  wood: 'wood',
  עץ: 'wood',
  פרקט: 'wood',
  stone: 'stone',
  אבן: 'stone',
  שיש: 'stone',
  tile: 'tile',
  אריח: 'tile',
  אריחים: 'tile',
  קרמיקה: 'tile',
  paint: 'paint',
  צבע: 'paint',
  wallcovering: 'wallcovering',
  טפט: 'wallcovering',
  metal: 'metal',
  מתכת: 'metal',
  glass: 'glass',
  זכוכית: 'glass',
  carpet: 'carpet',
  שטיח: 'carpet',
};

const SURFACE_WORDS: Record<string, FinishSurface> = {
  floor: 'floor',
  רצפה: 'floor',
  ריצוף: 'floor',
  wall: 'wall',
  קיר: 'wall',
  קירות: 'wall',
  חיפוי: 'wall',
  ceiling: 'ceiling',
  תקרה: 'ceiling',
};

/** Splits delimited text into rows of cells, honouring quotes. Tabs (Excel paste), commas and semicolons all work. */
export function parseTable(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell.trim());
      cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** A number from a cell, or null when the cell is empty or is not a number. Never a default. */
function numberOrNull(cell: string | undefined): number | null {
  if (!cell) return null;
  const n = Number(cell.replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function categoryFromCode(code: string): FinishCategory | null {
  const prefix = code.split('-')[0]?.toUpperCase();
  const hit = (Object.entries(FINISH_CODE_PREFIX) as [FinishCategory, string][]).find(([, p]) => p === prefix);
  return hit ? hit[0] : null;
}

export function parseFinishTable(text: string, rooms: KnownRoom[]): FinishImport {
  const table = parseTable(text);
  const problems: ImportProblem[] = [];
  if (table.length < 2) {
    return { specs: [], problems: [{ row: 1, he: 'צריך שורת כותרות ולפחות שורה אחת מתחתיה', en: 'A heading row and at least one row under it are needed' }] };
  }

  const header = table[0].map(norm);
  const at = {} as Record<Column, number>;
  for (const [col, names] of Object.entries(HEADINGS) as [Column, string[]][]) at[col] = header.findIndex((h) => names.includes(h));
  if (at.code < 0) {
    return { specs: [], problems: [{ row: 1, he: 'לא נמצאה עמודת "קוד" בשורת הכותרות', en: 'No "code" column was found in the heading row' }] };
  }

  const roomByName = new Map<string, string>();
  for (const r of rooms) for (const key of [r.id, r.nameHe, r.nameEn]) if (key) roomByName.set(norm(key), r.id);

  const specs: FinishScheduleSpec[] = [];
  const seen = new Set<string>();

  table.slice(1).forEach((cells, i) => {
    const row = i + 2;
    const get = (col: Column) => (at[col] >= 0 ? (cells[at[col]] ?? '').trim() : '');
    const code = get('code').toUpperCase();
    if (!code) return problems.push({ row, he: `שורה ${row}: אין קוד, השורה לא יובאה`, en: `Row ${row}: no code, the row was not imported` });
    if (seen.has(code)) return problems.push({ row, he: `שורה ${row}: הקוד ${code} כבר מופיע בקובץ`, en: `Row ${row}: code ${code} already appears in the file` });

    const category = CATEGORY_WORDS[norm(get('category'))] ?? categoryFromCode(code);
    if (!category) {
      return problems.push({ row, he: `שורה ${row}: לא ניתן לדעת איזה חומר זה (${code}) — חסרה קטגוריה, והקידומת אינה מוכרת`, en: `Row ${row}: cannot tell what material ${code} is — no category, and the prefix is not a known one` });
    }

    const surfaceCell = norm(get('surface'));
    const surface = SURFACE_WORDS[surfaceCell];
    if (!surface) {
      return problems.push({
        row,
        he: surfaceCell ? `שורה ${row}: המשטח "${get('surface')}" אינו מוכר — רצפה, קיר או תקרה` : `שורה ${row}: לא צוין משטח (רצפה, קיר או תקרה), ולכן אי אפשר למדוד את ${code}`,
        en: surfaceCell ? `Row ${row}: surface "${get('surface')}" is not recognised — floor, wall or ceiling` : `Row ${row}: no surface given (floor, wall or ceiling), so ${code} cannot be measured`,
      });
    }

    const areas: string[] = [];
    for (const name of get('rooms').split(/[;|]/).map((x) => x.trim()).filter(Boolean)) {
      const id = roomByName.get(norm(name));
      if (id) areas.push(id);
      else problems.push({ row, he: `שורה ${row}: החדר "${name}" אינו בפרויקט — ${code} יובא בלעדיו`, en: `Row ${row}: room "${name}" is not in the project — ${code} was imported without it` });
    }

    const width = numberOrNull(get('width'));
    const length = numberOrNull(get('length'));
    const base = code.includes('.') ? code.slice(0, code.lastIndexOf('.')) : undefined;
    seen.add(code);
    specs.push({
      code,
      category,
      variantOf: base,
      itemNameEn: get('name') || code,
      itemNameHe: get('name') || undefined,
      surface,
      pattern: get('pattern') || undefined,
      product: {
        type: get('type') || null,
        color: get('color') || null,
        finish: get('finish') || null,
        sizeMm: width != null || length != null ? { width, length } : null,
        thicknessMm: numberOrNull(get('thickness')),
        wearLayerMm: null,
      },
      areas: [...new Set(areas)],
      scope: 'unknown',
      sources: [],
    });
  });

  // A variant whose base is not in this file simply is not a variant here.
  const codes = new Set(specs.map((s) => s.code));
  for (const s of specs) if (s.variantOf && !codes.has(s.variantOf)) s.variantOf = undefined;

  return { specs, problems };
}

/** A file to start from: the headings, and two rows showing what goes under them. */
export function finishTemplate(he: boolean): string {
  const header = he
    ? ['קוד', 'קטגוריה', 'משטח', 'שם', 'דוגמה', 'סוג', 'גוון', 'גימור', 'רוחב', 'אורך', 'עובי', 'חדרים']
    : ['code', 'category', 'surface', 'name', 'pattern', 'type', 'color', 'finish', 'width', 'length', 'thickness', 'rooms'];
  const rows = he
    ? [
        ['WD-2', 'עץ', 'רצפה', 'רצפת עץ', 'Herringbone', '', '', '', '90', '650', '12.5', ''],
        ['PT-1', 'צבע', 'קיר', 'צבע קירות', '', '', '', '', '', '', '', ''],
      ]
    : [
        ['WD-2', 'wood', 'floor', 'Timber floor', 'Herringbone', '', '', '', '90', '650', '12.5', ''],
        ['PT-1', 'paint', 'wall', 'Wall paint', '', '', '', '', '', '', '', ''],
      ];
  return '﻿' + [header, ...rows].map((r) => r.join(',')).join('\r\n');
}

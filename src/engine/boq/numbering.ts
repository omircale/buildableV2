import { CHAPTERS, UNASSIGNED_CHAPTER, chapterLabel, chapterOf } from './chapters';
import type { BoqLine, LineLocation } from './line';

/**
 * Item numbers, the way an Israeli bill of quantities carries them.
 *
 * The scheme is not this engine's. A published bill numbers an item `מבנה.פרק.תת-פרק.סעיף` —
 * structure, Blue Book chapter, sub-chapter, item — and the standard interchange format for bills
 * (SKN) fixes the width of each part: two digits, two digits, two digits, four digits. So the two axes
 * this engine was built around, where the work is and which trade does it, are not a view laid over
 * the document; they are the first four digits of every line in it.
 *
 * A "structure" here is a room. Hotels, offices and shops are tendered room by room far more often
 * than building by building, and the format does not care which it is.
 */

/** Widths the SKN format allows in its extended form. */
export const SKN_LIMITS = { structure: 99, chapter: 99, subChapter: 99, item: 9999, quantity: 999999.99, descriptionChars: 300 } as const;

/** What each section is called when it heads a sub-chapter. Unknown sections fall back to their key. */
export const SECTION_LABEL: Record<string, { he: string; en: string }> = {
  units: { he: 'יחידות מורכבות', en: 'Assembled units' },
  boards: { he: 'לוחות', en: 'Boards' },
  substrates: { he: 'לוחות נשיאה', en: 'Carrier boards' },
  edge_banding: { he: 'קנטים', en: 'Edge banding' },
  ironmongery: { he: 'פרזול', en: 'Ironmongery' },
  clearances: { he: 'מרווחים סביב ציוד', en: 'Clearances around equipment' },
  points: { he: 'נקודות', en: 'Points' },
  supply: { he: 'הבאת אספקה', en: 'Bringing a supply' },
  haulage: { he: 'הובלה והעלאה', en: 'Haulage and lifting' },
  floor: { he: 'ריצוף', en: 'Flooring' },
  wall: { he: 'חיפוי קירות', en: 'Wall cladding' },
  ceiling: { he: 'תקרות', en: 'Ceilings' },
  other: { he: 'שונות', en: 'Sundries' },
};

export function sectionLabel(section: string): { he: string; en: string } {
  return SECTION_LABEL[section] ?? { he: section, en: section };
}

/** A room's identity for numbering: the zone inside it does not make it a different structure. */
export function structureKey(l: LineLocation): string {
  return [l.buildingId ?? '-', l.levelId, l.spaceId].join('/');
}

export interface NumberedLine {
  line: BoqLine;
  /** The full item number, e.g. "01.07.01.0010". */
  number: string;
  structure: string;
  chapter: string;
  subChapter: string;
}

export interface BillStructure {
  code: string;
  key: string;
  location: LineLocation;
  chapters: {
    code: string;
    he: string;
    en: string;
    subChapters: { code: string; section: string; he: string; en: string; lines: NumberedLine[] }[];
  }[];
}

export interface NumberingProblem {
  code: 'too_many_structures' | 'too_many_sub_chapters' | 'too_many_items' | 'quantity_too_large' | 'unassigned_chapter';
  lineId?: string;
  he: string;
  en: string;
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/**
 * Numbers a bill and lays it out in document order: by room, then chapter, then sub-chapter.
 *
 * Items step by ten, as published bills do, so a line can be inserted later without renumbering its
 * neighbours. Anything the interchange format would reject is reported rather than silently truncated.
 */
export function numberBill(lines: BoqLine[]): { structures: BillStructure[]; numbered: NumberedLine[]; problems: NumberingProblem[] } {
  const problems: NumberingProblem[] = [];
  const structures: BillStructure[] = [];
  const numbered: NumberedLine[] = [];

  const keys = [...new Set(lines.map((l) => structureKey(l.location)))];
  if (keys.length > SKN_LIMITS.structure) {
    problems.push({ code: 'too_many_structures', he: `יותר מ-${SKN_LIMITS.structure} חדרים בכתב כמויות אחד — הפורמט התקני אינו מאפשר זאת`, en: `More than ${SKN_LIMITS.structure} rooms in one bill — the standard format does not allow it` });
  }

  keys.forEach((key, si) => {
    const structure = pad(si + 1, 2);
    const here = lines.filter((l) => structureKey(l.location) === key);
    const chapterCodes = [...new Set(here.map(chapterOf))].sort();
    const out: BillStructure = { code: structure, key, location: here[0].location, chapters: [] };

    for (const chapter of chapterCodes) {
      const ofChapter = here.filter((l) => chapterOf(l) === chapter);
      const sections = [...new Set(ofChapter.map((l) => l.section))];
      if (sections.length > SKN_LIMITS.subChapter) {
        problems.push({ code: 'too_many_sub_chapters', he: `יותר מ-${SKN_LIMITS.subChapter} תתי-פרקים בפרק ${chapter}`, en: `More than ${SKN_LIMITS.subChapter} sub-chapters in chapter ${chapter}` });
      }
      const label = chapterLabel(chapter);
      const chapterOut: BillStructure['chapters'][number] = { code: `${structure}.${chapter}`, he: label.he, en: label.en, subChapters: [] };

      sections.forEach((section, ci) => {
        const sub = pad(ci + 1, 2);
        const ofSection = ofChapter.filter((l) => l.section === section);
        // Step by ten while there is room for it; a very long sub-chapter falls back to consecutive numbers.
        const step = ofSection.length * 10 <= SKN_LIMITS.item ? 10 : 1;
        if (ofSection.length > SKN_LIMITS.item) {
          problems.push({ code: 'too_many_items', he: `יותר מ-${SKN_LIMITS.item} סעיפים בתת-פרק אחד`, en: `More than ${SKN_LIMITS.item} items in one sub-chapter` });
        }
        const sLabel = sectionLabel(section);
        const subOut = { code: `${structure}.${chapter}.${sub}`, section, he: sLabel.he, en: sLabel.en, lines: [] as NumberedLine[] };

        ofSection.forEach((line, ii) => {
          const n: NumberedLine = { line, number: `${structure}.${chapter}.${sub}.${pad((ii + 1) * step, 4)}`, structure, chapter, subChapter: sub };
          subOut.lines.push(n);
          numbered.push(n);
          if (line.quantity != null && line.quantity > SKN_LIMITS.quantity) {
            problems.push({ code: 'quantity_too_large', lineId: line.id, he: `הכמות בשורה ${line.id} גדולה ממה שהפורמט התקני מאפשר`, en: `The quantity on line ${line.id} is larger than the standard format allows` });
          }
        });
        chapterOut.subChapters.push(subOut);
      });

      if (chapter === UNASSIGNED_CHAPTER) {
        problems.push({
          code: 'unassigned_chapter',
          he: `${ofChapter.length} שורות אינן משויכות לפרק מוכר ומוספרו תחת פרק ${UNASSIGNED_CHAPTER}`,
          en: `${ofChapter.length} lines belong to no recognised chapter and were numbered under chapter ${UNASSIGNED_CHAPTER}`,
        });
      }
      out.chapters.push(chapterOut);
    }
    structures.push(out);
  });

  return { structures, numbered, problems };
}

/** The chapters a bill touches, across every room — the summary a tender is priced against. */
export function chapterSummary(lines: BoqLine[]): { code: string; he: string; en: string; lines: number; sourced: boolean }[] {
  const codes = [...new Set(lines.map(chapterOf))].sort();
  return codes.map((code) => ({ code, ...chapterLabel(code), lines: lines.filter((l) => chapterOf(l) === code).length, sourced: code in CHAPTERS }));
}

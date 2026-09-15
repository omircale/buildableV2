import type { Ec5Class, Material, Source, SourcedValue, StockSize } from './types';

export const SOURCES = {
  en622_5: {
    title: 'EN 622-5:2009 Fibreboards — Requirements for dry process boards (MDF)',
    reference: 'Table 3 (MDF general purpose, dry) / Table 5 (MDF.LA)',
    url: 'https://www.choobeno.com/wp-content/uploads/2019/12/BSI-BS-EN-622-5.pdf',
  },
  en312: {
    title: 'EN 312:2010 Particleboards — Specifications',
    reference: 'Table 3 (P2, boards for interior fitments, dry)',
    url: 'https://cdn.standards.iteh.ai/samples/32825/f503d7326937419baa76fe3ab40205d0/SIST-EN-312-2011.pdf',
  },
  finnishPlywood: {
    title: 'Handbook of Finnish Plywood (Koskisen)',
    reference: 'Tables 3-1 and 3-2 — birch plywood 18 mm, 13 plies (values per EN 789 testing)',
    url: 'https://koskisen.fi/wp-content/uploads/materials/HandBook-of-Koskisen-Plywood.pdf',
  },
  en338_2003: {
    title: 'EN 338:2003 Structural timber — Strength classes',
    reference: 'Table 1 (C16, C24, D30)',
    url: 'http://higiene.unex.es/Bibliogr/ISO_BS_USDA/ISO_BS/BS%20EN/BS%20EN%2000338-2003.pdf',
  },
  en338_2016: {
    title: 'EN 338:2016 excerpt (dataholz.eu)',
    reference: 'Strength classes — E0,mean and fm,k for C16/C24 match the 2003 edition',
    url: 'https://www.dataholz.eu/fileadmin/dataholz/media/baustoffe/Datenblaetter_en/vh_en_01.pdf',
  },
  ec5: {
    title: 'EN 1995-1-1:2004+A1:2008 (Eurocode 5)',
    reference: 'Table 2.3 (γM), Table 3.1 (kmod), Table 3.2 (kdef), Table 7.2 (deflection limits)',
    url: 'https://gaprojekt.com/wp-content/uploads/2021/11/Eurocode-5-Design-of-timber-structures.pdf',
  },
} satisfies Record<string, Source>;

/** Stock sheet sizes have not yet been confirmed with Israeli suppliers (PRD §34). */
const assumedSheet = (lengthMm: number, widthMm: number): StockSize => ({
  lengthMm,
  widthMm,
  kind: 'assumption',
  note: 'מידת לוח מקובלת — טרם אומתה מול ספק',
});

/**
 * Density for panels is not set by EN 622-5 / EN 312. Self-weight is a small part of shelf load, so an
 * explicitly-labelled upper-bound assumption is used and the structural result is capped at YELLOW.
 */
const assumedDensity = (value: number, note: string): SourcedValue => ({ value, kind: 'assumption', sources: [], note });

export const MATERIAL_LIBRARY: Material[] = [
  {
    id: 'birch_plywood',
    nameHe: "סנדוויץ' ליבנה",
    nameEn: 'Birch plywood',
    descriptionHe: 'לבוד ליבנה פיני/בלטי. ערכי חוזק זמינים לעובי 18 מ"מ בלבד.',
    category: 'plywood',
    ec5Class: 'plywood',
    thicknessesMm: [6.5, 12, 15, 18, 21, 24],
    densityKgM3: { value: 680, kind: 'mean', sources: [SOURCES.finnishPlywood] },
    properties: [
      {
        minMm: 17,
        maxMm: 19,
        eBendingMpa: { value: 10048, kind: 'mean', sources: [SOURCES.finnishPlywood], note: 'במקביל לסיבי שכבת הפנים' },
        fBendingMpa: { value: 40.2, kind: 'characteristic', sources: [SOURCES.finnishPlywood], note: 'במקביל לסיבי שכבת הפנים' },
      },
    ],
    structuralUse: true,
    hasGrain: true,
    stock: [assumedSheet(2500, 1250), assumedSheet(2440, 1220)],
    defaultColor: '#dcc39a',
    verified: true,
  },
  {
    id: 'mdf',
    nameHe: 'MDF',
    nameEn: 'MDF (general purpose, dry)',
    descriptionHe: 'ערכי מינימום לפי EN 622-5. MDF רגיל אינו מכוסה ב-Eurocode 5 — זחילה מוערכת באנלוגיה ל-MDF.LA.',
    category: 'mdf',
    ec5Class: 'not_covered',
    ec5AnalogyClass: 'mdf_la',
    thicknessesMm: [16, 18, 19, 22, 25],
    densityKgM3: assumedDensity(800, 'EN 622-5 אינו קובע צפיפות. 800 ק"ג/מ"ק — הנחת גבול עליון לחישוב משקל עצמי.'),
    properties: [
      {
        minMm: 12,
        maxMm: 19,
        eBendingMpa: { value: 2200, kind: 'standard_minimum', sources: [SOURCES.en622_5] },
        fBendingMpa: { value: 20, kind: 'standard_minimum', sources: [SOURCES.en622_5] },
      },
      {
        minMm: 19,
        maxMm: 30,
        eBendingMpa: { value: 2100, kind: 'standard_minimum', sources: [SOURCES.en622_5] },
        fBendingMpa: { value: 18, kind: 'standard_minimum', sources: [SOURCES.en622_5] },
      },
    ],
    structuralUse: true,
    hasGrain: false,
    stock: [assumedSheet(2800, 2070), assumedSheet(2440, 1220)],
    defaultColor: '#b89f7e',
    verified: true,
  },
  {
    id: 'particleboard_p2',
    nameHe: 'סיבית (P2)',
    nameEn: 'Particleboard P2',
    descriptionHe: 'סיבית לריהוט פנים לפי EN 312. אינה מכוסה ב-Eurocode 5 — זחילה מוערכת באנלוגיה ל-P4.',
    category: 'particleboard',
    ec5Class: 'not_covered',
    ec5AnalogyClass: 'particleboard_p4',
    thicknessesMm: [16, 18],
    densityKgM3: assumedDensity(750, 'EN 312 אינו קובע צפיפות. 750 ק"ג/מ"ק — הנחת גבול עליון לחישוב משקל עצמי.'),
    properties: [
      {
        minMm: 13,
        maxMm: 20,
        eBendingMpa: { value: 1600, kind: 'standard_minimum', sources: [SOURCES.en312] },
        fBendingMpa: { value: 11, kind: 'standard_minimum', sources: [SOURCES.en312] },
      },
    ],
    structuralUse: true,
    hasGrain: false,
    stock: [assumedSheet(2800, 2070)],
    defaultColor: '#e8e4dc',
    verified: true,
  },
  {
    id: 'softwood_c24',
    nameHe: 'עץ רך מלא — מדורג C24',
    nameEn: 'Solid softwood, strength class C24',
    descriptionHe: 'עץ מחטני (אורן/אשוח) שעבר מיון חוזק ל-C24. לוח מודבק שלא עבר מיון — הערכים אינם חלים.',
    category: 'solid_softwood',
    ec5Class: 'solid_timber',
    thicknessesMm: [18, 20, 27, 40],
    densityKgM3: { value: 420, kind: 'mean', sources: [SOURCES.en338_2003] },
    properties: [
      {
        minMm: 0,
        maxMm: 150,
        eBendingMpa: { value: 11000, kind: 'mean', sources: [SOURCES.en338_2003, SOURCES.en338_2016] },
        fBendingMpa: { value: 24, kind: 'characteristic', sources: [SOURCES.en338_2003, SOURCES.en338_2016] },
      },
    ],
    structuralUse: true,
    hasGrain: true,
    stock: [assumedSheet(3000, 1200)],
    defaultColor: '#e6c68f',
    verified: true,
  },
  {
    id: 'softwood_c16',
    nameHe: 'עץ רך מלא — מדורג C16',
    nameEn: 'Solid softwood, strength class C16',
    descriptionHe: 'עץ מחטני שעבר מיון חוזק ל-C16.',
    category: 'solid_softwood',
    ec5Class: 'solid_timber',
    thicknessesMm: [18, 20, 27, 40],
    densityKgM3: { value: 370, kind: 'mean', sources: [SOURCES.en338_2003] },
    properties: [
      {
        minMm: 0,
        maxMm: 150,
        eBendingMpa: { value: 8000, kind: 'mean', sources: [SOURCES.en338_2003, SOURCES.en338_2016] },
        fBendingMpa: { value: 16, kind: 'characteristic', sources: [SOURCES.en338_2003, SOURCES.en338_2016] },
      },
    ],
    structuralUse: true,
    hasGrain: true,
    stock: [assumedSheet(3000, 1200)],
    defaultColor: '#edd3a4',
    verified: true,
  },
  {
    id: 'hardwood_d30',
    nameHe: 'עץ קשה מלא — מדורג D30 (למשל אלון)',
    nameEn: 'Solid hardwood, strength class D30',
    descriptionHe: 'עץ נשיר שעבר מיון חוזק ל-D30. ערכי EN 338:2003.',
    category: 'solid_hardwood',
    ec5Class: 'solid_timber',
    thicknessesMm: [20, 26, 40],
    densityKgM3: { value: 640, kind: 'mean', sources: [SOURCES.en338_2003] },
    properties: [
      {
        minMm: 0,
        maxMm: 150,
        eBendingMpa: { value: 10000, kind: 'mean', sources: [SOURCES.en338_2003], note: 'במהדורת 2016 ייתכן ערך שונה — לא אומת' },
        fBendingMpa: { value: 30, kind: 'characteristic', sources: [SOURCES.en338_2003] },
      },
    ],
    structuralUse: true,
    hasGrain: true,
    stock: [assumedSheet(3000, 1200)],
    defaultColor: '#b58a5a',
    verified: true,
  },
  {
    id: 'hdf_back',
    nameHe: 'HDF לגב',
    nameEn: 'HDF back panel',
    descriptionHe: 'לוח גב דק. אינו רכיב נושא עומס; אין נתוני חוזק במערכת.',
    category: 'mdf',
    ec5Class: 'not_covered',
    thicknessesMm: [3, 4],
    densityKgM3: assumedDensity(950, 'צפיפות HDF לא אומתה — הנחת גבול עליון לחישוב משקל בלבד.'),
    properties: [],
    structuralUse: false,
    hasGrain: false,
    stock: [assumedSheet(2440, 1220), assumedSheet(2800, 2070)],
    defaultColor: '#8a735a',
    verified: false,
  },
];

const byId = new Map(MATERIAL_LIBRARY.map((m) => [m.id, m]));

let customMaterials = new Map<string, Material>();

export function setCustomMaterials(list: Material[]): void {
  customMaterials = new Map(list.map((m) => [m.id, m]));
}

export function getMaterial(id: string): Material | undefined {
  return byId.get(id) ?? customMaterials.get(id);
}

export function allMaterials(): Material[] {
  return [...MATERIAL_LIBRARY, ...customMaterials.values()];
}

export function propertiesFor(material: Material, thicknessMm: number) {
  return material.properties.find((p) => thicknessMm > p.minMm && thicknessMm <= p.maxMm);
}

// ---------------- Eurocode 5 factors (service class 1: heated interior) ----------------

type CoveredClass = Exclude<Ec5Class, 'not_covered'>;

/** EN 1995-1-1 Table 3.2, service class 1. */
export const KDEF_SC1: Record<CoveredClass, number> = {
  solid_timber: 0.6,
  plywood: 0.8,
  osb3: 1.5,
  particleboard_p4: 2.25,
  particleboard_p6: 1.5,
  mdf_la: 2.25,
};

/** EN 1995-1-1 Table 3.1, service class 1, long-term action (storage loads per EC5 Table 2.2). */
export const KMOD_LONG_TERM_SC1: Record<CoveredClass, number> = {
  solid_timber: 0.7,
  plywood: 0.7,
  osb3: 0.5,
  particleboard_p4: 0.45,
  particleboard_p6: 0.5,
  mdf_la: 0.4,
};

/** EN 1995-1-1 Table 2.3. */
export const GAMMA_M: Record<CoveredClass, number> = {
  solid_timber: 1.3,
  plywood: 1.2,
  osb3: 1.2,
  particleboard_p4: 1.3,
  particleboard_p6: 1.3,
  mdf_la: 1.3,
};

export function ec5ClassFor(material: Material): { cls: CoveredClass; byAnalogy: boolean } | null {
  if (material.ec5Class !== 'not_covered') return { cls: material.ec5Class, byAnalogy: false };
  if (material.ec5AnalogyClass) return { cls: material.ec5AnalogyClass, byAnalogy: true };
  return null;
}

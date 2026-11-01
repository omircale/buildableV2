import { localized, type EngineLocale } from '../i18n';
import type { Supplier, SupplierAddonOption, SupplierEdgeOption, SupplierFinish } from './types';

/**
 * Snapshot of the public ordering configurator of hayozrim.com, captured 2026-09-15 from the
 * ProductConfigurator data embedded in each product page (variants, limits, add-ons, weightPerSqm).
 * Prices are ILS per m² as displayed; VAT treatment was not stated on the page.
 */

const EDGE_OPTIONS: SupplierEdgeOption[] = [
  { id: 'none', nameHe: 'ללא קנטים', nameEn: 'No edge banding', edges: [] },
  { id: 'all', nameHe: 'קנטים מסביב', nameEn: 'Edge banding all round', edges: ['width', 'width', 'depth', 'depth'] },
  { id: 'one_width', nameHe: 'קנט אחד - עומק/אורך', nameEn: 'One edge – depth/length', edges: ['depth'] },
  { id: 'one_length', nameHe: 'קנט אחד - רוחב', nameEn: 'One edge – width', edges: ['width'] },
  { id: 'length_width', nameHe: 'רוחב + עומק/אורך', nameEn: 'Width + depth/length', edges: ['width', 'depth'] },
  { id: 'length_two_widths', nameHe: 'רוחב + פעמיים עומק/אורך', nameEn: 'Width + both depth/length edges', edges: ['width', 'depth', 'depth'] },
];
const EDGE = { pricePerMeter: 7, options: EDGE_OPTIONS };

const LIMITS = { minLongMm: 100, maxLongMm: 2400, minShortMm: 100, maxShortMm: 1200, stepMm: 10 };

// Display colours are Buildable's visual approximation of the named decors.
const COLORS: Record<string, string> = {
  'לבן מט': '#f1efea',
  'שמנת מט': '#ece3cf',
  'אפור בהיר': '#cfd0cd',
  'אפור גרפיט': '#4b4c4e',
  'שחור מט': '#232323',
  'פשתן אפרפר': '#c9c0b2',
  'אלון מבוקע': '#b8956d',
  'אלון מחורץ': '#a3845f',
  'ליבנה גלוי': '#dcc39a',
  'אלון גלוי': '#c09467',
  'MDF ירוק': '#8e9a78',
  'MDF חום': '#9c7d5d',
  OSB: '#c9a66d',
  'דיקט': '#d6b688',
};

/** English display names of the decors. Finish ids stay Hebrew: they are persisted in saved designs. */
export const FINISH_NAMES_EN: Record<string, string> = {
  'לבן מט': 'Matte white',
  'שמנת מט': 'Matte cream',
  'אפור בהיר': 'Light grey',
  'אפור גרפיט': 'Graphite grey',
  'שחור מט': 'Matte black',
  'פשתן אפרפר': 'Grey linen',
  'אלון מבוקע': 'Split oak',
  'אלון מחורץ': 'Grooved oak',
  'ליבנה גלוי': 'Natural birch',
  'אלון גלוי': 'Natural oak',
  'MDF ירוק': 'Green MDF',
  'MDF חום': 'Brown MDF',
  OSB: 'OSB',
  'דיקט': 'Plywood',
};

/** Display name for a finish id (e.g. a saved design's `finishId`); unknown ids are returned unchanged. */
export function finishDisplayName(finishId: string, locale?: EngineLocale): string {
  return localized(finishId, FINISH_NAMES_EN[finishId], locale);
}

const finishes = (price: number, names: string[], overrides: Record<string, number> = {}): SupplierFinish[] =>
  names.map((n) => ({ id: n, nameHe: n, nameEn: FINISH_NAMES_EN[n], pricePerSqm: overrides[n] ?? price, color: COLORS[n] ?? '#cccccc' }));

const NAILS: SupplierAddonOption[] = [
  { id: 'none', nameHe: 'ללא מסמרים', nameEn: 'No nails', price: 0 },
  { id: '50_nails', nameHe: '50 מסמרים', nameEn: '50 nails', price: 7 },
  { id: '100_nails', nameHe: '100 מסמרים', nameEn: '100 nails', price: 10 },
];

const FORMICA_DECORS = ['לבן מט', 'שמנת מט', 'אפור בהיר', 'אפור גרפיט', 'שחור מט', 'פשתן אפרפר', 'אלון מבוקע', 'אלון מחורץ'];
const BIRCH_FORMICA_DECORS = ['לבן מט', 'שמנת מט', 'אפור בהיר', 'אפור גרפיט', 'שחור מט', 'אלון מבוקע', 'אלון מחורץ'];

const BIRCH_NOTE = 'הלוח מתואר כ"כולו שכבות ליבנה ללא חללים". דרגה, מספר שכבות ותקן לא צוינו, ולכן החישוב נשען על נתוני לבוד ליבנה דומה.';
const BIRCH_NOTE_EN = 'The board is described as "entirely birch plies, no voids". Grade, ply count and standard are not stated, so the calculation relies on data for comparable birch plywood.';

export const HAYOZRIM: Supplier = {
  id: 'hayozrim',
  nameHe: 'היוצרים בהתאמה אישית',
  nameEn: 'Hayozrim custom cut',
  url: 'https://hayozrim.com/',
  capturedAt: '2026-09-15',
  source: { title: 'hayozrim.com — מחולל ההזמנה בדפי המוצר', reference: 'נתוני ProductConfigurator, נאספו 15.9.2026', url: 'https://hayozrim.com/collections/custom-cut-wood-board', titleEn: 'hayozrim.com — product page order configurator', referenceEn: 'ProductConfigurator data, captured 15 Sep 2026' },
  shippingIls: { amount: 50, noteHe: 'מוצג בדף המוצר כ"עלות משלוח ₪50". כללי חישוב (משקל/אזור/כמות) לא פורסמו.', noteEn: 'Shown on the product page as "shipping cost ₪50". Calculation rules (weight/region/quantity) are not published.' },
  leadTimeHe: '2–15 ימי עסקים; איסוף עצמי בבית שאן',
  leadTimeEn: '2–15 business days; self pickup in Beit She\'an',
  policyHe: ['ביטול עד 30 דקות מההזמנה', 'אין החזרות לאחר תחילת ייצור', 'דיווח על פגם תוך 24 שעות'],
  policyEn: ['Cancellation within 30 minutes of ordering', 'No returns once production has started', 'Report defects within 24 hours'],
  products: [
    {
      handle: 'birch-18mm', titleHe: "בירץ' 18 מ״מ", titleEn: 'Birch plywood 18 mm', url: 'https://hayozrim.com/products/birch-18mm', thicknessMm: 18, role: 'board',
      finishes: finishes(285, ['ליבנה גלוי']), limits: LIMITS, minPricePerPiece: 50, edgeBanding: null, weightKgPerSqm: 12.6,
      descriptionHe: 'לבוד ליבנה גלוי. קצוות השכבות נראים.', descriptionEn: 'Uncoated birch plywood. Ply edges are visible.', engineering: { referenceMaterialId: 'birch_plywood', confirmed: false, noteHe: BIRCH_NOTE, noteEn: BIRCH_NOTE_EN }, hasGrain: true, pickupOnly: false,
    },
    {
      handle: 'birch-24mm', titleHe: "בירץ' 24 מ״מ", titleEn: 'Birch plywood 24 mm', url: 'https://hayozrim.com/products/birch-24mm', thicknessMm: 24, role: 'board',
      finishes: finishes(650, ['ליבנה גלוי']), limits: LIMITS, minPricePerPiece: 50, edgeBanding: null, weightKgPerSqm: 16.8,
      descriptionHe: 'לבוד ליבנה גלוי.', descriptionEn: 'Uncoated birch plywood.', engineering: { referenceMaterialId: 'birch_plywood', confirmed: false, noteHe: BIRCH_NOTE, noteEn: BIRCH_NOTE_EN }, hasGrain: true, pickupOnly: false,
    },
    {
      handle: 'shelf-birch-16mm', titleHe: "בירץ' ליבנה 16 מ״מ", titleEn: 'Birch plywood 16 mm', url: 'https://hayozrim.com/products/shelf-birch-16mm', thicknessMm: 16, role: 'board',
      finishes: finishes(325, ['ליבנה גלוי']), limits: LIMITS, minPricePerPiece: 50, edgeBanding: null, weightKgPerSqm: 10.9,
      descriptionHe: 'לבוד ליבנה גלוי.', descriptionEn: 'Uncoated birch plywood.', engineering: { referenceMaterialId: 'birch_plywood', confirmed: false, noteHe: BIRCH_NOTE, noteEn: BIRCH_NOTE_EN }, hasGrain: true, pickupOnly: false,
    },
    {
      handle: 'birch-12mm', titleHe: "בירץ' 12 מ״מ", titleEn: 'Birch plywood 12 mm', url: 'https://hayozrim.com/products/birch-12mm', thicknessMm: 12, role: 'board',
      finishes: finishes(165, ['ליבנה גלוי']), limits: LIMITS, minPricePerPiece: 50, edgeBanding: null, weightKgPerSqm: 8.4,
      descriptionHe: 'לבוד ליבנה גלוי.', descriptionEn: 'Uncoated birch plywood.', engineering: { referenceMaterialId: 'birch_plywood', confirmed: false, noteHe: BIRCH_NOTE, noteEn: BIRCH_NOTE_EN }, hasGrain: true, pickupOnly: false,
    },
    {
      handle: 'shelf-sandwich-17mm', titleHe: "סנדוויץ' 17 מ\"מ", titleEn: 'Sandwich board 17 mm', url: 'https://hayozrim.com/products/shelf-sandwich-17mm', thicknessMm: 17, role: 'board',
      finishes: finishes(270, FORMICA_DECORS), limits: LIMITS, minPricePerPiece: 50, edgeBanding: EDGE, weightKgPerSqm: 9.5,
      descriptionHe: 'לוח סנדוויץ׳ מצופה פורמייקה, ליבה משילוב עצים רכים.', descriptionEn: 'Laminate-faced sandwich board with a mixed softwood core.', engineering: null, hasGrain: true, pickupOnly: false,
    },
    {
      handle: 'sibit-melamine-17mm', titleHe: 'סיבית מלמין 17 מ״מ', titleEn: 'Melamine particleboard 17 mm', url: 'https://hayozrim.com/products/sibit-melamine-17mm', thicknessMm: 17, role: 'board',
      finishes: finishes(250, ['לבן מט']), limits: LIMITS, minPricePerPiece: 50, edgeBanding: EDGE, weightKgPerSqm: 11.5,
      descriptionHe: 'סיבית מצופה מלמין.', descriptionEn: 'Melamine-faced particleboard.',
      engineering: { referenceMaterialId: 'particleboard_p2', confirmed: false, noteHe: 'סוג הסיבית (P2/P4) לא צוין. הושווה לערכי מינימום של P2 — השוואה לא אושרה.', noteEn: 'Particleboard type (P2/P4) is not stated. Compared with P2 minimum values — equivalence not confirmed.' }, hasGrain: false, pickupOnly: false,
    },
    {
      handle: 'shelf-sibit-28mm', titleHe: 'סיבית מלמין 28 מ״מ', titleEn: 'Melamine particleboard 28 mm', url: 'https://hayozrim.com/products/shelf-sibit-28mm', thicknessMm: 28, role: 'board',
      finishes: finishes(585, ['לבן מט', 'שחור מט', 'אפור בהיר']), limits: LIMITS, minPricePerPiece: 50, edgeBanding: EDGE, weightKgPerSqm: 19,
      descriptionHe: 'סיבית מלמין בעובי מוגבר.', descriptionEn: 'Extra-thick melamine-faced particleboard.',
      engineering: { referenceMaterialId: 'particleboard_p2', confirmed: false, noteHe: 'סוג הסיבית לא צוין, ואין במערכת ערכי תקן לעובי 28 מ"מ.', noteEn: 'Particleboard type is not stated, and the system has no standard values for 28 mm thickness.' }, hasGrain: false, pickupOnly: false,
    },
    {
      handle: 'mdf-brown-17mm', titleHe: 'MDF חום 17 מ״מ גלוי', titleEn: 'Brown MDF 17 mm, raw', url: 'https://hayozrim.com/products/mdf-brown-17mm', thicknessMm: 17, role: 'board',
      finishes: finishes(208, ['MDF חום']), limits: LIMITS, minPricePerPiece: 50, edgeBanding: null, weightKgPerSqm: 12.2,
      descriptionHe: 'MDF סטנדרטי לשימוש כללי, גלוי — מתאים לצביעה.', descriptionEn: 'Standard general-purpose MDF, uncoated — suitable for painting.',
      engineering: { referenceMaterialId: 'mdf', confirmed: false, noteHe: 'MDF סטנדרטי; עמידה ב-EN 622-5 לא צוינה.', noteEn: 'Standard MDF; compliance with EN 622-5 is not stated.' }, hasGrain: false, pickupOnly: false,
    },
    {
      handle: 'mdf-green-17mm', titleHe: 'MDF ירוק 17 מ"מ', titleEn: 'Green MDF 17 mm', url: 'https://hayozrim.com/products/mdf-green-17mm', thicknessMm: 17, role: 'board',
      finishes: finishes(208, ['MDF ירוק']), limits: LIMITS, minPricePerPiece: 50, edgeBanding: null, weightKgPerSqm: 13.1,
      descriptionHe: 'MDF עמיד לחות.', descriptionEn: 'Moisture-resistant MDF.',
      engineering: { referenceMaterialId: 'mdf', confirmed: false, noteHe: 'MDF עמיד לחות (MDF.H). חושב לפי מינימום MDF כללי — השוואה לא אושרה.', noteEn: 'Moisture-resistant MDF (MDF.H). Calculated with general-purpose MDF minimum values — equivalence not confirmed.' }, hasGrain: false, pickupOnly: false,
    },
    {
      handle: 'shelf-birch-formica-28mm', titleHe: "בירץ' פורמייקה 28 מ״מ - גימור טבעי", titleEn: 'Laminate-faced birch plywood 28 mm – natural edges', url: 'https://hayozrim.com/products/shelf-birch-formica-28mm', thicknessMm: 28, role: 'board',
      finishes: finishes(910, BIRCH_FORMICA_DECORS, { 'אלון מבוקע': 1040, 'אלון מחורץ': 1040 }), limits: LIMITS, minPricePerPiece: 50, edgeBanding: EDGE, weightKgPerSqm: 20.8,
      descriptionHe: 'ליבנה מצופה פורמייקה, קצוות שכבות גלויים.', descriptionEn: 'Laminate-faced birch plywood with exposed ply edges.', engineering: null, hasGrain: true, pickupOnly: false,
    },
    {
      handle: 'shelf-birch-formica-28mm-edge', titleHe: "בירץ' פורמייקה 28 מ״מ - גימור קנטים", titleEn: 'Laminate-faced birch plywood 28 mm – edge-banded', url: 'https://hayozrim.com/products/shelf-birch-formica-28mm-edge', thicknessMm: 28, role: 'board',
      finishes: finishes(936, BIRCH_FORMICA_DECORS, { 'אלון מבוקע': 1066, 'אלון מחורץ': 1066 }), limits: LIMITS, minPricePerPiece: 50, edgeBanding: null, weightKgPerSqm: 20.8,
      descriptionHe: 'ליבנה מצופה פורמייקה עם גימור קנטים כלול.', descriptionEn: 'Laminate-faced birch plywood with edge banding included.', engineering: null, hasGrain: true, pickupOnly: false,
    },
    {
      handle: 'butcher-oak-26mm', titleHe: "בוצ'ר אלון 26 מ״מ", titleEn: 'Oak butcher block 26 mm', url: 'https://hayozrim.com/products/butcher-oak-26mm', thicknessMm: 26, role: 'board',
      finishes: finishes(1521, ['אלון גלוי']), limits: LIMITS, minPricePerPiece: 50, edgeBanding: null, weightKgPerSqm: 18.7,
      descriptionHe: 'עץ אלון מלא מודבק (בוצ׳ר). אינו עץ מדורג חוזק — ערכי D30 לא חלים.', descriptionEn: 'Glued solid oak (butcher block). Not strength-graded timber — D30 values do not apply.', engineering: null, hasGrain: true, pickupOnly: false,
    },
    {
      handle: 'plywood-formica-4-6mm', titleHe: 'דיקט 5.5 מ״מ פורמייקה צד אחד', titleEn: 'Plywood 5.5 mm, laminate on one side', url: 'https://hayozrim.com/products/plywood-formica-4-6mm', thicknessMm: 5.5, role: 'back',
      finishes: finishes(104, ['לבן מט', 'אלון מבוקע', 'שחור מט']), limits: LIMITS, minPricePerPiece: 50, edgeBanding: null, weightKgPerSqm: 4.4,
      nails: NAILS,
      descriptionHe: 'גב ארון, פורמייקה בצד אחד.', descriptionEn: 'Cabinet back panel, laminate on one side.', engineering: null, hasGrain: true, pickupOnly: false,
    },
    {
      handle: 'plywood-raw-4mm', titleHe: 'דיקט 4 מ״מ גלוי משני הצדדים', titleEn: 'Plywood 4 mm, raw on both sides', url: 'https://hayozrim.com/products/plywood-raw-4mm', thicknessMm: 4, role: 'back',
      finishes: finishes(78, ['דיקט']), limits: LIMITS, minPricePerPiece: 50, edgeBanding: null, weightKgPerSqm: 2.4,
      nails: NAILS,
      descriptionHe: 'גב ארון גלוי.', descriptionEn: 'Uncoated cabinet back panel.', engineering: null, hasGrain: true, pickupOnly: false,
    },
    {
      handle: 'masonite-3-5mm', titleHe: 'מזונית 3.5 מ״מ ציפוי צד אחד', titleEn: 'Hardboard (Masonite) 3.5 mm, coated on one side', url: 'https://hayozrim.com/products/masonite-3-5mm', thicknessMm: 3.5, role: 'back',
      finishes: finishes(78, ['לבן מט']), limits: LIMITS, minPricePerPiece: 50, edgeBanding: null, weightKgPerSqm: 3.3,
      nails: NAILS,
      descriptionHe: 'גב ארון מזונית לבנה.', descriptionEn: 'White hardboard (Masonite) cabinet back panel.', engineering: null, hasGrain: false, pickupOnly: false,
    },
  ],
};

/** Captured but deliberately not offered in the designer yet, with the reason. */
export const HAYOZRIM_EXCLUDED = [
  { handle: 'osb-10mm', reasonHe: 'עובי 10 מ"מ מתחת למינימום לחיבורי ברגים בקצה', reasonEn: '10 mm thickness is below the minimum for screw joints into the board edge' },
  { handle: 'birch-6mm', reasonHe: 'דק מדי לגוף; לא מוצע כגב אצל הספק', reasonEn: 'Too thin for the carcass; not offered as a back panel by the supplier' },
  { handle: 'pine-board-by-size', reasonHe: 'לטות (20×40/45 מ"מ), לא לוח; איסוף עצמי בלבד', reasonEn: 'Battens (20×40/45 mm), not a board; self pickup only' },
  { handle: 'birch-16mm', reasonHe: 'מוצר נסתר במחיר ₪260 למ"ר — כפילות מול shelf-birch-16mm (₪325). ממתין לבירור', reasonEn: 'Hidden product at ₪260/m² — duplicates shelf-birch-16mm (₪325). Awaiting clarification' },
];

import type { Source } from '../types';

/**
 * Safety and usage sources for the non-shelf templates, taken from docs/data/floor-bed-rules.json.
 * Confidence notes are carried into the check text: several are secondary summaries of paywalled standards.
 */
export const SAFETY_SOURCES = {
  cpscEntrapment: {
    title: 'CPSC Investigation Guideline — Structural Entrapment (Appendix 35, rev. Dec 2004)',
    reference: 'טווח 89–230 מ"מ (3.5–9 אינץ\'), מתוך ASTM F1487/F1148 — כלל תכנון באנלוגיה, לא דרישה למיטות',
    referenceEn: '89–230 mm (3.5–9 in) range, from ASTM F1487/F1148 — a design heuristic by analogy, not a bed requirement',
    url: 'https://www.reginfo.gov/public/do/DownloadDocument?objectID=68326001',
  },
  zipadeeRecall: {
    title: 'CPSC Recall: Zipadee Kids Convertible House Bed Frames and Montessori Floor Beds (2023)',
    reference: 'ריקול בגלל מרווחים שבהם גוף הילד עובר והראש לא',
    referenceEn: "Recall because of gaps where a child's torso passes but the head does not",
    url: 'https://www.cpsc.gov/Recalls/2023/Zipadee-Kids-Recalls-Convertible-House-Bed-Frames-and-Montessori-Floor-Beds-Due-to-Entrapment-and-Strangulation-Hazards',
  },
  en716Gap: {
    title: 'Baby Cot & Mattress Safety Standards of BS EN 716 (Picket&Rail) — סיכום משני',
    titleEn: 'Baby Cot & Mattress Safety Standards of BS EN 716 (Picket&Rail) — secondary summary',
    reference: 'מרווח מזרן–מסגרת ≤ 30 מ"מ בעריסות (EN 716-1)',
    referenceEn: 'Mattress-to-frame gap ≤ 30 mm in cots (EN 716-1)',
    url: 'https://picketandrail.com/blogs/baby-kids-blog/baby-cot-mattress-key-safety-standards-and-requirements-of-bs-en-716',
  },
  en747Scope: {
    title: 'EN 747-1:2024 fact-check (GP Camping Guide) — סיכום משני',
    titleEn: 'EN 747-1:2024 fact-check (GP Camping Guide) — secondary summary',
    reference: 'כללי מיטות קומתיים/גבוהות חלים ממזרן בגובה 600 מ"מ ומעלה',
    referenceEn: 'Bunk/high-bed rules apply from a mattress height of 600 mm',
    url: 'https://gp-camping-guide.com/bunk-bed-safety/',
  },
  cfr1213Guard: {
    title: '16 CFR 1213.3 — Requirements (bunk beds)',
    reference: '1213.3(a)(6): מעקה ≥ 5 אינץ\' (127 מ"מ) מעל המזרן — למיטות קומתיים',
    referenceEn: '1213.3(a)(6): guardrail ≥ 5 in (127 mm) above the mattress — for bunk beds',
    url: 'https://www.law.cornell.edu/cfr/text/16/1213.3',
  },
  en716Edges: {
    title: 'EN 716-1 testing standard summary (Furnitest) — סיכום משני',
    titleEn: 'EN 716-1 testing standard summary (Furnitest) — secondary summary',
    reference: 'קצוות נגישים מעוגלים או משופעים, ללא שבבים; אין רדיוס מספרי',
    referenceEn: 'Accessible edges rounded or chamfered, free of burrs; no numeric radius',
    url: 'https://furnitest.com/testing/furniture-testing/standards/en-716-1-2017-en-716-2017/',
  },
  en71Coatings: {
    title: 'EN 71-3:2013+A1 (Table 2, category III)',
    reference: 'גבולות נדידה של מתכות מציפויים במוצרי ילדים; לוודא מול המהדורה העדכנית',
    referenceEn: 'Metal migration limits from coatings on children’s products; confirm against the current edition',
    url: 'https://law.resource.org/pub/eu/toys/en.71.3.2015.html',
  },
  formaldehyde: {
    title: '40 CFR 770.10 — Formaldehyde emission standards (TSCA Title VI / CARB P2)',
    reference: "דיקט עץ קשה ≤ 0.05 ppm; MDF ≤ 0.11 ppm; סיבית ≤ 0.09 ppm. באירופה: דרגת E1 לפי EN 13986",
    referenceEn: 'Hardwood plywood ≤ 0.05 ppm; MDF ≤ 0.11 ppm; particleboard ≤ 0.09 ppm. In Europe: class E1 per EN 13986',
    url: 'https://www.law.cornell.edu/cfr/text/40/770.10',
  },
  slatSpacing: {
    title: 'Puffy — How Far Apart Should Bed Slats Be? (הנחיית יצרן מזרנים, לא תקן)',
    titleEn: 'Puffy — How Far Apart Should Bed Slats Be? (mattress-maker guidance, not a standard)',
    reference: 'מרווח מרבי מקובל בין דקים 51–76 מ"מ; למזרני קצף ≤ 70 מ"מ',
    referenceEn: 'Commonly cited maximum slat gap 51–76 mm; ≤ 70 mm for foam mattresses',
    url: 'https://puffy.com/blogs/best-sleep/how-far-apart-should-bed-slats-be-the-spacing-guide',
  },
  en1725: {
    title: 'SATRA — Safety, strength and durability testing of beds to EN 1725:2023',
    reference: 'התקן מניח משתמש עד 110 ק"ג; ערכי הכוחות עצמם לא פורסמו במקור נגיש',
    referenceEn: 'The standard assumes a user of up to 110 kg; the test forces themselves are not in an accessible source',
    url: 'https://www.satra.com/spotlight/article.php?id=566',
  },
  seating: {
    title: 'EN 12520 (ישיבה ביתית — חוזק, עמידות ובטיחות) · EN 1022 (יציבות ישיבה)',
    titleEn: 'EN 12520 (domestic seating — strength, durability and safety) · EN 1022 (seating stability)',
    reference: 'דורשים בדיקות פיזיות; ערכי העומס לא נקראו מהתקן',
    referenceEn: 'Require physical tests; the load values were not read from the standard',
  },
} satisfies Record<string, Source>;

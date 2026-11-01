/**
 * The knowledge cards a proposal leans on, as the university holds them.
 *
 * Every card here was written by the learning rounds from a source that was opened, and none of them
 * has been checked by a partner yet — so every one is "unverified" and the screen says so. A card's
 * status is copied by hand from Notion for now; when the knowledge base moves into the repo this list
 * is generated from it instead.
 */

export type CardStatus = 'verified' | 'unverified';

export interface Citation {
  id: string;
  /** The claim in a line, in our own words. */
  he: string;
  en: string;
  /** Where in the source the claim sits. */
  where: string;
  url: string;
  status: CardStatus;
  /** True when the source is not Israeli: right for physics, never the final word on a design limit. */
  foreign?: boolean;
  /** When the rule belongs to one city's water corporation, that city. */
  city?: string;
}

const card = (c: Citation) => c;

export const CITATIONS = {
  drainParts: card({
    id: 'drainParts',
    he: 'במערכת סילוק מים במבנה מבחינים בין צנרת דלוחים, שפכים ואוויר, עם מחסומים, קולטנים ותאי ביקורת',
    en: 'A building drainage system separates grey water, soil and vent pipes, with traps, stacks and inspection chambers',
    where: 'תכנית לימודים שרברבות תברואתית, עמ׳ 9–10',
    url: 'https://app.notion.com/400b0f002db481258866e568e10ef0eb',
    status: 'unverified',
  }),
  greaseTelAviv: card({
    id: 'greaseTelAviv',
    he: 'בתל אביב-יפו עסק עם שומנים חייב במפריד שומן על קו הביוב, בשטח הפרטי בלבד',
    en: 'In Tel Aviv-Yafo a business with grease must have a grease separator on the sewer line, on private ground only',
    where: 'מי אביבים, מפרט דרישות לעסקים, עמ׳ 1',
    url: 'https://app.notion.com/400b0f002db481dc964ffdee4738b867',
    status: 'unverified',
    city: 'תל אביב-יפו',
  }),
  greaseRestaurant: card({
    id: 'greaseRestaurant',
    he: 'לפי טבלת מי אביבים מסעדה (4.2א) חייבת במפריד שומן; מזנון עד 50 מ"ר (4.2ב) פטור',
    en: 'By the Mei Avivim table a restaurant (4.2a) needs a grease separator; a snack bar up to 50 m² (4.2b) is exempt',
    where: 'מי אביבים, עמ׳ 3, טבלת עסקים',
    url: 'https://app.notion.com/400b0f002db4816288c2c84ec389020e',
    status: 'unverified',
    city: 'תל אביב-יפו',
  }),
  planMarks: card({
    id: 'planMarks',
    he: 'בתכנית העסק למי אביבים מסמנים את נקודת חיבור המים, קיבולת מפריד השומן, מיקום המז"ח ושעון המים',
    en: 'The business plan for Mei Avivim marks the water connection, grease separator capacity, backflow preventer and meter',
    where: 'מי אביבים, עמ׳ 1 סעיף 6א; עמ׳ 6',
    url: 'https://app.notion.com/400b0f002db48131b13fc71119ba315b',
    status: 'unverified',
    city: 'תל אביב-יפו',
  }),
  backflowInstall: card({
    id: 'backflowInstall',
    he: 'בעל עסק מתקין מז"ח בראש מערכת המים של העסק, באמצעות מתקין מוסמך',
    en: 'A business installs a backflow preventer at the head of its water system, by a licensed installer',
    where: 'תקנות בריאות העם (מז"ח), תקנה 3 — נוסח ויקיטקסט, לאמת מול הנוסח הרשמי',
    url: 'https://app.notion.com/400b0f002db481de8d3fdf0e8b357b7e',
    status: 'unverified',
  }),
  backflowTest: card({
    id: 'backflowTest',
    he: 'מז"ח נבדק בידי מתקין מוסמך לפחות פעם בשנה, והתוצאות נרשמות בפנקס בדיקות',
    en: 'A backflow preventer is tested by a licensed installer at least once a year, with results logged',
    where: 'תקנות מז"ח, תקנה 6',
    url: 'https://app.notion.com/400b0f002db48123933bef25a7499d9b',
    status: 'unverified',
  }),
  manning: card({
    id: 'manning',
    he: 'משוואת מנינג נותנת מהירות זרימה בכבידה מתוך חספוס, רדיוס הידראולי ושיפוע',
    en: 'Manning’s equation gives gravity-flow velocity from roughness, hydraulic radius and slope',
    where: 'InfraLens (תקציר CPHEEO); ACPA עמ׳ 4',
    url: 'https://app.notion.com/400b0f002db48179b2a1f7964df956f2',
    status: 'unverified',
    foreign: true,
  }),
  hydraulicRadius: card({
    id: 'hydraulicRadius',
    he: 'בצינור עגול מלא הרדיוס ההידראולי שווה לרבע הקוטר הפנימי',
    en: 'In a full circular pipe the hydraulic radius is a quarter of the inside diameter',
    where: 'InfraLens, Key formulas',
    url: 'https://app.notion.com/400b0f002db481dba929e5e09a1794c6',
    status: 'unverified',
    foreign: true,
  }),
  manningN: card({
    id: 'manningN',
    he: 'בתכנון ביוב מקובל מקדם מנינג 0.012–0.013 גם לצינור חלק',
    en: 'Sewer design commonly uses a Manning n of 0.012–0.013 even for smooth pipe',
    where: 'ACPA עמ׳ 4–5',
    url: 'https://app.notion.com/400b0f002db4817d97d4eef5bf1ba1e7',
    status: 'unverified',
    foreign: true,
  }),
  minVelocity: card({
    id: 'minVelocity',
    he: 'מהירות של כ-0.6 מ׳/שנ׳ בצינור מלא או חצי-מלא מונעת שקיעת מוצקים בביוב',
    en: 'About 0.6 m/s in a full or half-full pipe keeps solids from settling in a sewer',
    where: 'ACPA עמ׳ 4; InfraLens',
    url: 'https://app.notion.com/400b0f002db48138ab9dc249d6f88f20',
    status: 'unverified',
    foreign: true,
  }),
} as const;

export type CitationId = keyof typeof CITATIONS;

export const citation = (id: CitationId): Citation => CITATIONS[id];

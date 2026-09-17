/**
 * Language of human-readable text produced by the engine. Hebrew is the default.
 * Numbers, ids, statuses and formulas never depend on the locale.
 */
export type EngineLocale = 'he' | 'en';

export const ENGINE_LOCALES: readonly EngineLocale[] = ['he', 'en'];

let currentLocale: EngineLocale = 'he';

export function setEngineLocale(locale: EngineLocale): void {
  currentLocale = locale === 'en' ? 'en' : 'he';
}

export function getEngineLocale(): EngineLocale {
  return currentLocale;
}

/** Runs `fn` with the engine locale set, restoring the previous locale afterwards (synchronous callers only). */
export function withEngineLocale<T>(locale: EngineLocale, fn: () => T): T {
  const previous = currentLocale;
  setEngineLocale(locale);
  try {
    return fn();
  } finally {
    currentLocale = previous;
  }
}

/** Picks the string for the current engine locale. */
export function tr(he: string, en: string): string {
  return currentLocale === 'en' ? en : he;
}

/** Hebrew text with an optional English sibling; falls back to Hebrew when English is missing. */
export function localized(he: string, en?: string | null, locale: EngineLocale = currentLocale): string {
  return locale === 'en' && en ? en : he;
}

// ---- display-name helpers for data objects (structural types, so this module has no engine imports)

export const materialName = (m: { nameHe: string; nameEn?: string }, locale?: EngineLocale) => localized(m.nameHe, m.nameEn, locale);
export const materialDescription = (m: { descriptionHe: string; descriptionEn?: string }, locale?: EngineLocale) => localized(m.descriptionHe, m.descriptionEn, locale);
export const productTitle = (p: { titleHe: string; titleEn?: string }, locale?: EngineLocale) => localized(p.titleHe, p.titleEn, locale);
export const productDescription = (p: { descriptionHe: string; descriptionEn?: string }, locale?: EngineLocale) => localized(p.descriptionHe, p.descriptionEn, locale);
/** Supplier finishes, edge options and add-ons (nails) all carry `nameHe` / `nameEn`. */
export const finishName = (f: { nameHe: string; nameEn?: string }, locale?: EngineLocale) => localized(f.nameHe, f.nameEn, locale);
export const edgeOptionName = finishName;
export const addonName = finishName;
export const supplierName = finishName;
export const noteText = (n: { noteHe: string; noteEn?: string }, locale?: EngineLocale) => localized(n.noteHe, n.noteEn, locale);

/** Source with an optional English title / reference. Returns the same object when nothing changes. */
export function localizeSource<S extends { title: string; reference: string; titleEn?: string; referenceEn?: string }>(s: S, locale: EngineLocale = currentLocale): S {
  if (locale !== 'en' || (!s.titleEn && !s.referenceEn)) return s;
  return { ...s, title: localized(s.title, s.titleEn, locale), reference: localized(s.reference, s.referenceEn, locale) };
}

/** Optional note with an optional English sibling (SourcedValue / StockSize). */
export function localizedNote(v: { note?: string; noteEn?: string }, locale: EngineLocale = currentLocale): string | undefined {
  return v.note == null ? undefined : localized(v.note, v.noteEn, locale);
}

import type { DesignParams, ParamsPatch, TemplateId } from '../engine';
import { useDesign } from '../state/designStore';
import { useUi, type Locale } from '../state/uiStore';
import { Chip, Field, UnitInput, inputClass } from './common';

type Text = { he: string; en: string };
export type FieldGroup = 'size' | 'use' | 'build' | 'safety';

type Values = Record<string, unknown>;

export type FieldDef =
  | { kind: 'length'; key: string; label: Text; hint?: Text; group: FieldGroup; min: number; max: number; showIf?: (p: Values) => boolean }
  | { kind: 'mass'; key: string; label: Text; hint?: Text; group: FieldGroup; min: number; max: number; showIf?: (p: Values) => boolean }
  | { kind: 'boolean'; key: string; label: Text; hint?: Text; group: FieldGroup; showIf?: (p: Values) => boolean }
  | { kind: 'choice'; key: string; label: Text; hint?: Text; group: FieldGroup; options: { value: string | number; label: Text }[]; showIf?: (p: Values) => boolean }
  | { kind: 'presets'; key: string; label: Text; hint?: Text; group: FieldGroup; options: { label: Text; set: ParamsPatch }[]; showIf?: (p: Values) => boolean };

export const GROUP_TITLES: Record<FieldGroup, Text> = {
  size: { he: 'מידות', en: 'Size' },
  use: { he: 'שימוש ועומסים', en: 'Use and loads' },
  build: { he: 'מבנה', en: 'Construction' },
  safety: { he: 'ילדים, פתחים ומסגרת בית', en: 'Children, openings and house frame' },
};

const MATTRESS_SIZES: [number, number][] = [
  [600, 1200],
  [700, 1400],
  [700, 1600],
  [800, 1900],
  [900, 1900],
  [900, 2000],
  [1400, 1900],
  [1600, 2000],
  [1800, 2000],
];

const DISTRIBUTION: FieldDef = {
  kind: 'choice',
  key: 'topLoadDistribution',
  label: { he: 'אופן העומס', en: 'Load distribution' },
  group: 'use',
  options: [
    { value: 'uniform', label: { he: 'מפוזר לאורך המשטח', en: 'Spread along the top' } },
    { value: 'point_center', label: { he: 'מרוכז במרכז (אדם יושב)', en: 'Concentrated at the centre (a person sitting)' } },
  ],
};

export const TEMPLATE_FIELDS: Partial<Record<TemplateId, FieldDef[]>> = {
  bed: [
    {
      kind: 'presets',
      key: 'mattress',
      label: { he: 'מידת מזרן נפוצה', en: 'Common mattress size' },
      hint: { he: 'או הקלידו כל מידה למטה', en: 'Or type any size below' },
      group: 'size',
      options: MATTRESS_SIZES.map(([w, l]) => ({ label: { he: `${w / 10}×${l / 10}`, en: `${w / 10}×${l / 10}` }, set: { mattressWidthMm: w, mattressLengthMm: l } })),
    },
    { kind: 'length', key: 'mattressWidthMm', label: { he: 'רוחב מזרן', en: 'Mattress width' }, group: 'size', min: 50, max: 180 },
    { kind: 'length', key: 'mattressLengthMm', label: { he: 'אורך מזרן', en: 'Mattress length' }, group: 'size', min: 100, max: 210 },
    { kind: 'length', key: 'mattressThicknessMm', label: { he: 'עובי מזרן', en: 'Mattress thickness' }, group: 'size', min: 5, max: 35 },
    {
      kind: 'choice',
      key: 'sleepers',
      label: { he: 'כמה ישנים', en: 'Sleepers' },
      group: 'use',
      options: [
        { value: 1, label: { he: 'אחד', en: 'One' } },
        { value: 2, label: { he: 'שניים', en: 'Two' } },
      ],
    },
    {
      kind: 'mass',
      key: 'sleeperMassKg',
      label: { he: 'משקל לחישוב, לכל ישן', en: 'Design mass per sleeper' },
      hint: {
        he: 'ברירת המחדל 110 ק"ג — המשקל שתקן המיטות EN 1725 מניח. גם במיטת ילד כדאי להשאיר: מבוגר נשכב לידו.',
        en: 'Default 110 kg — the user mass the bed standard EN 1725 assumes. Keep it for a child’s bed too: an adult lies down next to them.',
      },
      group: 'use',
      min: 5,
      max: 150,
    },
    { kind: 'mass', key: 'mattressMassKg', label: { he: 'משקל המזרן', en: 'Mattress mass' }, group: 'use', min: 0, max: 80 },
    { kind: 'length', key: 'railHeightMm', label: { he: 'גובה הדפנות מהרצפה', en: 'Rail height from the floor' }, group: 'build', min: 15, max: 60 },
    { kind: 'length', key: 'deckHeightMm', label: { he: 'גובה משטח הדקים', en: 'Slat deck height' }, hint: { he: 'המזרן מונח בגובה הזה', en: 'The mattress sits at this height' }, group: 'build', min: 12, max: 50 },
    { kind: 'length', key: 'headboardHeightMm', label: { he: 'גובה ראש מיטה', en: 'Headboard height' }, hint: { he: '0 = בלי ראש מיטה', en: '0 = no headboard' }, group: 'build', min: 0, max: 120 },
    { kind: 'boolean', key: 'centerSupport', label: { he: 'תמיכה מרכזית לדקים', en: 'Centre support for the slats' }, hint: { he: 'חוצה את מפתח הדקים — חזק הרבה יותר', en: 'Halves the slat span — much stiffer' }, group: 'build' },
    { kind: 'length', key: 'slatWidthMm', label: { he: 'רוחב דק', en: 'Slat width' }, group: 'build', min: 10, max: 20 },
    { kind: 'length', key: 'slatGapMm', label: { he: 'מרווח בין דקים', en: 'Gap between slats' }, group: 'build', min: 1, max: 12 },
    { kind: 'length', key: 'mattressGapMm', label: { he: 'מרווח סביב המזרן', en: 'Gap around the mattress' }, group: 'build', min: 0, max: 5 },
    {
      kind: 'boolean',
      key: 'childBed',
      label: { he: 'מיטת ילד — להחיל כללי בטיחות ילדים', en: 'Child’s bed — apply child-safety rules' },
      hint: { he: 'פתחים, מרווח מזרן, קצוות, צבעים', en: 'Openings, mattress gap, edges, paints' },
      group: 'safety',
    },
    {
      kind: 'length',
      key: 'entryOpeningMm',
      label: { he: 'פתח כניסה בדופן', en: 'Entry opening in the rail' },
      hint: { he: '0 = דופן סגורה. פתח של 9–23 ס"מ חסום (סכנת לכידה)', en: '0 = closed rail. An opening of 9–23 cm is blocked (entrapment hazard)' },
      group: 'safety',
      min: 0,
      max: 120,
    },
    { kind: 'boolean', key: 'houseFrame', label: { he: 'מסגרת בית', en: 'House frame' }, group: 'safety' },
    { kind: 'length', key: 'houseWallHeightMm', label: { he: 'גובה קירות הבית', en: 'House wall height' }, group: 'safety', min: 60, max: 160, showIf: (p) => p.houseFrame === true },
  ],
  table: [
    { kind: 'length', key: 'widthMm', label: { he: 'רוחב', en: 'Width' }, group: 'size', min: 30, max: 240 },
    { kind: 'length', key: 'heightMm', label: { he: 'גובה', en: 'Height' }, group: 'size', min: 25, max: 110 },
    { kind: 'length', key: 'depthMm', label: { he: 'עומק', en: 'Depth' }, group: 'size', min: 25, max: 120 },
    { kind: 'mass', key: 'topLoadKg', label: { he: 'עומס על המשטח', en: 'Load on the top' }, hint: { he: 'אם יושבים — משקל האדם', en: 'If people sit on it — their mass' }, group: 'use', min: 0, max: 250 },
    DISTRIBUTION,
    { kind: 'boolean', key: 'middleSupport', label: { he: 'דופן אמצעית', en: 'Middle panel' }, hint: { he: 'חוצה את מפתח המשטח', en: 'Halves the span of the top' }, group: 'build' },
    { kind: 'boolean', key: 'hasApron', label: { he: 'קורת חיזוק אחורית', en: 'Back rail' }, hint: { he: 'מונעת התנדנדות לצדדים', en: 'Stops sideways wobble' }, group: 'build' },
    { kind: 'length', key: 'apronHeightMm', label: { he: 'גובה קורת החיזוק', en: 'Back rail height' }, group: 'build', min: 10, max: 40, showIf: (p) => p.hasApron === true },
    { kind: 'length', key: 'lowerShelfHeightMm', label: { he: 'גובה מדף תחתון', en: 'Lower shelf height' }, hint: { he: '0 = בלי מדף', en: '0 = no shelf' }, group: 'build', min: 0, max: 80 },
    { kind: 'mass', key: 'lowerShelfLoadKg', label: { he: 'עומס מדף תחתון', en: 'Lower shelf load' }, group: 'use', min: 0, max: 100, showIf: (p) => Number(p.lowerShelfHeightMm) > 0 },
  ],
  chair: [
    { kind: 'length', key: 'seatWidthMm', label: { he: 'רוחב מושב', en: 'Seat width' }, group: 'size', min: 25, max: 70 },
    { kind: 'length', key: 'seatHeightMm', label: { he: 'גובה מושב', en: 'Seat height' }, group: 'size', min: 20, max: 70 },
    { kind: 'length', key: 'depthMm', label: { he: 'עומק', en: 'Depth' }, group: 'size', min: 25, max: 70 },
    { kind: 'length', key: 'backHeightMm', label: { he: 'גובה משענת', en: 'Backrest height' }, group: 'size', min: 30, max: 110 },
    {
      kind: 'mass',
      key: 'userMassKg',
      label: { he: 'משקל לחישוב', en: 'Design mass' },
      hint: { he: 'גם בכיסא ילד כדאי להשאיר משקל מבוגר — מבוגרים יושבים עליו', en: 'Keep an adult mass for a child’s chair too — adults sit on it' },
      group: 'use',
      min: 10,
      max: 150,
    },
  ],
  pullup: [
    { kind: 'length', key: 'widthMm', label: { he: 'רוחב', en: 'Width' }, group: 'size', min: 70, max: 150 },
    { kind: 'length', key: 'heightMm', label: { he: 'גובה', en: 'Height' }, group: 'size', min: 150, max: 240 },
    { kind: 'length', key: 'footLengthMm', label: { he: 'אורך רגלי הבסיס', en: 'Foot length' }, group: 'size', min: 60, max: 160 },
    { kind: 'length', key: 'uprightWidthMm', label: { he: 'רוחב עמוד', en: 'Upright width' }, group: 'build', min: 15, max: 40 },
    { kind: 'mass', key: 'userMassKg', label: { he: 'משקל משתמש', en: 'User mass' }, group: 'use', min: 20, max: 150 },
  ],
};

export function fieldsFor(p: DesignParams, groups: FieldGroup[]): FieldDef[] {
  const values = p as unknown as Values;
  return (TEMPLATE_FIELDS[p.template] ?? []).filter((f) => groups.includes(f.group) && (!f.showIf || f.showIf(values)));
}

function Hint({ text }: { text: string }) {
  return <span className="mt-1 block text-[13px] leading-snug text-muted">{text}</span>;
}

export function TemplateFields({ groups }: { groups: FieldGroup[] }) {
  const p = useDesign((s) => s.params);
  const update = useDesign((s) => s.update);
  const locale = useUi((s) => s.locale) as Locale;
  const values = p as unknown as Values;
  const L = (t: Text) => t[locale];
  const cmUnit = locale === 'he' ? 'ס"מ' : 'cm';
  const kgUnit = locale === 'he' ? 'ק"ג' : 'kg';
  const set = (key: string, v: unknown) => update({ [key]: v } as ParamsPatch, key);

  return (
    <div className="flex flex-col gap-3">
      {fieldsFor(p, groups).map((f) => {
        const hint = f.hint && L(f.hint);
        switch (f.kind) {
          case 'length':
            return (
              <Field key={f.key} label={L(f.label)}>
                <UnitInput ariaLabel={L(f.label)} value={Number(values[f.key])} scale={10} unit={cmUnit} min={f.min} max={f.max} onChange={(v) => set(f.key, v)} />
                {hint && <Hint text={hint} />}
              </Field>
            );
          case 'mass':
            return (
              <Field key={f.key} label={L(f.label)}>
                <UnitInput ariaLabel={L(f.label)} value={Number(values[f.key])} unit={kgUnit} min={f.min} max={f.max} onChange={(v) => set(f.key, v)} />
                {hint && <Hint text={hint} />}
              </Field>
            );
          case 'boolean':
            return (
              <label key={f.key} className="flex min-h-10 items-center gap-3 text-[15px]">
                <input type="checkbox" checked={values[f.key] === true} onChange={(e) => set(f.key, e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
                <span>
                  {L(f.label)}
                  {hint && <span className="block text-[13px] text-muted">{hint}</span>}
                </span>
              </label>
            );
          case 'choice':
            return (
              <Field key={f.key} label={L(f.label)} hint={hint}>
                <select
                  className={inputClass}
                  value={String(values[f.key])}
                  onChange={(e) => {
                    const opt = f.options.find((o) => String(o.value) === e.target.value);
                    if (opt) set(f.key, opt.value);
                  }}
                >
                  {f.options.map((o) => (
                    <option key={String(o.value)} value={String(o.value)}>
                      {L(o.label)}
                    </option>
                  ))}
                </select>
              </Field>
            );
          case 'presets':
            return (
              <Field key={f.key} label={L(f.label)} hint={hint}>
                <div className="flex flex-wrap gap-2">
                  {f.options.map((o) => {
                    const selected = Object.entries(o.set).every(([k, v]) => values[k] === v);
                    return (
                      <Chip key={L(o.label)} selected={selected} onClick={() => update(o.set)}>
                        <span className="num">{L(o.label)}</span>
                      </Chip>
                    );
                  })}
                </div>
              </Field>
            );
        }
      })}
    </div>
  );
}

import { allMaterials, getMaterial, propertiesFor, type FinishSpec, type LoadDistribution, type OpenShelfParams } from '../engine';
import { useDesign } from '../state/designStore';
import { Field, Section, inputClass } from './common';

function NumberInput({ value, onChange, min, max, step = 1, suffix }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[#9a5b2e]" />
      <div className="relative w-24">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className={`${inputClass} pl-8`}
        />
        {suffix && <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted">{suffix}</span>}
      </div>
    </div>
  );
}

const LOAD_PRESETS: { label: string; massKg: number; distribution: LoadDistribution }[] = [
  { label: 'ספרים (מדף מלא)', massKg: 25, distribution: 'uniform' },
  { label: 'חפצי נוי', massKg: 8, distribution: 'uniform' },
  { label: 'פריט כבד במרכז', massKg: 20, distribution: 'point_center' },
];

export function ParamsPanel() {
  const p = useDesign((s) => s.params);
  const update = useDesign((s) => s.update);
  const userMode = useDesign((s) => s.userMode);
  const set = <K extends keyof OpenShelfParams>(key: K, value: OpenShelfParams[K]) => update({ [key]: value } as Partial<OpenShelfParams>, key);

  const material = getMaterial(p.materialId);
  const structural = allMaterials().filter((m) => m.structuralUse);
  const backMaterials = allMaterials().filter((m) => m.id === 'birch_plywood' || !m.structuralUse);
  const backMaterial = getMaterial(p.backMaterialId);
  const setFinish = (patch: Partial<FinishSpec>) => update({ finish: { ...p.finish, ...patch } }, 'finish');

  return (
    <div className="text-sm">
      <Section title="מידות חיצוניות">
        <Field label="רוחב">
          <NumberInput value={p.widthMm} onChange={(v) => set('widthMm', v)} min={200} max={2400} step={10} suffix='מ"מ' />
        </Field>
        <Field label="גובה">
          <NumberInput value={p.heightMm} onChange={(v) => set('heightMm', v)} min={200} max={2700} step={10} suffix='מ"מ' />
        </Field>
        <Field label="עומק">
          <NumberInput value={p.depthMm} onChange={(v) => set('depthMm', v)} min={150} max={800} step={5} suffix='מ"מ' />
        </Field>
      </Section>

      <Section title="חלוקה">
        <Field label="מדפים ביניים">
          <NumberInput value={p.shelfCount} onChange={(v) => set('shelfCount', Math.round(v))} min={0} max={12} />
        </Field>
        <Field label="מחיצות אנכיות">
          <NumberInput value={p.dividerCount} onChange={(v) => set('dividerCount', Math.round(v))} min={0} max={6} />
        </Field>
        {userMode === 'advanced' && (
          <Field label="גובה סוקל" hint="0 = ללא">
            <NumberInput value={p.plinthHeightMm} onChange={(v) => set('plinthHeightMm', v)} min={0} max={200} step={5} suffix='מ"מ' />
          </Field>
        )}
      </Section>

      <Section title="חומר">
        <Field label="חומר גוף">
          <select
            className={inputClass}
            value={p.materialId}
            onChange={(e) => {
              const m = getMaterial(e.target.value)!;
              const t = m.thicknessesMm.includes(p.thicknessMm) ? p.thicknessMm : (m.thicknessesMm.find((x) => propertiesFor(m, x)) ?? m.thicknessesMm[0]);
              update({ materialId: m.id, thicknessMm: t });
            }}
          >
            {structural.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nameHe}
              </option>
            ))}
          </select>
        </Field>
        {material && <p className="text-[11px] leading-snug text-muted">{material.descriptionHe}</p>}
        <Field label="עובי">
          <select className={inputClass} value={p.thicknessMm} onChange={(e) => update({ thicknessMm: Number(e.target.value) })}>
            {material?.thicknessesMm.map((t) => (
              <option key={t} value={t}>
                {t} מ"מ{propertiesFor(material, t) ? '' : ' — אין נתוני חוזק'}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.hasBack} onChange={(e) => update({ hasBack: e.target.checked })} className="accent-[#9a5b2e]" />
          גב מחובר
        </label>
        {p.hasBack && userMode === 'advanced' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="חומר גב">
              <select
                className={inputClass}
                value={p.backMaterialId}
                onChange={(e) => {
                  const m = getMaterial(e.target.value)!;
                  update({ backMaterialId: m.id, backThicknessMm: m.thicknessesMm[0] });
                }}
              >
                {backMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nameHe}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="עובי גב">
              <select className={inputClass} value={p.backThicknessMm} onChange={(e) => update({ backThicknessMm: Number(e.target.value) })}>
                {backMaterial?.thicknessesMm.map((t) => (
                  <option key={t} value={t}>
                    {t} מ"מ
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </Section>

      <Section title="עומס לכל מדף">
        <div className="flex flex-wrap gap-1.5">
          {LOAD_PRESETS.map((l) => (
            <button
              key={l.label}
              onClick={() => update({ loadPerShelf: l })}
              className={`rounded-full px-2.5 py-1 text-xs ring-1 ${p.loadPerShelf.label === l.label ? 'bg-accent text-white ring-accent' : 'bg-white ring-line hover:bg-accent-soft'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <Field label="משקל מתוכנן">
          <NumberInput value={p.loadPerShelf.massKg} onChange={(v) => update({ loadPerShelf: { ...p.loadPerShelf, label: 'מותאם', massKg: v } }, 'load')} min={0} max={150} suffix='ק"ג' />
        </Field>
        <Field label="פיזור">
          <select className={inputClass} value={p.loadPerShelf.distribution} onChange={(e) => update({ loadPerShelf: { ...p.loadPerShelf, label: 'מותאם', distribution: e.target.value as LoadDistribution } })}>
            <option value="uniform">מפוזר לאורך המדף</option>
            <option value="point_center">מרוכז במרכז</option>
          </select>
        </Field>
      </Section>

      <Section title="גימור וצבע">
        <p className="text-[11px] text-muted">הצבע הוא מאפיין תצוגה בלבד ואינו משנה את החישוב ההנדסי.</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="סוג">
            <select className={inputClass} value={p.finish.type} onChange={(e) => setFinish({ type: e.target.value as FinishSpec['type'] })}>
              <option value="natural">טבעי</option>
              <option value="lacquered">לכה שקופה</option>
              <option value="stained">בייץ</option>
              <option value="painted">צבע</option>
            </select>
          </Field>
          <Field label="ברק">
            <select className={inputClass} value={p.finish.sheen} onChange={(e) => setFinish({ sheen: e.target.value as FinishSpec['sheen'] })}>
              <option value="matte">מט</option>
              <option value="satin">סאטן</option>
              <option value="gloss">מבריק</option>
            </select>
          </Field>
        </div>
        {(p.finish.type === 'painted' || p.finish.type === 'stained') && (
          <Field label="צבע">
            <input type="color" value={p.finish.color} onChange={(e) => setFinish({ color: e.target.value })} className="h-9 w-full cursor-pointer rounded-md border border-line" />
          </Field>
        )}
        {userMode === 'advanced' && (
          <Field label="קנט בחזית" hint="0 = ללא">
            <select className={inputClass} value={p.edgeBandMm} onChange={(e) => update({ edgeBandMm: Number(e.target.value) })}>
              {[0, 0.5, 1, 2].map((t) => (
                <option key={t} value={t}>
                  {t === 0 ? 'ללא' : `${t} מ"מ`}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Section>
    </div>
  );
}

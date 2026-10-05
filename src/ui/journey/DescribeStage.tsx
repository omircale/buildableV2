import { useMemo, useState } from 'react';
import { EQUIPMENT } from '../../engine';
import { useT } from '../../i18n';
import { useSurvey } from '../../state/spaceStore';
import { useUi } from '../../state/uiStore';
import { Button, inputClass } from '../common';
import { interpretSpace, type SpaceClaim } from '../survey/interpretSpace';

const metres = (mm: number) => (mm / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Whether a claim is taken by default. A unit the person did not say has to be ticked by them. */
const takenByDefault = (c: SpaceClaim) => (c.field === 'size' || c.field === 'height' ? c.unitStated : c.field !== 'open');

export function DescribeStage({ onDone }: { onDone: () => void }) {
  const t = useT();
  const d = t.journey.describe;
  const he = useUi((s) => s.locale) === 'he';
  const text = useSurvey((s) => s.describeText);
  const setText = useSurvey((s) => s.setDescribeText);
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [ticked, setTicked] = useState<Set<number>>(new Set());

  const reading = useMemo(() => interpretSpace(text), [text]);
  const isOn = (i: number, c: SpaceClaim) => (takenByDefault(c) ? !unticked.has(i) : ticked.has(i));
  const toggle = (i: number, c: SpaceClaim) => {
    const flip = (set: Set<number>) => {
      const next = new Set(set);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    };
    if (takenByDefault(c)) setUnticked(flip);
    else setTicked(flip);
  };

  const describeClaim = (c: SpaceClaim): string => {
    switch (c.field) {
      case 'equipment': {
        const item = EQUIPMENT.find((e) => e.id === c.equipmentId);
        const name = item ? (he ? item.nameHe : item.nameEn) : c.equipmentId;
        return c.count > 1 ? `${name} ×${c.count}` : name;
      }
      case 'size':
        return d.sizeClaim(metres(c.widthMm), metres(c.depthMm));
      case 'height':
        return d.heightClaim(metres(c.heightMm));
      case 'name':
        return d.nameClaim(c.name);
      case 'open':
        return d.openClaim;
    }
  };

  const apply = () => {
    const st = useSurvey.getState();
    reading.claims.forEach((c, i) => {
      if (!isOn(i, c)) return;
      if (c.field === 'equipment') st.setEquipmentCount(c.equipmentId, c.count);
      if (c.field === 'size') st.setRectangle(c.widthMm, c.depthMm);
      if (c.field === 'height') st.setHeight(c.heightMm);
      if (c.field === 'name') st.setName(c.name);
    });
    onDone();
  };

  const reset = (value: string) => {
    setText(value);
    setUnticked(new Set());
    setTicked(new Set());
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <label className="block text-[0.875rem] font-semibold" htmlFor="describe-text">
          {d.label}
        </label>
        <textarea id="describe-text" rows={5} className={`${inputClass} h-auto py-2.5 leading-relaxed`} placeholder={d.placeholder} value={text} onChange={(e) => reset(e.target.value)} />
        <div className="space-y-1.5">
          <div className="text-[0.7812rem] text-muted">{d.examplesTitle}</div>
          <div className="flex flex-col items-start gap-1.5">
            {d.examples.map((ex) => (
              <button key={ex} type="button" className="rounded-lg border border-line px-3 py-1.5 text-start text-[0.8125rem] hover:bg-sunken" onClick={() => reset(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[0.7812rem] leading-relaxed text-muted">{d.lexiconNote}</p>
      </div>

      <div className="space-y-4">
        <section>
          <h3 className="text-[0.875rem] font-semibold">{d.understood}</h3>
          {reading.claims.length === 0 ? (
            <p className="mt-1 text-[0.8125rem] text-muted">{d.nothingYet}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {reading.claims.map((c, i) => (
                <li key={`${c.field}-${i}`} className="rounded-lg border border-line px-3 py-2">
                  <label className="flex items-start gap-2.5">
                    {c.field === 'open' ? (
                      <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-unknown-soft" aria-hidden />
                    ) : (
                      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]" checked={isOn(i, c)} onChange={() => toggle(i, c)} />
                    )}
                    <span className="min-w-0">
                      <span className="block text-[0.875rem]">{describeClaim(c)}</span>
                      <span className="block text-[0.75rem] text-muted">{d.from(c.source)}</span>
                      {(c.field === 'size' || c.field === 'height') && !c.unitStated && <span className="mt-0.5 block text-[0.75rem] text-warn">{d.unitInferred}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        {reading.unread.length > 0 && (
          <section className="rounded-xl bg-unknown-soft px-4 py-3">
            <h3 className="text-[0.8438rem] font-semibold">{d.notUnderstood}</h3>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {reading.unread.map((u, i) => (
                // A person can write the same unknown phrase twice, so the phrase alone is not a key.
                <li key={`${i}-${u}`} className="rounded-md bg-panel px-2 py-0.5 text-[0.8125rem]">
                  {u}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[0.7812rem] leading-snug text-muted">{d.notUnderstoodHint}</p>
          </section>
        )}

        <Button variant="primary" disabled={!reading.claims.some((c, i) => c.field !== 'open' && isOn(i, c))} onClick={apply}>
          {d.apply}
        </Button>
      </div>
    </div>
  );
}

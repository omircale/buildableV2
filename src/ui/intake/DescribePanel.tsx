import { useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { Button, inputClass } from '../common';
import { FURNITURE_TYPES, type FurnitureKind, type SpaceCm } from '../furnitureCatalog';
import { IconChevron } from '../icons';
import { gapsIn, kindFrom, readDescription, spaceFrom, intendedUse, type Claim, type Gap } from './interpret';

/**
 * Describe the piece in your own words and go straight to the editor.
 *
 * What the text was understood to say is shown as chips with the words each came from, so a wrong
 * reading is visible before it becomes a design. What could not be read is shown too, as a question —
 * a person who wrote "up to the ceiling" believes they gave a height, and the honest response is to
 * say we did not get one and ask, not to pick a number for them.
 */
export function DescribePanel({ onStart }: { onStart: (kind: FurnitureKind, space: SpaceCm, use: ReturnType<typeof intendedUse>) => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const [answers, setAnswers] = useState<Partial<Record<Gap, string>>>({});

  const reading = useMemo(() => readDescription(text), [text]);
  const claims = reading.claims;
  const gaps = useMemo(() => gapsIn(claims, reading.unread), [claims, reading.unread]);

  const answeredSpace = (): SpaceCm => {
    const base = spaceFrom(claims);
    const num = (g: Gap) => {
      const v = Number(answers[g]);
      return answers[g] && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
    };
    return { w: base.w ?? num('width'), h: base.h ?? num('height'), d: base.d ?? num('depth') };
  };

  const kind = kindFrom(claims) ?? ((answers.kind as FurnitureKind | undefined) ?? null);
  const ready = Boolean(text.trim()) && kind != null;

  const start = () => {
    if (!kind) return;
    onStart(kind, answeredSpace(), intendedUse(claims));
  };

  const available = FURNITURE_TYPES.filter((f) => f.available);

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-panel p-6 ring-1 ring-line" aria-label={t.intake.title}>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[22px] leading-tight font-bold">{t.intake.title}</h2>
        <p className="text-[15px] leading-relaxed text-muted">{t.intake.subtitle}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ready && start()}
          placeholder={t.intake.placeholder}
          aria-label={t.intake.title}
          className={`${inputClass} h-12 flex-1 text-[16px]`}
        />
        <Button variant="primary" size="lg" onClick={start} disabled={!ready}>
          {t.intake.open}
          <IconChevron size={18} className="ltr:rotate-180" />
        </Button>
      </div>

      {!text.trim() && (
        <ul className="flex flex-wrap gap-2">
          {t.intake.examples.map((ex) => (
            <li key={ex}>
              <button type="button" onClick={() => setText(ex)} className="rounded-full bg-sunken px-3 py-1.5 text-[13px] text-muted hover:text-ink">
                {ex}
              </button>
            </li>
          ))}
        </ul>
      )}

      {text.trim() && (
        <div className="flex flex-col gap-3">
          {claims.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-muted">{t.intake.understood}</span>
              <ul className="flex flex-wrap gap-2">
                {claims.map((c, i) => (
                  <li key={`${c.field}-${i}`} className="rounded-lg bg-ok-soft px-3 py-1.5 text-[14px] text-ok">
                    {claimLabel(c, t)}
                    <span className="text-[12px] opacity-70"> · “{c.source}”</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reading.unread.length > 0 && (
            <p className="text-[14px] leading-relaxed text-warn">{t.intake.notUnderstood(reading.unread.map((u) => `“${u.phrase}”`).join(', '))}</p>
          )}

          {gaps.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-muted">{t.intake.stillNeeded}</span>
              <div className="flex flex-wrap items-end gap-3">
                {gaps.includes('kind') && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[13px] text-muted">{t.intake.whichPiece}</span>
                    <select value={answers.kind ?? ''} onChange={(e) => setAnswers({ ...answers, kind: e.target.value })} className={`${inputClass} w-56`}>
                      <option value="">{t.intake.choose}</option>
                      {available.map((f) => (
                        <option key={f.kind} value={f.kind}>
                          {t.furniture[f.kind].name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {(['width', 'height', 'depth'] as const)
                  .filter((g) => gaps.includes(g))
                  .map((g) => (
                    <label key={g} className="flex flex-col gap-1">
                      <span className="text-[13px] text-muted">{t.intake.axis[g]}</span>
                      <input
                        type="number"
                        min={1}
                        value={answers[g] ?? ''}
                        onChange={(e) => setAnswers({ ...answers, [g]: e.target.value })}
                        placeholder={t.common.cm}
                        className={`${inputClass} w-28`}
                      />
                    </label>
                  ))}
              </div>
              {/* Sizes left blank are not guessed here; the piece opens at its own stated starting size. */}
              <p className="text-[13px] leading-relaxed text-muted">{t.intake.blankNote}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function claimLabel(c: Claim, t: ReturnType<typeof useT>): string {
  switch (c.field) {
    case 'kind':
      return t.furniture[c.kind].name;
    case 'use':
      return t.intake.useLabel(t.setup.loads[c.use].name);
    default:
      return `${t.intake.axis[c.field]} ${c.cm} ${t.common.cm}`;
  }
}

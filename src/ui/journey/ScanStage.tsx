import { useState } from 'react';
import { useT } from '../../i18n';
import { useSurvey } from '../../state/spaceStore';
import { SECTORS } from '../../engine';
import { Button, Chip } from '../common';
import { IconCheck, IconX } from '../icons';
import { NullableCm } from '../survey/SurveyEditor';

/**
 * What a scan will feel like, drawn rather than performed.
 *
 * Nothing on this screen measures anything. A real scan needs a native iOS app on a phone with LiDAR,
 * so the drawing plays out what that app would return — and says, inside the phone itself, that it is
 * a simulation. It also draws the one thing a scan cannot see, the drain behind the wall, because that
 * limit is what the next steps exist to fill.
 */
function ScanAnimation({ play }: { play: number }) {
  const t = useT();
  const s = t.journey.scan;
  return (
    <div className="mx-auto w-[240px] rounded-[34px] border-[6px] border-ink/85 bg-ink/85 p-1.5 shadow-lg">
      <div className="overflow-hidden rounded-[26px] bg-[#1d2427]">
        <svg key={play} viewBox="0 0 200 250" className="scan-svg block w-full" role="img" aria-label={s.phoneCaption}>
          <style>{`
            .scan-svg .draw { stroke-dasharray: 560; stroke-dashoffset: 560; animation: scan-draw 2.2s ease-out forwards; }
            .scan-svg .appear { opacity: 0; animation: scan-appear .5s ease-out forwards; }
            .scan-svg .sweep { animation: scan-sweep 2.2s ease-in-out forwards; }
            .scan-svg .pulse { opacity: 0; transform-origin: center; transform-box: fill-box; animation: scan-appear .5s ease-out 3.7s forwards, scan-pulse 1.4s ease-in-out 4.4s infinite; }
            @keyframes scan-draw { to { stroke-dashoffset: 0; } }
            @keyframes scan-appear { to { opacity: 1; } }
            @keyframes scan-sweep { 0% { transform: translateY(0); opacity: .9; } 100% { transform: translateY(150px); opacity: 0; } }
            @keyframes scan-pulse { 50% { transform: scale(1.25); } }
            @media (prefers-reduced-motion: reduce) {
              .scan-svg .draw { animation: none; stroke-dashoffset: 0; }
              .scan-svg .appear, .scan-svg .pulse { animation: none; opacity: 1; }
              .scan-svg .sweep { display: none; }
            }
          `}</style>

          <text x="100" y="22" textAnchor="middle" fontSize="8.5" fill="#f1b27e" direction="rtl">
            {s.phoneCaption}
          </text>

          <rect className="sweep" x="20" y="40" width="160" height="3" rx="1.5" fill="#f1b27e" opacity=".9" />

          {/* Three built walls; the fourth side is open to the deck. */}
          <path className="draw" d="M30 190 V50 H170 V190" fill="none" stroke="#e9e4da" strokeWidth="3" strokeLinejoin="round" />
          <path className="appear" style={{ animationDelay: '2.2s' }} d="M30 190 H170" stroke="#f1b27e" strokeWidth="2" strokeDasharray="6 5" />
          <text className="appear" style={{ animationDelay: '2.3s' }} x="100" y="206" textAnchor="middle" fontSize="8" fill="#f1b27e" direction="rtl">
            {s.detected.open}
          </text>

          <text className="appear" style={{ animationDelay: '2.4s', direction: 'ltr', unicodeBidi: 'isolate' }} x="100" y="44" textAnchor="middle" fontSize="8" fill="#e9e4da">
            7.20 m
          </text>

          {/* A door in the left wall. */}
          <g className="appear" style={{ animationDelay: '2.6s' }}>
            <rect x="26" y="70" width="8" height="30" fill="#1d2427" />
            <path d="M34 70 A30 30 0 0 1 64 100" fill="none" stroke="#9fb0b4" strokeWidth="1.2" />
            <text x="46" y="118" fontSize="7.5" fill="#9fb0b4" direction="rtl">
              {s.detected.door}
            </text>
          </g>

          {/* Large equipment the scan recognises. */}
          <g className="appear" style={{ animationDelay: '3s' }}>
            <rect x="98" y="54" width="34" height="18" rx="3" fill="#2f5d62" stroke="#7fc3c9" />
            <text x="115" y="66" textAnchor="middle" fontSize="7.5" fill="#e9e4da">
              {s.detected.sink}
            </text>
          </g>
          <g className="appear" style={{ animationDelay: '3.3s' }}>
            <rect x="136" y="54" width="28" height="18" rx="3" fill="#2f5d62" stroke="#7fc3c9" />
            <text x="150" y="66" textAnchor="middle" fontSize="7.5" fill="#e9e4da">
              {s.detected.fridge}
            </text>
          </g>

          {/* What it cannot see: the drain in the wall. */}
          <g className="pulse">
            <circle cx="170" cy="120" r="9" fill="#b5652b" />
            <text x="170" y="124" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
              ?
            </text>
          </g>
          <text className="appear" style={{ animationDelay: '3.9s' }} x="156" y="146" textAnchor="end" fontSize="7.5" fill="#f1b27e" direction="rtl">
            {s.notDetected}
          </text>
        </svg>
      </div>
    </div>
  );
}

export function ScanStage({ onDone }: { onDone: () => void }) {
  const t = useT();
  const s = t.journey.scan;
  const survey = useSurvey();
  const [play, setPlay] = useState(0);

  // A person's own measurement replaces the example outright — it never lands on top of invented walls.
  const own = (apply: (st: ReturnType<typeof useSurvey.getState>) => void) => {
    useSurvey.getState().clearSample();
    apply(useSurvey.getState());
  };

  return (
    <div className="space-y-8">
      {/* What a person can do today comes first; the scan that will one day do it for them comes after. */}
      <div className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-body font-semibold">{s.ownTitle}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-small text-muted">{t.survey.sectorLabel}</span>
              {(['all', ...SECTORS] as const).map((k) => (
                <Chip key={k} selected={survey.sector === k} onClick={() => survey.setSector(k)}>
                  {t.survey.sectors[k]}
                </Chip>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <NullableCm label={t.survey.width} value={survey.sample ? null : survey.widthMm} onChange={(v) => own((st) => st.setRectangle(v, st.depthMm))} />
              <NullableCm label={t.survey.depth} value={survey.sample ? null : survey.depthMm} onChange={(v) => own((st) => st.setRectangle(st.widthMm, v))} />
              <NullableCm label={t.survey.height} value={survey.sample ? null : survey.space.heightMm} onChange={(v) => own((st) => st.setHeight(v))} />
            </div>
            <Button variant="primary" disabled={survey.sample || survey.widthMm == null || survey.depthMm == null} onClick={onDone}>
              {s.useOwn}
            </Button>
          </div>
        <div className="flex flex-wrap items-center gap-3 text-small text-muted">
          {s.or}
          <div>
            <Button
                            onClick={() => {
                survey.loadSample();
                onDone();
              }}
            >
              {s.useSample}
            </Button>
          </div>

        </div>
      </div>

      <h3 className="border-t border-line pt-6 text-body font-semibold">{s.scanTitle}</h3>
    <div className="grid gap-8 md:grid-cols-[260px_minmax(0,1fr)]">
      <div className="space-y-3 text-center">
        <ScanAnimation play={play} />
        <button type="button" className="text-small text-muted underline underline-offset-2" onClick={() => setPlay((n) => n + 1)}>
          {s.replay}
        </button>
      </div>

      <div className="space-y-5">
        <section>
          <h3 className="text-body font-semibold">{s.howTitle}</h3>
          <p className="mt-1 max-w-prose text-body leading-relaxed text-muted">{s.howBody}</p>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl bg-ok-soft px-4 py-3">
            <h3 className="text-small font-semibold">{s.seesTitle}</h3>
            <ul className="mt-1.5 space-y-1 text-small">
              {s.sees.map((x) => (
                <li key={x} className="flex items-start gap-1.5">
                  <IconCheck size={16} className="mt-0.5 shrink-0 text-ok" />
                  {x}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl bg-warn-soft px-4 py-3">
            <h3 className="text-small font-semibold">{s.missesTitle}</h3>
            <ul className="mt-1.5 space-y-1 text-small">
              {s.misses.map((x) => (
                <li key={x} className="flex items-start gap-1.5">
                  <IconX size={16} className="mt-0.5 shrink-0 text-warn" />
                  {x}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-small leading-snug text-muted">{s.missesNote}</p>
          </section>
        </div>

        <section className="rounded-xl border border-line px-4 py-3">
          <h3 className="text-small font-semibold">{s.needsTitle}</h3>
          <ul className="mt-1.5 list-disc space-y-0.5 ps-5 text-small text-muted">
            {s.needs.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>

      </div>
    </div>
    </div>
  );
}

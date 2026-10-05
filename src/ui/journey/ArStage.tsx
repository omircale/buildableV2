import { lazy, Suspense, useEffect, useState } from 'react';
import type { DesignResult } from '../../engine';
import { useT } from '../../i18n';
import { useDesign } from '../../state/designStore';
import { useUi } from '../../state/uiStore';
import { ArCard } from '../ar/ArCard';
import { arPath, type ArPath } from '../ar/placement';

/** The live session carries its own three.js scene; only a phone that can run it pays for it. */
const ArPlacement = lazy(() => import('../ar/ArPlacement'));

/**
 * AR on site, in its two moments, by whichever path the device in hand can take.
 *
 * Before the order, the designed piece is stood in the real room. A browser that can run a live AR
 * session gets one — place, turn, measure. An iPhone cannot, so it gets the system viewer, which places
 * and nothing more; the screen says which of the two it is offering and why, rather than showing a
 * button that does less than it appears to.
 *
 * After installation, laying the design over what was actually fitted needs the model anchored to a
 * scan of the room, so that half is described, not shown.
 */
export function ArStage({ design, modeLabels }: { design: DesignResult; modeLabels: { live: string; prototype: string } }) {
  const t = useT();
  const a = t.journey.ar;
  const he = useUi((s) => s.locale) === 'he';
  const designName = useDesign((s) => s.projectName);
  const [path, setPath] = useState<ArPath | null>(null);

  useEffect(() => {
    let alive = true;
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    const decide = (live: boolean | null) => alive && setPath(arPath(live, navigator.userAgent, navigator.maxTouchPoints));
    if (!xr) decide(null);
    else
      xr.isSessionSupported('immersive-ar')
        .then(decide)
        .catch(() => decide(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="min-w-0 space-y-3 rounded-xl border border-line p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-[0.75rem] font-medium">{modeLabels.live}</span>
          <h3 className="text-[0.875rem] font-semibold">{path === 'live' ? a.liveTitle : a.beforeTitle}</h3>
        </div>

        {path === null && <p className="text-[0.8438rem] text-muted">{a.checking}</p>}

        {path === 'live' && (
          <>
            <p className="text-[0.8438rem] leading-relaxed text-muted">{a.liveBody}</p>
            <Suspense fallback={<p className="text-[0.8438rem] text-muted">{t.common.loading}</p>}>
              <ArPlacement design={design} designName={designName} he={he} labels={a.live} />
            </Suspense>
            <details className="rounded-lg border border-line">
              <summary className="cursor-pointer px-3 py-2 text-[0.8438rem] font-medium">{a.filesTitle}</summary>
              <div className="px-3 pb-3">
                <ArCard result={design} />
              </div>
            </details>
          </>
        )}

        {(path === 'system-viewer' || path === 'none') && (
          <>
            <p className="text-[0.8438rem] leading-relaxed text-muted">{a.beforeBody}</p>
            <p className="rounded-lg bg-sunken px-3 py-2 text-[0.7812rem] leading-snug">{path === 'system-viewer' ? a.iosNote : a.noneNote}</p>
            <ArCard result={design} />
          </>
        )}
      </section>

      <section className="min-w-0 space-y-3 rounded-xl border border-dashed border-line-strong p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-unknown-soft px-2.5 py-0.5 text-[0.75rem] font-medium">{modeLabels.prototype}</span>
          <h3 className="text-[0.875rem] font-semibold">{a.afterTitle}</h3>
        </div>
        <p className="text-[0.8438rem] leading-relaxed text-muted">{a.afterBody}</p>
        <p className="rounded-lg bg-sunken px-3 py-2 text-[0.7812rem] leading-snug">{a.afterNeeds}</p>
      </section>
    </div>
  );
}

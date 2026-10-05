import { lazy, Suspense, useEffect, useState } from 'react';
import type { DesignResult } from '../../engine';
import { useT } from '../../i18n';
import { useDesign } from '../../state/designStore';
import { Button, IconButton } from '../common';
import { IconX } from '../icons';
import { exportArFile } from './arExport';
import { HostError, hostModel } from './hostModel';

const RoomViewer = lazy(() => import('./RoomViewer'));

/**
 * The room, over the editor rather than after it.
 *
 * Seeing a piece at full size is part of designing it, not a step at the end: if the thing looks
 * wrong standing against the wall, the reason to know that is to go and change it. So this opens on
 * top of the viewport and closes back onto the same design, with the controls still beside it —
 * rather than sending someone to a summary screen and losing their place.
 *
 * One honest limit: on iPhone, placing the model in the room hands off to Quick Look, which is part
 * of the operating system. Editing cannot happen inside it. Coming back returns here, untouched.
 */
export function ArOverlay({ result, onClose }: { result: DesignResult; onClose: () => void }) {
  const t = useT();
  const projectName = useDesign((s) => s.projectName);
  const projectId = useDesign((s) => s.projectId);
  const [urls, setUrls] = useState<{ glb: string; usdz: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [glbFile, usdzFile] = await Promise.all([exportArFile(result, 'glb', { projectName }), exportArFile(result, 'usdz', { projectName })]);
        const id = projectId ?? 'design';
        const [glb, usdz] = await Promise.all([hostModel(glbFile.blob, 'glb', id), hostModel(usdzFile.blob, 'usdz', id)]);
        if (!cancelled) setUrls({ glb, usdz });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof HostError && e.reason === 'not-signed-in' ? t.ar.needsSignIn : (e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-uploading on every dimension nudge would be wasteful; the overlay is opened afresh instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-paper/98" role="dialog" aria-modal="true" aria-label={t.ar.viewInRoom}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h2 className="flex-1 text-control font-semibold">{t.ar.viewInRoom}</h2>
        <IconButton label={t.common.close} onClick={onClose}>
          <IconX size={18} />
        </IconButton>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {error ? (
          <div className="flex max-w-sm flex-col gap-3 text-center">
            <p className="text-control leading-relaxed text-bad">{error}</p>
            <Button variant="secondary" onClick={onClose}>
              {t.ar.backToEditing}
            </Button>
          </div>
        ) : urls ? (
          <Suspense fallback={<p className="text-control text-muted">{t.ar.hosting}</p>}>
            <div className="relative w-full max-w-2xl">
              <RoomViewer glbUrl={urls.glb} usdzUrl={urls.usdz} alt={projectName} arButtonLabel={t.ar.placeInRoom} onArUnavailable={() => setUnavailable(true)} />
            </div>
          </Suspense>
        ) : (
          <p className="text-control text-muted">{t.ar.hosting}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5">
        <p className="flex-1 text-small leading-relaxed text-muted">{unavailable ? t.ar.noArHere : t.ar.editHint}</p>
        <Button variant="primary" onClick={onClose}>
          {t.ar.backToEditing}
        </Button>
      </div>
    </div>
  );
}

import { lazy, Suspense, useState } from 'react';
import type { DesignResult } from '../../engine';
import { useT } from '../../i18n';
import { useDesign } from '../../state/designStore';
import { Button } from '../common';
import { IconDownload } from '../icons';
import { exportArFile, preferredFormat, type ArFormat } from './arExport';
import { HostError, hostModel } from './hostModel';

/** The viewer pulls in a large package; nobody pays for it until they ask to see the piece in the room. */
const RoomViewer = lazy(() => import('./RoomViewer'));

/**
 * Downloads the design as a 3D file at real scale. On iPhone/iPad the USDZ opens straight into AR Quick Look;
 * the GLB is for Android viewers and 3D software. Viewing in the room directly from the site needs the file to
 * be hosted, which comes with deployment.
 */
export function ArCard({ result }: { result: DesignResult }) {
  const t = useT();
  const projectName = useDesign((s) => s.projectName);
  const [busy, setBusy] = useState<ArFormat | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projectId = useDesign((s) => s.projectId);
  const [hosting, setHosting] = useState(false);
  const [room, setRoom] = useState<{ glb: string; usdz: string } | null>(null);
  const [arUnavailable, setArUnavailable] = useState(false);

  /**
   * Quick Look and Scene Viewer fetch a URL; they cannot open a file held in the browser. So seeing
   * the piece in the room means uploading it, behind a link that expires — which is why this asks for
   * a sign-in and says so rather than failing quietly.
   */
  const viewInRoom = async () => {
    setHosting(true);
    setError(null);
    setArUnavailable(false);
    try {
      const [glbFile, usdzFile] = await Promise.all([exportArFile(result, 'glb', { projectName }), exportArFile(result, 'usdz', { projectName })]);
      const id = projectId ?? 'design';
      const [glb, usdz] = await Promise.all([hostModel(glbFile.blob, 'glb', id), hostModel(usdzFile.blob, 'usdz', id)]);
      setRoom({ glb, usdz });
    } catch (e) {
      setError(e instanceof HostError && e.reason === 'not-signed-in' ? t.ar.needsSignIn : (e as Error).message);
    } finally {
      setHosting(false);
    }
  };
  const ios = preferredFormat() === 'usdz';
  // A design with broken geometry would export overlapping or negative parts; everything else may be viewed.
  const geometryBroken = result.report.checks.some((c) => c.category === 'geometry' && c.status === 'RED');

  const download = async (format: ArFormat) => {
    setBusy(format);
    setError(null);
    try {
      const file = await exportArFile(result, format, { projectName });
      const url = URL.createObjectURL(file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDone(t.ar.ready(file.filename, Math.max(1, Math.round(file.bytes / 1024))));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const order: ArFormat[] = ios ? ['usdz', 'glb'] : ['glb', 'usdz'];
  return (
    <section data-ar-card className="flex flex-col gap-3 rounded-xl bg-panel p-5 ring-1 ring-line">
      <h2 className="text-lg font-semibold">{t.ar.title}</h2>
      <p className="text-[15px] leading-relaxed text-muted">{t.ar.intro}</p>
      {geometryBroken ? (
        <p className="rounded-lg bg-bad-soft px-3 py-2 text-[14px] text-bad">{t.ar.blocked}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {order.map((format, i) => (
              <Button key={format} variant={i === 0 ? 'primary' : 'secondary'} disabled={busy != null} onClick={() => void download(format)}>
                <IconDownload size={18} />
                {busy === format ? t.ar.preparing : format === 'usdz' ? t.ar.downloadIos : t.ar.downloadGlb}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" disabled={hosting || busy != null} onClick={() => void viewInRoom()}>
              {hosting ? t.ar.hosting : t.ar.viewInRoom}
            </Button>
            <p className="text-[13px] leading-relaxed text-muted">{t.ar.uploadNote}</p>
          </div>
          {room && (
            <div className="relative">
              <Suspense fallback={<p className="text-[13px] text-muted">{t.ar.hosting}</p>}>
                <RoomViewer glbUrl={room.glb} usdzUrl={room.usdz} alt={projectName} arButtonLabel={t.ar.placeInRoom} onArUnavailable={() => setArUnavailable(true)} />
              </Suspense>
              {arUnavailable && <p className="mt-2 text-[13px] text-muted">{t.ar.noArHere}</p>}
            </div>
          )}
          {done && <p className="num text-[13px] text-ok">{done}</p>}
          {error && <p className="text-[13px] text-bad">{error}</p>}
          <p className="text-[13px] leading-relaxed text-muted">{ios ? t.ar.iosHint : t.ar.androidHint}</p>
          <p className="text-[13px] text-muted">{t.ar.scaleNote}</p>
        </>
      )}
    </section>
  );
}

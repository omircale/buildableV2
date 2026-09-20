import { useState } from 'react';
import type { DesignResult } from '../../engine';
import { useT } from '../../i18n';
import { useDesign } from '../../state/designStore';
import { Button } from '../common';
import { IconDownload } from '../icons';
import { exportArFile, preferredFormat, type ArFormat } from './arExport';

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
          {done && <p className="num text-[13px] text-ok">{done}</p>}
          {error && <p className="text-[13px] text-bad">{error}</p>}
          <p className="text-[13px] leading-relaxed text-muted">{ios ? t.ar.iosHint : t.ar.androidHint}</p>
          <p className="text-[13px] text-muted">{t.ar.scaleNote}</p>
        </>
      )}
    </section>
  );
}

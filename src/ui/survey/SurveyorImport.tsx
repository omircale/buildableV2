import { useMemo, useRef, useState } from 'react';
import { decodeDxf, layerSummary, likelyUnit, parseDxf, roomsFromDrawing, type DxfDrawing, type DxfUnit } from '../../engine';
import { useT } from '../../i18n';
import { useSurvey } from '../../state/spaceStore';
import { useUi } from '../../state/uiStore';
import { Button, inputClass } from '../common';

/** A floor's DXF is a few megabytes. Far beyond this, it is a whole building and reading it would freeze the page. */
const MAX_MB = 40;

type Unit = Exclude<DxfUnit, 'unknown'>;

/** The rooms drawn to scale, numbered as in the list, so the person sees they are the right ones. */
function Preview({ rooms }: { rooms: { footprintMm: { x: number; y: number }[]; include: boolean }[] }) {
  // Laid out in a row, each at the same scale, so a large room looks large.
  const gap = 1500;
  let x = 0;
  const placed = rooms.map((r) => {
    const w = Math.max(...r.footprintMm.map((p) => p.x));
    const at = x;
    x += w + gap;
    return { ...r, at, w, h: Math.max(...r.footprintMm.map((p) => p.y)) };
  });
  const width = Math.max(1, x - gap);
  const height = Math.max(1, ...placed.map((p) => p.h));
  return (
    <svg viewBox={`${-400} ${-400} ${width + 800} ${height + 800}`} className="h-40 w-full rounded-lg bg-sunken" role="img" aria-hidden>
      {placed.map((r, i) => (
        <g key={i} transform={`translate(${r.at} 0)`} opacity={r.include ? 1 : 0.3}>
          <polygon points={r.footprintMm.map((p) => `${p.x},${height - p.y}`).join(' ')} fill="var(--color-accent-soft)" stroke="var(--color-ink)" strokeWidth={Math.max(width, height) / 300} />
          <text x={r.w / 2} y={height - r.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(width, height) / 18} fill="var(--color-ink)">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * The surveyor's drawing, turned into the property's rooms.
 *
 * Nothing is applied until the person has seen it: which layer the rooms were read from, in which
 * units, each room's name and area, and which room takes the branch's equipment. A drawing that does
 * not say its units gets a suggestion and a warning, never a silent choice.
 */
export function SurveyorImport({ onImported }: { onImported?: () => void }) {
  const t = useT();
  const s = t.surveyor;
  const he = useUi((st) => st.locale) === 'he';
  const importSurvey = useSurvey((st) => st.importSurvey);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<DxfDrawing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [layer, setLayer] = useState('');
  const [unit, setUnit] = useState<Unit>('mm');
  const [names, setNames] = useState<Record<number, string>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [equipmentRoom, setEquipmentRoom] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  const layers = useMemo(() => (drawing ? layerSummary(drawing).filter((l) => l.closed > 0) : []), [drawing]);
  const rooms = useMemo(() => (drawing && layer ? roomsFromDrawing(drawing, layer, unit) : []), [drawing, layer, unit]);
  const guessed = drawing?.units === 'unknown';

  const read = async (f: File) => {
    setError(null);
    setDone(null);
    setDrawing(null);
    setFile(f.name);
    if (/\.dwg$/i.test(f.name)) return setError(s.dwg);
    if (!/\.dxf$/i.test(f.name)) return setError(s.notDxf);
    if (f.size > MAX_MB * 1024 * 1024) return setError(s.tooBig(MAX_MB));
    setBusy(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const d = parseDxf(decodeDxf(bytes));
      const candidates = layerSummary(d).filter((l) => l.closed > 0);
      if (!candidates.length) {
        setError(s.noOutlines);
        return;
      }
      const first = candidates[0].name;
      setDrawing(d);
      setLayer(first);
      setUnit(d.units !== 'unknown' ? d.units : (likelyUnit(d, first) ?? 'mm'));
      setNames({});
      setExcluded(new Set());
      // The branch's equipment goes, by default, to the room labelled a kitchen — or else the largest.
      const found = roomsFromDrawing(d, first, d.units !== 'unknown' ? d.units : (likelyUnit(d, first) ?? 'mm'));
      const kitchen = found.findIndex((r) => r.name != null && /מטבח|kitchen/i.test(r.name));
      setEquipmentRoom(kitchen >= 0 ? kitchen : found.reduce((best, r, i) => (r.areaM2 > found[best].areaM2 ? i : best), 0));
    } catch {
      setError(s.notDxf);
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (i: number) => names[i] ?? rooms[i]?.name ?? s.unnamed(i + 1);
  const chosen = rooms.map((r, i) => ({ ...r, index: i })).filter((r) => !excluded.has(r.index));
  const fmt = (n: number) => n.toLocaleString(he ? 'he-IL' : 'en-GB', { maximumFractionDigits: 1 });

  return (
    <section className="space-y-3 rounded-xl border border-line bg-panel p-4">
      <div>
        <h3 className="text-body font-semibold">{s.title}</h3>
        <p className="mt-0.5 max-w-prose text-small text-muted">{s.intro}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? s.reading : s.choose}
        </Button>
        {file && <span className="text-small text-muted" dir="ltr">{file}</span>}
        <input
          ref={fileRef}
          type="file"
          accept=".dxf,.dwg,application/dxf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void read(f);
          }}
        />
      </div>
      <p className="text-caption leading-snug text-muted">{s.formats}</p>

      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-small text-bad">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-small">
          {done} {s.heightNote}
        </p>
      )}

      {drawing && !done && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-small font-medium">{s.layer}</span>
              <select
                className={inputClass}
                value={layer}
                onChange={(e) => {
                  setLayer(e.target.value);
                  setNames({});
                  setExcluded(new Set());
                  setEquipmentRoom(0);
                }}
              >
                {layers.map((l) => (
                  <option key={l.name} value={l.name}>
                    {s.layerOption(l.name, l.closed)}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-caption text-muted">{s.layerHint}</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-small font-medium">{s.unit}</span>
              <select className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                {(['mm', 'cm', 'm'] as const).map((u) => (
                  <option key={u} value={u}>
                    {s.units[u]}
                    {!guessed && u === drawing.units ? ` — ${s.unitDeclared}` : ''}
                  </option>
                ))}
              </select>
              {guessed && <span className="mt-1 block text-caption text-warn">{s.unitGuessed}</span>}
            </label>
          </div>

          {rooms.length === 0 ? (
            <p className="text-small text-muted">{s.none}</p>
          ) : (
            <>
              <Preview rooms={rooms.map((r, i) => ({ footprintMm: r.footprintMm, include: !excluded.has(i) }))} />
              <p className="text-small font-medium">{s.found(rooms.length)}</p>
              <ol className="space-y-2">
                {rooms.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line px-3 py-2">
                    <span className="w-6 text-center text-small font-semibold tabular-nums">{i + 1}</span>
                    <label className="flex items-center gap-1.5 text-small">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--color-accent)]"
                        checked={!excluded.has(i)}
                        onChange={(e) =>
                          setExcluded((was) => {
                            const next = new Set(was);
                            if (e.target.checked) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                      />
                      {s.include}
                    </label>
                    <input className={`${inputClass} h-9 min-w-0 flex-1 basis-40 sm:max-w-[16rem]`} aria-label={s.roomName} value={nameOf(i)} maxLength={80} onChange={(e) => setNames((n) => ({ ...n, [i]: e.target.value }))} />
                    <span className="text-small tabular-nums">{s.area(fmt(r.areaM2))}</span>
                    <span className="text-small text-muted">{s.corners(r.footprintMm.length)}</span>
                    <label className="flex items-center gap-1.5 text-small">
                      <input type="radio" name="equipment-room" className="h-5 w-5 accent-[var(--color-accent)]" checked={equipmentRoom === i} disabled={excluded.has(i)} onChange={() => setEquipmentRoom(i)} />
                      {s.equipmentHere}
                    </label>
                    {r.hadArcs && <span className="basis-full text-caption text-warn">{s.arcs}</span>}
                  </li>
                ))}
              </ol>
              <p className="text-caption text-muted">{s.replaceWarning}</p>
              <Button
                variant="primary"
                disabled={chosen.length === 0}
                onClick={() => {
                  const target = Math.max(0, chosen.findIndex((r) => r.index === equipmentRoom));
                  importSurvey(
                    chosen.map((r) => ({ name: nameOf(r.index).trim() || s.unnamed(r.index + 1), footprintMm: r.footprintMm })),
                    { equipmentRoom: target, fileName: file ?? 'DXF' },
                  );
                  setDone(s.done(chosen.length, file ?? 'DXF'));
                  onImported?.();
                }}
              >
                {s.import(chosen.length)}
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

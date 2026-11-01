import { polygonArea, type Pt } from '../geometry';

/**
 * Reading a surveyor's drawing.
 *
 * A surveyor in Israel delivers the existing-conditions survey as a CAD drawing. DWG, the native
 * format, is closed and cannot be read in a browser without a licensed library, but every CAD program
 * saves the same drawing as DXF — an open, documented text format — and that is what this reads.
 *
 * Only what a room outline is made of is read: closed polylines, the text labels inside them, the
 * layers both sit on, and the drawing's units. Nothing is inferred from a line that is not closed, and
 * nothing is guessed about which layer holds the rooms — surveyors name layers differently, so the
 * person picks the layer, seeing what each one holds.
 */

export interface DxfPolyline {
  layer: string;
  points: Pt[];
  closed: boolean;
  /** True when a segment was an arc (a bulge). Read as a straight chord, and said so. */
  hadArcs: boolean;
}

export interface DxfText {
  layer: string;
  text: string;
  at: Pt;
}

export type DxfUnit = 'mm' | 'cm' | 'm' | 'unknown';

export interface DxfDrawing {
  /** As the drawing declares it ($INSUNITS). "unknown" when it does not — and then a person says. */
  units: DxfUnit;
  polylines: DxfPolyline[];
  texts: DxfText[];
}

/** $INSUNITS codes for the units a building survey is drawn in. */
const INSUNITS: Record<number, DxfUnit> = { 4: 'mm', 5: 'cm', 6: 'm' };

/** Millimetres per drawing unit. */
export const MM_PER: Record<Exclude<DxfUnit, 'unknown'>, number> = { mm: 1, cm: 10, m: 1000 };

/**
 * The text decoding a DXF file asks for. A drawing saved by an older program in Hebrew declares the
 * Windows-1255 code page; read as UTF-8 its labels come out as rubbish.
 */
export function dxfEncoding(bytes: Uint8Array): 'utf-8' | 'windows-1255' {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 200_000)));
  const m = head.match(/\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/);
  const version = head.match(/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*AC(\d+)/);
  // From AutoCAD 2007 (AC1021) on, a DXF is UTF-8 whatever code page it names.
  if (version && Number(version[1]) >= 1021) return 'utf-8';
  return m && /1255/.test(m[1]) ? 'windows-1255' : 'utf-8';
}

/**
 * The drawing as text. A file can declare one code page and be written in another — some programs
 * name Windows-1255 and save UTF-8 — so the bytes decide: text that is valid UTF-8 is read as UTF-8
 * (Hebrew in Windows-1255 practically never is), and anything else in the code page the file names.
 */
export function decodeDxf(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder(dxfEncoding(bytes) === 'windows-1255' ? 'windows-1255' : 'latin1').decode(bytes);
  }
}

/** Text as CAD writes it, made readable: \U+05D0 escapes decoded, MTEXT formatting codes removed. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;\\{}]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/%%[cdpCDP]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The drawing's group-code / value pairs. */
function pairs(text: string): [number, string][] {
  const lines = text.split(/\r?\n/);
  const out: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isInteger(code)) continue;
    out.push([code, lines[i + 1]]);
  }
  return out;
}

export function parseDxf(text: string): DxfDrawing {
  const p = pairs(text);
  let units: DxfUnit = 'unknown';
  const polylines: DxfPolyline[] = [];
  const texts: DxfText[] = [];

  // Header: the units.
  for (let i = 0; i < p.length; i++) {
    if (p[i][0] === 9 && p[i][1].trim() === '$INSUNITS' && p[i + 1]?.[0] === 70) units = INSUNITS[Number(p[i + 1][1])] ?? 'unknown';
  }

  // Entities. Each entity starts at a code-0 pair; its fields run until the next one.
  const start = p.findIndex(([c, v], i) => c === 2 && v.trim() === 'ENTITIES' && p[i - 1]?.[0] === 0);
  if (start < 0) return { units, polylines, texts };
  let i = start + 1;
  const fields = (from: number) => {
    const out: [number, string][] = [];
    let j = from + 1;
    for (; j < p.length && p[j][0] !== 0; j++) out.push(p[j]);
    return { out, next: j };
  };

  while (i < p.length) {
    const [code, value] = p[i];
    if (code !== 0) {
      i++;
      continue;
    }
    const type = value.trim();
    if (type === 'ENDSEC') break;
    const { out, next } = fields(i);
    const layer = out.find(([c]) => c === 8)?.[1].trim() ?? '0';

    if (type === 'LWPOLYLINE') {
      const flags = Number(out.find(([c]) => c === 70)?.[1] ?? 0);
      const pts: Pt[] = [];
      let hadArcs = false;
      for (let k = 0; k < out.length; k++) {
        if (out[k][0] === 10) {
          const y = out.slice(k + 1).find(([c]) => c === 20);
          pts.push({ x: Number(out[k][1]), y: Number(y?.[1] ?? 0) });
        }
        if (out[k][0] === 42 && Number(out[k][1]) !== 0) hadArcs = true;
      }
      polylines.push({ layer, points: pts, closed: (flags & 1) === 1, hadArcs });
      i = next;
      continue;
    }

    if (type === 'POLYLINE') {
      const flags = Number(out.find(([c]) => c === 70)?.[1] ?? 0);
      const pts: Pt[] = [];
      let hadArcs = false;
      let j = next;
      // Old-style polylines list their corners as VERTEX entities, ending with SEQEND.
      while (j < p.length && p[j][0] === 0 && p[j][1].trim() === 'VERTEX') {
        const v = fields(j);
        const x = v.out.find(([c]) => c === 10)?.[1];
        const y = v.out.find(([c]) => c === 20)?.[1];
        if (v.out.some(([c, val]) => c === 42 && Number(val) !== 0)) hadArcs = true;
        if (x != null && y != null) pts.push({ x: Number(x), y: Number(y) });
        j = v.next;
      }
      if (p[j]?.[1].trim() === 'SEQEND') j = fields(j).next;
      polylines.push({ layer, points: pts, closed: (flags & 1) === 1, hadArcs });
      i = j;
      continue;
    }

    if (type === 'TEXT' || type === 'MTEXT') {
      const raw = out
        .filter(([c]) => c === 1 || c === 3)
        .map(([, v]) => v)
        .join('');
      const x = out.find(([c]) => c === 10)?.[1];
      const y = out.find(([c]) => c === 20)?.[1];
      const clean = cleanText(raw);
      if (clean && x != null && y != null) texts.push({ layer, text: clean, at: { x: Number(x), y: Number(y) } });
    }
    i = next;
  }

  // A polyline drawn closed by repeating its first corner is closed; the repeat is dropped.
  for (const pl of polylines) {
    const [a, b] = [pl.points[0], pl.points[pl.points.length - 1]];
    if (pl.points.length > 3 && a && b && Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) {
      pl.points.pop();
      pl.closed = true;
    }
  }
  return { units, polylines: polylines.filter((pl) => pl.points.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))), texts };
}

export interface LayerSummary {
  name: string;
  /** Closed outlines on the layer — the candidates for rooms. */
  closed: number;
  texts: number;
}

/** What each layer holds, most closed outlines first — the list a person picks the room layer from. */
export function layerSummary(d: DxfDrawing): LayerSummary[] {
  const map = new Map<string, LayerSummary>();
  const get = (name: string) => map.get(name) ?? map.set(name, { name, closed: 0, texts: 0 }).get(name)!;
  for (const pl of d.polylines) {
    const l = get(pl.layer);
    if (pl.closed && pl.points.length >= 3) l.closed++;
  }
  for (const t of d.texts) get(t.layer).texts++;
  return [...map.values()].sort((a, b) => b.closed - a.closed || b.texts - a.texts || a.name.localeCompare(b.name));
}

function inside(poly: Pt[], at: Pt): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > at.y !== b.y > at.y && at.x < ((b.x - a.x) * (at.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

export interface FoundRoom {
  /** The label found inside the outline, or null when there was none. */
  name: string | null;
  /** In millimetres, moved so the outline's corner nearest the origin sits at 0,0. */
  footprintMm: Pt[];
  areaM2: number;
  hadArcs: boolean;
}

/** Outlines smaller than this are fixtures and symbols, not rooms. */
export const MIN_ROOM_M2 = 1;

/**
 * The rooms on one layer: every closed outline of at least a square metre, in millimetres, with the
 * label that sits inside it. A label inside two nested outlines goes to the smaller one, which is the
 * room — the larger is usually the floor or the unit around it.
 */
export function roomsFromDrawing(d: DxfDrawing, layer: string, unit: Exclude<DxfUnit, 'unknown'>): FoundRoom[] {
  const k = MM_PER[unit];
  const outlines = d.polylines
    .filter((pl) => pl.layer === layer && pl.closed && pl.points.length >= 3)
    .map((pl) => ({ pl, mm: pl.points.map((q) => ({ x: q.x * k, y: q.y * k })) }))
    .map((o) => ({ ...o, areaM2: Math.abs(polygonArea(o.mm)) / 1e6 }))
    .filter((o) => o.areaM2 >= MIN_ROOM_M2)
    .sort((a, b) => a.areaM2 - b.areaM2);

  const taken = new Set<DxfText>();
  return outlines.map((o) => {
    const label = d.texts.find((t) => !taken.has(t) && inside(o.pl.points, t.at));
    if (label) taken.add(label);
    const minX = Math.min(...o.mm.map((q) => q.x));
    const minY = Math.min(...o.mm.map((q) => q.y));
    return {
      name: label?.text ?? null,
      footprintMm: o.mm.map((q) => ({ x: Math.round(q.x - minX), y: Math.round(q.y - minY) })),
      areaM2: o.areaM2,
      hadArcs: o.pl.hadArcs,
    };
  });
}

/**
 * The unit a drawing that does not declare one was most likely drawn in, from the size of its rooms:
 * a room is a few to a few hundred square metres. Offered for a person to confirm, never applied alone.
 */
export function likelyUnit(d: DxfDrawing, layer: string): Exclude<DxfUnit, 'unknown'> | null {
  const areas = d.polylines
    .filter((pl) => pl.layer === layer && pl.closed && pl.points.length >= 3)
    .map((pl) => Math.abs(polygonArea(pl.points)))
    .sort((a, b) => a - b);
  if (!areas.length) return null;
  const median = areas[Math.floor(areas.length / 2)];
  let best: { unit: Exclude<DxfUnit, 'unknown'>; score: number } | null = null;
  for (const unit of ['mm', 'cm', 'm'] as const) {
    const m2 = (a: number) => (a * MM_PER[unit] ** 2) / 1e6;
    // How many outlines come out room-sized, and whether the middle one is a typical room.
    const score = areas.filter((a) => m2(a) >= 2 && m2(a) <= 2000).length + (m2(median) >= 5 && m2(median) <= 200 ? 1 : 0);
    if (score > 0 && (!best || score > best.score)) best = { unit, score };
  }
  return best?.unit ?? null;
}

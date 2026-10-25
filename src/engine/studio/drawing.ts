import type { Pt } from '../geometry';
import { KIND_LABEL, STUDIO_DRAFT, currentApproval, statusOf, type StudioElement, type StudioProject } from './model';

/**
 * The plumbing drawing a trade takes away: as DXF for their CAD program, and as an A3 sheet for print.
 *
 * Both say what they are before anything else. Rejected elements are left out. Accepted ones are drawn
 * on the system's layer, and what is still only proposed goes on a layer of its own, so nobody builds
 * from a proposal by mistake. The layer names follow a working assumption that the field partners have
 * yet to confirm.
 */

export interface DrawingLayer {
  name: string;
  /** AutoCAD colour index. */
  aci: number;
  /** For the printed sheet. */
  hex: string;
}

export const DRAWING_LAYERS = {
  room: { name: 'A-ROOM', aci: 8, hex: '#6b6358' },
  roomText: { name: 'A-ROOM-IDEN', aci: 8, hex: '#6b6358' },
  drain: { name: 'P-DRAIN', aci: 30, hex: '#b06a2c' },
  drainProposed: { name: 'P-DRAIN-PROP', aci: 31, hex: '#b06a2c' },
  water: { name: 'P-WATER', aci: 5, hex: '#3b82c4' },
  waterProposed: { name: 'P-WATER-PROP', aci: 4, hex: '#3b82c4' },
  fixture: { name: 'P-FIXT', aci: 30, hex: '#b06a2c' },
  fixtureProposed: { name: 'P-FIXT-PROP', aci: 31, hex: '#b06a2c' },
  note: { name: 'P-ANNO', aci: 7, hex: '#1c1a17' },
} satisfies Record<string, DrawingLayer>;

type LayerKey = keyof typeof DRAWING_LAYERS;

const isRun = (e: StudioElement) => e.kind === 'drain_run' || e.kind === 'water_run';

/** The elements that belong on a drawing, each with the layer it goes on. Rejected ones do not. */
export function drawingElements(project: StudioProject, elements: StudioElement[]): { el: StudioElement; layer: LayerKey; accepted: boolean }[] {
  return elements
    .filter((el) => statusOf(project, el.id) !== 'rejected')
    .map((el) => {
      const accepted = statusOf(project, el.id) === 'accepted';
      const base: 'drain' | 'water' | 'fixture' = isRun(el) ? (el.layer === 'water' ? 'water' : 'drain') : 'fixture';
      return { el, accepted, layer: (accepted ? base : `${base}Proposed`) as LayerKey };
    });
}

/** The words at the head of every drawing: what it is, which revision, and whether anyone approved it. */
export function drawingTitle(project: StudioProject, locale: 'he' | 'en'): string[] {
  const he = locale === 'he';
  const approval = currentApproval(project);
  return [
    he ? `תוכנית אינסטלציה — ${project.name || 'פרויקט'}` : `Plumbing plan — ${project.name || 'project'}`,
    approval
      ? he
        ? `גרסה ${project.revision} · אושר בידי ${approval.by}`
        : `Revision ${project.revision} · approved by ${approval.by}`
      : he
        ? `גרסה ${project.revision} · לא אושר — לא לביצוע`
        : `Revision ${project.revision} · not approved — not for construction`,
    he ? STUDIO_DRAFT.he : STUDIO_DRAFT.en,
  ];
}

/** The design values as a note, each with where it came from, or said to be missing. */
export function designNotes(project: StudioProject, locale: 'he' | 'en'): string[] {
  const he = locale === 'he';
  const d = project.design;
  const value = (label: string, v: { value: number; source: string } | null, unit: string) =>
    // The source is typed by a person in either language; isolating it keeps its brackets where they belong.
    v ? `${label}: ${v.value} ${unit} (${he ? 'מקור' : 'source'}: \u2068${v.source}\u2069)` : `${label}: ${he ? 'חסר' : 'missing'}`;
  return [
    value(he ? 'קוטר שפכים' : 'Soil pipe diameter', d.diameterMm, he ? 'מ"מ' : 'mm'),
    value(he ? 'שיפוע שפכים' : 'Soil pipe slope', d.slopePct, '%'),
    d.connection ? (he ? 'נקודת החיבור לביוב סומנה בידי אדם' : 'Sewer connection marked by a person') : he ? 'נקודת החיבור לביוב משוערת — לאמת בשטח' : 'Sewer connection assumed — verify on site',
    he ? 'קו רציף — מאושר. שכבה נפרדת \u2066-PROP\u2069 — הצעה שלא אושרה.' : 'Solid — accepted. Separate -PROP layer — proposal not accepted.',
  ];
}

/* ------------------------------------------------------------------ DXF */

/**
 * Text in a DXF as AutoCAD's own \U+XXXX escapes, so the file is plain ASCII and opens the same in any
 * code page. This repo's reader decodes the same escapes.
 */
export function dxfText(s: string): string {
  return [...s].map((ch) => (ch.charCodeAt(0) < 128 ? ch : `\\U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)).join('');
}

/**
 * The drawing as an AutoCAD R12 DXF: the oldest version every CAD program still reads, with no handles
 * or object section to get wrong. Coordinates are in millimetres, as the plan is.
 */
export function planDxf(project: StudioProject, elements: StudioElement[], locale: 'he' | 'en'): string {
  const out: string[] = [];
  const g = (code: number, value: string | number) => out.push(String(code), typeof value === 'number' ? (Number.isInteger(value) ? String(value) : value.toFixed(3)) : value);
  const layers = Object.values(DRAWING_LAYERS);

  g(0, 'SECTION');
  g(2, 'HEADER');
  g(9, '$ACADVER');
  g(1, 'AC1009');
  g(9, '$INSUNITS');
  g(70, 4);
  g(0, 'ENDSEC');

  g(0, 'SECTION');
  g(2, 'TABLES');
  g(0, 'TABLE');
  g(2, 'LTYPE');
  g(70, 1);
  g(0, 'LTYPE');
  g(2, 'CONTINUOUS');
  g(70, 0);
  g(3, 'Solid line');
  g(72, 65);
  g(73, 0);
  g(40, 0);
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(70, layers.length);
  for (const l of layers) {
    g(0, 'LAYER');
    g(2, l.name);
    g(70, 0);
    g(62, l.aci);
    g(6, 'CONTINUOUS');
  }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  const polyline = (layer: string, pts: Pt[], closed: boolean) => {
    g(0, 'POLYLINE');
    g(8, layer);
    g(66, 1);
    g(70, closed ? 1 : 0);
    for (const p of pts) {
      g(0, 'VERTEX');
      g(8, layer);
      g(10, p.x);
      g(20, p.y);
    }
    g(0, 'SEQEND');
    g(8, layer);
  };
  const text = (layer: string, at: Pt, height: number, s: string) => {
    g(0, 'TEXT');
    g(8, layer);
    g(10, at.x);
    g(20, at.y);
    g(40, height);
    g(1, dxfText(s));
  };
  const circle = (layer: string, at: Pt, r: number) => {
    g(0, 'CIRCLE');
    g(8, layer);
    g(10, at.x);
    g(20, at.y);
    g(40, r);
  };

  g(0, 'SECTION');
  g(2, 'ENTITIES');
  for (const sp of project.spaces) {
    polyline(DRAWING_LAYERS.room.name, sp.outline, true);
    const c = { x: sp.outline.reduce((a, p) => a + p.x, 0) / sp.outline.length, y: sp.outline.reduce((a, p) => a + p.y, 0) / sp.outline.length };
    if (sp.name) text(DRAWING_LAYERS.roomText.name, c, 250, sp.name);
  }
  const he = locale === 'he';
  for (const { el, layer } of drawingElements(project, elements)) {
    const name = DRAWING_LAYERS[layer].name;
    if (isRun(el)) {
      polyline(name, el.points, false);
      continue;
    }
    const p = el.points[0];
    if (el.kind === 'grease_separator') polyline(name, [{ x: p.x - 400, y: p.y - 250 }, { x: p.x + 400, y: p.y - 250 }, { x: p.x + 400, y: p.y + 250 }, { x: p.x - 400, y: p.y + 250 }], true);
    else if (el.kind === 'wc') polyline(name, [{ x: p.x - 175, y: p.y - 175 }, { x: p.x + 175, y: p.y - 175 }, { x: p.x + 175, y: p.y + 175 }, { x: p.x - 175, y: p.y + 175 }], true);
    else if (el.kind === 'backflow') polyline(name, [{ x: p.x, y: p.y + 230 }, { x: p.x + 200, y: p.y - 170 }, { x: p.x - 200, y: p.y - 170 }], true);
    else circle(name, p, el.kind === 'sewer_connection' ? 250 : 175);
    if (el.kind === 'grease_separator' || el.kind === 'backflow' || el.kind === 'sewer_connection') {
      text(DRAWING_LAYERS.note.name, { x: p.x + 450, y: p.y + 300 }, 150, he ? KIND_LABEL[el.kind].he : KIND_LABEL[el.kind].en);
    }
  }
  // The title and the notes sit under the plan, where a drawing's title block is read.
  const minX = Math.min(...project.spaces.flatMap((s) => s.outline.map((p) => p.x)), 0);
  const minY = Math.min(...project.spaces.flatMap((s) => s.outline.map((p) => p.y)), 0);
  [...drawingTitle(project, locale), ...designNotes(project, locale)].forEach((line, i) => text(DRAWING_LAYERS.note.name, { x: minX, y: minY - 800 - i * 400 }, i === 0 ? 300 : 180, line));
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ the printed sheet */

/** Drawing scales a plan is printed at. The sheet takes the largest one that fits. */
export const SCALES = [20, 25, 50, 75, 100, 200, 500] as const;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface Sheet {
  svg: string;
  /** 1:n */
  scale: number;
}

/**
 * The plan as an A3 landscape sheet, in millimetres of paper: the plan at a true scale, a legend, the
 * notes and a title block. Text is set right to left for Hebrew; the plan itself is never mirrored.
 */
export function planSheet(project: StudioProject, elements: StudioElement[], locale: 'he' | 'en'): Sheet {
  const he = locale === 'he';
  const W = 420;
  const H = 297;
  const M = 10;
  const blockH = 52;
  const area = { x: M + 5, y: M + 5, w: W - 2 * M - 10, h: H - 2 * M - blockH - 15 };
  const pts = project.spaces.flatMap((s) => s.outline);
  const box = pts.length
    ? { minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)) }
    : { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  const bw = Math.max(1, box.maxX - box.minX);
  const bh = Math.max(1, box.maxY - box.minY);
  const scale = SCALES.find((n) => bw / n <= area.w && bh / n <= area.h) ?? SCALES[SCALES.length - 1];
  const ox = area.x + (area.w - bw / scale) / 2;
  const oy = area.y + (area.h - bh / scale) / 2;
  // Plan millimetres to paper millimetres, with the plan's y turned to run down the page.
  const P = (p: Pt) => ({ x: ox + (p.x - box.minX) / scale, y: oy + (box.maxY - p.y) / scale });
  const pl = (ps: Pt[]) => ps.map((p) => `${P(p).x.toFixed(2)},${P(p).y.toFixed(2)}`).join(' ');
  const r = (mm: number) => mm / scale;
  const dir = he ? 'rtl' : 'ltr';
  const font = "font-family=\"'Heebo','Assistant','Arial',sans-serif\"";
  const parts: string[] = [];

  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
  parts.push(`<rect x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" fill="none" stroke="#1c1a17" stroke-width="0.5"/>`);

  for (const sp of project.spaces) {
    parts.push(`<polygon points="${pl(sp.outline)}" fill="#f6f3ee" stroke="${DRAWING_LAYERS.room.hex}" stroke-width="0.5"/>`);
    const c = P({ x: sp.outline.reduce((a, p) => a + p.x, 0) / sp.outline.length, y: sp.outline.reduce((a, p) => a + p.y, 0) / sp.outline.length });
    if (sp.name) parts.push(`<text x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" ${font} font-size="3.5" fill="#6b6358" text-anchor="middle" direction="${dir}">${esc(sp.name)}</text>`);
  }

  for (const { el, layer, accepted } of drawingElements(project, elements)) {
    const color = DRAWING_LAYERS[layer].hex;
    const dash = accepted ? '' : ' stroke-dasharray="2 1.2"';
    if (isRun(el)) {
      parts.push(`<polyline points="${pl(el.points)}" fill="none" stroke="${color}" stroke-width="${el.layer === 'drainage' ? 0.7 : 0.45}" stroke-linejoin="round"${dash}/>`);
      continue;
    }
    const p = P(el.points[0]);
    const s = Math.max(r(175), 1.2);
    const common = `fill="#ffffff" stroke="${color}" stroke-width="0.4"${dash}`;
    if (el.kind === 'grease_separator') parts.push(`<rect x="${(p.x - s * 2.2).toFixed(2)}" y="${(p.y - s * 1.4).toFixed(2)}" width="${(s * 4.4).toFixed(2)}" height="${(s * 2.8).toFixed(2)}" ${common}/>`);
    else if (el.kind === 'wc') parts.push(`<rect x="${(p.x - s).toFixed(2)}" y="${(p.y - s).toFixed(2)}" width="${(2 * s).toFixed(2)}" height="${(2 * s).toFixed(2)}" ${common}/>`);
    else if (el.kind === 'backflow') parts.push(`<polygon points="${p.x.toFixed(2)},${(p.y - s * 1.3).toFixed(2)} ${(p.x + s * 1.2).toFixed(2)},${(p.y + s).toFixed(2)} ${(p.x - s * 1.2).toFixed(2)},${(p.y + s).toFixed(2)}" ${common}/>`);
    else parts.push(`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${(el.kind === 'sewer_connection' ? s * 1.4 : s).toFixed(2)}" ${common}/>`);
    if (el.kind === 'grease_separator' || el.kind === 'backflow' || el.kind === 'sewer_connection') {
      // In right-to-left text "start" is the right end, so a Hebrew label is set to the left of its symbol.
      parts.push(`<text x="${(he ? p.x - s * 2.6 : p.x + s * 2.6).toFixed(2)}" y="${(p.y - s * 1.6).toFixed(2)}" ${font} font-size="2.6" fill="#1c1a17" text-anchor="start" direction="${dir}">${esc(he ? KIND_LABEL[el.kind].he : KIND_LABEL[el.kind].en)}</text>`);
    }
  }

  // Title block along the bottom: title and status on the reading side, legend and notes beside it.
  const by = H - M - blockH;
  parts.push(`<line x1="${M}" y1="${by}" x2="${W - M}" y2="${by}" stroke="#1c1a17" stroke-width="0.5"/>`);
  const titleX = he ? W - M - 4 : M + 4;
  // "start" is the right end in right-to-left text and the left end otherwise: the reading side either way.
  const anchor = 'start';
  const [title, status, draft] = drawingTitle(project, locale);
  parts.push(`<text x="${titleX}" y="${by + 9}" ${font} font-size="6" font-weight="700" fill="#1c1a17" text-anchor="${anchor}" direction="${dir}">${esc(title)}</text>`);
  parts.push(`<text x="${titleX}" y="${by + 17}" ${font} font-size="3.6" fill="${currentApproval(project) ? '#2a6b43' : '#a3231b'}" text-anchor="${anchor}" direction="${dir}">${esc(status)}</text>`);
  parts.push(`<text x="${titleX}" y="${by + 24}" ${font} font-size="3" fill="#1c1a17" text-anchor="${anchor}" direction="${dir}">${esc(he ? `קנ"מ 1:${scale} בהדפסה על A3` : `Scale 1:${scale} when printed on A3`)}</text>`);
  designNotes(project, locale).forEach((line, i) =>
    parts.push(`<text x="${titleX}" y="${by + 31 + i * 4.5}" ${font} font-size="2.8" fill="#1c1a17" text-anchor="${anchor}" direction="${dir}">${esc(line)}</text>`),
  );
  parts.push(`<text x="${W / 2}" y="${H - M - 3}" ${font} font-size="2.6" fill="#6b6358" text-anchor="middle" direction="${dir}">${esc(draft)}</text>`);

  // Legend on the other side, so it never sits under the title. Each label follows its swatch in reading order.
  const label = (x: number, y: number, text: string) =>
    `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" ${font} font-size="3" fill="#1c1a17" text-anchor="start" direction="${dir}">${esc(text)}</text>`;
  const lx = he ? M + 6 : W - M - 96;
  const swatch = (i: number) => (he ? lx + 76 - i : lx + i);
  const after = (i: number) => (he ? swatch(i) - 3 : swatch(i) + 3);
  const legend: [string, string, boolean][] = [
    [DRAWING_LAYERS.drain.hex, he ? 'שפכים — מאושר' : 'Soil — accepted', true],
    [DRAWING_LAYERS.drain.hex, he ? 'שפכים — מוצע' : 'Soil — proposed', false],
    [DRAWING_LAYERS.water.hex, he ? 'מים — מאושר' : 'Water — accepted', true],
    [DRAWING_LAYERS.water.hex, he ? 'מים — מוצע' : 'Water — proposed', false],
  ];
  legend.forEach(([color, text, solid], i) => {
    const y = by + 9 + i * 6;
    const [a, b] = he ? [swatch(14), swatch(0)] : [swatch(0), swatch(14)];
    parts.push(`<line x1="${a}" y1="${y - 1}" x2="${b}" y2="${y - 1}" stroke="${color}" stroke-width="0.7"${solid ? '' : ' stroke-dasharray="2 1.2"'}/>`);
    parts.push(label(after(14), y, text));
  });
  const sym = by + 35;
  const symbols: [string, string][] = [
    [`<circle cx="0" cy="0" r="1.4" fill="#fff" stroke="#b06a2c" stroke-width="0.4"/>`, he ? 'נקודה' : 'Point'],
    [`<rect x="-1.4" y="-1.4" width="2.8" height="2.8" fill="#fff" stroke="#b06a2c" stroke-width="0.4"/>`, he ? KIND_LABEL.wc.he : KIND_LABEL.wc.en],
    [`<polygon points="0,-1.6 1.6,1.2 -1.6,1.2" fill="#fff" stroke="#3b82c4" stroke-width="0.4"/>`, he ? KIND_LABEL.backflow.he : KIND_LABEL.backflow.en],
    [`<rect x="-2.2" y="-1.4" width="4.4" height="2.8" fill="#fff" stroke="#b06a2c" stroke-width="0.4"/>`, he ? KIND_LABEL.grease_separator.he : KIND_LABEL.grease_separator.en],
  ];
  symbols.forEach(([shape, text], i) => {
    const y = sym + Math.floor(i / 2) * 6;
    const col = (i % 2) * 40;
    const cx = he ? lx + 76 - col : lx + 2 + col;
    parts.push(`<g transform="translate(${cx} ${y})">${shape}</g>`);
    parts.push(label(he ? cx - 4 : cx + 4, y + 1, text));
  });

  // North arrow is left out on purpose: the drawing does not say where north is.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
  return { svg, scale };
}

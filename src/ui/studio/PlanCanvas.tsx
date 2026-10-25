import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Pt } from '../../engine/geometry';
import { statusOf, type FieldMark, type Layer, type StudioElement, type StudioIssue, type StudioProject } from '../../engine/studio/model';
import { useStudioT } from '../../i18n/studio';
import { LAYER_COLOR } from './layers';

/**
 * The plan, drawn in the building's own millimetres.
 *
 * The drawing is never mirrored for a right-to-left language — a plan is a plan. A proposed element is
 * dashed, an accepted one solid, a rejected one faint, so the state reads without colour; colour only
 * tells the systems apart.
 */

const ISSUE_COLOR = { blocking: 'var(--color-bad)', warning: 'var(--color-warn)', info: 'var(--color-unknown)' } as const;

export type Visible = Record<'architecture' | Layer | 'marks', boolean>;

interface Props {
  project: StudioProject;
  elements: StudioElement[];
  issues: StudioIssue[];
  marks: FieldMark[];
  visible: Visible;
  selected: string | null;
  highlighted: string[];
  /** When set, the next click on the plan is a point, not a selection. */
  picking?: boolean;
  onPick?: (at: Pt) => void;
  onSelect?: (id: string | null) => void;
  className?: string;
}

const MARGIN = 1200;

export function PlanCanvas({ project, elements, issues, marks, visible, selected, highlighted, picking, onPick, onSelect, className }: Props) {
  const s = useStudioT().plan;
  const svgRef = useRef<SVGSVGElement>(null);
  const bounds = useMemo(() => {
    const pts = project.spaces.flatMap((sp) => sp.outline);
    if (!pts.length) return { minX: 0, minY: 0, maxX: 10000, maxY: 10000 };
    return { minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)) };
  }, [project.spaces]);
  const full = { x: bounds.minX - MARGIN, y: -bounds.maxY - MARGIN, w: bounds.maxX - bounds.minX + 2 * MARGIN, h: bounds.maxY - bounds.minY + 2 * MARGIN };
  const [view, setView] = useState<typeof full | null>(null);
  const vb = view ?? full;
  const drag = useRef<{ x: number; y: number; vb: typeof full; moved: boolean } | null>(null);

  // The drawing's width on screen, so a line or a label keeps its size in pixels at every zoom.
  const [screenW, setScreenW] = useState(800);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(() => setScreenW(svg.clientWidth || 800));
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);
  /** One screen pixel, in plan millimetres. */
  const u = vb.w / screenW;
  // The drawing's y runs up; the screen's runs down. Everything is drawn at (x, -y).
  const P = (p: Pt) => `${p.x},${-p.y}`;

  const toPlan = (clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: Math.round(pt.x), y: Math.round(-pt.y) };
  };

  const zoom = (factor: number, around?: Pt) => {
    const c = around ?? { x: vb.x + vb.w / 2, y: -(vb.y + vb.h / 2) };
    const w = Math.min(full.w * 2, Math.max(full.w / 12, vb.w * factor));
    const h = (vb.h / vb.w) * w;
    setView({ x: c.x - (c.x - vb.x) * (w / vb.w), y: -c.y - (-c.y - vb.y) * (h / vb.h), w, h });
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, vb, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const svg = svgRef.current;
    if (!d || !svg || e.buttons !== 1) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    const k = d.vb.w / svg.clientWidth;
    setView({ ...d.vb, x: d.vb.x - dx * k, y: d.vb.y - dy * k });
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) return;
    if (picking && onPick) {
      const at = toPlan(e.clientX, e.clientY);
      if (at) onPick(at);
      return;
    }
    const target = (e.target as Element).closest('[data-id]');
    onSelect?.(target ? target.getAttribute('data-id') : null);
  };

  const strokeFor = (el: StudioElement) => {
    const st = statusOf(project, el.id);
    const w = (el.layer === 'drainage' ? 3 : 2) * u * (selected === el.id || highlighted.includes(el.id) ? 1.8 : 1);
    return {
      stroke: LAYER_COLOR[el.layer],
      strokeWidth: w,
      strokeDasharray: st === 'proposed' ? `${4 * w} ${2.5 * w}` : st === 'rejected' ? `${1 * w} ${3 * w}` : undefined,
      opacity: st === 'rejected' ? 0.35 : 1,
    };
  };

  const shown = elements.filter((el) => visible[el.layer]);
  const runs = shown.filter((el) => el.kind === 'drain_run' || el.kind === 'water_run');
  const points = shown.filter((el) => !(el.kind === 'drain_run' || el.kind === 'water_run'));

  return (
    <div className={`relative overflow-hidden rounded-xl border border-line bg-panel ${className ?? ''}`}>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className={`block h-full w-full touch-none select-none ${picking ? 'cursor-crosshair' : 'cursor-grab'}`}
        role="img"
        aria-label={s.plan}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={(e) => {
          const at = toPlan(e.clientX, e.clientY) ?? undefined;
          zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, at);
        }}
      >
        {visible.architecture &&
          project.spaces.map((sp) => {
            const c = { x: sp.outline.reduce((a, p) => a + p.x, 0) / sp.outline.length, y: sp.outline.reduce((a, p) => a + p.y, 0) / sp.outline.length };
            return (
              <g key={sp.id}>
                <polygon points={sp.outline.map(P).join(' ')} fill="var(--color-sunken)" stroke="var(--color-muted)" strokeWidth={2.5 * u} />
                <text x={c.x} y={-c.y} textAnchor="middle" dominantBaseline="middle" fontSize={13 * u} fill="var(--color-muted)">
                  {sp.name}
                </text>
              </g>
            );
          })}

        {runs.map((el) => (
          <g key={el.id} data-id={el.id} className="cursor-pointer">
            {/* A wider invisible line, so a thin pipe is easy to hit. */}
            <polyline points={el.points.map(P).join(' ')} fill="none" stroke="transparent" strokeWidth={14 * u} />
            <polyline points={el.points.map(P).join(' ')} fill="none" strokeLinejoin="round" {...strokeFor(el)} />
          </g>
        ))}

        {points.map((el) => {
          const p = el.points[0];
          const st = strokeFor(el);
          const r = 7 * u * (selected === el.id ? 1.4 : 1);
          const common = { ...st, fill: 'var(--color-panel)', strokeWidth: 2 * u * (selected === el.id ? 1.6 : 1) };
          const shape =
            el.kind === 'grease_separator' ? (
              <rect x={p.x - r * 1.4} y={-p.y - r} width={r * 2.8} height={r * 2} {...common} />
            ) : el.kind === 'backflow' ? (
              <polygon points={`${p.x},${-p.y - r * 1.3} ${p.x + r * 1.2},${-p.y + r} ${p.x - r * 1.2},${-p.y + r}`} {...common} />
            ) : el.kind === 'sewer_connection' ? (
              <circle cx={p.x} cy={-p.y} r={r * 1.4} {...common} strokeDasharray={project.design.connection ? undefined : `${3 * u} ${2 * u}`} />
            ) : el.kind === 'wc' ? (
              <rect x={p.x - r} y={-p.y - r} width={r * 2} height={r * 2} {...common} />
            ) : (
              <circle cx={p.x} cy={-p.y} r={r} {...common} />
            );
          return (
            <g key={el.id} data-id={el.id} className="cursor-pointer">
              <circle cx={p.x} cy={-p.y} r={r * 2.2} fill="transparent" />
              {shape}
            </g>
          );
        })}

        {issues
          .filter((i) => i.at)
          .map((i) => (
            <g key={i.id} data-id={`issue:${i.id}`} className="cursor-pointer">
              <circle cx={i.at!.x} cy={-i.at!.y} r={16 * u} fill="none" stroke={ISSUE_COLOR[i.severity]} strokeWidth={(selected === `issue:${i.id}` ? 4 : 2.5) * u} />
            </g>
          ))}

        {visible.marks &&
          marks.map((m) => (
            <g key={m.id} data-id={`issue:mark_${m.id}`} className="cursor-pointer">
              <circle cx={m.at.x} cy={-m.at.y} r={11 * u} fill="var(--color-warn)" />
              <text x={m.at.x} y={-m.at.y} textAnchor="middle" dominantBaseline="central" fontSize={14 * u} fontWeight={700} fill="var(--color-panel)">
                !
              </text>
            </g>
          ))}
      </svg>
      <div className="absolute bottom-2 end-2 flex gap-1">
        {[
          { label: s.zoomIn, text: '+', run: () => zoom(1 / 1.4) },
          { label: s.zoomOut, text: '−', run: () => zoom(1.4) },
          { label: s.fit, text: '⤢', run: () => setView(null) },
        ].map((b) => (
          <button key={b.label} type="button" aria-label={b.label} title={b.label} onClick={b.run} className="h-11 w-11 rounded-lg border border-line bg-panel text-lg text-ink hover:bg-sunken">
            {b.text}
          </button>
        ))}
      </div>
    </div>
  );
}

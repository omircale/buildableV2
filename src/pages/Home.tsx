import { useMemo, useState } from 'react';
import type { AuthState } from '../cloud/supabase';
import { useT } from '../i18n';
import { useDesign } from '../state/designStore';
import { ProjectCard } from './Projects';
import { AppHeader } from '../ui/AppHeader';
import { buttonClass } from '../ui/common';
import { FURNITURE_TYPES, fitsSpace, presetFor, type FurnitureKind, type FurnitureType, type SpaceCm } from '../ui/furnitureCatalog';
import { DescribePanel } from '../ui/intake/DescribePanel';
import { loadFor, type LoadPresetId } from '../ui/DesignControls';
import { FurnitureArt, IconChevron, IconRuler } from '../ui/icons';

function SpaceInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const t = useT();
  return (
    <label className="flex h-11 w-36 items-center rounded-lg border border-line-strong bg-panel focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
      <span className="ps-3 text-sm text-muted">{label}</span>
      <input
        type="number"
        min={1}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
        className="num h-full min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none"
      />
      <span className="pe-3 text-[13px] text-muted">{t.common.cm}</span>
    </label>
  );
}

function FurnitureCard({ type, fits, onOpen }: { type: FurnitureType; fits: boolean; onOpen: () => void }) {
  const t = useT();
  const copy = t.furniture[type.kind];
  const disabled = !type.available;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-describedby={`${type.kind}-desc`}
      className={`group flex flex-col overflow-hidden rounded-xl text-start transition ${
        disabled ? 'cursor-default border border-dashed border-line-strong bg-panel/60' : 'bg-panel ring-1 ring-line hover:-translate-y-0.5 hover:shadow-md hover:ring-accent'
      } ${fits ? '' : 'opacity-45'}`}
    >
      <div className={`relative flex h-40 items-center justify-center ${disabled ? 'text-muted' : 'bg-sunken text-ink group-hover:bg-accent-soft'}`}>
        <FurnitureArt kind={type.kind} />
        {(type.isNew || disabled) && (
          <span className={`absolute start-3 top-3 rounded-full px-2 py-0.5 text-xs font-semibold ${type.isNew ? 'bg-accent text-on-accent' : 'bg-sunken text-muted ring-1 ring-line'}`}>
            {type.isNew ? t.common.isNew : t.common.soon}
          </span>
        )}
        {!fits && <span className="absolute end-3 top-3 rounded-full bg-panel px-2 py-0.5 text-xs font-semibold text-muted ring-1 ring-line">{t.home.doesntFit}</span>}
      </div>
      <div className="flex flex-col gap-1 px-4 pb-4 pt-3">
        <span className={`text-[17px] font-semibold ${disabled ? 'text-muted' : ''}`}>{copy.name}</span>
        <span id={`${type.kind}-desc`} className="text-sm text-muted">
          {copy.blurb}
          {type.isNew && disabled ? ` · ${t.common.soon}` : ''}
        </span>
      </div>
    </button>
  );
}

export function HomePage({ auth }: { auth: AuthState }) {
  const t = useT();
  const projects = useDesign((s) => s.projects);
  const startNew = useDesign((s) => s.startNew);
  const [space, setSpace] = useState<SpaceCm>({ w: null, h: null, d: null });
  const hasSpace = space.w != null || space.h != null || space.d != null;
  const fits = useMemo(() => new Map(FURNITURE_TYPES.map((f) => [f.kind, fitsSpace(f, space)])), [space]);

  const open = (type: FurnitureType, forSpace: SpaceCm = space) => {
    if (!type.available) return;

    const preset = presetFor(type, forSpace);
    if (!preset) return;
    startNew(preset, t.furniture[type.kind].name);
    window.location.hash = '#/design/edit';
  };

  /** Described in words: open that piece at the sizes the description actually gave. */
  const openDescribed = (kind: FurnitureKind, described: SpaceCm, use: LoadPresetId | null) => {
    const type = FURNITURE_TYPES.find((f) => f.kind === kind);
    if (!type) return;
    setSpace(described);
    const preset = presetFor(type, described);
    if (!preset) return;
    const withUse = use && 'loadPerShelf' in preset ? { ...preset, loadPerShelf: loadFor(use) } : preset;
    startNew(withUse, t.furniture[kind].name);
    window.location.hash = '#/design/edit';
  };


  return (
    <div className="flex min-h-full flex-col bg-paper">
      <AppHeader auth={auth} />
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-8 py-9">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-2xl flex-col gap-2">
            <h1 className="text-[40px] leading-tight font-bold tracking-tight">{t.home.title}</h1>
            <p className="text-lg leading-relaxed text-muted">{t.home.subtitle}</p>
          </div>
        </div>

        {/* Say what you want and go straight to the editor; the gallery below is for picking instead. */}
        <DescribePanel onStart={openDescribed} />

        {projects.length > 0 && (
          <section className="flex flex-col gap-3" aria-label={t.projects.recent}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t.projects.recent}</h2>
              <a href="#/projects" className={buttonClass('ghost', 'sm')}>
                {t.projects.all} ({projects.length})
              </a>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {projects.slice(0, 4).map((p) => (
                <ProjectCard key={p.id} project={p} compact />
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-wrap items-center gap-4 rounded-xl bg-panel px-5 py-3.5 ring-1 ring-line" aria-label={t.home.spaceTitle}>
          <span className="text-accent">
            <IconRuler size={26} />
          </span>
          <span className="text-base font-semibold">{t.home.spaceTitle}</span>
          <div className="flex flex-wrap gap-2">
            <SpaceInput label={t.dims.width} value={space.w} onChange={(w) => setSpace({ ...space, w })} />
            <SpaceInput label={t.dims.height} value={space.h} onChange={(h) => setSpace({ ...space, h })} />
            <SpaceInput label={t.dims.depth} value={space.d} onChange={(d) => setSpace({ ...space, d })} />
          </div>
          <span className="text-sm text-muted">{t.home.spaceHint}</span>
          {hasSpace && (
            <button type="button" onClick={() => setSpace({ w: null, h: null, d: null })} className={`${buttonClass('ghost', 'sm')} ms-auto`}>
              {t.home.clear}
            </button>
          )}
        </section>

        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {FURNITURE_TYPES.map((type) => (
            <FurnitureCard key={type.kind} type={type} fits={fits.get(type.kind) ?? true} onOpen={() => open(type)} />
          ))}
        </div>

        <ol className="flex flex-wrap items-center gap-3 text-[15px] text-muted">
          {t.home.stepsLine.map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              {i > 0 && <IconChevron size={16} className="rtl:rotate-0 ltr:rotate-180" />}
              {s}
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}

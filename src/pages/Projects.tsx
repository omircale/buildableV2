import { useMemo, useRef, useState } from 'react';
import type { AuthState } from '../cloud/supabase';
import { runDesign } from '../engine';
import { useT } from '../i18n';
import { useDesign, type LocalProject } from '../state/designStore';
import { useUi } from '../state/uiStore';
import { AppHeader } from '../ui/AppHeader';
import { buttonClass, downloadText, inputClass } from '../ui/common';
import { artKindFor } from '../ui/furnitureCatalog';
import { FurnitureArt } from '../ui/icons';
import { formatCm } from '../ui/measure';

export function relativeTime(ts: number, locale: 'he' | 'en'): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const minutes = Math.round((ts - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

export function ProjectCard({ project, compact }: { project: LocalProject; compact?: boolean }) {
  const t = useT();
  const locale = useUi((s) => s.locale);
  const activeId = useDesign((s) => s.projectId);
  const openProject = useDesign((s) => s.openProject);
  const renameProject = useDesign((s) => s.renameProject);
  const duplicateProject = useDesign((s) => s.duplicateProject);
  const deleteProject = useDesign((s) => s.deleteProject);
  const [editing, setEditing] = useState(false);
  const result = useMemo(() => runDesign(project.params, undefined, locale), [project.params, locale]);
  const kind = artKindFor(project.params);
  const o = result.model.overall;
  const active = project.id === activeId;

  const commitRename = (value: string) => {
    if (!editing) return;
    if (value.trim() && value.trim() !== project.name) renameProject(project.id, value.trim());
    setEditing(false);
  };

  const open = () => {
    openProject(project.id);
    window.location.hash = '#/design/structure';
  };

  return (
    <article className={`flex flex-col overflow-hidden rounded-xl bg-panel ring-1 ${active ? 'ring-2 ring-accent' : 'ring-line'}`}>
      <button type="button" onClick={open} className="relative flex h-32 items-center justify-center bg-sunken text-ink hover:bg-accent-soft" aria-label={`${t.projects.open}: ${project.name}`}>
        <FurnitureArt kind={kind} className="max-h-24" />
        {active && <span className="absolute start-3 top-3 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">{t.projects.current}</span>}
        <span className={`absolute end-3 top-3 rounded-full px-2 py-0.5 text-xs font-semibold ${result.report.exportBlocked ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok'}`}>
          {result.report.exportBlocked ? t.projects.blocked : t.projects.ready}
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-1 px-4 pb-3 pt-3">
        {editing ? (
          <input
            autoFocus
            aria-label={t.projects.rename}
            defaultValue={project.name}
            className={inputClass}
            onBlur={(e) => commitRename(e.target.value)}
            onKeyDown={(e) => {
              // Enter saves directly (not via blur), so saving never depends on where focus is.
              if (e.key === 'Enter') commitRename((e.target as HTMLInputElement).value);
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <span className="truncate text-[17px] font-semibold" title={project.name}>
            {project.name}
          </span>
        )}
        <span className="text-sm text-muted">{t.furniture[kind].name}</span>
        <span className="flex flex-wrap gap-x-2 text-[13px] text-muted">
          {/* Numbers in their own LTR spans so RTL text never reorders "W × H × D" or the price. */}
          <span className="num" dir="ltr">
            {formatCm(o.x)} × {formatCm(o.y)} × {formatCm(o.z)}
          </span>
          <span>{t.common.cm}</span>
          {result.quote && (
            <span className="num" dir="ltr">
              · ₪{Math.round(result.quote.totalIls).toLocaleString('he-IL')}
            </span>
          )}
        </span>
        <span className="text-[13px] text-muted">
          {t.projects.edited} {relativeTime(project.updatedAt, locale)}
        </span>
      </div>
      {!compact && (
        <div className="flex flex-wrap items-center gap-1 border-t border-line px-2 py-2">
          <button type="button" onClick={open} className={buttonClass('primary', 'sm')}>
            {t.projects.open}
          </button>
          <button type="button" onClick={() => setEditing(true)} className={buttonClass('ghost', 'sm')}>
            {t.projects.rename}
          </button>
          <button type="button" onClick={() => duplicateProject(project.id, t.projects.copySuffix)} className={buttonClass('ghost', 'sm')}>
            {t.projects.duplicate}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(t.projects.deleteConfirm(project.name))) deleteProject(project.id);
            }}
            className={`${buttonClass('ghost', 'sm')} ms-auto text-bad`}
          >
            {t.projects.delete}
          </button>
        </div>
      )}
    </article>
  );
}

export function ProjectsPage({ auth }: { auth: AuthState }) {
  const t = useT();
  const projects = useDesign((s) => s.projects);
  const saveError = useDesign((s) => s.saveError);
  const exportAll = useDesign((s) => s.exportAll);
  const importAll = useDesign((s) => s.importAll);
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoreMessage, setRestoreMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const restore = async (file: File) => {
    try {
      const n = importAll(JSON.parse(await file.text()));
      setRestoreMessage(n ? { ok: true, text: t.projects.restored(n) } : { ok: false, text: t.projects.restoreFailed });
    } catch {
      setRestoreMessage({ ok: false, text: t.projects.restoreFailed });
    }
  };
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <AppHeader auth={auth} />
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-8 py-9">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-2xl flex-col gap-2">
            <h1 className="text-[36px] leading-tight font-bold tracking-tight">{t.projects.title}</h1>
            <p className="text-lg leading-relaxed text-muted">{t.projects.subtitle}</p>
          </div>
          <a href="#/" className={buttonClass('primary', 'md')}>
            {t.projects.newProject}
          </a>
        </div>
        {saveError && (
          <p className="rounded-xl bg-bad-soft px-4 py-3 text-[15px] text-bad">
            <strong>{t.projects.saveErrorTitle}</strong> {t.projects.saveErrorText}
          </p>
        )}
        {projects.length === 0 ? (
          <p className="rounded-xl bg-panel p-6 text-[15px] text-muted ring-1 ring-line">{t.projects.empty}</p>
        ) : (
          <>
            <p className="text-sm text-muted">{t.projects.count(projects.length)}</p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          </>
        )}
        <section className="flex flex-wrap items-center gap-3 rounded-xl bg-sunken p-4 text-[14px] text-muted">
          <span className="flex-1 leading-relaxed">{t.projects.localOnly}</span>
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => downloadText(`buildable-projects-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportAll(), null, 2), 'application/json;charset=utf-8')}>
            {t.projects.backupAll}
          </button>
          <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => fileRef.current?.click()}>
            {t.projects.restoreAll}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void restore(file);
            }}
          />
        </section>
        {restoreMessage && <p className={`rounded-xl px-4 py-3 text-[14px] ${restoreMessage.ok ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>{restoreMessage.text}</p>}
        <p className="rounded-xl bg-sunken p-4 text-[14px] leading-relaxed text-muted">{t.projects.cloudNote}</p>
      </main>
    </div>
  );
}

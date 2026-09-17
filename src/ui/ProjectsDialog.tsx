import { useCallback, useEffect, useRef, useState } from 'react';
import { cloudConfigured, createProject, deleteProject, listProjects, listVersions, saveVersion, type ProjectRow, type VersionRow } from '../cloud/supabase';
import { buildModel, withDefaults, type DesignResult } from '../engine';
import { formatCm } from './measure';

import { useT } from '../i18n';
import { useDesign } from '../state/designStore';
import { useUi } from '../state/uiStore';
import { Button, StatusBadge, downloadText, inputClass } from './common';

function versionSize(raw: unknown, cm: string): string {
  const params = withDefaults(raw);
  if (!params) return '—';
  const o = buildModel(params).overall;
  return `${formatCm(o.x)}×${formatCm(o.y)}×${formatCm(o.z)} ${cm}`;
}

export function ProjectsDialog({ open, onClose, result, signedIn, isMember }: { open: boolean; onClose: () => void; result: DesignResult; signedIn: boolean; isMember: boolean }) {
  const t = useT();
  const c = t.cloud;
  const dateLocale = useUi((s) => (s.locale === 'he' ? 'he-IL' : 'en-GB'));
  const { projectName, params, cloudProjectId, setCloudProjectId, replaceParams, setProjectName, importProject } = useDesign();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The error kind, not its text, so the message follows a language switch.
  const [importError, setImportError] = useState<'badFile' | 'unknownFurniture' | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(cloudProjectId);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects());
      if (activeId) setVersions(await listVersions(activeId));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [activeId]);

  useEffect(() => {
    if (open && signedIn && isMember) void refresh();
  }, [open, signedIn, isMember, refresh]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  if (!open) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveNewVersion = () =>
    run(async () => {
      let id = cloudProjectId;
      if (!id) {
        const p = await createProject(projectName || c.untitled);
        id = p.id;
        setCloudProjectId(id);
        setActiveId(id);
      }
      await saveVersion(id, result.model.params, result.report, label.trim() || null);
      setLabel('');
    });

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={c.title} className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl bg-paper shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-3">
          <h2 className="font-bold">{c.title}</h2>
          <Button variant="ghost" onClick={onClose}>
            {t.common.close}
          </Button>
        </div>
        <div className="p-4">
          {!cloudConfigured && <p className="mb-3 text-sm">{c.notConfigured}</p>}
          {cloudConfigured && !signedIn && (
            <p className="text-sm">
              {c.signInPrefix}{' '}
              <a href="#/login" className="text-accent underline">
                {c.signInLink}
              </a>
              .
            </p>
          )}
          {cloudConfigured && signedIn && !isMember && <p className="text-sm text-bad">{c.noAccess}</p>}
          {error && <p className="mb-2 rounded bg-bad-soft px-2 py-1 text-xs text-bad">{error}</p>}

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-sunken p-3">
            <span className="text-sm font-semibold">{c.backupTitle}</span>
            <span className="text-xs text-muted">{c.backupHint}</span>
            <div className="ms-auto flex gap-2">
              <Button
                onClick={() =>
                  downloadText(
                    `${projectName || 'buildable'}.json`,
                    JSON.stringify({ format: 'buildable-project', version: 1, projectName, params }, null, 2),
                    'application/json;charset=utf-8',
                  )
                }
              >
                {c.download}
              </Button>
              <Button onClick={() => fileInputRef.current?.click()}>{c.load}</Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setImportError(null);
                  file
                    .text()
                    .then((text) => {
                      let parsed: { projectName?: string; params?: unknown };
                      try {
                        parsed = JSON.parse(text);
                      } catch {
                        // Never show the raw parser message ("Unexpected token…") to the user.
                        setImportError('badFile');
                        return;
                      }
                      const imported = withDefaults(parsed?.params);
                      if (!imported) {
                        setImportError('unknownFurniture');
                        return;
                      }
                      importProject(imported, parsed.projectName ?? projectName);
                      onClose();
                    })
                    .catch(() => setImportError('badFile'));
                }}
              />
            </div>
          </div>
          {importError && <p className="mb-2 rounded bg-bad-soft px-2 py-1 text-xs text-bad">{c[importError]}</p>}

          {cloudConfigured && signedIn && isMember && (
            <div className="grid gap-4 md:grid-cols-[1fr_1.3fr]">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{c.saveVersion}</h3>
                <input className={inputClass} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={c.namePlaceholder} />
                <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={c.labelPlaceholder} />
                <div className="flex gap-2">
                  <Button variant="primary" disabled={busy} onClick={saveNewVersion}>
                    {cloudProjectId ? c.saveNew : c.createAndSave}
                  </Button>
                  {cloudProjectId && (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setCloudProjectId(null);
                        setProjectName(`${projectName} ${c.copySuffix}`);
                      }}
                      title={c.duplicateHint}
                    >
                      {c.duplicate}
                    </Button>
                  )}
                </div>
                <h3 className="pt-3 text-sm font-semibold">{c.cloudProjects}</h3>
                <ul className="space-y-1">
                  {projects.map((p) => (
                    <li key={p.id} className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ring-1 ${activeId === p.id ? 'bg-accent-soft ring-accent/40' : 'bg-panel ring-line'}`}>
                      <button className="flex-1 text-start" onClick={() => setActiveId(p.id)}>
                        {p.name}
                        <span className="block text-[11px] text-muted">{new Date(p.updated_at).toLocaleString(dateLocale)}</span>
                      </button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(c.deleteConfirm(p.name)))
                            void run(async () => {
                              await deleteProject(p.id);
                              if (cloudProjectId === p.id) setCloudProjectId(null);
                              if (activeId === p.id) {
                                setActiveId(null);
                                setVersions([]);
                              }
                            });
                        }}
                      >
                        {c.delete}
                      </Button>
                    </li>
                  ))}
                  {!projects.length && <li className="text-xs text-muted">{c.noCloudProjects}</li>}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">{c.history}</h3>
                {!activeId && <p className="text-xs text-muted">{c.pickProject}</p>}
                <ul className="space-y-1.5">
                  {versions.map((v) => (
                    <li key={v.id} className="flex items-center gap-2 rounded-md bg-panel px-2 py-1.5 text-xs ring-1 ring-line">
                      <span className="font-mono font-bold">v{v.version_no}</span>
                      <span className="flex-1">
                        {v.label ?? <span className="text-muted">{c.noLabel}</span>}
                        <span className="block text-[11px] text-muted">
                          {new Date(v.created_at).toLocaleString(dateLocale)} · {versionSize(v.params, t.common.cm)}
                        </span>
                      </span>
                      {v.summary.overall && <StatusBadge status={v.summary.overall as never} />}
                      <Button
                        onClick={() => {
                          const p = projects.find((x) => x.id === v.project_id);
                          const restored = withDefaults(v.params);
                          if (restored) replaceParams(restored, p?.name, v.project_id);
                          onClose();
                        }}
                      >
                        {c.restore}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

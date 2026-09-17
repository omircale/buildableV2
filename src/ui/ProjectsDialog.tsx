import { useCallback, useEffect, useRef, useState } from 'react';
import { cloudConfigured, createProject, deleteProject, listProjects, listVersions, saveVersion, type ProjectRow, type VersionRow } from '../cloud/supabase';
import { buildModel, withDefaults, type DesignResult } from '../engine';
import { formatCm } from './measure';

function versionSize(raw: unknown): string {
  const params = withDefaults(raw);
  if (!params) return '—';
  const o = buildModel(params).overall;
  return `${formatCm(o.x)}×${formatCm(o.y)}×${formatCm(o.z)} ס"מ`;
}
import { useDesign } from '../state/designStore';
import { Button, StatusBadge, downloadText, inputClass } from './common';

export function ProjectsDialog({ open, onClose, result, signedIn, isMember }: { open: boolean; onClose: () => void; result: DesignResult; signedIn: boolean; isMember: boolean }) {
  const { projectName, params, cloudProjectId, setCloudProjectId, replaceParams, setProjectName, importProject } = useDesign();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
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
        const p = await createProject(projectName || 'פרויקט ללא שם');
        id = p.id;
        setCloudProjectId(id);
        setActiveId(id);
      }
      await saveVersion(id, result.model.params, result.report, label.trim() || null);
      setLabel('');
    });

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl bg-paper shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-3">
          <h2 className="font-bold">פרויקטים וגרסאות</h2>
          <Button variant="ghost" onClick={onClose}>
            סגירה
          </Button>
        </div>
        <div className="p-4">
          {!cloudConfigured && <p className="text-sm">הענן לא מוגדר בסביבה זו. העבודה נשמרת מקומית בדפדפן.</p>}
          {cloudConfigured && !signedIn && (
            <p className="text-sm">
              העבודה נשמרת אוטומטית בדפדפן. לשמירת גרסאות בענן יש <a href="#/login" className="text-accent underline">להתחבר</a>.
            </p>
          )}
          {cloudConfigured && signedIn && !isMember && <p className="text-sm text-bad">החשבון מחובר אך אין לו הרשאת גישה. ההרשאה ניתנת ע"י מנהל.</p>}
          {error && <p className="mb-2 rounded bg-bad-soft px-2 py-1 text-xs text-bad">{error}</p>}

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-sunken p-3">
            <span className="text-sm font-semibold">גיבוי לקובץ במחשב</span>
            <span className="text-xs text-muted">שימושי עד שיהיה אפשר לנהל כמה פרויקטים במקביל באפליקציה עצמה</span>
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
                הורדת קובץ פרויקט
              </Button>
              <Button onClick={() => fileInputRef.current?.click()}>טעינת קובץ פרויקט</Button>
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
                      const parsed = JSON.parse(text) as { projectName?: string; params?: unknown };
                      const params = withDefaults(parsed.params);
                      if (!params) throw new Error('קובץ לא מזוהה כפרויקט Buildable תקין.');
                      importProject(params, parsed.projectName ?? projectName);
                    })
                    .catch((err: Error) => setImportError(err.message || 'שגיאה בקריאת הקובץ.'));
                }}
              />
            </div>
          </div>
          {importError && <p className="mb-2 rounded bg-bad-soft px-2 py-1 text-xs text-bad">{importError}</p>}

          {cloudConfigured && signedIn && isMember && (
            <div className="grid gap-4 md:grid-cols-[1fr_1.3fr]">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">שמירת גרסה</h3>
                <input className={inputClass} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="שם הפרויקט" />
                <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="תיאור הגרסה (לא חובה)" />
                <div className="flex gap-2">
                  <Button variant="primary" disabled={busy} onClick={saveNewVersion}>
                    {cloudProjectId ? 'שמירת גרסה חדשה' : 'יצירת פרויקט ושמירה'}
                  </Button>
                  {cloudProjectId && (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setCloudProjectId(null);
                        setProjectName(`${projectName} (עותק)`);
                      }}
                      title="הגרסה הבאה תישמר כפרויקט חדש"
                    >
                      שכפול כפרויקט חדש
                    </Button>
                  )}
                </div>
                <h3 className="pt-3 text-sm font-semibold">הפרויקטים שלי</h3>
                <ul className="space-y-1">
                  {projects.map((p) => (
                    <li key={p.id} className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ring-1 ${activeId === p.id ? 'bg-accent-soft ring-accent/40' : 'bg-panel ring-line'}`}>
                      <button className="flex-1 text-right" onClick={() => setActiveId(p.id)}>
                        {p.name}
                        <span className="block text-[11px] text-muted">{new Date(p.updated_at).toLocaleString('he-IL')}</span>
                      </button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(`למחוק את "${p.name}" וכל הגרסאות שלו? לא ניתן לשחזר.`))
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
                        מחיקה
                      </Button>
                    </li>
                  ))}
                  {!projects.length && <li className="text-xs text-muted">אין עדיין פרויקטים בענן.</li>}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">היסטוריית גרסאות</h3>
                {!activeId && <p className="text-xs text-muted">בחרו פרויקט.</p>}
                <ul className="space-y-1.5">
                  {versions.map((v) => (
                    <li key={v.id} className="flex items-center gap-2 rounded-md bg-panel px-2 py-1.5 text-xs ring-1 ring-line">
                      <span className="font-mono font-bold">v{v.version_no}</span>
                      <span className="flex-1">
                        {v.label ?? <span className="text-muted">ללא תיאור</span>}
                        <span className="block text-[11px] text-muted">
                          {new Date(v.created_at).toLocaleString('he-IL')} · {versionSize(v.params)}
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
                        שחזור
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

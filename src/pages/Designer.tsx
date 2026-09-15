import { useEffect, useMemo, useState } from 'react';
import { logUsage, type AuthState } from '../cloud/supabase';
import { cutListCsv, getMaterial, runDesign, type ComponentRole } from '../engine';
import { useDesign, type ViewMode } from '../state/designStore';
import { BuildStatusPanel } from '../ui/BuildStatusPanel';
import { Button, StatusBadge, downloadText } from '../ui/common';
import { ManufacturingPanel } from '../ui/ManufacturingPanel';
import { ParamsPanel } from '../ui/ParamsPanel';
import { PrintPackage } from '../ui/PrintPackage';
import { ProjectsDialog } from '../ui/ProjectsDialog';
import { Viewport3D, type CameraPreset } from '../ui/Viewport3D';

const VIEW_MODES: [ViewMode, string][] = [
  ['design', 'עיצוב'],
  ['structural', 'מבני'],
  ['exploded', 'מפורק'],
  ['measure', 'מידות'],
  ['warnings', 'אזהרות'],
];

const ROLE_LABEL: Record<ComponentRole, string> = { side: 'דפנות', top: 'גג', bottom: 'תחתית', shelf: 'מדפים', divider: 'מחיצות', back: 'גב', plinth: 'סוקל' };

export function DesignerPage({ auth }: { auth: AuthState }) {
  const s = useDesign();
  const result = useMemo(() => runDesign(s.params, s.config), [s.params, s.config]);
  const [preset, setPreset] = useState<{ name: CameraPreset; nonce: number }>({ name: 'iso', nonce: 0 });
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [paramsOpen, setParamsOpen] = useState(() => window.innerWidth >= 900);
  const [statusOpen, setStatusOpen] = useState(() => window.innerWidth >= 1200);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useDesign.getState().undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        useDesign.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selected = result.model.components.find((c) => c.id === s.selectedId);
  const selectedChecks = selected ? result.report.checks.filter((c) => c.componentIds.includes(selected.id)) : [];
  const roles = [...new Set(result.model.components.map((c) => c.role))];

  const exportCsv = () => {
    downloadText(`${s.projectName || 'buildable'}-cut-list.csv`, cutListCsv(result.model.parts, getMaterial), 'text/csv;charset=utf-8');
    void logUsage('export_csv', 0);
  };

  const printPackage = () => {
    const canvas = document.querySelector('canvas');
    setSnapshot(canvas ? canvas.toDataURL('image/png') : null);
    void logUsage('export_print', 0);
    // Let React render the snapshot into the print section before opening the dialog.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  return (
    <>
      <div className="no-print flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-2">
          <span className="text-lg font-bold tracking-tight">Buildable</span>
          <input value={s.projectName} onChange={(e) => s.setProjectName(e.target.value)} className="w-48 rounded-md border border-transparent px-2 py-1 text-sm hover:border-line focus:border-accent focus:outline-none" aria-label="שם הפרויקט" />
          <StatusBadge
            status={result.report.exportBlocked ? 'RED' : result.report.overall === 'GREEN' ? 'GREEN' : 'YELLOW'}
            label={result.report.exportBlocked ? 'חסום לייצור' : 'ללא כשל חוסם · נדרש אימות פיזי'}
          />
          <div className="mx-2 flex rounded-md ring-1 ring-line">
            {(['beginner', 'advanced'] as const).map((m) => (
              <button key={m} onClick={() => s.setUserMode(m)} className={`px-2.5 py-1 text-xs ${s.userMode === m ? 'bg-accent text-white' : ''}`}>
                {m === 'beginner' ? 'מתחיל' : 'מתקדם'}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <Button variant={paramsOpen ? 'secondary' : 'ghost'} onClick={() => setParamsOpen(!paramsOpen)}>
            פרמטרים
          </Button>
          <Button variant={statusOpen ? 'secondary' : 'ghost'} onClick={() => setStatusOpen(!statusOpen)}>
            בדיקות
          </Button>
          <Button variant="ghost" onClick={s.undo} disabled={!s.past.length} title="ביטול (Ctrl/⌘+Z)">
            ↶ ביטול
          </Button>
          <Button variant="ghost" onClick={s.redo} disabled={!s.future.length} title="שחזור (Ctrl/⌘+Shift+Z)">
            ↷ שחזור
          </Button>
          <Button onClick={() => setProjectsOpen(true)}>פרויקטים וגרסאות</Button>
          <Button onClick={exportCsv} disabled={result.report.exportBlocked} title={result.report.exportBlocked ? 'ייצוא חסום עד תיקון הכשלים' : undefined}>
            CSV לחיתוך
          </Button>
          <Button variant="primary" onClick={printPackage} disabled={result.report.exportBlocked} title={result.report.exportBlocked ? 'ייצוא חסום עד תיקון הכשלים' : 'שמירה כ-PDF דרך חלון ההדפסה'}>
            חבילת הזמנה (PDF)
          </Button>
          {auth.role === 'admin' && (
            <a href="#/admin" className="text-sm text-accent underline">
              ניהול
            </a>
          )}
          <a href="#/login" className="text-sm text-muted underline">
            {auth.session ? auth.session.user.email : 'התחברות'}
          </a>
        </header>

        <div className="flex min-h-0 flex-1">
          {paramsOpen && (
          <aside className="w-72 shrink-0 overflow-y-auto border-l border-line bg-white">
            <ParamsPanel />
            <div className="p-4">
              <Button
                variant="danger"
                onClick={() => {
                  if (confirm('להתחיל עיצוב חדש? העיצוב הנוכחי יישאר זמין בביטול (Ctrl+Z).')) s.reset();
                }}
              >
                עיצוב חדש
              </Button>
            </div>
          </aside>
          )}

          <main className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <Viewport3D result={result} preset={preset} />
              <div className="absolute right-3 top-3 flex flex-col gap-2">
                <div className="flex rounded-lg bg-white/95 p-1 shadow ring-1 ring-line">
                  {VIEW_MODES.map(([m, label]) => (
                    <button key={m} onClick={() => s.setViewMode(m)} className={`rounded-md px-2.5 py-1 text-xs ${s.viewMode === m ? 'bg-accent text-white' : 'hover:bg-accent-soft'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 rounded-lg bg-white/95 p-1 shadow ring-1 ring-line">
                  {roles.map((r) => (
                    <label key={r} className="flex items-center gap-1 px-1.5 text-[11px]">
                      <input type="checkbox" checked={!s.hiddenRoles.includes(r)} onChange={() => s.toggleRole(r)} />
                      {ROLE_LABEL[r]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="absolute left-3 top-3 flex rounded-lg bg-white/95 p-1 shadow ring-1 ring-line">
                {(
                  [
                    ['iso', 'איזומטרי'],
                    ['front', 'חזית'],
                    ['side', 'צד'],
                    ['top', 'על'],
                  ] as [CameraPreset, string][]
                ).map(([name, label]) => (
                  <button key={name} onClick={() => setPreset({ name, nonce: preset.nonce + 1 })} className="rounded-md px-2 py-1 text-xs hover:bg-accent-soft">
                    {label}
                  </button>
                ))}
              </div>
              {s.viewMode === 'structural' && (
                <div className="absolute bottom-3 right-3 rounded-lg bg-white/95 px-3 py-2 text-[11px] shadow ring-1 ring-line">
                  <div className="mb-1 font-semibold">צבע = סטטוס בדיקה</div>
                  <div className="flex gap-2">
                    <StatusBadge status="GREEN" />
                    <StatusBadge status="YELLOW" />
                    <StatusBadge status="RED" />
                    <StatusBadge status="GREY" />
                  </div>
                </div>
              )}
              {selected && (
                <div className="absolute bottom-3 left-3 w-64 rounded-lg bg-white/95 p-3 text-xs shadow ring-1 ring-line">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold">{selected.name}</span>
                    <button onClick={() => s.select(null)} className="text-muted">
                      ✕
                    </button>
                  </div>
                  <div className="num text-muted">
                    {Math.round(selected.size.x)} × {Math.round(selected.size.y)} × {Math.round(selected.size.z)} מ"מ
                  </div>
                  <div>
                    {getMaterial(selected.materialId)?.nameHe} · {selected.thicknessMm} מ"מ
                  </div>
                  {selected.spanMm != null && <div>מפתח חופשי: {Math.round(selected.spanMm)} מ"מ</div>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedChecks.map((c) => (
                      <StatusBadge key={c.id} status={c.status} label={c.title.split(':').pop()?.trim()} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className={`${bottomOpen ? 'h-[38%]' : 'h-9'} shrink-0 border-t border-line bg-paper`}>
              <button onClick={() => setBottomOpen(!bottomOpen)} className="absolute z-10 -mt-3 mr-3 rounded-full bg-white px-2 text-xs ring-1 ring-line">
                {bottomOpen ? '▾ ייצור' : '▴ ייצור'}
              </button>
              {bottomOpen && <ManufacturingPanel result={result} />}
            </div>
          </main>

          {statusOpen && (
            <aside className="w-96 shrink-0 overflow-y-auto border-r border-line bg-paper">
              <BuildStatusPanel result={result} />
            </aside>
          )}
        </div>
      </div>
      <PrintPackage result={result} projectName={s.projectName} snapshot={snapshot} />
      <ProjectsDialog open={projectsOpen} onClose={() => setProjectsOpen(false)} result={result} signedIn={Boolean(auth.session)} isMember={auth.role != null} />
    </>
  );
}

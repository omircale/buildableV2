import { useEffect, useMemo, useRef, useState } from 'react';
import { logUsage, type AuthState } from '../cloud/supabase';
import { allMaterials, cutListCsv, finishName, getMaterial, productTitle, runDesign, supplierProductFor, type ComponentRole, type DesignResult, type EngineLocale, type Status } from '../engine';
import { useT } from '../i18n';
import { useDesign, type ViewMode } from '../state/designStore';
import { useUi } from '../state/uiStore';
import { AdvancedPanel } from '../ui/AdvancedPanel';
import { AppHeader } from '../ui/AppHeader';
import { useRegisterCommands, type Command } from '../ui/CommandPalette';
import { Button, IconButton, Kbd, downloadText } from '../ui/common';
import { LookControls, SelectedPartPanel, StructureControls } from '../ui/DesignControls';
import { BuildPill, FixesButton } from '../ui/Issues';
import { IconCheck, IconChevron, IconFolder, IconFrame, IconLayers, IconPanel, IconRedo, IconSparkle, IconSquares, IconUndo } from '../ui/icons';
import { PrintPackage } from '../ui/PrintPackage';
import { ProjectsDialog } from '../ui/ProjectsDialog';
import { AssemblyBooklet } from '../ui/AssemblyBooklet';
import { formatCm } from '../ui/measure';
import { STATUS_COLOR, Viewport3D, type CameraPreset } from '../ui/Viewport3D';
import { ReviewStep } from './design/ReviewStep';
import { SetupStep } from './design/SetupStep';

export const STEPS = ['setup', 'structure', 'look', 'review'] as const;
export type Step = (typeof STEPS)[number];

const VIEW_MODES: ViewMode[] = ['design', 'structural', 'exploded', 'measure', 'warnings'];
const CAMERAS: CameraPreset[] = ['iso', 'front', 'side', 'top'];

function go(step: Step) {
  window.location.hash = `#/design/${step}`;
}

function Stepper({ step, result }: { step: Step; result: DesignResult }) {
  const t = useT();
  const current = STEPS.indexOf(step);
  return (
    <nav aria-label={t.flow.stepOf(current + 1, STEPS.length)}>
      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const blockedReview = s === 'review' && result.report.exportBlocked;
          return (
            <li key={s} className="flex items-center gap-2">
              {i > 0 && <span className={`h-0.5 w-8 rounded ${i <= current ? 'bg-accent' : 'bg-line'}`} aria-hidden />}
              <a
                href={`#/design/${s}`}
                aria-current={active ? 'step' : undefined}
                className={`flex h-10 items-center gap-2 rounded-full pe-3 ps-1 transition hover:bg-sunken ${active ? 'font-semibold' : 'text-muted'}`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                    active ? 'bg-accent text-on-accent' : done ? (blockedReview ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok') : 'text-muted ring-2 ring-line-strong'
                  }`}
                >
                  {done ? <IconCheck size={14} strokeWidth={2.6} /> : i + 1}
                </span>
                <span className="text-[15px]">{t.flow.steps[s]}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function LayersMenu({ roles }: { roles: ComponentRole[] }) {
  const t = useT();
  const hidden = useDesign((s) => s.hiddenRoles);
  const toggleRole = useDesign((s) => s.toggleRole);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <IconButton label={t.viewport.layers} active={open || hidden.length > 0} onClick={() => setOpen(!open)}>
        <IconLayers size={18} />
      </IconButton>
      {open && (
        <div className="absolute bottom-12 start-0 z-20 w-48 rounded-xl bg-panel p-2 shadow-lg ring-1 ring-line">
          <div className="px-2 pb-1 text-xs font-semibold text-muted">{t.viewport.layers}</div>
          {roles.map((r) => (
            <label key={r} className="flex h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-[15px] hover:bg-sunken">
              <input type="checkbox" className="h-4 w-4" checked={!hidden.includes(r)} onChange={() => toggleRole(r)} />
              {t.viewport.roles[r]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Viewport({ result }: { result: DesignResult }) {
  const t = useT();
  const viewMode = useDesign((s) => s.viewMode);
  const setViewMode = useDesign((s) => s.setViewMode);
  const advancedOpen = useUi((s) => s.advancedOpen);
  const setAdvancedOpen = useUi((s) => s.setAdvancedOpen);
  const viewStyle = useUi((s) => s.viewStyle);
  const setViewStyle = useUi((s) => s.setViewStyle);
  const [preset, setPreset] = useState<{ name: CameraPreset; nonce: number }>({ name: 'iso', nonce: 0 });
  const roles = [...new Set(result.model.components.map((c) => c.role))];

  return (
    <div className="relative min-h-0 min-w-0 flex-1 bg-sunken">
      <Viewport3D result={result} preset={preset} />
      <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-wrap items-start justify-between gap-2 [&>*]:pointer-events-auto">
        <BuildPill result={result} />
        <Button variant={advancedOpen ? 'primary' : 'secondary'} onClick={() => setAdvancedOpen(!advancedOpen)} title={t.viewport.advancedShortcut} className="shadow-sm">
          <IconPanel size={18} />
          {t.viewport.advanced}
          <Kbd>E</Kbd>
        </Button>
      </div>
      {viewMode === 'structural' && (
        <div className="absolute end-4 bottom-20 flex flex-col gap-1.5 rounded-xl bg-panel/95 px-3 py-2.5 text-[13px] shadow-sm ring-1 ring-line">
          {(['GREEN', 'YELLOW', 'RED', 'GREY'] as Status[]).map((s) => (
            <span key={s} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: STATUS_COLOR[s] }} />
              {t.viewport.legend[s]}
            </span>
          ))}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
        {/* On narrower windows the toolbar scrolls inside itself instead of pushing the page sideways. */}
        <div className="scrollbar-none flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-panel/95 p-1 shadow-md ring-1 ring-line backdrop-blur [&>*]:shrink-0">
          <div role="radiogroup" aria-label={t.viewport.layers} className="flex">
            {VIEW_MODES.map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={viewMode === m}
                onClick={() => setViewMode(m)}
                className={`h-10 rounded-lg px-3.5 text-[15px] ${viewMode === m ? 'bg-accent-soft font-semibold text-accent-ink' : 'hover:bg-sunken'}`}
              >
                {t.viewport.modes[m]}
              </button>
            ))}
          </div>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden />
          {CAMERAS.map((c) => (
            <button key={c} onClick={() => setPreset({ name: c, nonce: preset.nonce + 1 })} className="h-10 rounded-lg px-2.5 text-sm text-muted hover:bg-sunken hover:text-ink">
              {t.viewport.cameras[c]}
            </button>
          ))}
          <IconButton label={t.viewport.cameras.iso} onClick={() => setPreset({ name: 'iso', nonce: preset.nonce + 1 })}>
            <IconFrame size={18} />
          </IconButton>
          <LayersMenu roles={roles} />
          <span className="mx-1 h-6 w-px bg-line" aria-hidden />
          <div role="radiogroup" aria-label={t.view.style} className="flex gap-0.5 rounded-lg bg-sunken p-0.5">
            <button
              type="button"
              role="radio"
              aria-checked={viewStyle === 'realistic'}
              title={t.view.realisticHint}
              onClick={() => setViewStyle('realistic')}
              className={`flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm ${viewStyle === 'realistic' ? 'bg-panel font-semibold shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              <IconSparkle size={15} />
              {t.view.realistic}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={viewStyle === 'illustration'}
              title={t.view.illustrationHint}
              onClick={() => setViewStyle('illustration')}
              className={`flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm ${viewStyle === 'illustration' ? 'bg-panel font-semibold shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              <IconSquares size={15} />
              {t.view.illustration}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DesignerPage({ auth, step }: { auth: AuthState; step: Step }) {
  const t = useT();
  const s = useDesign();
  const advancedOpen = useUi((u) => u.advancedOpen);
  const setAdvancedOpen = useUi((u) => u.setAdvancedOpen);
  const locale = useUi((u) => u.locale) as EngineLocale;
  const result = useMemo(() => runDesign(s.params, s.config, locale), [s.params, s.config, locale]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          useDesign.getState().undo();
        } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
          e.preventDefault();
          useDesign.getState().redo();
        }
        return;
      }
      if (k === 'e' && !e.altKey) {
        e.preventDefault();
        useUi.getState().setAdvancedOpen(!useUi.getState().advancedOpen);
      } else if (k === 'escape') {
        useDesign.getState().select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const exportCsv = () => {
    downloadText(`${s.projectName || 'buildable'}-cut-list.csv`, cutListCsv(result.model.parts, getMaterial), 'text/csv;charset=utf-8');
    void logUsage('export_csv', 0);
  };

  const [pdfBusy, setPdfBusy] = useState(false);

  /** Generates a real, downloadable PDF (no print dialog) by rasterizing the print package — the browser
   * shapes the Hebrew/RTL text correctly this way, which jsPDF's own text API cannot do on its own. */
  const printPackage = async () => {
    const canvas = document.querySelector('canvas');
    setSnapshot(canvas ? canvas.toDataURL('image/png') : null);
    void logUsage('export_print', 0);
    setPdfBusy(true);
    try {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const el = document.getElementById('print-package');
      if (!el) return;
      const previousStyle = el.getAttribute('style');
      Object.assign(el.style, { display: 'block', position: 'fixed', left: '-10000px', top: '0', width: '210mm' });
      try {
        const { exportElementToPdf } = await import('../ui/pdfExport');
        await exportElementToPdf(el, `${s.projectName || 'buildable'}.pdf`);
      } finally {
        if (previousStyle == null) el.removeAttribute('style');
        else el.setAttribute('style', previousStyle);
      }
    } finally {
      setPdfBusy(false);
    }
  };

  const [bookletBusy, setBookletBusy] = useState(false);
  const downloadBooklet = async () => {
    setBookletBusy(true);
    try {
      const el = document.getElementById('assembly-booklet');
      if (!el) return;
      const { exportPagesToPdf } = await import('../ui/pdfExport');
      await exportPagesToPdf(el, `${s.projectName || 'buildable'} - ${t.booklet.title}.pdf`);
    } finally {
      setBookletBusy(false);
    }
  };

  const commands = useMemo<Command[]>(() => {
    const a = t.command.actions;
    const p = s.params;
    const list: Command[] = [
      ...(p.template === 'open_shelf'
        ? ([
            { id: 'add-shelf', group: 'actions', label: a.addShelf, keywords: 'shelf מדף', disabled: p.shelfCount >= 12, run: () => s.update({ shelfCount: p.shelfCount + 1 }) },
            { id: 'remove-shelf', group: 'actions', label: a.removeShelf, keywords: 'shelf מדף', disabled: p.shelfCount <= 0, run: () => s.update({ shelfCount: p.shelfCount - 1 }) },
            { id: 'add-divider', group: 'actions', label: a.addDivider, keywords: 'divider מחיצה', disabled: p.dividerCount >= 6, run: () => s.update({ dividerCount: p.dividerCount + 1 }) },
            { id: 'remove-divider', group: 'actions', label: a.removeDivider, keywords: 'divider מחיצה', disabled: p.dividerCount <= 0, run: () => s.update({ dividerCount: p.dividerCount - 1 }) },
          ] as Command[])
        : []),
      { id: 'advanced', group: 'actions', label: a.toggleAdvanced, detail: 'E', keywords: 'engineering checks cut list הנדסה בדיקות חיתוך', run: () => setAdvancedOpen(!useUi.getState().advancedOpen) },
      { id: 'csv', group: 'actions', label: a.exportCsv, keywords: 'export csv ייצוא', disabled: result.report.exportBlocked, run: exportCsv },
      { id: 'pdf', group: 'actions', label: a.printPdf, keywords: 'print pdf הדפסה', disabled: result.report.exportBlocked, run: printPackage },
      { id: 'projects', group: 'actions', label: a.projects, keywords: 'save versions שמירה גרסאות', run: () => setProjectsOpen(true) },
      { id: 'undo', group: 'actions', label: t.common.undo, detail: 'Ctrl Z', disabled: !s.past.length, run: s.undo },
      { id: 'redo', group: 'actions', label: t.common.redo, detail: 'Ctrl Shift Z', disabled: !s.future.length, run: s.redo },
      ...STEPS.map((st, i) => ({ id: `step-${st}`, group: 'steps' as const, label: t.flow.steps[st], detail: t.flow.stepOf(i + 1, STEPS.length), run: () => go(st) })),
      ...result.model.components.map((c) => ({
        id: `part-${c.id}`,
        group: 'parts' as const,
        label: c.name,
        detail: `${formatCm(c.size.x)} × ${formatCm(c.size.y)} × ${formatCm(c.size.z)}`,
        keywords: `${c.id} ${t.viewport.roles[c.role]}`,
        run: () => {
          s.select(c.id);
          if (step !== 'structure' && step !== 'look') go('structure');
        },
      })),
    ];
    for (const m of allMaterials()) {
      const sp = supplierProductFor(m);
      if (!sp || sp.product.role !== 'board') continue;
      for (const f of sp.product.finishes) {
        list.push({
          id: `mat-${m.id}-${f.id}`,
          group: 'materials',
          label: `${productTitle(sp.product, locale)} · ${finishName(f, locale)}`,
          detail: `₪${f.pricePerSqm}${t.structure.perSqm}`,
          swatch: f.color,
          keywords: `${sp.product.thicknessMm}`,
          run: () => {
            s.update({ materialId: m.id, thicknessMm: sp.product.thicknessMm, finishId: f.id, edgeOption: sp.product.edgeBanding ? p.edgeOption : 'none', finish: { ...p.finish, type: 'supplier' } });
            if (step === 'setup' || step === 'review') go('look');
          },
        });
      }
    }
    return list;
    // exportCsv/printPackage close over the latest result through this memo's deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, s.params, s.past.length, s.future.length, result, step]);
  useRegisterCommands('designer', commands);


  const q = result.quote;
  const showSidePanel = step === 'structure' || step === 'look';

  return (
    <>
      <div className="no-print flex h-full flex-col bg-paper">
        <AppHeader
          auth={auth}
          start={
            <input
              value={s.projectName}
              onChange={(e) => s.setProjectName(e.target.value)}
              aria-label={t.header.projectName}
              className="h-10 w-52 min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-base font-semibold hover:border-line focus:border-accent focus:outline-none"
            />
          }
          center={<Stepper step={step} result={result} />}
          end={
            <>
              <IconButton label={`${t.common.undo} (Ctrl/⌘ Z)`} onClick={s.undo} disabled={!s.past.length}>
                <IconUndo size={18} />
              </IconButton>
              <IconButton label={`${t.common.redo} (Ctrl/⌘ Shift Z)`} onClick={s.redo} disabled={!s.future.length}>
                <IconRedo size={18} />
              </IconButton>
              <IconButton label={t.command.actions.projects} onClick={() => setProjectsOpen(true)}>
                <IconFolder size={18} />
              </IconButton>
              <span className="mx-1 hidden text-sm text-muted 2xl:inline">{t.common.saved}</span>
            </>
          }
        />

        <div className="flex min-h-0 flex-1">
          {step === 'setup' && <SetupStep result={result} />}
          {showSidePanel && (
            <>
              <aside className="w-[360px] shrink-0 overflow-y-auto border-e border-line bg-panel" aria-label={t.flow.steps[step]}>
                {s.selectedId ? <SelectedPartPanel result={result} /> : step === 'structure' ? <StructureControls result={result} /> : <LookControls />}
              </aside>
              <Viewport result={result} />
              {advancedOpen && <AdvancedPanel result={result} />}
            </>
          )}
          {step === 'review' && <ReviewStep result={result} onCsv={exportCsv} onPrint={printPackage} pdfBusy={pdfBusy} onBooklet={downloadBooklet} bookletBusy={bookletBusy} />}
        </div>

        {step !== 'review' && (
          <footer className="flex h-[72px] shrink-0 items-center justify-between gap-4 border-t border-line bg-panel px-6">
            <div className="flex items-center gap-4">
            <FixesButton result={result} />
            <div className="flex items-baseline gap-2.5">
              {q ? (
                <>
                  <span className="text-sm text-muted">{t.flow.estimatedPrice}</span>
                  <span className="num text-2xl font-bold">{t.common.ils(q.totalIls)}</span>
                  <span className="text-sm text-muted">{t.flow.inclShipping}</span>
                </>
              ) : (
                <span className="text-sm text-muted">{t.flow.noPrice}</span>
              )}
            </div>
            </div>
            <div className="flex items-center gap-2">
              {stepIndex > 0 ? (
                <Button variant="ghost" size="lg" onClick={() => go(STEPS[stepIndex - 1])}>
                  {t.common.back}
                </Button>
              ) : (
                <a href="#/" className="inline-flex h-12 items-center rounded-lg px-6 text-base hover:bg-sunken">
                  {t.common.back}
                </a>
              )}
              <Button variant="primary" size="lg" onClick={() => go(STEPS[stepIndex + 1])}>
                {t.flow.next[step]}
                <IconChevron size={18} className="ltr:rotate-180" />
              </Button>
            </div>
          </footer>
        )}
      </div>
      <PrintPackage result={result} projectName={s.projectName} snapshot={snapshot} />
      <AssemblyBooklet result={result} projectName={s.projectName} />
      <ProjectsDialog open={projectsOpen} onClose={() => setProjectsOpen(false)} result={result} signedIn={Boolean(auth.session)} isMember={auth.role != null} />
    </>
  );
}

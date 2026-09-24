import { useEffect, useRef } from 'react';
import type { DesignResult } from '../engine';
import { useT } from '../i18n';
import { useDesign } from '../state/designStore';
import { useUi, type EditorTab } from '../state/uiStore';
import { AddComponentPanel } from './AddComponentPanel';
import { LookControls, SelectedPartPanel, StructureControls } from './DesignControls';
import { FlatSections } from './common';

const TABS: EditorTab[] = ['structure', 'look', 'addons'];

/**
 * The editing panel.
 *
 * Two rules from the tools that do this well shape it. First, an inspector shows what belongs to the
 * current selection, not everything there is — Figma's panel is near-empty with nothing selected and
 * Canva's toolbar appears only once you pick something. So: pick a part and this becomes that part;
 * pick nothing and it is the piece as a whole.
 *
 * Second, a few long groups belong in one row of tabs rather than a column of accordions, which is
 * Nielsen Norman's line for exactly this case — an accordion is for many short sections nobody needs
 * all of, and these are four long ones a person needs most of.
 */
export function EditorPanel({ result }: { result: DesignResult }) {
  const t = useT();
  const selectedId = useDesign((s) => s.selectedId);
  const tab = useUi((s) => s.editorTab);
  const setTab = useUi((s) => s.setEditorTab);

  if (selectedId) return <SelectedPartPanel result={result} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label={t.flow.controls} className="flex shrink-0 gap-1 border-b border-line px-3 pt-3">
        {TABS.map((id) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              role="tab"
              id={`editor-tab-${id}`}
              aria-selected={selected}
              aria-controls={`editor-panel-${id}`}
              onClick={() => setTab(id)}
              /* Two signals for the active tab, not one: weight and an underline that meets the border. */
              className={`-mb-px min-h-11 flex-1 border-b-2 px-3 text-[15px] transition ${
                selected ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {t.editor.tabs[id]}
            </button>
          );
        })}
      </div>

      <div id={`editor-panel-${tab}`} role="tabpanel" aria-labelledby={`editor-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto">
        {/* Inside a tab the groups are headings, not another layer of folding: two levels of disclosure, not three. */}
        <FlatSections>
          {tab === 'structure' && <StructureControls result={result} />}
          {tab === 'look' && <LookControls />}
          {tab === 'addons' && <AddComponentPanel result={result} />}
        </FlatSections>
      </div>
    </div>
  );
}

/**
 * Scrolls a section into view and rings it when a finding points at it, then releases the ring so it
 * does not become permanent decoration.
 */
export function useSectionFocus(id: string | undefined): { ref: React.RefObject<HTMLElement | null>; focused: boolean } {
  const focusSectionId = useUi((s) => s.focusSectionId);
  const ref = useRef<HTMLElement>(null);
  const focused = Boolean(id) && focusSectionId === id;
  useEffect(() => {
    if (!focused) return;
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focused]);
  return { ref, focused };
}

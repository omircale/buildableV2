import type { DesignResult } from '../engine';
import { useT } from '../i18n';
import { useUi, type AdvancedTab } from '../state/uiStore';
import { BuildStatusPanel } from './BuildStatusPanel';
import { IconButton } from './common';
import { IconX } from './icons';
import { ManufacturingTab } from './ManufacturingPanel';

const TABS: AdvancedTab[] = ['checks', 'order', 'cut', 'sheets', 'bom', 'assembly', 'impact'];

export function AdvancedPanel({ result }: { result: DesignResult }) {
  const t = useT();
  const tab = useUi((s) => s.advancedTab);
  const setTab = useUi((s) => s.setAdvancedTab);
  const setOpen = useUi((s) => s.setAdvancedOpen);

  return (
    <aside className="flex w-[520px] shrink-0 flex-col border-s border-line bg-panel" aria-label={t.viewport.advanced}>
      <div className="flex items-center gap-2 border-b border-line ps-2 pe-1">
        <div role="tablist" className="scrollbar-none flex min-w-0 flex-1 overflow-x-auto">
          {TABS.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`h-12 shrink-0 border-b-[3px] px-2.5 text-[14px] whitespace-nowrap ${tab === id ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {t.advanced.tabs[id]}
            </button>
          ))}
        </div>
        <IconButton label={t.advanced.close} onClick={() => setOpen(false)}>
          <IconX size={18} />
        </IconButton>
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto bg-paper">
        {tab === 'checks' ? <BuildStatusPanel result={result} /> : <ManufacturingTab result={result} tab={tab} />}
      </div>
    </aside>
  );
}

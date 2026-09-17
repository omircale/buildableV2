import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { useT } from '../i18n';
import { useUi } from '../state/uiStore';
import { Kbd } from './common';
import { IconSearch } from './icons';

export type CommandGroup = 'furniture' | 'steps' | 'actions' | 'parts' | 'materials';

export interface Command {
  id: string;
  group: CommandGroup;
  label: string;
  detail?: string;
  keywords?: string;
  swatch?: string;
  disabled?: boolean;
  run: () => void;
}

const useRegistry = create<{ sources: Record<string, Command[]>; set: (key: string, cmds: Command[] | null) => void }>((set) => ({
  sources: {},
  set: (key, cmds) =>
    set((s) => {
      const sources = { ...s.sources };
      if (cmds) sources[key] = cmds;
      else delete sources[key];
      return { sources };
    }),
}));

/** Lets a page contribute commands while it is mounted. */
export function useRegisterCommands(key: string, commands: Command[]) {
  const set = useRegistry((s) => s.set);
  useEffect(() => {
    set(key, commands);
  }, [key, commands, set]);
  useEffect(() => () => set(key, null), [key, set]);
}

const GROUP_ORDER: CommandGroup[] = ['actions', 'steps', 'parts', 'materials', 'furniture'];

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[֑-ׇ̀-ͯ׳״"']/gu, '');
}

function search(all: Command[], query: string): Command[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  const matched = tokens.length
    ? all.filter((c) => tokens.every((tok) => normalize(`${c.label} ${c.detail ?? ''} ${c.keywords ?? ''}`).includes(tok)))
    : all.filter((c) => c.group !== 'materials' && c.group !== 'parts');
  return GROUP_ORDER.flatMap((g) => matched.filter((c) => c.group === g)).slice(0, 60);
}

export function CommandPalette() {
  const open = useUi((s) => s.commandOpen);
  const setOpen = useUi((s) => s.setCommandOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUi.getState().commandOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // Mounting the dialog only while open gives every opening a fresh query and a synchronously focused input.
  return open ? <PaletteDialog /> : null;
}

function PaletteDialog() {
  const t = useT();
  const setOpen = useUi((s) => s.setCommandOpen);
  const sources = useRegistry((s) => s.sources);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => search(Object.values(sources).flat(), query), [sources, query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (c: Command | undefined) => {
    if (!c || c.disabled) return;
    setOpen(false);
    c.run();
  };

  let lastGroup: CommandGroup | null = null;

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label={t.header.search} className="w-full max-w-xl overflow-hidden rounded-2xl bg-panel shadow-2xl ring-1 ring-line" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex h-14 items-center gap-3 border-b border-line px-4">
          <IconSearch size={20} className="text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                // The DOM value can be ahead of the last render when Enter follows typing or pasting immediately.
                const typed = e.currentTarget.value;
                run(typed === query ? results[active] : search(Object.values(sources).flat(), typed)[0]);
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
            placeholder={t.command.placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} id="command-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && <p className="px-3 py-6 text-center text-[15px] text-muted">{t.command.empty}</p>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? t.command.groups[c.group] : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {header && <div className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted">{header}</div>}
                <div
                  id={`cmd-${c.id}`}
                  role="option"
                  data-index={i}
                  aria-selected={i === active}
                  aria-disabled={c.disabled}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(c)}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${i === active ? 'bg-accent-soft' : ''} ${c.disabled ? 'opacity-45' : ''}`}
                >
                  {c.swatch && <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/25" style={{ background: c.swatch }} />}
                  <span className="flex-1 text-[15px]">{c.label}</span>
                  {c.detail && <span className="text-[13px] text-muted">{c.detail}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-line px-4 py-2 text-xs text-muted">{t.command.hint}</div>
      </div>
    </div>
  );
}

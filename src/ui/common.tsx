import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { Status } from '../engine';
import { useT } from '../i18n';
import { useUi } from '../state/uiStore';
import { IconAlert, IconCheck, IconChevronDown, IconHelpCircle, IconMinus, IconPlus, IconSearch, IconX } from './icons';

export const STATUS_SEVERITY: Record<Status, number> = { GREEN: 0, YELLOW: 1, GREY: 2, RED: 3 };

const STATUS_CLASS: Record<Status, string> = {
  GREEN: 'bg-ok-soft text-ok ring-ok/30',
  YELLOW: 'bg-warn-soft text-warn ring-warn/30',
  RED: 'bg-bad-soft text-bad ring-bad/30',
  GREY: 'bg-unknown-soft text-unknown ring-unknown/30',
};

export function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  if (status === 'GREEN') return <IconCheck size={size} strokeWidth={2.4} />;
  if (status === 'YELLOW') return <IconAlert size={size} strokeWidth={2.2} />;
  if (status === 'RED') return <IconX size={size} strokeWidth={2.4} />;
  return <IconHelpCircle size={size} strokeWidth={2} />;
}

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const t = useT();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-semibold ring-1 ${STATUS_CLASS[status]}`}>
      <StatusIcon status={status} size={12} />
      {label ?? t.status[status]}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-muted">
        <span className="shrink-0">{label}</span>
        {hint && <span className="text-[13px] font-normal">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export const inputClass = 'h-10 w-full rounded-lg border border-line-strong bg-panel px-3 text-[15px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-50';

export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string }) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-panel px-2.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
      <IconSearch size={16} className="shrink-0 text-muted" />
      <input
        type="search"
        value={value}
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" aria-label="clear" onClick={() => onChange('')} className="text-muted hover:text-ink">
          <IconX size={14} />
        </button>
      )}
    </div>
  );
}

/** Case/diacritics-insensitive "contains every word" match used by in-section search fields. */
export function matchesQuery(query: string, ...texts: (string | undefined | null)[]): boolean {
  const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0591-\u05C7\u0300-\u036f\u05F3\u05F4"']/gu, '');
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = norm(texts.filter(Boolean).join(' '));
  return tokens.every((t) => hay.includes(t));
}

/**
 * Collapsible category. Collapsed, it shows its title plus a one-line summary of the current choice,
 * so long panels read like a stack of dropdowns instead of an endless scroll.
 */
/**
 * Inside a tab, a group is a heading rather than another thing to unfold. Sections that were authored
 * to start closed stay foldable — the author already judged them secondary.
 */
const FlatSectionsContext = createContext(false);

export function FlatSections({ children }: { children: ReactNode }) {
  return <FlatSectionsContext.Provider value={true}>{children}</FlatSectionsContext.Provider>;
}

export function Section({
  id,
  title,
  summary,
  children,
  right,
  defaultOpen = true,
  count,
}: {
  id?: string;
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) {
  const stored = useUi((s) => (id ? s.sections[id] : undefined));
  const setSectionOpen = useUi((s) => s.setSectionOpen);
  const flat = useContext(FlatSectionsContext) && defaultOpen;
  const foldable = Boolean(id) && !flat;
  const open = foldable ? (stored ?? defaultOpen) : true;
  const bodyId = id ? `section-${id}` : undefined;

  // A finding can point at the control that governs it; the section says so briefly, then lets go.
  const focusSectionId = useUi((s) => s.focusSectionId);
  const clearFocus = useUi((s) => s.clearFocus);
  const focused = Boolean(id) && focusSectionId === id;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focused) return;
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const timer = setTimeout(clearFocus, 2200);
    return () => clearTimeout(timer);
  }, [focused, clearFocus]);

  return (
    <section ref={ref} className={`border-b border-line transition ${focused ? 'bg-accent-soft ring-2 ring-accent ring-inset' : ''}`}>
      <div className="flex items-center gap-2 px-5">
        {foldable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => id && setSectionOpen(id, !open)}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2 text-start"
          >
            <IconChevronDown size={16} className={`shrink-0 text-muted transition ${open ? '' : 'rtl:rotate-90 ltr:-rotate-90'}`} />
            <span className="text-[15px] font-semibold">{title}</span>
            {count != null && <span className="rounded-full bg-sunken px-1.5 text-xs text-muted">{count}</span>}
            {!open && summary && <span className="ms-auto truncate ps-2 text-[13px] text-muted">{summary}</span>}
          </button>
        ) : (
          <h3 className="flex min-h-12 flex-1 items-center text-[15px] font-semibold">{title}</h3>
        )}
        {open && right}
      </div>
      {open && (
        <div id={bodyId} className="space-y-3 px-5 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function buttonClass(variant: Variant = 'secondary', size: 'md' | 'lg' | 'sm' = 'md') {
  const styles = {
    primary: 'bg-accent text-on-accent hover:brightness-110 font-semibold',
    secondary: 'bg-panel text-ink ring-1 ring-line-strong hover:bg-accent-soft',
    ghost: 'text-ink hover:bg-sunken',
    danger: 'bg-panel text-bad ring-1 ring-bad/40 hover:bg-bad-soft',
  }[variant];
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-10 px-4 text-[15px]', lg: 'h-12 px-6 text-base' }[size];
  return `inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${sizes}`;
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled,
  title,
  type = 'button',
  className = '',
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button type={type} title={title} aria-label={ariaLabel} disabled={disabled} onClick={onClick} className={`${buttonClass(variant, size)} ${className}`}>
      {children}
    </button>
  );
}

export function IconButton({ label, onClick, children, active, disabled }: { label: string; onClick?: () => void; children: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-sunken'}`}
    >
      {children}
    </button>
  );
}

/** Number input with a unit; the value is stored in `scale` units per displayed unit (e.g. mm stored, cm shown → scale 10). */
export function UnitInput({ value, onChange, unit, scale = 1, min, max, step = 1, ariaLabel, invalid }: { value: number; onChange: (v: number) => void; unit: string; scale?: number; min?: number; max?: number; step?: number; ariaLabel?: string; invalid?: boolean }) {
  const shown = Math.round((value / scale) * 100) / 100;
  return (
    <div className={`flex h-10 items-center rounded-lg border bg-panel focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 ${invalid ? 'border-bad' : 'border-line-strong'}`}>
      <input
        type="number"
        aria-label={ariaLabel}
        value={shown}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v)) onChange(v * scale);
        }}
        className="num h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] text-ink outline-none"
      />
      <span className="pe-3 text-[13px] text-muted">{unit}</span>
    </div>
  );
}

export function Stepper({ value, onChange, min, max, label, format }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string; format: (v: number) => string }) {
  return (
    <div className="inline-flex h-10 items-center rounded-lg border border-line-strong bg-panel" role="group" aria-label={label}>
      <button type="button" aria-label={`${label} −`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className="flex h-full w-10 items-center justify-center rounded-s-lg hover:bg-sunken disabled:opacity-35">
        <IconMinus size={16} />
      </button>
      <span className="min-w-24 px-2 text-center text-[15px]" aria-live="polite">
        {format(value)}
      </span>
      <button type="button" aria-label={`${label} +`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className="flex h-full w-10 items-center justify-center rounded-e-lg hover:bg-sunken disabled:opacity-35">
        <IconPlus size={16} />
      </button>
    </div>
  );
}

export function Chip({ selected, onClick, children, disabled }: { selected: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm transition disabled:opacity-40 ${selected ? 'bg-ink text-paper' : 'bg-panel text-ink ring-1 ring-line-strong hover:bg-sunken'}`}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-sunken px-1.5 py-0.5 font-sans text-xs text-muted">{children}</kbd>;
}

export function downloadText(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking in the same tick can cancel the download in some browsers; release the blob a moment later.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

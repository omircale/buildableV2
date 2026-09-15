import type { ReactNode } from 'react';
import type { CheckCategory, Status } from '../engine';

export const STATUS_LABEL: Record<Status, string> = { GREEN: 'עובר', YELLOW: 'אזהרה', RED: 'נכשל', GREY: 'לא ידוע' };

export const CATEGORY_LABEL: Record<CheckCategory, string> = {
  geometry: 'גאומטריה',
  materials: 'חומרים',
  structure: 'מבנה',
  connections: 'חיבורים',
  stability: 'יציבות',
  manufacturing: 'ייצור',
  assembly: 'הרכבה',
  safety: 'בטיחות',
};

const STATUS_CLASS: Record<Status, string> = {
  GREEN: 'bg-ok-soft text-ok ring-ok/30',
  YELLOW: 'bg-warn-soft text-warn ring-warn/30',
  RED: 'bg-bad-soft text-bad ring-bad/30',
  GREY: 'bg-unknown-soft text-unknown ring-unknown/30',
};

const STATUS_ICON: Record<Status, string> = { GREEN: '✓', YELLOW: '!', RED: '✕', GREY: '?' };

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_CLASS[status]}`}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-xs font-medium text-muted">
        <span>{label}</span>
        {hint && <span className="text-[11px] text-muted/80">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export const inputClass = 'w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {right}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

export function Button({ children, onClick, variant = 'secondary', disabled, title, type = 'button' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; title?: string; type?: 'button' | 'submit' }) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent/90',
    secondary: 'bg-white text-ink ring-1 ring-line hover:bg-accent-soft',
    ghost: 'text-muted hover:bg-black/5',
    danger: 'bg-white text-bad ring-1 ring-bad/30 hover:bg-bad-soft',
  }[variant];
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}>
      {children}
    </button>
  );
}

export function downloadText(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

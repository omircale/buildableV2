import { useEffect } from 'react';
import { useT } from '../../i18n';
import { useSurvey } from '../../state/spaceStore';
import { IconX } from '../icons';

/** How long the offer to undo stays on screen. Long enough to notice a slip and reach the button. */
const VISIBLE_MS = 12_000;

/**
 * "Removed — undo."
 *
 * A destructive action here is never confirmed with a dialog and never final on the spot: it happens,
 * and for a while it can be taken back. A dialog before every delete teaches people to click through
 * it; an undo afterwards is there for the one time it was a mistake. Announced politely, so a screen
 * reader hears what was removed without losing its place.
 */
export function UndoToast() {
  const t = useT();
  const undoable = useSurvey((s) => s.undoable);
  const undo = useSurvey((s) => s.undo);
  const dismiss = useSurvey((s) => s.dismissUndo);
  const refusal = useSurvey((s) => s.refusal);
  const dismissRefusal = useSurvey((s) => s.dismissRefusal);
  const r = t.survey.refusal;
  const saveFailed = useSurvey((s) => s.saveFailed);

  useEffect(() => {
    if (!undoable) return;
    const timer = setTimeout(dismiss, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [undoable, dismiss]);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4">
      {/* Not dismissible: it goes when a save goes through, and not before. */}
      {saveFailed && (
        <div role="alert" className="pointer-events-auto max-w-xl rounded-xl bg-bad px-4 py-3 text-body leading-snug text-white shadow-lg">
          {t.survey.saveFailed}
        </div>
      )}
      {/* Something asked for and not done. It stays until read: a refusal that fades is a silent one. */}
      {refusal && (
        <div role="alert" className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-xl bg-bad px-4 py-3 text-body leading-snug text-white shadow-lg">
          <span>
            {refusal.code === 'item_count' && r.item_count(refusal.asked, refusal.limit)}
            {refusal.code === 'rooms_full' && r.rooms_full(refusal.limit)}
            {refusal.code === 'rooms_copies' && r.rooms_copies(refusal.asked, refusal.left)}
            {refusal.code === 'room_count' && r.room_count(refusal.asked, refusal.limit)}
          </span>
          <button type="button" onClick={dismissRefusal} aria-label={t.common.close} className="mt-0.5 shrink-0 opacity-80 hover:opacity-100">
            <IconX size={16} />
          </button>
        </div>
      )}
      {undoable && (
        <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-body text-paper shadow-lg">
          <span>{t.survey.undo[undoable.kind]}</span>
          <button type="button" onClick={undo} className="font-semibold underline underline-offset-2">
            {t.survey.undo.action}
          </button>
          <button type="button" onClick={dismiss} aria-label={t.common.close} className="opacity-70 hover:opacity-100">
            <IconX size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

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

  useEffect(() => {
    if (!undoable) return;
    const timer = setTimeout(dismiss, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [undoable, dismiss]);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
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

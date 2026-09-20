import { useT } from '../../i18n';
import { useUi } from '../../state/uiStore';

/** States plainly that the model is showing a catalogue finish which does not affect the design or the price. */
export function DecorPreviewBadge() {
  const t = useT();
  const preview = useUi((s) => s.decorPreview);
  const setPreview = useUi((s) => s.setDecorPreview);
  if (!preview) return null;
  return (
    <div className="flex h-11 items-center gap-2 rounded-full bg-panel/95 py-1 pe-2 ps-1 shadow-sm ring-1 ring-accent/40 backdrop-blur">
      <img src={preview.image} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-line" />
      <span className="max-w-[220px] truncate text-[14px] font-semibold" title={preview.nameHe}>
        {t.decors.previewBadge(preview.nameHe)}
      </span>
      <button type="button" onClick={() => setPreview(null)} className="h-9 rounded-full px-3 text-[13px] font-medium text-accent-ink hover:bg-sunken">
        {t.decors.clearPreview}
      </button>
    </div>
  );
}

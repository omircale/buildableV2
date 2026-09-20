import { useMemo, useState } from 'react';
import type { AuthState } from '../cloud/supabase';
import { useT } from '../i18n';
import { useUi } from '../state/uiStore';
import { AppHeader } from '../ui/AppHeader';
import { Chip, SearchField, buttonClass } from '../ui/common';
import { DECOR_CATALOG, decorFacets, filterDecors, type CatalogDecor } from '../ui/decors/catalog';

/**
 * The panel distributor's published finishes, with their own photographs (used with permission).
 * These are that distributor's products, not the decors of the boards the current price comes from, so a
 * chosen finish is shown on the model as a preview and never changes the design or the order.
 */
export function DecorsPage({ auth }: { auth: AuthState }) {
  const t = useT();
  const preview = useUi((s) => s.decorPreview);
  const setPreview = useUi((s) => s.setDecorPreview);
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<string | null>(null);
  const [materialType, setMaterialType] = useState<string | null>(null);

  const all = DECOR_CATALOG.decors;
  const families = useMemo(() => decorFacets(all, 'family'), [all]);
  const materials = useMemo(() => decorFacets(all, 'materialType'), [all]);
  const shown = useMemo(() => filterDecors(all, { query, family, materialType }), [all, query, family, materialType]);

  const choose = (d: CatalogDecor) => {
    setPreview({ code: d.code, nameHe: d.nameHe, image: d.image });
    window.location.hash = '#/design/look';
  };

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <AppHeader auth={auth} />
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-5 px-8 py-9">
        <div className="flex flex-col gap-2">
          <h1 className="text-[36px] leading-tight font-bold tracking-tight">{t.decors.title}</h1>
          <p className="max-w-3xl text-lg leading-relaxed text-muted">{t.decors.intro}</p>
          <p className="max-w-3xl rounded-xl bg-warn-soft px-4 py-3 text-[14px] leading-relaxed text-warn">{t.decors.previewOnlyNote}</p>
        </div>

        <div className="flex flex-col gap-3">
          <SearchField value={query} onChange={setQuery} placeholder={t.decors.search} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted">{t.decors.family}</span>
            <Chip selected={family == null} onClick={() => setFamily(null)}>
              {t.decors.all}
            </Chip>
            {families.map((f) => (
              <Chip key={f} selected={family === f} onClick={() => setFamily(family === f ? null : f)}>
                {t.decors.families[f] ?? f}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted">{t.decors.material}</span>
            <Chip selected={materialType == null} onClick={() => setMaterialType(null)}>
              {t.decors.all}
            </Chip>
            {materials.map((m) => (
              <Chip key={m} selected={materialType === m} onClick={() => setMaterialType(materialType === m ? null : m)}>
                {t.decors.materials[m] ?? m}
              </Chip>
            ))}
          </div>
          <p className="text-sm text-muted">{t.decors.showing(shown.length, all.length)}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((d) => (
            <figure key={d.code} className={`flex flex-col overflow-hidden rounded-xl bg-panel ring-1 ${preview?.code === d.code ? 'ring-2 ring-accent' : 'ring-line'}`}>
              <button type="button" onClick={() => choose(d)} className="group relative block aspect-square overflow-hidden bg-sunken" aria-label={`${t.decors.preview}: ${d.nameHe}`}>
                <img src={d.image} alt={d.nameHe} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 bg-ink/70 px-2 py-1 text-[12px] font-semibold text-paper opacity-0 transition group-hover:opacity-100">{t.decors.preview}</span>
              </button>
              <figcaption className="flex flex-1 flex-col gap-1 px-3 py-2">
                <span className="line-clamp-2 text-[14px] font-medium" title={d.nameHe}>
                  {d.nameHe}
                </span>
                <span className="num text-[12px] text-muted">{d.code}</span>
                <span className="text-[12px] text-muted">
                  {[d.materialType && (t.decors.materials[d.materialType] ?? d.materialType), d.finish].filter(Boolean).join(' · ')}
                </span>
                <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-auto text-[12px] text-accent-ink underline underline-offset-2">
                  {t.decors.atSource}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
        {shown.length === 0 && <p className="rounded-xl bg-panel p-6 text-[15px] text-muted ring-1 ring-line">{t.decors.noMatches}</p>}

        <footer className="flex flex-wrap items-center gap-3 rounded-xl bg-sunken p-4 text-[13px] leading-relaxed text-muted">
          <span className="flex-1">
            {DECOR_CATALOG.attribution} {t.decors.imported(DECOR_CATALOG.imagesImportedAt, DECOR_CATALOG.count)}
          </span>
          <a href={DECOR_CATALOG.catalogIndexUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('ghost', 'sm')}>
            {t.decors.catalogSite}
          </a>
        </footer>
      </main>
    </div>
  );
}

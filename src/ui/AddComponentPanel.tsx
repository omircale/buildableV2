import { useMemo, useState } from 'react';
import { ADDONS, openingsFor } from '../engine/addons/registry';
import type { Addon, AddonKind, DesignResult, Opening } from '../engine';
import { useT } from '../i18n';
import { useDesign } from '../state/designStore';
import { Button, SearchField, Section, StatusIcon, matchesQuery } from './common';
import { formatCm } from './measure';

const KINDS = Object.keys(ADDONS) as AddonKind[];

/**
 * The component library: search or scroll the parts a piece can take, and put one into a specific
 * opening. It is the same panel on every furniture type, because a component builds into an opening
 * and every template declares its own — so a drawer is offered wherever a drawer actually fits, and
 * nowhere it does not.
 */
export function AddComponentPanel({ result }: { result: DesignResult }) {
  const t = useT();
  const params = useDesign((s) => s.params);
  const update = useDesign((s) => s.update);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState<AddonKind | null>(null);

  const openings = result.model.openings;
  const added = params.addons ?? [];
  const taken = new Set(added.map((a) => a.openingId));

  const catalog = useMemo(
    () =>
      KINDS.map((kind) => {
        const fits = openingsFor(kind, openings).filter((o) => !taken.has(o.id));
        return { kind, label: t.addons.kinds[kind].name, blurb: t.addons.kinds[kind].blurb, fits };
      }).filter((c) => matchesQuery(query, c.label, c.blurb)),
    [openings, query, t, taken],
  );

  const add = (kind: AddonKind, opening: Opening) => {
    const id = `${kind}_${Date.now().toString(36)}`;
    update({ addons: [...added, { id, kind, openingId: opening.id }] });
    setPicking(null);
  };

  const remove = (addon: Addon) => update({ addons: added.filter((a) => a.id !== addon.id) });

  if (!openings.length)
    return (
      <Section title={t.addons.title} defaultOpen={false}>
        <p className="text-[14px] leading-relaxed text-muted">{t.addons.noOpenings}</p>
      </Section>
    );

  return (
    <Section title={t.addons.title} defaultOpen={added.length > 0}>
      <div className="flex flex-col gap-4">
        {added.length > 0 && (
          <ul className="flex flex-col gap-2">
            {added.map((a) => {
              const opening = openings.find((o) => o.id === a.openingId);
              const checks = result.report.checks.filter((c) => c.id.endsWith(a.id));
              return (
                <li key={a.id} className="flex items-center gap-3 rounded-lg bg-sunken px-3 py-2">
                  <span className="flex-1 text-[14px]">
                    <span className="font-medium">{t.addons.kinds[a.kind].name}</span>
                    {/* An addon whose opening is gone is not built; say so rather than listing it as if it were. */}
                    <span className="text-muted"> · {opening ? opening.name : t.addons.openingGone}</span>
                  </span>
                  {checks.map((c) => (
                    <StatusIcon key={c.id} status={c.status} />
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => remove(a)}>
                    {t.addons.remove}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <SearchField value={query} onChange={setQuery} placeholder={t.addons.search} label={t.addons.search} />

        <ul className="flex flex-col gap-2">
          {catalog.map(({ kind, label, blurb, fits }) => (
            <li key={kind} className="rounded-lg ring-1 ring-line">
              <button
                type="button"
                disabled={!fits.length}
                onClick={() => setPicking(picking === kind ? null : kind)}
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex-1">
                  <span className="block text-[15px] font-medium">{label}</span>
                  <span className="block text-[13px] leading-snug text-muted">{blurb}</span>
                </span>
                <span className="num shrink-0 pt-0.5 text-[12px] text-muted">{fits.length ? t.addons.spots(fits.length) : t.addons.noRoom}</span>
              </button>

              {picking === kind && fits.length > 0 && (
                <ul className="flex flex-col gap-1 border-t border-line px-3 py-2">
                  <li className="pb-1 text-[13px] text-muted">{t.addons.chooseSpot}</li>
                  {fits.map((o) => (
                    <li key={o.id}>
                      <button type="button" onClick={() => add(kind, o)} className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-start text-[14px] hover:bg-sunken">
                        <span className="flex-1">{o.name}</span>
                        <span className="num text-[12px] text-muted">
                          {formatCm(o.size.x)} × {formatCm(o.size.y)} × {formatCm(o.size.z)} {t.common.cm}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {catalog.length === 0 && <p className="text-[14px] text-muted">{t.addons.noMatches}</p>}
      </div>
    </Section>
  );
}

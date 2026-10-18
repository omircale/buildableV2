import { useEffect, useState } from 'react';
import { loadBill, type AuthState } from '../cloud/supabase';
import { SERVICE_LABEL, SITE_CHECKS, branchNeed, evaluateChecks, floorAreaM2, propertySummary, type CheckStatus, type ServiceKind } from '../engine';
import { useT } from '../i18n';
import { projectRooms, reviveProject } from '../state/spaceStore';
import { useUi } from '../state/uiStore';
import { AppHeader } from '../ui/AppHeader';
import { buttonClass } from '../ui/common';

const STYLE: Record<CheckStatus, string> = { ok: 'bg-ok-soft', gap: 'bg-bad-soft text-bad', unknown: 'bg-unknown-soft' };

interface Side {
  name: string;
  rooms: number;
  floorM2: number | null;
  points: Partial<Record<ServiceKind, number>>;
  status: Map<string, CheckStatus>;
  summary: ReturnType<typeof propertySummary>;
}

/** One saved property, read back and checked the same way the walk-through checks it. */
export function sideOf(name: string, data: unknown): Side | null {
  const project = reviveProject(data);
  if (!project) return null;
  const rooms = projectRooms(project);
  const need = branchNeed(rooms);
  const evaluated = evaluateChecks(need, project.siteChecks);
  const areas = rooms.map((r) => floorAreaM2(r.space));
  return {
    name: project.propertyName || name,
    rooms: rooms.reduce((a, r) => a + r.count, 0),
    // A total over rooms some of which were never measured would read as the floor area; it is not.
    floorM2: areas.every((a) => a != null) ? rooms.reduce((a, r, i) => a + (areas[i] as number) * r.count, 0) : null,
    points: need.points,
    status: new Map(evaluated.map((e) => [e.check.id, e.status])),
    summary: propertySummary(evaluated),
  };
}

/**
 * Two properties side by side, for the decision between them.
 *
 * Read straight from the account and checked by the same rules as the walk-through, so the comparison
 * can never disagree with what each property's own screens say.
 */
export function ComparePage({ auth, ids }: { auth: AuthState; ids: string[] }) {
  const t = useT();
  const c = t.compare;
  const k = t.check;
  const he = useUi((s) => s.locale) === 'he';
  const [sides, setSides] = useState<Side[] | null>(null);
  const [failed, setFailed] = useState(false);
  const ready = auth.session != null && auth.role != null && ids.length === 2;

  useEffect(() => {
    if (!ready) return;
    let live = true;
    Promise.all(ids.map((id) => loadBill(id))).then(
      (loaded) => {
        if (!live) return;
        const out = loaded.map((l) => (l ? sideOf(l.row.name, l.data) : null));
        if (out.some((s) => s == null)) setFailed(true);
        else setSides(out as Side[]);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [ready, ids]);

  const fmt = (n: number) => n.toLocaleString(he ? 'he-IL' : 'en-GB', { maximumFractionDigits: 1 });
  const kinds = sides ? ([...new Set(sides.flatMap((s) => Object.keys(s.points)))] as ServiceKind[]) : [];
  const rows = SITE_CHECKS.filter((check) => sides?.some((s) => s.status.has(check.id)));

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <AppHeader auth={auth} start={<h1 className="truncate text-control font-semibold">{c.title}</h1>} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-4 py-6">
        <p className="max-w-3xl text-body text-muted">{c.intro}</p>
        {!auth.loading && !ready && <p className="rounded-xl bg-sunken p-4 text-body">{auth.session ? c.pick : c.needAccount}</p>}
        {ready && !sides && !failed && <p className="text-body text-muted">{c.loading}</p>}
        {failed && (
          <p role="alert" className="rounded-xl bg-bad-soft p-4 text-body text-bad">
            {c.failed}
          </p>
        )}
        {sides && (
          <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
            <table className="w-full min-w-[560px] border-collapse text-body">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-3 text-start text-small font-semibold text-muted">{c.check}</th>
                  {sides.map((s, i) => (
                    <th key={i} className="px-4 py-3 text-start">
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-small font-normal text-muted">{c.summary(s.summary.gaps, s.summary.unknown, s.summary.ok)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line">
                  <td className="px-4 py-2.5 text-small text-muted">{c.rooms}</td>
                  {sides.map((s, i) => (
                    <td key={i} className="px-4 py-2.5 tabular-nums">
                      {s.rooms}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-line">
                  <td className="px-4 py-2.5 text-small text-muted">{c.floor}</td>
                  {sides.map((s, i) => (
                    <td key={i} className="px-4 py-2.5 tabular-nums">
                      {s.floorM2 == null ? <span className="text-muted">{c.notMeasured}</span> : `${fmt(s.floorM2)} ${he ? 'מ"ר' : 'm²'}`}
                    </td>
                  ))}
                </tr>
                {rows.map((check) => (
                  <tr key={check.id} className="border-b border-line">
                    <td className="px-4 py-2.5 leading-snug">{he ? check.he : check.en}</td>
                    {sides.map((s, i) => {
                      const st = s.status.get(check.id);
                      return (
                        <td key={i} className="px-4 py-2.5">
                          {st ? <span className={`rounded-full px-2.5 py-0.5 text-caption font-semibold ${STYLE[st]}`}>{st === 'ok' ? k.ok : st === 'gap' ? k.gap : k.unknownStatus}</span> : <span className="text-small text-muted">{c.notAsked}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {kinds.map((kind) => (
                  <tr key={kind} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 text-small text-muted">
                      {c.needs}: {he ? SERVICE_LABEL[kind].he : SERVICE_LABEL[kind].en}
                    </td>
                    {sides.map((s, i) => (
                      <td key={i} className="px-4 py-2.5 tabular-nums">
                        {s.points[kind] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <a href="#/projects" className={buttonClass('secondary', 'md')}>
          {c.back}
        </a>
      </main>
    </div>
  );
}

export default ComparePage;

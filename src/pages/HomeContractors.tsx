import type { AuthState } from '../cloud/supabase';
import { useStudioT } from '../i18n/studio';
import { useStudio } from '../state/studioStore';
import { AppHeader } from '../ui/AppHeader';
import { buttonClass } from '../ui/common';

/**
 * The front door of Buildable for building contractors: one action, the studio. The open project, if
 * there is one, is offered back so a second visit does not start over.
 */
export function HomeContractorsPage({ auth }: { auth: AuthState }) {
  const t = useStudioT();
  const h = t.home;
  const name = useStudio((s) => s.name);
  const hasPlan = useStudio((s) => s.spaces.length > 0);
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <AppHeader auth={auth} />
      <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12">
        <section className="flex flex-col gap-5">
          <div className="flex max-w-3xl flex-col gap-3">
            <h1 className="text-display leading-tight font-bold tracking-tight text-balance">{h.title}</h1>
            <p className="text-lg leading-relaxed text-muted">{h.body}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href={hasPlan ? '#/studio/plan' : '#/studio/start'} className={buttonClass('primary', 'lg')}>
              {hasPlan ? h.open : h.start}
            </a>
            {hasPlan && name && <span className="text-body text-muted">{name}</span>}
          </div>
          <p className="max-w-3xl rounded-xl bg-warn-soft px-4 py-3 text-small leading-relaxed">{t.demo}</p>
        </section>
        <section className="flex flex-col gap-4" aria-labelledby="how-title">
          <h2 id="how-title" className="text-xl font-semibold">
            {h.how}
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {h.steps.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-1.5 rounded-xl border border-line bg-panel p-4">
                <span className="text-small font-semibold text-accent-ink tabular-nums">{i + 1}</span>
                <span className="text-body font-semibold">{step.title}</span>
                <span className="text-small leading-relaxed text-muted">{step.body}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}

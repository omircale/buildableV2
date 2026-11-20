import type { AuthState } from '../cloud/api';
import { useServicesT } from '../i18n/services';
import { useT } from '../i18n';
import { projectRooms, useSurvey } from '../state/spaceStore';
import { AppHeader } from '../ui/AppHeader';
import { buttonClass } from '../ui/common';

/**
 * The front door of the hospitality site: what it does for a hotel, and the way into it.
 *
 * One primary action — a room's bill of quantities — because a hotel renovates the building it already
 * has. Checking a property before renting it is still there, as a secondary link, for a chain that
 * takes a new site. The open project, if there is one, is offered back so a refresh or a second visit
 * does not start over.
 */
export function HomePage({ auth }: { auth: AuthState }) {
  const equipmentLink = useServicesT().homeLink;
  const t = useT();
  const h = t.home;
  const survey = useSurvey();
  const rooms = projectRooms(survey);
  const answered = Object.keys(survey.siteChecks).length;
  const hasProperty = survey.propertyName !== '' || survey.equipmentIds.length > 0 || rooms.length > 1 || answered > 0;

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <AppHeader auth={auth} />
      <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12">
        <section className="flex flex-col gap-5" aria-label={h.hotelTitle}>
          <div className="flex max-w-3xl flex-col gap-3">
            <h1 className="text-display leading-tight font-bold tracking-tight text-balance">{h.hotelTitle}</h1>
            <p className="text-lg leading-relaxed text-muted">{h.hotelBody}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href="#/space" className={buttonClass('primary', 'lg')}>
              {h.roomStart}
            </a>
            <a href="#/journey" className={buttonClass('secondary', 'lg')}>
              {h.hotelStart}
            </a>
            <a href="#/equipment" className="text-body font-medium text-accent-ink underline underline-offset-2">
              {equipmentLink}
            </a>
            <a href="#/check/start" className="text-body font-medium text-accent-ink underline underline-offset-2">
              {h.checkLease}
            </a>

          </div>
          <p className="max-w-3xl rounded-xl bg-warn-soft px-4 py-3 text-small leading-relaxed">{h.draftNote}</p>
        </section>

        {hasProperty && (
          <section className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-line bg-panel px-5 py-4" aria-label={h.openTitle}>
            <div className="min-w-0 flex-1 basis-60">
              <div className="text-small text-muted">{h.openTitle}</div>
              <div className="text-lg font-semibold">{survey.propertyName || h.unnamedProperty}</div>
              <div className="text-small text-muted">{h.openFacts(rooms.length, answered)}</div>
            </div>
            <a href="#/space" className={buttonClass('primary', 'md')}>
              {h.continueProject}
            </a>
            {answered > 0 && (
              <a href="#/check/tour" className="text-small text-accent-ink underline underline-offset-2">
                {h.continueCheck}
              </a>
            )}
            <a href="#/projects" className="text-small text-muted underline underline-offset-2">
              {t.header.projects}
            </a>
          </section>
        )}

        <section className="flex flex-col gap-4" aria-labelledby="how-title">
          <h2 id="how-title" className="text-xl font-semibold">
            {h.howTitle}
          </h2>
          {/* A real sequence, so it is numbered. */}
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {h.how.map((step, i) => (
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

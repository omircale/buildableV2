import type { AuthState } from '../cloud/supabase';
import { useT } from '../i18n';
import { BillsSection } from '../ui/account/Bills';
import { AppHeader } from '../ui/AppHeader';
import { ProjectBackup } from '../ui/survey/ProjectBackup';

/**
 * The properties: those saved to the account, filed by place, and the one open in this browser.
 */
export function ProjectsPage({ auth }: { auth: AuthState }) {
  const t = useT();
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <AppHeader auth={auth} />
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-9">
        <h1 className="text-title leading-tight font-bold tracking-tight">{t.projects.title}</h1>
        <BillsSection auth={auth} />
        <section className="flex flex-col gap-2 rounded-xl bg-sunken p-4">
          <p className="max-w-prose text-body leading-relaxed text-muted">{t.projects.localOnlyBills}</p>
          <ProjectBackup />
        </section>
      </main>
    </div>
  );
}

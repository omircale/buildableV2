import type { AuthState } from '../cloud/supabase';
import { useT } from '../i18n';
import { AppHeader } from '../ui/AppHeader';
import { buttonClass } from '../ui/common';

/**
 * An address that leads nowhere says so.
 *
 * It used to open the home page without a word, which reads as "the link worked" — and a link to a
 * room or a step that no longer exists, sent to a colleague, would land them somewhere unrelated with
 * no sign that anything was wrong.
 */
export function NotFoundPage({ auth }: { auth: AuthState }) {
  const t = useT();
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <AppHeader auth={auth} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-6 py-12">
        <h1 className="text-title leading-tight font-bold text-balance">{t.notFound.title}</h1>
        <p className="text-base leading-relaxed text-muted">{t.notFound.body}</p>
        <div className="flex flex-wrap gap-3">
          <a href="#/" className={buttonClass('primary')}>
            {t.notFound.home}
          </a>
          <a href="#/journey" className={buttonClass('secondary')}>
            {t.journey.title}
          </a>
        </div>
      </main>
    </div>
  );
}

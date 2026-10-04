import type { AuthState } from '../cloud/supabase';
import { useT } from '../i18n';
import { AppHeader } from '../ui/AppHeader';
import { BillView } from '../ui/survey/BillView';
import { SampleBanner, SurveyEditor } from '../ui/survey/SurveyEditor';
import { useRoomBill } from '../ui/survey/useRoomBill';

/** The survey on its own: measure, mark, read the bill. The walkthrough at #/journey uses the same parts. */
export function SpacePage({ auth }: { auth: AuthState }) {
  const t = useT();
  const bill = useRoomBill();

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <AppHeader auth={auth} start={<h1 className="truncate text-[15px] font-semibold">{t.survey.title}</h1>} />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-6">
        <p className="max-w-2xl text-[14px] leading-relaxed text-muted">{t.survey.intro}</p>
        <SampleBanner />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="rounded-2xl border border-line bg-panel">
            <SurveyEditor bill={bill} />
          </div>
          <div className="rounded-2xl border border-line bg-panel">
            <BillView lines={bill.lines} showReset />
          </div>
        </div>
      </main>
    </div>
  );
}

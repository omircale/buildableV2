import type { AuthState } from '../cloud/supabase';
import { useT } from '../i18n';
import { AppHeader } from '../ui/AppHeader';
import { BillView } from '../ui/survey/BillView';
import { FinishSchedule } from '../ui/survey/FinishSchedule';
import { ProjectBackup } from '../ui/survey/ProjectBackup';
import { RoomSwitcher } from '../ui/survey/RoomSwitcher';
import { SampleBanner, SurveyEditor } from '../ui/survey/SurveyEditor';
import { UndoToast } from '../ui/survey/UndoToast';
import { useRoomBill } from '../ui/survey/useRoomBill';

/** The project on one screen: its rooms, the open room's survey, the finish schedule and the bill. */
export function SpacePage({ auth }: { auth: AuthState }) {
  const t = useT();
  const bill = useRoomBill();

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <AppHeader auth={auth} start={<h1 className="truncate text-control font-semibold">{t.survey.title}</h1>} />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-6">
        <p className="max-w-2xl text-body leading-relaxed text-muted">{t.survey.intro}</p>
        <SampleBanner />
        <RoomSwitcher bill={bill} />
        <ProjectBackup />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0 space-y-6">
            <div className="rounded-2xl border border-line bg-panel">
              <SurveyEditor bill={bill} />
            </div>
            <FinishSchedule bill={bill} />
          </div>
          <div className="min-w-0 self-start rounded-2xl border border-line bg-panel">
            <BillView bill={bill} showReset />
          </div>
        </div>
      </main>
      <UndoToast />
    </div>
  );
}

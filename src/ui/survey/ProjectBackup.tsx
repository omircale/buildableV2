import { useRef, useState } from 'react';
import { useT } from '../../i18n';
import { useSurvey } from '../../state/spaceStore';
import { downloadText } from '../common';

/** A backup is small; a file far larger than any project is not one. */
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/**
 * The project as a file, and back.
 *
 * The survey lives in this browser and nowhere else. Until it can be saved to an account, a file is
 * the only way to move it to another device, hand it to a colleague, or keep it past a cleared cache —
 * and a browser can clear a site's storage on its own schedule.
 */
export function ProjectBackup() {
  const t = useT();
  const b = t.survey.backup;
  const exportProject = useSurvey((s) => s.exportProject);
  const restoreProject = useSurvey((s) => s.restoreProject);
  const fileRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem]">
      <span className="text-muted">{b.note}</span>
      <button type="button" className="font-medium text-accent-ink underline underline-offset-2" onClick={() => downloadText('buildable-project.json', exportProject(), 'application/json')}>
        {b.save}
      </button>
      <button type="button" className="font-medium text-accent-ink underline underline-offset-2" onClick={() => fileRef.current?.click()}>
        {b.restore}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setFailed(file.size > MAX_BACKUP_BYTES || !restoreProject(await file.text()));
        }}
      />
      {failed && (
        <span role="alert" className="text-bad">
          {b.failed}
        </span>
      )}
    </div>
  );
}

import type { AuthState } from '../cloud/api';
import { useT } from '../i18n';
import { useAppUpdate, switchToNewVersion } from '../pwa';
import { Button } from './common';

/** A line above every screen: working without a connection, or a new version ready to use. */
export function AppStatus({ auth }: { auth: AuthState }) {
  const c = useT().common;
  const update = useAppUpdate((s) => s.waiting);
  if (!auth.offline && !update) return null;
  return (
    <div className="no-print flex flex-wrap items-center justify-center gap-3 bg-warn-soft px-4 py-1.5 text-small" role="status">
      {auth.offline && <span>{c.offlineBar}</span>}
      {update && (
        <>
          <span>{c.updateReady}</span>
          <Button size="sm" onClick={switchToNewVersion}>
            {c.updateNow}
          </Button>
        </>
      )}
    </div>
  );
}

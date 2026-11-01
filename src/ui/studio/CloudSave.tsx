import { useEffect, useState } from 'react';
import { deleteStudio, listStudio, signInUrl, type AuthState, type StudioRow } from '../../cloud/api';
import { useStudioT } from '../../i18n/studio';
import { hasUnsaved, useStudio } from '../../state/studioStore';
import { keepLocalOnly, keepMine, openFromCloud, putInCloud, syncNow, takeTheirs, useStudioSync } from '../../state/studioSync';
import { useUi } from '../../state/uiStore';
import { Button } from '../common';

/** The studio's link to the account: where the project stands, and the choices when two devices disagree. */

function useWhen() {
  const locale = useUi((s) => (s.locale === 'he' ? 'he-IL' : 'en-GB'));
  return {
    time: (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    date: (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  };
}

const isMember = (auth: AuthState) => !!auth.session && !!auth.role;

/** Beside the studio's title: save to the account, or how the saved project stands. */
export function CloudStatus({ auth }: { auth: AuthState }) {
  const c = useStudioT().cloud;
  const when = useWhen();
  const cloud = useStudio((s) => s.cloud);
  const unsaved = useStudio(hasUnsaved);
  const hasPlan = useStudio((s) => s.spaces.length > 0);
  const status = useStudioSync((s) => s.status);

  if (auth.loading) return null;
  if (!auth.session) {
    return (
      <a href={signInUrl('#/studio/start')} className="text-small text-muted underline underline-offset-2">
        {c.signIn}
      </a>
    );
  }
  if (!auth.role) return null;

  if (!cloud) {
    return (
      <Button size="sm" disabled={!hasPlan || status === 'saving'} onClick={() => void putInCloud()}>
        {status === 'saving' ? c.status.saving : c.save}
      </Button>
    );
  }

  // A change waits a moment before it is sent; saying "saving" then is truer than flashing "unsaved".
  const shown = (status === 'saved' || status === 'idle') && unsaved ? 'saving' : status;
  const text = shown === 'saved' || shown === 'idle' ? c.status.saved(when.time(cloud.savedAt)) : c.status[shown];
  const tone = shown === 'saved' || shown === 'idle' ? 'bg-ok-soft' : shown === 'saving' ? 'bg-panel text-muted' : shown === 'offline' ? 'bg-warn-soft' : 'bg-bad-soft text-bad';
  return (
    <span className="flex items-center gap-2">
      <span role="status" className={`rounded-full px-3 py-0.5 text-caption ${tone}`}>
        {text}
      </span>
      {(shown === 'failed' || shown === 'signedOut') && (
        <Button size="sm" variant="ghost" onClick={() => void syncNow()}>
          {c.retry}
        </Button>
      )}
    </span>
  );
}

/** When another device saved over this one's starting point, or the project left the account. */
export function CloudChoice() {
  const c = useStudioT().cloud;
  const when = useWhen();
  const status = useStudioSync((s) => s.status);
  const theirs = useStudioSync((s) => s.theirs);
  const [busy, setBusy] = useState(false);
  const act = (fn: () => Promise<void> | void) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (status === 'conflict') {
    return (
      <div role="alert" className="no-print flex flex-wrap items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-small">
        <p className="flex-1 basis-64">{c.conflictBody(theirs ? when.date(theirs.updated_at) : '—')}</p>
        <Button size="sm" variant="primary" disabled={busy} onClick={act(takeTheirs)}>
          {c.takeTheirs}
        </Button>
        <Button size="sm" disabled={busy} onClick={act(() => (confirm(c.keepMineConfirm) ? keepMine() : undefined))}>
          {c.keepMine}
        </Button>
      </div>
    );
  }
  if (status === 'gone') {
    return (
      <div role="alert" className="no-print flex flex-wrap items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-small">
        <p className="flex-1 basis-64">{c.goneBody}</p>
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={act(async () => {
            keepLocalOnly();
            await putInCloud();
          })}
        >
          {c.saveAgain}
        </Button>
        <Button size="sm" disabled={busy} onClick={keepLocalOnly}>
          {c.localOnly}
        </Button>
      </div>
    );
  }
  return null;
}

/** On the studio's first step: the projects in the account, to open on this device. */
export function CloudProjects({ auth, onOpened }: { auth: AuthState; onOpened: () => void }) {
  const c = useStudioT().cloud;
  const when = useWhen();
  const currentId = useStudio((s) => s.cloud?.id ?? null);
  const [rows, setRows] = useState<StudioRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [asked, setAsked] = useState(0);
  const refresh = () => setAsked((n) => n + 1);
  const member = isMember(auth);

  useEffect(() => {
    // The list is the account's; it is read again when this device's project joins or leaves it.
    if (!member) return;
    let live = true;
    listStudio().then(
      (r) => live && (setRows(r), setFailed(false)),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [member, currentId, asked]);

  if (!member) return null;

  const open = async (row: StudioRow) => {
    const s = useStudio.getState();
    const onlyHere = s.spaces.length > 0 && (!s.cloud || hasUnsaved(s));
    if (s.spaces.length > 0 && !confirm(onlyHere ? c.replaceUnsaved : c.replace)) return;
    setBusy(row.id);
    const ok = await openFromCloud(row.id);
    setBusy(null);
    if (ok) onOpened();
    else refresh();
  };

  const remove = async (row: StudioRow) => {
    if (!confirm(c.removeConfirm(row.name))) return;
    setBusy(row.id);
    try {
      await deleteStudio(row.id);
      if (useStudio.getState().cloud?.id === row.id) keepLocalOnly();
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <section className="space-y-2 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-base font-semibold">{c.list}</h2>
      <p className="text-small text-muted">{c.listHint}</p>
      {failed && <p className="text-small text-bad">{c.loadFailed}</p>}
      {rows && rows.length === 0 && <p className="text-small text-muted">{c.empty}</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 basis-40">
                <span className="block truncate font-medium">{row.name}</span>
                <span className="text-caption text-muted">{c.updated(when.date(row.updated_at))}</span>
              </span>
              {row.id === currentId ? (
                <span className="rounded-full bg-ok-soft px-3 py-0.5 text-caption">{c.current}</span>
              ) : (
                <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => void open(row)}>
                  {c.open}
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void remove(row)}>
                {c.remove}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

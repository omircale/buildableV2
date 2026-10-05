import { useCallback, useEffect, useState } from 'react';
import { createBill, createPlace, deleteBill, deletePlace, listBills, listPlaces, loadBill, renamePlace, updateBill, type AuthState, type BillRow, type PlaceRow } from '../../cloud/supabase';
import { useT } from '../../i18n';
import { useAccount } from '../../state/accountStore';
import { projectRooms, useSurvey } from '../../state/spaceStore';
import { useUi } from '../../state/uiStore';
import { Button, buttonClass, inputClass } from '../common';
import { IconFolder } from '../icons';

/** The open survey as the account stores it: the same thing a backup file holds. */
function openProject() {
  const st = useSurvey.getState();
  return { data: JSON.parse(st.exportProject()) as unknown, rooms: projectRooms(st).length };
}

/** After a save the survey and the account agree; this is the moment they did. */
const savedNow = () => useSurvey.getState().updatedAt ?? 0;

function PlaceSelect({ places, value, onChange, id }: { places: PlaceRow[]; value: string | null; onChange: (placeId: string | null) => void; id?: string }) {
  const b = useT().account.bills;
  return (
    <select id={id} className={inputClass} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{b.noPlace}</option>
      {places.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

/** Who can save to an account, and what to say to everyone else. Null means: go ahead. */
function useGate(auth: AuthState): { text: string; link: boolean } | null {
  const a = useT().account;
  if (auth.loading) return { text: '', link: false };
  if (!auth.session) return { text: a.bills.signInPrompt, link: true };
  if (!auth.role) return { text: a.pendingBody, link: false };
  return null;
}

/**
 * The line that says where the open project lives, and saves it.
 *
 * It sits beside the work, not on a separate page: a person should not have to leave a room they are
 * surveying to find out whether it is saved anywhere but this browser.
 */
export function CloudSave({ auth }: { auth: AuthState }) {
  const t = useT();
  const b = t.account.bills;
  const gate = useGate(auth);
  const current = useAccount((s) => s.current);
  const setCurrent = useAccount((s) => s.setCurrent);
  const updatedAt = useSurvey((s) => s.updatedAt);
  const roomName = useSurvey((s) => s.space.nameHe);
  const [form, setForm] = useState(false);
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [name, setName] = useState('');
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (gate) {
    if (!gate.text) return null;
    return (
      <p className="text-small text-muted">
        {gate.text}{' '}
        {gate.link && (
          <a href="#/login" className="font-medium text-accent-ink underline underline-offset-2">
            {b.signInLink}
          </a>
        )}
      </p>
    );
  }

  const attempt = async (work: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await work();
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  const saveChanges = () =>
    attempt(async () => {
      if (!current) return;
      const row = await updateBill(current.id, openProject());
      setCurrent({ id: row.id, name: row.name, placeId: row.place_id, savedAt: savedNow() });
    });

  const openForm = () => {
    setName(current ? current.name : roomName || '');
    setPlaceId(current?.placeId ?? null);
    setForm(true);
    void listPlaces().then(setPlaces, () => setFailed(true));
  };

  const saveNew = () =>
    attempt(async () => {
      const row = await createBill({ name: name.trim() || b.untitled, placeId, ...openProject() });
      setCurrent({ id: row.id, name: row.name, placeId: row.place_id, savedAt: savedNow() });
      setForm(false);
    });

  const unsaved = current != null && (updatedAt ?? 0) > current.savedAt;

  return (
    <div className="space-y-3 text-small">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {current ? (
          <>
            <span className="font-medium">{current.name}</span>
            <span role="status" className={`rounded-full px-2.5 py-0.5 ${unsaved ? 'bg-warn-soft' : 'bg-ok-soft'}`}>
              {busy ? b.saving : unsaved ? b.unsaved : b.saved}
            </span>
            <Button size="sm" variant={unsaved ? 'primary' : 'secondary'} disabled={busy || !unsaved} onClick={() => void saveChanges()}>
              {b.saveChanges}
            </Button>
            <button type="button" className="text-muted underline underline-offset-2" onClick={openForm}>
              {b.saveAsNew}
            </button>
          </>
        ) : (
          <>
            <span className="text-muted">{b.notSaved}</span>
            <Button size="sm" variant="primary" disabled={busy} onClick={openForm}>
              {b.save}
            </Button>
          </>
        )}
        <a href="#/projects" className="ms-auto text-muted underline underline-offset-2">
          {t.account.toProjects}
        </a>
      </div>

      {form && (
        <form
          className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void saveNew();
          }}
        >
          <label className="block">
            <span className="mb-1 block text-muted">{b.name}</span>
            <input className={inputClass} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-muted">{b.place}</span>
            <PlaceSelect places={places} value={placeId} onChange={setPlaceId} />
          </label>
          <div className="flex gap-2">
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? b.saving : b.save}
            </Button>
            <Button variant="ghost" onClick={() => setForm(false)}>
              {t.common.close}
            </Button>
          </div>
        </form>
      )}

      {failed && (
        <p role="alert" className="text-bad">
          {b.failed}
        </p>
      )}
    </div>
  );
}

function BillItem({ bill, places, current, onChanged, onOpen }: { bill: BillRow; places: PlaceRow[]; current: boolean; onChanged: () => void; onOpen: () => void }) {
  const b = useT().account.bills;
  const locale = useUi((s) => s.locale);
  const account = useAccount();
  const [editing, setEditing] = useState(false);

  const rename = async (value: string) => {
    setEditing(false);
    const name = value.trim();
    if (!name || name === bill.name) return;
    await updateBill(bill.id, { name });
    if (account.current?.id === bill.id) account.setCurrent({ ...account.current, name });
    onChanged();
  };

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-2.5 last:border-0">
      <div className="min-w-0 flex-1 basis-48">
        {editing ? (
          <input
            autoFocus
            aria-label={b.rename}
            defaultValue={bill.name}
            maxLength={200}
            className={inputClass}
            onBlur={(e) => void rename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void rename((e.target as HTMLInputElement).value);
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-body font-medium">{bill.name}</span>
            {current && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-caption">{b.current}</span>}
          </div>
        )}
        <div className="text-small text-muted">
          {b.rooms(bill.rooms)} · {b.updated} {new Date(bill.updated_at).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-GB')}
        </div>
      </div>
      <label className="flex items-center gap-2 text-small text-muted">
        <span className="sr-only sm:not-sr-only">{b.moveTo}</span>
        <span className="w-40">
          <PlaceSelect
            places={places}
            value={bill.place_id}
            onChange={async (placeId) => {
              await updateBill(bill.id, { placeId });
              if (account.current?.id === bill.id) account.setCurrent({ ...account.current, placeId });
              onChanged();
            }}
          />
        </span>
      </label>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={buttonClass('primary', 'sm')} onClick={onOpen}>
          {b.open}
        </button>
        <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => setEditing(true)}>
          {b.rename}
        </button>
        <button
          type="button"
          className={`${buttonClass('ghost', 'sm')} text-bad`}
          onClick={async () => {
            // Deleting from the account cannot be taken back, so it is asked — unlike a room, which can.
            if (!confirm(b.deleteConfirm(bill.name))) return;
            await deleteBill(bill.id);
            if (account.current?.id === bill.id) account.setCurrent(null);
            onChanged();
          }}
        >
          {b.delete}
        </button>
      </div>
    </li>
  );
}

/**
 * Everything the account has saved, in folders named after places.
 *
 * A folder is a place — a hotel, a branch, an office floor — because that is how the people who run
 * several sites already think about their work. A project with no place is not hidden; it has its own
 * group at the end.
 */
export function BillsSection({ auth }: { auth: AuthState }) {
  const t = useT();
  const b = t.account.bills;
  const gate = useGate(auth);
  const account = useAccount();
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [bills, setBills] = useState<BillRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPlace, setNewPlace] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);

  const member = gate == null;
  const refresh = useCallback(() => {
    Promise.all([listPlaces(), listBills()]).then(
      ([p, l]) => {
        setPlaces(p);
        setBills(l);
        setError(null);
      },
      () => setError(b.loadFailed),
    );
  }, [b.loadFailed]);
  // Whose list this is: another account signing in must never see the last one's rows for a moment.
  const userId = auth.session?.user.id;
  useEffect(() => {
    setBills(null);
    setPlaces([]);
    if (member) refresh();
  }, [member, userId, refresh]);

  const guard = (work: () => Promise<unknown>, message: string) => () => void work().catch(() => setError(message));

  const open = async (bill: BillRow) => {
    const loaded = await loadBill(bill.id);
    if (!loaded || !useSurvey.getState().restoreProject(JSON.stringify(loaded.data))) return setError(b.openFailed);
    account.setCurrent({ id: bill.id, name: bill.name, placeId: bill.place_id, savedAt: savedNow() });
    window.location.hash = '#/space';
  };

  const heading = (
    <div className="flex max-w-2xl flex-col gap-1">
      <h2 className="text-xl font-semibold">{b.title}</h2>
      <p className="text-body leading-relaxed text-muted">{b.subtitle}</p>
    </div>
  );

  if (gate) {
    return (
      <section className="space-y-3">
        {heading}
        {gate.text && (
          <p className="rounded-xl bg-sunken p-4 text-body text-muted">
            {gate.text}{' '}
            {gate.link && (
              <a href="#/login" className="font-medium text-accent-ink underline underline-offset-2">
                {b.signInLink}
              </a>
            )}
          </p>
        )}
      </section>
    );
  }

  const groups: { place: PlaceRow | null; items: BillRow[] }[] = [
    ...places.map((place) => ({ place, items: (bills ?? []).filter((x) => x.place_id === place.id) })),
    { place: null, items: (bills ?? []).filter((x) => x.place_id == null || !places.some((p) => p.id === x.place_id)) },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {heading}
        <div className="flex flex-wrap gap-2">
          <a href="#/space" className={buttonClass('secondary', 'md')}>
            {b.toSpace}
          </a>
          <Button
            onClick={() => {
              useSurvey.getState().reset();
              account.setCurrent(null);
              window.location.hash = '#/journey/scan';
            }}
          >
            {b.newProject}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-body text-bad">
          {error}
        </p>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newPlace.trim();
          if (!name) return;
          guard(async () => {
            await createPlace(name);
            setNewPlace('');
            refresh();
          }, b.failed)();
        }}
      >
        <label className="min-w-0 flex-1 basis-64">
          <span className="mb-1 block text-small font-medium text-muted">{b.newPlace}</span>
          <input className={inputClass} value={newPlace} maxLength={120} placeholder={b.placeName} onChange={(e) => setNewPlace(e.target.value)} />
        </label>
        <Button type="submit" disabled={!newPlace.trim()}>
          {b.addPlace}
        </Button>
      </form>

      {bills == null ? (
        !error && <p className="text-body text-muted">{t.common.loading}</p>
      ) : bills.length === 0 && places.length === 0 ? (
        <p className="rounded-xl bg-panel p-6 text-body text-muted ring-1 ring-line">{b.empty}</p>
      ) : (
        groups.map(({ place, items }) =>
          // "No place" is only worth a heading when something is in it.
          place == null && items.length === 0 ? null : (
            <details key={place?.id ?? 'none'} open className="rounded-xl bg-panel ring-1 ring-line">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
                <IconFolder size={18} className="shrink-0 text-muted" />
                {place && renaming === place.id ? (
                  <input
                    autoFocus
                    aria-label={b.rename}
                    defaultValue={place.name}
                    maxLength={120}
                    className={`${inputClass} max-w-xs`}
                    onClick={(e) => e.preventDefault()}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      setRenaming(null);
                      if (name && name !== place.name) guard(() => renamePlace(place.id, name).then(refresh), b.failed)();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <span className="text-body font-semibold">{place ? place.name : b.noPlace}</span>
                )}
                <span className="text-small text-muted">{b.count(items.length)}</span>
                {place && (
                  <span className="ms-auto flex gap-1">
                    <button
                      type="button"
                      className={buttonClass('ghost', 'sm')}
                      onClick={(e) => {
                        e.preventDefault();
                        setRenaming(place.id);
                      }}
                    >
                      {b.rename}
                    </button>
                    <button
                      type="button"
                      className={`${buttonClass('ghost', 'sm')} text-bad`}
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirm(b.deletePlaceConfirm(place.name))) guard(() => deletePlace(place.id).then(refresh), b.failed)();
                      }}
                    >
                      {b.deletePlace}
                    </button>
                  </span>
                )}
              </summary>
              <div className="border-t border-line px-4">
                {items.length === 0 ? (
                  <p className="py-3 text-small text-muted">{b.emptyPlace}</p>
                ) : (
                  <ul>
                    {items.map((bill) => (
                      <BillItem key={bill.id} bill={bill} places={places} current={account.current?.id === bill.id} onChanged={refresh} onOpen={guard(() => open(bill), b.openFailed)} />
                    ))}
                  </ul>
                )}
              </div>
            </details>
          ),
        )
      )}
    </section>
  );
}

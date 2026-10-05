import { useState } from 'react';
import { useT } from '../../i18n';
import { MAX_ROOMS, useSurvey } from '../../state/spaceStore';
import { useUi } from '../../state/uiStore';
import { Button, Chip } from '../common';
import type { RoomBill } from './useRoomBill';

/** Above this many rooms a row of chips stops being readable and a list takes over. */
const CHIPS_UP_TO = 8;

/**
 * The project's rooms: open one, add one, copy the open one many times.
 *
 * Copying is the part that matters at scale. A hotel floor is the same guest room forty times, and
 * measuring it once and saying "forty of these" is the difference between a survey and a week.
 */
export function RoomSwitcher({ bill }: { bill: RoomBill }) {
  const t = useT();
  const he = useUi((s) => s.locale) === 'he';
  const survey = useSurvey();
  const [copies, setCopies] = useState(1);
  const rooms = bill.rooms;
  const left = MAX_ROOMS - rooms.length;
  // A room nobody named is called that, never by the id the system gave it.
  const nameOf = (r: (typeof rooms)[number]) => (he ? r.space.nameHe : r.space.nameEn) || t.survey.unnamed;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-panel px-4 py-3">
      <span className="text-[0.8438rem] font-semibold">{t.survey.rooms}</span>

      {rooms.length <= CHIPS_UP_TO ? (
        <div className="flex flex-wrap gap-1.5">
          {rooms.map((r) => (
            <Chip key={r.space.id} selected={r.space.id === survey.space.id} onClick={() => survey.openRoom(r.space.id)}>
              {nameOf(r)}
            </Chip>
          ))}
        </div>
      ) : (
        <select className="h-9 rounded-lg border border-field bg-panel px-2 text-[0.875rem]" value={survey.space.id} onChange={(e) => survey.openRoom(e.target.value)} aria-label={t.survey.rooms}>
          {rooms.map((r) => (
            <option key={r.space.id} value={r.space.id}>
              {nameOf(r)}
            </option>
          ))}
        </select>
      )}

      {rooms.length > 1 && <span className="text-[0.7812rem] text-muted">{t.survey.roomsCount(rooms.length)}</span>}
      {left < 10 && <span className="text-[0.7812rem] text-warn">{left < 1 ? t.survey.roomsFull(MAX_ROOMS) : t.survey.roomsLeft(left)}</span>}

      <div className="ms-auto flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={left < 1} onClick={survey.addRoom}>
          + {t.survey.addRoom}
        </Button>
        <span className="flex items-center gap-1.5 rounded-lg ring-1 ring-field">
          <Button size="sm" variant="ghost" disabled={left < 1} onClick={() => survey.duplicateRoom(copies)} title={t.survey.duplicateHint}>
            {t.survey.duplicate}
          </Button>
          <span className="text-[0.8125rem] text-muted">×</span>
          <input
            type="number"
            min={1}
            max={Math.max(1, left)}
            inputMode="numeric"
            value={Math.min(copies, Math.max(1, left))}
            onChange={(e) => setCopies(Math.max(1, Math.min(Math.max(1, left), Number(e.target.value) || 1)))}
            aria-label={t.survey.copies}
            className="h-9 w-14 rounded-e-lg bg-transparent px-1 text-center text-[0.875rem] tabular-nums outline-none"
          />
        </span>
        {rooms.length > 1 && (
          <Button size="sm" variant="ghost" onClick={() => survey.removeRoom(survey.space.id)}>
            {t.survey.removeRoom}
          </Button>
        )}
      </div>
    </div>
  );
}

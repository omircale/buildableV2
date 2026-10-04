import { useState } from 'react';
import { useT } from '../../i18n';
import { useSurvey } from '../../state/spaceStore';
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
  const nameOf = (r: (typeof rooms)[number]) => (he ? r.space.nameHe : r.space.nameEn) || r.space.id;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-panel px-4 py-3">
      <span className="text-[13.5px] font-semibold">{t.survey.rooms}</span>

      {rooms.length <= CHIPS_UP_TO ? (
        <div className="flex flex-wrap gap-1.5">
          {rooms.map((r) => (
            <Chip key={r.space.id} selected={r.space.id === survey.space.id} onClick={() => survey.openRoom(r.space.id)}>
              {nameOf(r)}
            </Chip>
          ))}
        </div>
      ) : (
        <select className="h-9 rounded-lg border border-line-strong bg-panel px-2 text-[14px]" value={survey.space.id} onChange={(e) => survey.openRoom(e.target.value)} aria-label={t.survey.rooms}>
          {rooms.map((r) => (
            <option key={r.space.id} value={r.space.id}>
              {nameOf(r)}
            </option>
          ))}
        </select>
      )}

      {rooms.length > 1 && <span className="text-[12.5px] text-muted">{t.survey.roomsCount(rooms.length)}</span>}

      <div className="ms-auto flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={survey.addRoom}>
          + {t.survey.addRoom}
        </Button>
        <span className="flex items-center gap-1.5 rounded-lg ring-1 ring-line-strong">
          <Button size="sm" variant="ghost" onClick={() => survey.duplicateRoom(copies)} title={t.survey.duplicateHint}>
            {t.survey.duplicate}
          </Button>
          <span className="text-[13px] text-muted">×</span>
          <input
            type="number"
            min={1}
            max={98}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Math.min(98, Number(e.target.value) || 1)))}
            aria-label={t.survey.copies}
            className="h-9 w-14 rounded-e-lg bg-transparent px-1 text-center text-[14px] tabular-nums outline-none"
          />
        </span>
        {rooms.length > 1 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm(t.survey.removeRoomConfirm(nameOf(rooms.find((r) => r.space.id === survey.space.id)!)))) survey.removeRoom(survey.space.id);
            }}
          >
            {t.survey.removeRoom}
          </Button>
        )}
      </div>
    </div>
  );
}

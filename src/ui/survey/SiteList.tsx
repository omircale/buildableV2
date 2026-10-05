import { useMemo } from 'react';
import { useT } from '../../i18n';
import type { Survey } from '../../state/spaceStore';
import { useUi } from '../../state/uiStore';
import { Button, downloadText } from '../common';
import { siteList, siteListText } from './siteQuestions';

/**
 * The questions the document is still waiting on, as a list a person can carry into the room.
 *
 * A bill with gaps is only useful if somebody knows which gaps are theirs to close. This is that list:
 * per room, in the words the questions are asked in, with what each one is wanted for.
 */
export function SiteList({ rooms }: { rooms: Survey[] }) {
  const t = useT();
  const he = useUi((s) => s.locale) === 'he';
  const list = useMemo(() => siteList(rooms, t, he), [rooms, t, he]);
  const count = list.reduce((a, r) => a + r.items.length, 0);

  return (
    <section className="space-y-2">
      <h3 className="text-body font-semibold">
        {t.survey.siteList}
        {count > 0 && <span className="font-normal text-muted"> · {count}</span>}
      </h3>
      {count === 0 ? (
        <p className="text-small text-muted">{t.survey.siteListEmpty}</p>
      ) : (
        <>
          <p className="max-w-prose text-small leading-snug text-muted">{t.survey.siteListHint}</p>
          {list.map((room, i) => (
            // With many rooms only the first is open: ninety-nine open lists is a wall of text.
            <details key={`${i}-${room.name}`} open={list.length <= 3 || i === 0} className="rounded-lg border border-line px-3 py-2">
              <summary className="cursor-pointer text-small font-semibold">
                {room.name} <span className="font-normal text-muted">· {room.items.length}</span>
              </summary>
              <ul className="mt-1.5 list-disc space-y-1 ps-5 text-small leading-snug">
                {room.items.map((item) => (
                  <li key={item.id}>
                    {item.text}
                    {item.for && <span className="text-muted"> — {t.survey.siteFor(item.for)}</span>}
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <Button onClick={() => downloadText('site-list.txt', siteListText(list, t), 'text/plain;charset=utf-8')}>{t.survey.siteListDownload}</Button>
        </>
      )}
    </section>
  );
}

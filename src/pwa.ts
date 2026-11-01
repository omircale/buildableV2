import { create } from 'zustand';

/**
 * The page's side of the offline copy (pwa/sw.js): registering it, and offering a new version when one
 * has been downloaded. The new version is used only when the person says so, because switching under
 * an open page could mix files from two versions.
 */

export const useAppUpdate = create<{ waiting: ServiceWorker | null }>(() => ({ waiting: null }));

let switching = false;

export function registerOfflineCopy(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // A version only counts as "new" when another one is already running this page.
        const offer = (w: ServiceWorker | null) => {
          if (w && navigator.serviceWorker.controller) useAppUpdate.setState({ waiting: w });
        };
        offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => w.state === 'installed' && offer(w));
        });
        // A page left open for days on a phone still hears about new versions.
        const check = () => document.visibilityState === 'visible' && navigator.onLine && void reg.update().catch(() => undefined);
        document.addEventListener('visibilitychange', check);
        window.addEventListener('online', check);
      })
      .catch(() => undefined);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (switching) window.location.reload();
    });
  });
}

/** Moves to the downloaded version; the page reloads once it has taken over. */
export function switchToNewVersion(): void {
  const w = useAppUpdate.getState().waiting;
  if (!w) return;
  switching = true;
  w.postMessage('switch-version');
}

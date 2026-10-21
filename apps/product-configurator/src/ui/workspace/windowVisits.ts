import { useEffect } from 'react';
import { desktopWindows, windowOfFrame } from '@/desktop';
import { useSetupStore } from '@/state/setupStore';

/**
 * In the desktop app: remembers the page each window's site goes to (a TinyGnomes task, a
 * wiki), so the window shows it again when it comes back, after another desk or view, or
 * from a saved layout, instead of the site's start page.
 */
export function useWindowVisits() {
  useEffect(() => {
    if (!desktopWindows) return;
    return desktopWindows.onVisit((name, url) => {
      const window = windowOfFrame(name);
      if (window) useSetupStore.getState().visitWindow(window.deskId, window.windowId, url);
    });
  }, []);
}

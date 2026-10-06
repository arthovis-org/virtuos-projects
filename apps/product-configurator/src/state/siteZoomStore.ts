import { create } from 'zustand';
import { validZoom, type WindowZoom } from './setup';

/**
 * The zoom last set for each site, remembered in this browser, as browsers remember a site's
 * page zoom: a window showing a site with no zoom of its own (`DeskWindows.zoom`, which layouts
 * save) shows it at the site's, also after a reload. 100% is no entry.
 */
interface SiteZoomState {
  zooms: Readonly<Record<string, WindowZoom>>;
  remember: (site: string, zoom: WindowZoom) => void;
}

const KEY = 'virtuos.siteZoom';

function load(): Record<string, WindowZoom> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    if (!stored || typeof stored !== 'object') return {};
    return Object.fromEntries(
      Object.entries(stored).flatMap(([site, value]) => {
        const zoom = validZoom(value);
        return zoom === null ? [] : [[site, zoom]];
      }),
    );
  } catch {
    // Storage blocked (a private window) or a broken entry: start afresh.
    return {};
  }
}

export const useSiteZoomStore = create<SiteZoomState>((set, get) => ({
  zooms: load(),
  remember: (site, zoom) => {
    const rest = Object.fromEntries(Object.entries(get().zooms).filter(([s]) => s !== site));
    const zooms = zoom === 1 ? rest : { ...rest, [site]: zoom };
    set({ zooms });
    try {
      window.localStorage.setItem(KEY, JSON.stringify(zooms));
    } catch {
      // Not remembered after a reload, but still in use now.
    }
  },
}));

/**
 * The desktop app (apps/configurator-desktop) runs this same configurator, with every site
 * allowed on the screens. It says so through `window.virtuosDesktop` (its preload script).
 */

interface DesktopBridge {
  /** Sites are shown as they are, whatever their embedding restrictions. */
  framing: boolean;
  platform: string;
}

const bridge = (window as { virtuosDesktop?: DesktopBridge }).virtuosDesktop;

/** In the desktop app. */
export const isDesktop = !!bridge;

/** Every site can be shown on the screens (the desktop app lifts embedding restrictions). */
export const framesAnySite = !!bridge?.framing;

/** The public website, which links point to from the app (its own page has an app:// address). */
const WEBSITE_URL = 'https://arthovis-org.github.io/virtuos-projects/product-configurator/';

/** The address of this page that others can open: the website's, also from the app. */
export function publicPageUrl(): string {
  return isDesktop ? WEBSITE_URL : `${window.location.origin}${window.location.pathname}`;
}

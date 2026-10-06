/**
 * The desktop app (apps/configurator-desktop) runs this same configurator, with every site
 * allowed on the screens. It says so through `window.virtuosDesktop` (its preload script).
 */

interface DesktopBridge {
  /** Sites are shown as they are, whatever their embedding restrictions. */
  framing: boolean;
  platform: string;
  /** The app's version (from 0.1.2 on). */
  version?: string;
  /** A downloaded update waiting for a restart (from 0.1.2 on). */
  updates?: DesktopUpdates;
}

interface DesktopUpdates {
  ready: () => Promise<string | null>;
  onReady: (callback: (version: string) => void) => () => void;
  restart: () => Promise<void>;
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

/**
 * Which version this is, to tell in feedback: the same number on the website and in the desktop
 * app (which is the code of a release), with the commit it was built from. The website changes
 * between releases, so its commit says how far past the release it is.
 */
export function versionLabel(): string {
  const version = bridge?.version ?? __VERSION__;
  return __BUILD__ ? `Version ${version} · ${__BUILD__}` : `Version ${version}`;
}

/** The desktop app's updates, when in it (a recent enough version). */
export const desktopUpdates: DesktopUpdates | undefined = bridge?.updates;

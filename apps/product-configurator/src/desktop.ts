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
  /** The layouts adapting some desktop-only sites to narrow screens (from 0.1.9 on). */
  siteStyles?: DesktopSiteStyles;
  /** Where the sites in windows go (from 0.1.16 on). */
  windows?: DesktopWindows;
}

interface DesktopWindows {
  /** Calls back with a window frame's name and its page whenever its site goes to another. */
  onVisit: (callback: (name: string, url: string) => void) => () => void;
  /** Pauses the video and audio in a window's frame, by its name (from 0.1.18 on). */
  pauseMedia?: (name: string) => void;
}

interface DesktopSiteStyles {
  /** Whether they apply, and the sites (hosts, with their subdomains) they are for. */
  state: () => Promise<{ enabled: boolean; hosts: string[] } | null>;
  /** Switches them on or off on every screen; resolves to whether they apply. */
  set: (on: boolean) => Promise<boolean>;
}

interface DesktopUpdates {
  ready: () => Promise<string | null>;
  onReady: (callback: (version: string) => void) => () => void;
  restart: () => Promise<void>;
  /** Where the launch's update check is (from 0.1.11 on). */
  status?: () => Promise<UpdateStatus>;
  onStatus?: (callback: (status: UpdateStatus) => void) => () => void;
}

/** The launch's update check: running, downloading what it found, found nothing, or failed. */
export type UpdateStatus = 'checking' | 'downloading' | 'current' | 'failed' | null;

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

/**
 * Windows' frames, by the name each is given (`windowFrameName`): the desktop app reports where
 * a frame's site goes by that name. A frame keeps the name it was made with (its desk can change
 * under it: the single desk becoming the room's first), so the name is a token of its own, and
 * this says which desk and window it is now.
 */
const FRAME_PREFIX = 'virtuos-window:';
const windowFrames = new Map<string, { deskId: string; windowId: string }>();
let frameCount = 0;

/** A name for a new window frame. */
export const windowFrameName = () => `${FRAME_PREFIX}${Date.now().toString(36)}-${++frameCount}`;

/** Says which desk and window the frame `name` is now; returns a function to forget it. */
export function registerWindowFrame(name: string, deskId: string, windowId: string) {
  const entry = { deskId, windowId };
  windowFrames.set(name, entry);
  return () => {
    if (windowFrames.get(name) === entry) windowFrames.delete(name);
  };
}

/** The desk and window a frame is now, by its name, if it is one of the windows'. */
export const windowOfFrame = (name: string) => windowFrames.get(name) ?? null;

/** Where the sites in windows go, when in the desktop app (a recent enough version). */
export const desktopWindows: DesktopWindows | undefined = bridge?.windows;

/** The desktop app's adapted site layouts and their switch, when in it (a recent enough version). */
export const desktopSiteStyles: DesktopSiteStyles | undefined = bridge?.siteStyles;

/**
 * Tells the configurator it runs in the desktop app, where every site can be shown on its
 * screens: no "blocked" marks or embed players needed. Also its version, its updates, the
 * switch for its adapted site layouts and where the sites in its windows go; nothing else of
 * the computer is exposed.
 */
const { contextBridge, ipcRenderer } = require('electron');

/** The app's version, passed by main.js. */
const version = process.argv.find((a) => a.startsWith('--virtuos-version='))?.split('=')[1] ?? '';

contextBridge.exposeInMainWorld('virtuosDesktop', {
  /** Sites are shown as they are, whatever their embedding restrictions. */
  framing: true,
  platform: process.platform,
  /** The app's version, e.g. 0.1.2. */
  version,
  /** A downloaded update, waiting for a restart (updates.js). */
  updates: {
    /** The version waiting, or null. */
    ready: () => ipcRenderer.invoke('virtuos:update-ready'),
    /** Calls back with the version once one is downloaded; returns a function to stop. */
    onReady: (callback) => {
      const listener = (_event, version) => callback(version);
      ipcRenderer.on('virtuos:update-ready', listener);
      return () => ipcRenderer.removeListener('virtuos:update-ready', listener);
    },
    /** Quits, installs the update and opens the app again. */
    restart: () => ipcRenderer.invoke('virtuos:restart-to-update'),
    /** Where the launch's check is ('checking', 'downloading', 'current', 'failed'), or null. */
    status: () => ipcRenderer.invoke('virtuos:update-status'),
    /** Calls back as the launch's check goes on; returns a function to stop. */
    onStatus: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('virtuos:update-status', listener);
      return () => ipcRenderer.removeListener('virtuos:update-status', listener);
    },
  },
  /** Where the sites in the configurator's windows go (windowVisits.js). */
  windows: {
    /** Calls back with a window frame's name and its page; returns a function to stop. */
    onVisit: (callback) => {
      const listener = (_event, name, url) => callback(name, url);
      ipcRenderer.on('virtuos:window-visit', listener);
      return () => ipcRenderer.removeListener('virtuos:window-visit', listener);
    },
    /** Pauses the video and audio in a window's frame, by its name (a parked window). */
    pauseMedia: (name) => ipcRenderer.send('virtuos:pause-media', name),
    /** A JPEG of part of the app's own window ({ x, y, width, height }), or null. */
    capture: (rect) => ipcRenderer.invoke('virtuos:capture', rect),
  },
  /** The app's processes' CPU and memory, for the performance panel (metrics.js). */
  metrics: () => ipcRenderer.invoke('virtuos:metrics'),
  /** Calls back when Ctrl+Shift+P is pressed anywhere in the window; returns a function to stop. */
  onTogglePerf: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('virtuos:toggle-perf', listener);
    return () => ipcRenderer.removeListener('virtuos:toggle-perf', listener);
  },
  /** The layouts adapting some desktop-only sites to narrow screens (siteStyles.js). */
  siteStyles: {
    /** Whether they apply, and the sites (hosts) they are for. */
    state: () => ipcRenderer.invoke('virtuos:site-styles'),
    /** Switches them on or off on every screen; resolves to whether they apply. */
    set: (on) => ipcRenderer.invoke('virtuos:set-site-styles', on),
  },
});

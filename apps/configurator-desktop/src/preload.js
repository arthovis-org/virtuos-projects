/**
 * Tells the configurator it runs in the desktop app, where every site can be shown on its
 * screens: no "blocked" marks or embed players needed. Also its version, its updates and the
 * switch for its adapted site layouts; nothing else of the computer is exposed.
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
  /** The layouts adapting some desktop-only sites to narrow screens (siteStyles.js). */
  siteStyles: {
    /** Whether they apply, and the sites (hosts) they are for. */
    state: () => ipcRenderer.invoke('virtuos:site-styles'),
    /** Switches them on or off on every screen; resolves to whether they apply. */
    set: (on) => ipcRenderer.invoke('virtuos:set-site-styles', on),
  },
});

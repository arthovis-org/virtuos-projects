/**
 * Tells the configurator it runs in the desktop app, where every site can be shown on its
 * screens: no "blocked" marks or embed players needed. Also its version and its updates;
 * nothing else of the computer is exposed.
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
  /**
   * Reflow (reflow.js): lists the columns of the page in the frame named `frame`, or shows one
   * of them across the window ({ action: 'analyse' | 'show' | 'reset', index? }).
   */
  reflow: (frame, command) => ipcRenderer.invoke('virtuos:reflow', { frame, command }),
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
  },
});

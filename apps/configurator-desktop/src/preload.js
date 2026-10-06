/**
 * Tells the configurator it runs in the desktop app, where every site can be shown on its
 * screens: no "blocked" marks or embed players needed. Nothing else of the computer is exposed.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('virtuosDesktop', {
  /** Sites are shown as they are, whatever their embedding restrictions. */
  framing: true,
  platform: process.platform,
});

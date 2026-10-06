/**
 * Updates from the project's GitHub releases (electron-updater): checked at launch and every
 * few hours, downloaded in the background, installed when the app quits. Once one is
 * downloaded the page is told (preload.js), and shows a notice to restart now or later.
 */
const { BrowserWindow, ipcMain } = require('electron');

/** How often an open app looks for a new release. */
const CHECK_EVERY = 4 * 60 * 60 * 1000;

/** The version downloaded and waiting to be installed, if any. */
let ready = null;

/** Only the configurator's own page (the window's top frame) may ask. */
const fromPage = (event) => event.senderFrame === event.sender.mainFrame;

function watchForUpdates() {
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    // No updater (a local build): carry on.
    return;
  }
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => {
    ready = info.version;
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('virtuos:update-ready', ready);
    }
  });
  // An update may have arrived before the page was ready to hear of it.
  ipcMain.handle('virtuos:update-ready', (event) => (fromPage(event) ? ready : null));
  ipcMain.handle('virtuos:restart-to-update', (event) => {
    if (fromPage(event) && ready) autoUpdater.quitAndInstall();
  });

  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  check();
  setInterval(check, CHECK_EVERY);
}

module.exports = { watchForUpdates };

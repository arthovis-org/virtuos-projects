/**
 * Updates from the project's GitHub releases (electron-updater): checked at launch and every
 * few hours, downloaded in the background, installed when the app quits. Once one is
 * downloaded the page is told (preload.js), and shows a notice to restart now or later. While
 * the launch's check runs (and an update it found downloads), the page shows that too.
 */
const { BrowserWindow, ipcMain } = require('electron');

/** How often an open app looks for a new release. */
const CHECK_EVERY = 4 * 60 * 60 * 1000;

/** The version downloaded and waiting to be installed, if any. */
let ready = null;

/**
 * Where the launch's check is: 'checking', 'downloading' (an update it found), 'current' (none
 * found) or 'failed'; null once it is over and told (or with no updater). Later checks run
 * quietly.
 */
let status = null;

function setStatus(next) {
  status = next;
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('virtuos:update-status', status);
  }
}

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
  // The launch's check, told to the page as it goes.
  let launch = true;
  autoUpdater.on('checking-for-update', () => {
    if (launch) setStatus('checking');
  });
  autoUpdater.on('update-available', () => {
    if (launch) setStatus('downloading');
  });
  autoUpdater.on('update-not-available', () => {
    if (!launch) return;
    launch = false;
    setStatus('current');
  });
  autoUpdater.on('error', () => {
    if (!launch) return;
    launch = false;
    setStatus('failed');
  });
  autoUpdater.on('update-downloaded', (info) => {
    if (launch) {
      launch = false;
      setStatus(null);
    }
    ready = info.version;
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('virtuos:update-ready', ready);
    }
  });
  // An update may have arrived before the page was ready to hear of it.
  ipcMain.handle('virtuos:update-ready', (event) => (fromPage(event) ? ready : null));
  ipcMain.handle('virtuos:update-status', (event) => (fromPage(event) ? status : null));
  ipcMain.handle('virtuos:restart-to-update', (event) => {
    if (fromPage(event) && ready) autoUpdater.quitAndInstall();
  });

  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  check();
  setInterval(check, CHECK_EVERY);
}

module.exports = { watchForUpdates };

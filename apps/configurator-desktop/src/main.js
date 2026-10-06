/**
 * The desktop app: the configurator (the website's build, bundled in web/) in a window, with
 * every site allowed on its screens (frames.js). Same code as the website; the page knows it
 * is in the app through `window.virtuosDesktop` (preload.js).
 *
 * In development (`npm run dev`) the window shows the website's dev server instead, with live
 * reload.
 */
const { app, BrowserWindow, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { allowFraming } = require('./frames');
const { watchVideosEmbedded } = require('./youtube');

/** The bundled configurator is served from here, like a website. */
const SCHEME = 'app';
const APP_URL = `${SCHEME}://configurator/`;
const WEB = path.join(__dirname, '..', 'web');
const DEV_URL = process.env.VIRTUOS_DEV_URL;

// Served like https (a secure origin with fetch, CORS and module scripts), so the page works
// exactly as it does on the website.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

/** Files of the bundled configurator; any path without a file is the page itself. */
function serveBundledSite() {
  protocol.handle(SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    let file = path.normalize(path.join(WEB, decodeURIComponent(pathname)));
    if (!file.startsWith(WEB)) return new Response('Not found', { status: 404 });
    if (!path.extname(file)) file = path.join(WEB, 'index.html');
    return net.fetch(pathToFileURL(file).toString());
  });
}

const isOwnPage = (url) => url.startsWith(APP_URL) || (DEV_URL && url.startsWith(DEV_URL));

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'VIRTUOS Configurator',
    backgroundColor: '#f4f4f2',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // New windows: links the configurator opens in a new tab ("Open in a new tab") go to the
  // visitor's own browser; pop-ups a site on a screen opens (a sign-in window) stay in the
  // app, so the sign-in lands where the site is.
  window.webContents.setWindowOpenHandler(({ url, disposition }) => {
    if (!/^https?:/.test(url)) return { action: 'deny' };
    if (disposition === 'new-window') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
        },
      };
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // The window itself only ever shows the configurator.
  window.webContents.on('will-navigate', (event, url) => {
    if (isOwnPage(url)) return;
    event.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });

  watchVideosEmbedded(window.webContents);
  void window.loadURL(DEV_URL ?? APP_URL);
}

// A separate profile (logins, settings) when asked, as the tests do: they then neither touch
// the visitor's nor run into the one-window lock of an open copy.
if (process.env.VIRTUOS_USER_DATA) app.setPath('userData', process.env.VIRTUOS_USER_DATA);

// One window: opening the app again brings it forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  void app.whenReady().then(() => {
    allowFraming(session.defaultSession);
    if (!DEV_URL) serveBundledSite();
    createWindow();

    // Installed copies update themselves from the project's GitHub releases.
    if (app.isPackaged) {
      try {
        const { autoUpdater } = require('electron-updater');
        void autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
      } catch {
        // No updater (a local build): carry on.
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

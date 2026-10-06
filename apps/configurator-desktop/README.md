# VIRTUOS Configurator (desktop app)

The [Smart Desk configurator](../product-configurator) as a Windows app, mainly for one thing the
website can't do: **show every website on the 3D screens**. In a browser, many sites (Notion,
ChatGPT, Gmail, X, news sites…) tell the browser not to show them inside another page, and the
screens can only explain that they're blocked. The app lifts that for pages on its screens, and
keeps their logins, so they work as they would in their own tab.

It is a thin wrapper: the same configurator code, built from `apps/product-configurator` and
bundled. Everything else (the 3D view, desks, the sheet, the AI, layouts) is the website's.

## How it works

```
src/main.js      the window; serves the bundled site at app://configurator/; links that open
                 a new tab go to the visitor's browser, sign-in pop-ups of sites stay in the app
src/frames.js    for pages inside frames only: removes X-Frame-Options and CSP frame-ancestors,
                 and makes their cookies SameSite=None so logins stick
src/preload.js   tells the page it runs in the app (window.virtuosDesktop); nothing else exposed
web/             the website's build (npm run build:web; not committed)
```

The configurator reads `window.virtuosDesktop` (`src/desktop.ts` there): in the app, sites are
never marked as blocked, links are shown as they are rather than through embed players (YouTube is shown as youtube.com
itself, with its logins and recommendations), the AI may use any site, and shared links point
to the public website.

**YouTube videos** play in YouTube's embed player (`src/youtube.js`): youtube.com's own video
page crashes inside a frame in this Electron (the screen turns grey a few seconds in), while the
embed player, made for frames, plays fine. A click on a video on a screen opens it there, with a
"← YouTube" button back; frames loading a video page are redirected; and YouTube is told the
public website shows the player (it refuses with error 153 otherwise).

Logins are kept in the app's own browser profile (`%APPDATA%\VIRTUOS Configurator`).

**Known limits.** Google won't let anyone sign in to a Google account inside an embedded app
browser (sites already signed in elsewhere in the app keep working). A few sites check from
their own scripts whether they're inside another page and stop.

## Develop

```bash
npm ci
npm run dev        # the website's dev server (starts it if needed) in the app's window, live reload
npm start          # the bundled build in the app
npm test           # smoke test: bundled site, and pages that refuse frames shown anyway (no internet)
npm run dist       # the Windows installer in release/ (unsigned)
```

Most work happens in `apps/product-configurator` as before, in the browser; the app picks it up.

## Release

Bump `version` in `package.json`, commit, and push a matching tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The `configurator-desktop` workflow builds the installer on Windows and publishes it as a GitHub
release with three files: the installer, its block map (smaller downloads) and `latest.yml`, which
installed copies read. The workflow uploads them itself in one step: electron-builder's own
publishing uploads files at once, and they raced to create the release (v0.1.1 lost two files).

Installed copies update themselves (`src/updates.js`): they look for a new release at launch and
every 4 hours, download it in the background, and show a notice in the page to **Restart now**
or later; it installs when the app is next closed anyway. The version this is shows at the foot
of the options panel, the same number on the website (whose build reads it from this
`package.json`), with the commit it was built from. The installer is unsigned for now, so
Windows shows "Windows protected your PC" the first time: **More info → Run anyway**. A
code-signing certificate removes that.

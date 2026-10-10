/**
 * Site styles: a compact layout for particular desktop-only sites on narrow screens (a portrait
 * side monitor is about 330 px wide). Zooming such a site out to fit makes its text too small
 * to read; a style written for it instead folds its menu away and lets its content use the
 * width, at full size.
 *
 * Each style applies only while the window is narrow (a media query on the page's own width),
 * so the same site on the main screen, or zoomed to Fit, looks as the site made it. The style
 * is added to the page whenever a frame on a screen loads one of the site's addresses
 * (webFrameMain.executeJavaScript reaches any site's page in the app), and added back if the
 * page replaces its head.
 */
const { webFrameMain } = require("electron");

/**
 * `hosts`: the site's addresses (a host and its subdomains). `maxWidth`: the window width (CSS
 * pixels) up to which the style applies. `css`: the rules.
 */
const SITE_STYLES = [
  {
    name: "tinygnomes",
    hosts: ["tinygnomes.com"],
    maxWidth: 700,
    css: "",
  },
];

// The tests add one for their own test site.
if (process.env.VIRTUOS_TEST_SITE_STYLE)
  SITE_STYLES.push(JSON.parse(process.env.VIRTUOS_TEST_SITE_STYLE));

/** The style for a page's address, if its site has one. */
function styleFor(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  return SITE_STYLES.find(
    (style) =>
      style.css.trim() &&
      style.hosts.some((h) => host === h || host.endsWith(`.${h}`)),
  );
}

/** Runs in the site's page: adds the style (once), and again if the page drops it. */
function addStyleInPage(id, css) {
  const add = () => {
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    (document.head ?? document.documentElement).appendChild(style);
  };
  add();
  const state = (window.__virtuosSiteStyle ??= {});
  if (!state.observer) {
    state.observer = new MutationObserver(add);
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
  return true;
}

/** The page's script for a style: its rules inside the narrow-window media query. */
function scriptFor(style) {
  const css = `@media (max-width: ${style.maxWidth}px) {\n${style.css}\n}`;
  return `(${addStyleInPage.toString()})(${JSON.stringify(`virtuos-site-${style.name}`)}, ${JSON.stringify(css)})`;
}

/** Applies site styles to the pages on the configurator's screens (frames, not the window). */
function watchSiteStyles(webContents) {
  webContents.on(
    "did-frame-finish-load",
    (_event, isMainFrame, processId, routingId) => {
      if (isMainFrame) return;
      let frame;
      try {
        frame = webFrameMain.fromId(processId, routingId);
      } catch {
        return;
      }
      const style = frame && styleFor(frame.url);
      if (!style) return;
      frame.executeJavaScript(scriptFor(style)).catch(() => {
        // The frame navigated away or closed meanwhile.
      });
    },
  );
}

module.exports = { watchSiteStyles, styleFor, scriptFor, SITE_STYLES };

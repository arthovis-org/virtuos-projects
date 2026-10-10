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
 * page replaces its head. Where the site's own scripts lay something out from the window's
 * width (and so leave it out on a narrow one), a site can also have a small page script.
 */
const { webFrameMain } = require("electron");

/**
 * `hosts`: the site's addresses (a host and its subdomains). `maxWidth`: the window width (CSS
 * pixels) up to which the style applies. `css`: the rules. `script` (optional): a function run
 * in the page with `maxWidth`, after the rules are added.
 */
const SITE_STYLES = [
  {
    name: "tinygnomes",
    hosts: ["tinygnomes.com"],
    maxWidth: 700,
    // Written from the dashboard's page (its menu, dashboard and team columns in a splitter,
    // sized in pixels by the app's own scripts, which these rules override).
    css: `
      /*
       * The page at the window's width: the app sets its main rows to a width of its own (at least
       * that of a desktop window), and the tables they sit in grow to fit them.
       */
      [id*="-Mol-RowLayout-body-"],
      [id$="-body_north"],
      [id$="-body_north"] > .qfw-molecule,
      [id$="-body_middle"],
      [id$="-splitter2_bag"] {
        width: 100vw !important;
      }
      [id$="splitter2_center"] div[style*="width"] {
        max-width: 100% !important;
      }
      /* The content's own layout (a service's columns), the width of the space beside the menu. */
      [id*="-Mol-ColumnLayout-servicebodyframe-"] {
        width: calc(100vw - 48px) !important;
      }
      [id*="-qtaskheader_qtaskheadercol"] {
        max-width: 100vw !important;
      }

      /* The menu: a strip of its icons (names on hover, as the site's own tooltips). */
      [id$="splitter2_left"] {
        width: 40px !important;
      }
      .servicebar-scrollarea,
      .servicebar-scrolldiv,
      .servicebar-controls,
      .servicebar-controls table {
        width: 40px !important;
      }
      .link-vservbar table {
        width: 36px !important;
      }
      .link-vservbar td[valign="middle"] {
        display: none !important;
      }
      .servicebar-controls td {
        width: 40px !important;
        padding: 5px 0 !important;
      }
      /* The big icon of the open service above the menu (the menu shows which is open). */
      .svc-topicon {
        display: none !important;
      }
      /* Unread counts on the icons. */
      .svc-pillbox-container {
        right: auto !important;
        left: 16px !important;
        transform: scale(0.75);
        transform-origin: left center;
      }

      /* Columns there is no room for: the team, the project's description. */
      [id$="splitter2_right"],
      [id$="splitter2_divider"],
      [id$="splitter2_divider2"],
      [id$="servicebodyframecol1"],
      [id$="servicebodyframecol3"] {
        display: none !important;
      }

      /* The content: the rest of the width. */
      [id$="splitter2_center"] {
        left: 40px !important;
        right: 0 !important;
        width: auto !important;
        padding-left: 4px !important;
        padding-right: 4px !important;
      }
      [id$="servicebodyframecol2"] {
        width: auto !important;
        float: none !important;
        padding: 0 2px !important;
      }

      /* The project picker in the top bar, beside the menu strip. */
      .global-projectpicker {
        left: 44px !important;
        right: 4px !important;
        width: auto !important;
      }
      .global-projectpicker table {
        width: 100% !important;
      }

      /* The project picker's list (370 px at least, placed for a desktop window): across the screen. */
      .widget-projectpicker.ui-menu {
        left: 4px !important;
        right: 4px !important;
        width: auto !important;
        min-width: 0 !important;
        max-width: calc(100vw - 8px) !important;
        max-height: 70vh;
        overflow-y: auto;
        box-sizing: border-box;
      }
      /*
       * Its "New project" and "N more" sit in a column beside the projects, with no room beside
       * them here: above them instead, in a row. (Only while open: closed, it is display: none.)
       */
      .widget-projectpicker.ui-menu:not([style*="display: none"]) {
        display: flex !important;
        flex-direction: column;
        height: auto !important;
      }
      .widget-projectpicker.ui-menu > .ui-menu-column {
        float: none !important;
      }
      .widget-projectpicker.ui-menu > .ui-menu-actions {
        order: -1;
        float: none !important;
        height: auto !important;
        margin: 0 0 6px !important;
        padding: 0 0 6px !important;
        border-left: none !important;
        border-bottom: 1px solid #ccc;
      }
      .widget-projectpicker.ui-menu > .ui-menu-actions > ul {
        display: flex;
        flex-wrap: wrap;
        gap: 2px 18px;
      }
      .widget-projectpicker.ui-menu > .ui-menu-actions li {
        width: auto !important;
        position: static !important;
      }
      .widget-projectpicker.ui-menu .ui-menu-item {
        white-space: normal;
        overflow-wrap: anywhere;
      }

      /* Your own avatar in the top corner: small, out of the way of the project picker. */
      .q3-teambarv {
        transform: scale(0.42);
        transform-origin: top right;
      }
      .global-projectpicker {
        right: 44px !important;
      }
      .global-projectpicker td > div {
        padding-left: 0 !important;
      }
      .pwidget-large-pp {
        width: auto !important;
        max-width: 100% !important;
      }

      /* The dashboard's entries: the time as a small label in the corner, the message the width. */
      [id*="-Mol-Dashboard2Chat-"] {
        position: relative;
      }
      td:has(> [id*="-Mol-RelativeTime-"]) {
        position: absolute !important;
        top: 2px;
        right: 2px;
        width: auto !important;
        padding: 0 4px !important;
        background: transparent !important;
        font-size: 11px;
        color: #8a8a8a;
      }
      /* Entries keep to the width (their tables grew to fit the longest line), long names end in "…". */
      [id*="-Mol-Dashboard2Chat-"] div[style*="nowrap"] {
        /* Fills its cell without widening it. */
        width: 0;
        min-width: 100%;
        text-overflow: ellipsis;
      }
      [id*="-Mol-Dashboard2Chat-"] div[style*="nowrap"] .link-textlink,
      [id*="-Mol-Dashboard2Chat-"] div[style*="nowrap"] .link-textlink a {
        display: inline !important;
      }
      [id*="-Mol-Dashboard2Chat-"] .qfw-divlink center {
        overflow-wrap: anywhere;
      }
      /* The spacer that kept a column free for the time (now in the corner). */
      [id*="-Mol-Dashboard2Chat-"] img[src*="1px.png"] {
        display: none !important;
      }

      /* Dialogs (the app's floating cards, placed and sized for a desktop window): across the screen. */
      .qfw-floatingcard {
        left: 4px !important;
        right: 4px !important;
        width: auto !important;
        max-width: calc(100vw - 8px) !important;
        box-sizing: border-box;
      }
      .qfw-floatingcard [id^="contentbag-"] {
        width: auto !important;
      }
      /* The project picker dialog's lists (All, Favorites, Recent, Hidden...): one project a line. */
      [id^="card-ProjectPicker-dialog"] [id$="_horizbag"] {
        width: auto !important;
        max-width: 100% !important;
      }
      [id^="card-ProjectPicker-dialog"] [id$="_headerbody"] {
        display: none !important;
      }
      [id^="card-ProjectPicker-dialog"] [id$="_bodybag"] [id^="PANEL"] {
        height: auto !important;
      }
      [id^="card-ProjectPicker-dialog"] [id$="_bodybag"] table,
      [id^="card-ProjectPicker-dialog"] [id$="_bodybag"] tbody,
      [id^="card-ProjectPicker-dialog"] [id$="_bodybag"] tr,
      [id^="card-ProjectPicker-dialog"] [id$="_bodybag"] td {
        display: block !important;
        width: auto !important;
      }
      [id^="card-ProjectPicker-dialog"] [id$="_bodybag"] td:empty {
        display: none !important;
      }
      [id^="card-ProjectPicker-dialog"] [id$="_bodybag"] td > div {
        width: auto !important;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      /* The project picker's list: its projects as wide as the screen allows. */
      .widget-projectpicker.ui-menu .project-sec {
        width: auto !important;
      }
      .widget-projectpicker.ui-menu .line1 {
        width: auto !important;
        max-width: 100%;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .pwidget-large-pp input {
        width: calc(100% - 64px) !important;
      }

      /*
       * Tasks: each task a card (its summary, then project and doer, then status and end date)
       * instead of a row of ten columns, which left the summary no width at all. Its cells, by
       * column: check box, project, summary, doer, priority, duration, actual duration, status,
       * end date, calendar.
       */
      [id^="TaskList-"][id$="-maintable_headerbody"],
      [id^="TaskList-"][id$="-maintable_bodybag"] tr[id*="-rowheader_"] {
        display: none !important;
      }
      /* The list and its panel at the screen's width (the app sizes them for its columns). */
      [id^="TaskList-"].tasks-panel,
      [id^="TaskList-"][id*="-Mol-EZTable-maintable-"],
      [id^="TaskList-"][id$="-maintable_horizbag"],
      [id^="TaskList-"][id$="-maintable_bodybag"] {
        width: auto !important;
        max-width: 100% !important;
        box-sizing: border-box;
      }
      /* Its top bar (create, filters, refresh, "71 of 71" and its menu) wraps. */
      .tasks-topbar {
        flex-wrap: wrap;
      }
      .tasks-topbar > * {
        max-width: 100%;
      }
      [id^="TaskList-"][id$="-maintable_bodybag"] [id^="PANEL"] {
        height: auto !important;
      }
      [id^="TaskList-"][id$="-maintable_bodybag"] table,
      [id^="TaskList-"][id$="-maintable_bodybag"] tbody {
        display: block !important;
        width: auto !important;
      }
      [id^="TaskList-"][id$="-maintable_bodybag"] tr[id*="-rowtr_"] {
        display: grid !important;
        grid-template-columns: 1fr auto;
        grid-template-areas: "summary summary" "project doer" "status end";
        gap: 1px 8px;
        padding: 6px 2px;
        border-bottom: 1px solid #eee;
      }
      [id^="TaskList-"][id$="-maintable_bodybag"] tr[id*="-rowtr_"] > td {
        display: block !important;
        width: auto !important;
        height: auto !important;
        min-width: 0;
        padding: 0 4px !important;
      }
      [id^="TaskList-"][id$="-maintable_bodybag"] tr[id*="-rowtr_"] > td > div {
        width: auto !important;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(1),
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(5),
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(6),
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(7),
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(10) {
        display: none !important;
      }
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(2) {
        grid-area: project;
        font-size: 12px;
      }
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(3) {
        grid-area: summary;
        font-weight: 600;
      }
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(3) nobr {
        white-space: normal;
      }
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(3) .qfw-molecule,
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(3) a {
        display: inline !important;
        white-space: normal !important;
      }
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(4) {
        grid-area: doer;
        font-size: 12px;
      }
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(8) {
        grid-area: status;
        font-size: 12px;
        color: #777;
      }
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(9) {
        grid-area: end;
        font-size: 12px;
        color: #777;
      }
    `,
    // The project list picks as many projects as its columns of them fit the window (its
    // _updateMenu: `(window width - 160) / 240`, up to 3): on a side monitor none. While it builds
    // the list on a narrow screen it is told the window is desktop width, so it lists the same
    // projects as on a desktop; the rules above stack its columns into one.
    script: (maxWidth) => {
      const DESKTOP_WIDTH = 1280;
      const patch = () => {
        const $ = window.jQuery;
        const picker = $?.ui?.projectPicker?.prototype;
        if (!picker) return false;
        if (picker.__virtuosNarrow) return true;
        const update = picker._updateMenu;
        picker._updateMenu = function (...args) {
          if (window.innerWidth > maxWidth) return update.apply(this, args);
          const width = $.fn.width;
          $.fn.width = function (...a) {
            return this[0] === window && a.length === 0
              ? DESKTOP_WIDTH
              : width.apply(this, a);
          };
          try {
            return update.apply(this, args);
          } finally {
            $.fn.width = width;
          }
        };
        picker.__virtuosNarrow = true;
        return true;
      };
      // The picker's script may load late: patch as soon as it is there, at the latest when the
      // page is used (focus and clicks come before the picker opens its list).
      if (patch()) return;
      const timer = setInterval(() => patch() && clearInterval(timer), 500);
      setTimeout(() => clearInterval(timer), 60000);
      for (const type of ["focusin", "pointerdown"]) {
        document.addEventListener(type, patch, true);
      }
    },
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

/**
 * The page's script for a style: its rules inside the narrow-window media query, then its own
 * script (once a page: it may patch the site's scripts).
 */
function scriptFor(style) {
  const css = `@media (max-width: ${style.maxWidth}px) {\n${style.css}\n}`;
  const id = `virtuos-site-${style.name}`;
  const add = `(${addStyleInPage.toString()})(${JSON.stringify(id)}, ${JSON.stringify(css)});`;
  if (!style.script) return add;
  const run = `if (!window.__virtuosSiteScript) { window.__virtuosSiteScript = true; (${style.script.toString()})(${style.maxWidth}); }`;
  return `${add}\n${run}\ntrue;`;
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

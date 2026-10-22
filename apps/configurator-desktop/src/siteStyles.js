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
 *
 * The styles can be switched off (and on again) from the configurator's workspace toolbar, to
 * compare a site as it is with how it is adapted: every page on the screens follows at once.
 */
const { ipcMain, webFrameMain } = require("electron");

/**
 * `hosts`: the site's addresses (a host and its subdomains). `maxWidth`: the window width (CSS
 * pixels) up to which the style applies. `css`: the rules. `script` (optional): a function run
 * in the page with `maxWidth`, after the rules are added.
 */
const SITE_STYLES = [
  {
    name: "tinygnomes",
    hosts: ["tinygnomes.com"],
    // Up to about two thirds of a main monitor: two TinyGnomes windows side by side on one
    // (each about 700 px) are both adapted, rather than one of them, just under the line, being
    // adapted and the other not. Dialogs keep to a phone's width in a wider window.
    maxWidth: 1000,
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
      /* In a short window the strip scrolls: without a scroll bar, which covered half the
         icons (the wheel still scrolls it). */
      .servicebar-scrollarea {
        overflow-x: hidden !important;
        scrollbar-width: none;
      }
      .servicebar-scrollarea::-webkit-scrollbar {
        display: none;
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

      /* The project picker in the top bar from the left edge: its Home button (tinygnomes'
         logo) over the menu strip, then the picker. */
      .global-projectpicker {
        left: 4px !important;
        right: 4px !important;
        width: auto !important;
      }
      .global-projectpicker table {
        width: 100% !important;
      }

      /* The project picker's list (370 px at least, placed for a desktop window): across the
         screen, up to 460 px. */
      .widget-projectpicker.ui-menu {
        left: 4px !important;
        right: max(4px, 100vw - 464px) !important;
        width: auto !important;
        min-width: 0 !important;
        max-width: min(100vw - 8px, 460px) !important;
        max-height: 70vh;
        overflow-y: auto;
        box-sizing: border-box;
      }
      /*
       * Its "New project" and "N more" sit in a column beside the projects, with no room beside
       * them here: under them instead, in a row (where they come in the list, so nothing moves
       * as it opens).
       */
      .widget-projectpicker.ui-menu:not([style*="display: none"]) {
        display: flex !important;
        flex-direction: column;
        height: auto !important;
      }
      .widget-projectpicker.ui-menu > .ui-menu-column {
        float: none !important;
      }
      /*
       * A project's row laid out without depending on any width around it: its link (placed
       * absolutely by the site, sized to its content) in the row's flow, the icon a fixed
       * column and the name the rest, ending in "…".
       */
      .widget-projectpicker.ui-menu .project-sec {
        width: auto !important;
        height: auto !important;
      }
      .widget-projectpicker.ui-menu .project-sec a {
        position: static !important;
        display: block !important;
      }
      .widget-projectpicker.ui-menu .project-sec a > table {
        width: 100% !important;
        table-layout: fixed;
      }
      .widget-projectpicker.ui-menu .project-sec td.project-icon {
        width: 34px;
      }
      .widget-projectpicker.ui-menu > .ui-menu-actions {
        float: none !important;
        height: auto !important;
        margin: 6px 0 0 !important;
        padding: 6px 0 0 !important;
        border-left: none !important;
        border-top: 1px solid #ccc;
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

      /*
       * Text buttons (Refresh, Create task...) are three cells, rounded ends and a middle; on a
       * screen seen at an angle their joins showed as thin white lines. The middle's colour
       * reaches a pixel under each end.
       */
      table[id$="_button_root"] td.m {
        position: relative;
      }
      table[id$="_button_root"] td.m::before {
        content: "";
        position: absolute;
        inset: 0 -1px;
        background: inherit;
      }
      table[id$="_button_root"] td.m > * {
        position: relative;
      }
      /* Dialogs (the app's floating cards, placed and sized for a desktop window): across the
         screen, up to 520 px (centred in a wider window). */
      .qfw-floatingcard {
        left: max(4px, 50vw - 260px) !important;
        right: max(4px, 50vw - 260px) !important;
        width: auto !important;
        max-width: min(100vw - 8px, 520px) !important;
        box-sizing: border-box;
      }
      .qfw-floatingcard [id^="contentbag-"] {
        width: 100% !important;
        box-sizing: border-box;
      }
      /* A window's title wraps instead of widening it. */
      .qfw-floatingcard [id^="cardheader-title-"] {
        white-space: normal !important;
      }
      /* (Its text is sized in pixels by the site's script, for the window's desktop width.) */
      .qfw-floatingcard [id^="cardheader-title-"] > div[style*="width"] {
        width: auto !important;
      }
      .qfw-floatingcard [id$="-_relativeanchor"] > div > table,
      .qfw-floatingcard table.qfw-border-normal {
        width: 100% !important;
      }
      /* Their rows of controls (Quick pick, then Create, Edit favorites, Close...) wrap. */
      .qfw-floatingcard [id^="cardcontent-"] {
        padding: 8px 8px 0 !important;
      }
      .qfw-floatingcard [id^="contentbag-"] > table,
      .qfw-floatingcard [id^="contentbag-"] > table > tbody {
        display: block !important;
        width: auto !important;
      }
      .qfw-floatingcard [id^="contentbag-"] > table > tbody > tr {
        display: flex !important;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 0;
      }
      .qfw-floatingcard [id^="contentbag-"] > table > tbody > tr > td {
        display: block !important;
        width: auto !important;
      }
      .qfw-floatingcard [id^="contentbag-"] > table > tbody > tr > td:has(.tab-bar, .r-border-grey) {
        flex-basis: 100%;
      }
      /*
       * The task window: its toolbar, header and button bar wrap, and its three columns (people,
       * the task's fields, its chat and files) are stacked: the fields first, then the people,
       * then the rest. (Its body is the padded block under the toolbar.)
       */
      [id^="card-TaskNew-dialog"] .dialog-bar,
      [id^="card-TaskNew-dialog"] .dialog-bar table {
        width: auto !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-toppart"],
      [id^="card-TaskNew-dialog"] .dialog-bar {
        height: auto !important;
        padding-bottom: 6px;
      }
      [id^="card-TaskNew-dialog"] .dialog-bar tr,
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > table > tbody > tr,
      [id^="card-TaskNew-dialog"] [id$="-rbar_tr"] {
        display: flex !important;
        flex-wrap: wrap;
        align-items: center;
      }
      /* The actions on one line when they fit (the usual four do): the bar takes the window's
         margins too, and the links their padding. */
      [id^="card-TaskNew-dialog"] .dialog-bar table.bar-table,
      [id^="card-TaskNew-dialog"] .dialog-bar table.bar-table > tbody {
        display: block !important;
        width: 100% !important;
      }
      [id^="card-TaskNew-dialog"] .dialog-bar :is([id$="-dialogbar_left"], [id$="-dialogbar_mid"]) {
        padding: 0 !important;
      }
      [id^="card-TaskNew-dialog"] .dialog-bar [id$="-dialogbar_right"] {
        flex: 1 1 0;
        padding-right: 0 !important;
      }
      [id^="card-TaskNew-dialog"] .dialog-bar [id$="-dialogbar_right"] > div {
        margin: 0 -10px !important;
      }
      /* (That reaches past the window's body, which then scrolled sideways for it.) */
      [id^="card-TaskNew-dialog"] [id^="contentbag-"] {
        overflow-x: hidden !important;
      }
      [id^="card-TaskNew-dialog"] .dialog-bar [id$="-dialogbar_right"] > div > table,
      [id^="card-TaskNew-dialog"] .dialog-bar [id$="-dialogbar_right"] > div > table > tbody {
        display: block !important;
        width: 100% !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-rbar_tr"] {
        justify-content: space-evenly;
        gap: 4px 2px;
        font-size: 11.5px;
      }
      [id^="card-TaskNew-dialog"] [id$="-rbar_tr"] > td {
        padding: 0 !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-rbar_tr"] > td > div {
        padding-right: 2px !important;
        padding-left: 2px !important;
      }
      /* The actions the site hides for this task stay hidden; no "|" between wrapped rows. */
      [id^="card-TaskNew-dialog"] .dialog-bar [id$="-rbar_tr"] > td:is([style*="display: none"], :has(> .v-bar)) {
        display: none !important;
      }
      [id^="card-TaskNew-dialog"] .dialog-bar td,
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > table > tbody > tr > td,
      [id^="card-TaskNew-dialog"] [id$="-rbar_tr"] > td {
        display: block !important;
        width: auto !important;
        white-space: normal !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > table,
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > table > tbody,
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > div > table,
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > div > table > tbody {
        display: block !important;
        width: auto !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > div[style*="height"] {
        height: auto !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > div > table > tbody > tr {
        display: flex !important;
        flex-direction: column;
      }
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > div > table > tbody > tr > td {
        display: block !important;
        width: auto !important;
        padding: 0 0 10px !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > div > table > tbody > tr > td:nth-child(2) {
        order: -1;
      }
      /* The people and the chat and files: as tall as their content, the window's width. */
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > div > table > tbody > tr > td > div,
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > div > table > tbody > tr > td > div > div {
        width: auto !important;
        height: auto !important;
        margin-left: 0 !important;
        padding-left: 0 !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > div > table > tbody > tr > td:not(:nth-child(2)) [style*="height"],
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > div > table > tbody > tr > td:not(:nth-child(2)) table {
        height: auto !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > div > table > tbody > tr > td:not(:nth-child(2)) {
        border-top: 1px solid #eee;
        padding-top: 8px !important;
      }
      /* Its people (Doer, Lead, Watcher, each a heading row then a row per person) in columns,
         each heading starting the next one. */
      [id^="card-TaskNew-dialog"] table:has(> tbody[id$="-actors_table_tablebody0"]) {
        display: block !important;
        width: 100% !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-actors_table_tablebody0"] {
        display: block !important;
        columns: 3;
        column-gap: 10px;
      }
      [id^="card-TaskNew-dialog"] [id$="-actors_table_tablebody0"] > tr {
        display: block !important;
        break-inside: avoid;
      }
      /* A person's row as tall as their picture (20 px in a 17 px line): the list clipped the
         pictures in its last row. */
      [id^="card-TaskNew-dialog"] [id$="-actors_table_tablebody0"] > tr[id*="-rowtr_"] {
        min-height: 24px;
      }
      [id^="card-TaskNew-dialog"] [id$="-actors_table_tablebody0"] {
        padding-bottom: 4px;
      }
      [id^="card-TaskNew-dialog"] [id$="-actors_table_tablebody0"] > tr > td {
        display: block !important;
        width: auto !important;
        height: auto !important;
        padding: 0 !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-actors_table_tablebody0"] > tr[id*="-rowheader_"] {
        display: none !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-actors_table_tablebody0"] > tr[id*="-rowtr_"]:has(td[style*="font-weight: bold"]) ~ tr:has(td[style*="font-weight: bold"]) {
        break-before: column;
      }
      /* Its header: no big tick (the title has one); the Lead and Doer cards side by side. */
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > table > tbody > tr > td:first-child {
        display: none !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] > table > tbody > tr > td {
        flex-basis: 100%;
        padding: 0 !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-acceptbar"] > table,
      [id^="card-TaskNew-dialog"] [id$="-acceptbar"] > table > tbody {
        display: block !important;
        width: 100% !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-acceptbar"] > table > tbody > tr {
        display: flex !important;
        gap: 8px;
        align-items: stretch;
        margin: 8px 0;
      }
      [id^="card-TaskNew-dialog"] [id$="-acceptbar"] > table > tbody > tr > td {
        display: block !important;
        flex: 1 1 0;
        min-width: 0;
        width: auto !important;
        padding: 0 !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-acceptbar"] fieldset {
        padding: 0 4px 4px !important;
        min-width: 0;
      }
      [id^="card-TaskNew-dialog"] [id$="-acceptbar"] fieldset > table {
        width: 100% !important;
        height: auto !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-acceptbar"] fieldset > table > tbody > tr > td:first-child {
        width: 48px !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-acceptbar"] .q-cb-text {
        font-size: 12px;
        padding-right: 0 !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-acceptbar"] > table > tbody > tr > td > * {
        width: auto !important;
        height: 100%;
        margin: 0 !important;
        box-sizing: border-box;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"],
      [id^="card-TaskNew-dialog"] [id$="-statuspanel"],
      [id^="card-TaskNew-dialog"] [id$="-content"] > div[style*="padding"] div[style*="height:370px"] {
        width: auto !important;
        height: auto !important;
        padding-right: 0 !important;
      }
      /* Its fields: each label above its value, the boxes the width of the window. */
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table,
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table > tbody,
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table > tbody > tr,
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table > tbody > tr > td {
        display: block !important;
        width: auto !important;
        text-align: left !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table > tbody > tr {
        margin-bottom: 2px;
      }
      /* Compact: a label just above its box, little space after it. */
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table > tbody > tr > td {
        padding: 0 0 8px !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table > tbody > tr > td[style*="text-align: right"] {
        padding: 0 0 3px !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table > tbody > tr > td:empty {
        display: none !important;
      }
      /* The dates with the calendar icon just before them. */
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table > tbody > tr[id$="-rowdates"] {
        display: flex !important;
        align-items: center;
        gap: 6px;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table > tbody > tr[id$="-rowdates"] > td {
        height: auto !important;
        padding: 0 0 8px !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table > tbody > tr[id$="-rowdates"] > td > img {
        display: block;
      }
      /* Estimated beside Actual, Priority beside Milestone, Category beside Sub (each row holds
         both pairs). */
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table > tbody > tr:is([id$="-rowtime"], [id$="-rowpriority"], [id$="-rowcategory"]) {
        display: grid !important;
        grid-template-rows: auto auto;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        grid-auto-flow: column;
        column-gap: 12px;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table > tbody > tr:is([id$="-rowtime"], [id$="-rowpriority"], [id$="-rowcategory"]) > td {
        display: block !important;
        min-width: 0;
        height: auto !important;
      }
      /* Estimated is short: its column only as wide as it, so "Add time" fits beside Actual. */
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] > table > tbody > tr[id$="-rowtime"] {
        grid-template-columns: auto minmax(0, 1fr);
        column-gap: 20px;
      }
      /* A new task's Estimated is a box ("Hours" after it): a few digits wide, so Actual fits. */
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] [id$="-duration"] table[width],
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] [id$="-duration"] [id*="-Mol-InputBox-"] table {
        width: auto !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] [id$="-duration"] td.inputbox table {
        width: 64px !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-rowpriority"] > td > div > table,
      [id^="card-TaskNew-dialog"] [id$="-rowpriority"] table.dropdown {
        width: 100% !important;
        table-layout: fixed;
      }
      [id^="card-TaskNew-dialog"] [id$="-rowpriority"] table.dropdown td.dd-mid {
        width: auto !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-rowpriority"] table.dropdown td:not(.dd-mid) {
        width: 29px;
      }
      /* Its estimated hours on the line of the actual ones (the link is padded like theirs, but
         inline, where padding doesn't move the text down). */
      [id^="card-TaskNew-dialog"] [id*="-Mol-TextLink-editduration-"] {
        display: inline-block !important;
      }
      /* The actual time and "Add time" beside it ("Add time" under it if there's no room). */
      [id^="card-TaskNew-dialog"] table[id$="-actualduration"],
      [id^="card-TaskNew-dialog"] table[id$="-actualduration"] > tbody {
        display: block !important;
      }
      [id^="card-TaskNew-dialog"] table[id$="-actualduration"] > tbody > tr {
        display: flex !important;
        flex-wrap: wrap;
        align-items: center;
        gap: 2px;
      }
      [id^="card-TaskNew-dialog"] table[id$="-actualduration"] > tbody > tr > td {
        display: block !important;
        padding-left: 0 !important;
      }
      /* Chat, Files and Links beside the Private, Calendar, Remind and Recurring boxes. */
      [id^="card-TaskNew-dialog"] table:has(> tbody > tr > td > table > tbody > tr > td > div[id*="-doeronly-"]) {
        display: block !important;
        width: 100% !important;
      }
      [id^="card-TaskNew-dialog"] table:has(> tbody > tr > td > table > tbody > tr > td > div[id*="-doeronly-"]) > tbody {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        column-gap: 12px;
      }
      [id^="card-TaskNew-dialog"] table:has(> tbody > tr > td > table > tbody > tr > td > div[id*="-doeronly-"]) > tbody > tr,
      [id^="card-TaskNew-dialog"] table:has(> tbody > tr > td > table > tbody > tr > td > div[id*="-doeronly-"]) > tbody > tr > td {
        display: block !important;
        height: auto !important;
        min-width: 0;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] table[width],
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] [id*="-Mol-InputBox-"] table {
        width: 100% !important;
        table-layout: fixed;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] .input-border-box {
        width: auto !important;
      }
      /* A new task's intro ("Create a task", then a line about it), 275 px wide. */
      [id^="card-TaskNew-dialog"] [id$="-panelcreate"] [style*="width"] {
        width: auto !important;
      }
      /* A new task's project is a picker (a set width, its box a set width less its icons). */
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] .pwidget-small-pp {
        width: auto !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] .pwidget-small-pp input {
        width: calc(100% - 48px) !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] td[width]:not([width="1%"]) {
        width: auto !important;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] input[style*="width"],
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] textarea {
        width: 100% !important;
        box-sizing: border-box;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] [style*="width"] {
        max-width: 100% !important;
        box-sizing: border-box;
      }
      /*
       * Dialogs over the task window (its Chat, Links, Actual hours, Remind, Edit people,
       * Recurring...): their body is set to a desktop width (722 px), which the window's tables
       * grew to; the screen's width instead (less the window's margins and padding). For a
       * chat, under the message box: the attach links, then the post options and "Post
       * message", wrapping onto a second line.
       */
      .qfw-floatingcard:not([id^="card-TaskNew-dialog"]) [id^="contentbag-"] {
        width: min(100vw - 54px, 466px) !important;
      }
      /* The links' table: its columns (Who, When, Source, Type, 100 px each) share the width. */
      [id^="card-ServiceLink-dialog"] [id*="-Mol-EZTable-"] td[style*="width"]:not([id$="_massaction"]) {
        width: auto !important;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      [id^="card-ServiceLink-dialog"] [id*="-Mol-EZTable-"] table {
        table-layout: fixed;
        width: 100% !important;
      }
      [id^="card-ServiceLink-dialog"] [id*="-Mol-EZTable-"] [style*="width"]:not(td) {
        max-width: 100% !important;
        box-sizing: border-box;
      }
      /*
       * Actual hours: the hours logged (Doer, Date, Hours, Edit: 355 px of columns) share the
       * width; the line adding hours (who, when, how many, Add) wraps, the hours under it.
       */
      [id^="card-TaskHoursActual-dialog"] table:has(> tbody > tr > td[style*="width"]) {
        table-layout: fixed;
        width: 100% !important;
      }
      [id^="card-TaskHoursActual-dialog"] table:has(> tbody > tr > td[style*="width"]) > tbody > tr > td {
        overflow: hidden;
        text-overflow: ellipsis;
        padding-left: 2px !important;
        padding-right: 2px !important;
      }
      [id^="card-TaskHoursActual-dialog"] table:has(> tbody > tr > td[style*="width"]) > tbody > tr > td:nth-child(1) {
        width: 30% !important;
      }
      [id^="card-TaskHoursActual-dialog"] table:has(> tbody > tr > td[style*="width"]) > tbody > tr > td:nth-child(2) {
        width: 36% !important;
      }
      [id^="card-TaskHoursActual-dialog"] table:has(> tbody > tr > td[style*="width"]) > tbody > tr > td:nth-child(3),
      [id^="card-TaskHoursActual-dialog"] table:has(> tbody > tr > td[style*="width"]) > tbody > tr > td:nth-child(4) {
        width: 17% !important;
      }
      [id^="card-TaskHoursActual-dialog"] [id*="-Mol-EZTable-"] [style*="width"]:not(td):not(table) {
        max-width: 100% !important;
        box-sizing: border-box;
      }
      [id^="card-TaskHoursActual-dialog"] table:has(> tbody > tr[id$="-addline"]),
      [id^="card-TaskHoursActual-dialog"] table:has(> tbody > tr[id$="-addline"]) > tbody {
        display: block !important;
        width: auto !important;
      }
      [id^="card-TaskHoursActual-dialog"] tr[id$="-addline"] {
        display: flex !important;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 6px 0;
      }
      [id^="card-TaskHoursActual-dialog"] tr[id$="-addline"] > td {
        display: block !important;
        padding-left: 3px !important;
      }
      /* Notifications (Remind me, Remind all): their choices narrower (150 px), beside the labels. */
      [id^="card-TaskNew_Notify-dialog"] table.dropdown td.dd-mid,
      [id^="card-TaskNew_Notify-dialog"] table.dropdown td.dd-mid > div[style*="width"] {
        width: 96px !important;
      }
      /* Recurrence: each rule ("The first Monday of every 1 month(s)") wraps like a sentence. */
      [id^="card-Recurring-dialog"] [id*="formula."][id$="_txt"] > table,
      [id^="card-Recurring-dialog"] [id*="formula."][id$="_txt"] > table > tbody {
        display: block !important;
        width: auto !important;
      }
      [id^="card-Recurring-dialog"] [id*="formula."][id$="_txt"] > table > tbody > tr {
        display: flex !important;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 0;
      }
      [id^="card-Recurring-dialog"] [id*="formula."][id$="_txt"] > table > tbody > tr > td {
        display: block !important;
      }
      /* Its wide choices (first, Monday, day(s): 100 px and more) as wide as their words. */
      [id^="card-Recurring-dialog"] table.dropdown td.dd-mid[style*="width: 1"],
      [id^="card-Recurring-dialog"] table.dropdown td.dd-mid[style*="width: 1"] > div[style*="width"] {
        width: 72px !important;
      }
      /*
       * Select participants: its two columns (the project's people to pick from, then the
       * chosen ones with their roles), 725 px side by side, one under the other.
       */
      [id^="card-TaskActors-dialog"] [id^="contentbag-"] > div > table,
      [id^="card-TaskActors-dialog"] [id^="contentbag-"] > div > table > tbody,
      [id^="card-TaskActors-dialog"] [id^="contentbag-"] > div > table > tbody > tr,
      [id^="card-TaskActors-dialog"] [id^="contentbag-"] > div > table > tbody > tr > td {
        display: block !important;
        width: auto !important;
        padding-right: 0 !important;
      }
      [id^="card-TaskActors-dialog"] [id^="contentbag-"] > div > table > tbody > tr > td + td {
        padding-top: 10px;
      }
      [id^="card-TaskActors-dialog"] [id^="contentbag-"] table[style*="width"]:not([id$="_button_root"]) {
        width: 100% !important;
      }
      [id^="card-TaskActors-dialog"] [id^="contentbag-"] [style*="width"]:not(td) {
        max-width: 100% !important;
        box-sizing: border-box;
      }
      /* The people to pick from (380 x 332 px) the width, its name filter too; both lists
         shorter, so the window's OK stays in view. */
      [id^="card-TaskActors-dialog"] [id*="-Mol-PersonaPicker-"] {
        width: auto !important;
        height: auto !important;
      }
      [id^="card-TaskActors-dialog"] [id*="-Mol-PersonaPicker-"] input[style*="width"] {
        width: 100% !important;
      }
      [id^="card-TaskActors-dialog"] [id*="-Mol-PersonaPicker-"] table:not(.tbl) {
        width: 100% !important;
      }
      [id^="card-TaskActors-dialog"] [id$="_bodybag"][style*="height"] {
        height: 150px !important;
      }
      [id^="card-TaskActors-dialog"] [id^="contentbag-"] table[style*="width"]:not([id$="_button_root"]) {
        table-layout: fixed;
      }
      /* Over the people: "Filter names", the filter, "Select all" (under them if need be). */
      [id^="card-TaskActors-dialog"] td.m-solid > table:has([id*="-Mol-InputBox-filtertext-"]),
      [id^="card-TaskActors-dialog"] td.m-solid > table:has([id*="-Mol-InputBox-filtertext-"]) > tbody {
        display: block !important;
      }
      [id^="card-TaskActors-dialog"] td.m-solid > table:has([id*="-Mol-InputBox-filtertext-"]) > tbody > tr {
        display: flex !important;
        flex-wrap: wrap;
        align-items: center;
      }
      [id^="card-TaskActors-dialog"] td.m-solid > table:has([id*="-Mol-InputBox-filtertext-"]) > tbody > tr > td {
        display: block !important;
      }
      [id^="card-TaskActors-dialog"] td.m-solid > table:has([id*="-Mol-InputBox-filtertext-"]) > tbody > tr > td:has([id*="-Mol-InputBox-filtertext-"]) {
        flex: 1 1 120px;
        min-width: 0;
      }
      [id^="card-TaskActors-dialog"] td.m-solid > table:has([id*="-Mol-InputBox-filtertext-"]) > tbody > tr > td:last-child {
        margin-left: auto;
      }
      [id^="card-TaskActors-dialog"] [id*="-Mol-InputBox-filtertext-"] table {
        width: 100% !important;
      }
      /* The chosen people: their name and role columns (110 px each) share the width. */
      [id^="card-TaskActors-dialog"] td[id*="actors_data0_"]:is([id$="_actor"], [id$="_role"]) {
        width: auto !important;
      }
      /* The message box (its highlighter sized in pixels by the site's script). */
      [id^="card-ChatService-dialog"] .highlightTextarea {
        width: 100% !important;
      }
      /* Tall enough for its instructions (four lines here); it still grows as one types. */
      [id^="card-ChatService-dialog"] .highlightTextarea,
      [id^="card-ChatService-dialog"] .highlightTextarea-container,
      [id^="card-ChatService-dialog"] .highlightTextarea textarea {
        min-height: 64px;
      }
      [id^="card-ChatService-dialog"] [id$="-post"] > table,
      [id^="card-ChatService-dialog"] [id$="-post"] > table > tbody {
        display: block !important;
        width: auto !important;
      }
      [id^="card-ChatService-dialog"] [id$="-post"] > table > tbody > tr {
        display: flex !important;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 4px 8px;
      }
      [id^="card-ChatService-dialog"] [id$="-post"] > table > tbody > tr > td {
        display: block !important;
        width: auto !important;
      }
      [id^="card-ChatService-dialog"] [id$="-post"] > table > tbody > tr > td:last-child {
        margin-left: auto;
      }
      /* The Ctrl+Return picture beside it (the message box says so too). */
      [id^="card-ChatService-dialog"] [id$="-post"] td:has(> img[src*="ctrl_return"]) {
        display: none !important;
      }
      /* Its tabs (All, Favorites, Recent, Hidden, Law) wrap onto two rows: the bar holds both, so
         the list under it isn't pushed beside the second row. */
      .qfw-floatingcard .tab-bar {
        height: auto !important;
        overflow: hidden;
      }
      [id^="card-ProjectPicker-dialog"] .r-border-grey > table {
        width: 100% !important;
      }
      [id^="card-ProjectPicker-dialog"] [id$="_message"] div[style*="width"] {
        width: auto !important;
        max-width: 100%;
        box-sizing: border-box;
      }
      /* A closed one is hidden behind the page (visibility: hidden, z-index -10), but parts of
         it make themselves visible again; here the page has gaps they showed through. */
      .qfw-floatingcard[style*="visibility: hidden"],
      .qfw-floatingcard[style*="visibility: hidden"] *,
      .qfw-floatingcard[style*="z-index: -"],
      .qfw-floatingcard[style*="z-index: -"] * {
        visibility: hidden !important;
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
      /* The tables around it don't grow with it: on a side monitor its filters sized them past
         the screen's edge, cutting off the tasks and the filters with them. */
      [id^="card-QuickCard-"] table:has(.tasks-panel) {
        table-layout: fixed !important;
        width: 100% !important;
      }
      [id^="card-QuickCard-"] td:has(.tasks-panel) {
        width: 100% !important;
      }
      [id^="contentbag-"]:has(.tasks-panel),
      [id^="card-QuickCard-"]:has(.tasks-panel) {
        width: auto !important;
        max-width: 100% !important;
      }
      /* Its filters wrap within the width. */
      .tasks-buttonbar,
      .tasks-buttonbar * {
        max-width: 100%;
        box-sizing: border-box;
      }
      .tasks-buttonbar div {
        flex-wrap: wrap;
      }
      /* With a filter on, the site frames the filters in a pink box: room it takes for nothing
         here (the filters themselves show which are on). */
      .tasks-buttonbar td.filter-bar.active {
        background: transparent !important;
        border-color: transparent !important;
      }
      /*
       * Create task and the filters in one wrapping row (Filter beside Create task, then the
       * filters set, then Custom and Clear), not the filters' own block under Create task. Each
       * keeps only its own height: the site pads them to line up in a desktop-wide bar.
       */
      .tasks-buttonbar [id$="-lbar_tr"] {
        flex-wrap: wrap !important;
        align-items: center !important;
        row-gap: 8px;
        padding: 4px 0 2px;
      }
      .tasks-buttonbar [id$="-lbar_tr"] > td {
        padding: 0 !important;
      }
      .tasks-buttonbar [id$="-lbar_tr"] > td:not(.filter-bar) {
        margin-right: 10px;
      }
      .tasks-buttonbar [id$="-lbar_tr"] > td:first-child:not(:has(*)) {
        display: none !important;
      }
      .tasks-buttonbar td.filter-bar {
        display: contents !important;
      }
      .tasks-buttonbar td.filter-bar > * {
        margin: 0 !important;
        padding: 0 !important;
      }
      .tasks-buttonbar td.filter-bar > :is(div.tasks-filters, div[class*="item"]) {
        display: flex !important;
        align-items: center;
        height: auto !important;
        min-height: 0 !important;
        margin-right: 10px !important;
      }
      .tasks-buttonbar td.filter-bar > div[class*="item"][style*="display: none"] {
        display: none !important;
      }
      .tasks-buttonbar td.filter-bar [class$="-label"],
      .tasks-buttonbar td.filter-bar .tasks-filter-item > div:first-child {
        display: none !important;
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
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td:nth-child(10),
      [id^="TaskList-"][id$="-maintable_bodybag"] tr > td[style*="display: none"] {
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

      /*
       * Wikis, a page being written: its bar (the title, Save, Cancel) and its text editor are
       * sized in pixels for a desktop window (1600 px): the screen's width instead, the title
       * box as wide as there is room, Save and Cancel beside it or under it.
       */
      .qwiki-topbar {
        width: auto !important;
        height: auto !important;
      }
      .qwiki-topbar .qwiki-buttonbar > table,
      .qwiki-topbar .qwiki-buttonbar > table > tbody {
        display: block !important;
        width: auto !important;
      }
      .qwiki-topbar .qwiki-buttonbar > table > tbody > tr,
      .qwiki-topbar [id$="-leftpropbar_tr"] {
        display: flex !important;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 0;
      }
      .qwiki-topbar .qwiki-buttonbar > table > tbody > tr > td:not([style*="display: none"]),
      .qwiki-topbar [id$="-leftpropbar_tr"] > td:not([style*="display: none"]) {
        display: block !important;
        width: auto !important;
      }
      .qwiki-topbar .qwiki-buttonbar > table > tbody > tr > td:has([id$="-leftpropbar_tr"]) {
        flex: 1 1 100%;
        min-width: 0;
      }
      .qwiki-topbar [id*="-leftpropbar-"],
      .qwiki-topbar [id*="-leftpropbar-"] > table,
      .qwiki-topbar [id*="-leftpropbar-"] > table > tbody {
        display: block !important;
        width: auto !important;
      }
      .qwiki-topbar [id$="-leftpropbar_tr"] > td:has(input) {
        flex: 1 1 160px;
        min-width: 0;
      }
      .qwiki-topbar [id$="-leftpropbar_tr"] td:has(input) table {
        width: 100% !important;
      }
      .qwiki-topbar [id$="-leftpropbar_tr"] input[style*="width"] {
        width: 100% !important;
        box-sizing: border-box;
      }
      [id^="card-QuickCard-"] .cke,
      [id^="card-QuickCard-"] .cke_inner {
        width: auto !important;
      }
      /*
       * A wiki being read: its bar (Back to index, the title, Edit wiki, read time) is fixed over
       * the page with room left for one line of it, so wrapped here it covered the article's
       * first heading: it scrolls with the article instead. The article keeps to the width:
       * long words and code wrap, its tables are the width, a wider one scrolls on its own.
       */
      .qwiki-topbar:has(~ .qwiki-panel [id$="-wiki_html"]) {
        position: relative !important;
        top: auto !important;
      }
      .qwiki-panel:has([id$="-wiki_html"]) {
        padding-top: 8px !important;
      }
      .qwiki-panel [id$="-pagecontent"] {
        table-layout: fixed;
        width: 100% !important;
      }
      [id$="-wiki_html"] {
        overflow-wrap: anywhere;
      }
      [id$="-wiki_html"] :is(div, p, ul, ol, table, img, iframe, video) {
        max-width: 100% !important;
        box-sizing: border-box;
      }
      [id$="-wiki_html"] table {
        display: block;
        overflow-x: auto;
      }
      [id$="-wiki_html"] pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      [id$="-wiki_html"] img {
        height: auto !important;
      }
      /* The list of wikis' filters: Filter and the filter set beside it, on a line of their own
         under Create wiki, without the box the site draws round them. */
      .qwiki-topbar .qwiki-buttonbar > table > tbody > tr > td.filter-bar:not([style*="display: none"]) {
        display: flex !important;
        flex: 1 1 100%;
        flex-wrap: wrap;
        align-items: center;
        row-gap: 6px;
        margin: 0 0 4px !important;
        padding: 0 !important;
        border-color: transparent !important;
        background: transparent !important;
      }
      .qwiki-topbar td.filter-bar > * {
        flex: 0 0 auto;
        width: auto !important;
        min-width: 0 !important;
        height: auto !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        padding: 0 !important;
      }
      .qwiki-topbar td.filter-bar > .qwiki-filters {
        display: flex;
        align-items: center;
        margin-right: 8px;
      }
      /* The filter set (140 px) takes the rest of the line. */
      .qwiki-topbar td.filter-bar > .qwiki-filter-item {
        flex: 1 1 100px;
        max-width: 180px;
      }
      .qwiki-topbar td.filter-bar > .qwiki-filter-item table {
        width: 100% !important;
        table-layout: fixed;
      }
      .qwiki-topbar td.filter-bar > .qwiki-filter-item table.dropdown td.dd-mid,
      .qwiki-topbar td.filter-bar > .qwiki-filter-item [style*="width"] {
        width: auto !important;
      }
      .qwiki-topbar td.filter-bar > .qwiki-filter-item table.dropdown td:not(.dd-mid) {
        width: 29px;
      }
      .qwiki-topbar td.filter-bar .qwiki-filters-label,
      .qwiki-topbar td.filter-bar .qwiki-filter-item > div:first-child {
        display: none !important;
      }
      /*
       * The list of wikis: each wiki a card (its title across the width, then who edited it
       * last, when, and its shares) instead of a row of columns, which left the title 46 px.
       * Its cells: title, project (hidden), last editor, posted, shares.
       */
      [id^="WikiIndex-"][id$="-indextable_headerbody"],
      [id^="WikiIndex-"][id$="-indextable_bodybag"] tr[id*="-rowheader_"] {
        display: none !important;
      }
      [id^="WikiIndex-"][id$="-indextable_bodybag"] [id^="PANEL"] {
        height: auto !important;
      }
      [id^="WikiIndex-"][id$="-indextable_bodybag"] table,
      [id^="WikiIndex-"][id$="-indextable_bodybag"] tbody {
        display: block !important;
        width: auto !important;
      }
      [id^="WikiIndex-"][id$="-indextable_bodybag"] tr[id*="-rowtr_"] {
        display: grid !important;
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-areas: "title title title" "editor posted shares";
        align-items: center;
        gap: 2px 10px;
        padding: 7px 4px;
        border-bottom: 1px solid #eee;
      }
      [id^="WikiIndex-"][id$="-indextable_bodybag"] tr[id*="-rowtr_"] > td {
        display: block !important;
        width: auto !important;
        height: auto !important;
        min-width: 0;
        padding: 0 4px !important;
      }
      [id^="WikiIndex-"][id$="-indextable_bodybag"] tr[id*="-rowtr_"] > td[style*="display: none"] {
        display: none !important;
      }
      [id^="WikiIndex-"][id$="-indextable_bodybag"] tr[id*="-rowtr_"] > td:nth-child(1) {
        grid-area: title;
        font-weight: 600;
      }
      [id^="WikiIndex-"][id$="-indextable_bodybag"] tr[id*="-rowtr_"] > td:nth-child(1) div,
      [id^="WikiIndex-"][id$="-indextable_bodybag"] tr[id*="-rowtr_"] > td:nth-child(1) nobr {
        width: auto !important;
        white-space: normal;
      }
      [id^="WikiIndex-"][id$="-indextable_bodybag"] tr[id*="-rowtr_"] > td:nth-child(3) {
        grid-area: editor;
        font-size: 12px;
      }
      [id^="WikiIndex-"][id$="-indextable_bodybag"] tr[id*="-rowtr_"] > td:nth-child(4) {
        grid-area: posted;
        font-size: 12px;
        color: #777;
      }
      [id^="WikiIndex-"][id$="-indextable_bodybag"] tr[id*="-rowtr_"] > td:nth-child(5) {
        grid-area: shares;
        font-size: 12px;
      }

      /*
       * Reports, Forms, Search: a service's own panel (report templates; Create form, Filter,
       * Trashcan; nothing for Search) beside its content, both placed at fixed widths. Here the
       * panel on top, as tall as it is up to 40% of the height, and the content under it, each
       * scrolling on its own as the site's side-by-side ones do.
       */
      [id*="-Mol-VerticalDivider-servicebodyframe-"],
      [id$="-servicebodyframe_bag"] {
        height: 100% !important;
      }
      [id$="-servicebodyframe_bag"] {
        display: flex !important;
        flex-direction: column;
        gap: 8px;
      }
      [id$="-servicebodyframe_bag"] > [id$="-servicebodyframe_left"],
      [id$="-servicebodyframe_bag"] > [id$="-servicebodyframe_right"] {
        position: static !important;
        width: auto !important;
        height: auto !important;
      }
      [id$="-servicebodyframe_bag"] > [id$="-servicebodyframe_left"] {
        flex: 0 1 auto;
        max-height: 40%;
        overflow-y: auto !important;
      }
      [id$="-servicebodyframe_bag"] > [id$="-servicebodyframe_right"] {
        flex: 1 1 0;
        min-height: 0;
        overflow-y: auto !important;
      }
      [id$="-servicebodyframe_bag"] > [id$="-servicebodyframe_divider"] {
        display: none !important;
      }
      /* Search's form (520 px, its search box 337 px): the width. */
      [id^="GlobalSearch-"] [id$="-servicebodyframe_right"] div[style*="width"] {
        width: auto !important;
        max-width: 100% !important;
      }
      [id^="GlobalSearch-"] [id$="-servicebodyframe_right"] :is(table, td)[width] {
        width: auto !important;
      }
      [id^="GlobalSearch-"] [id*="-Mol-RadioButtonGroup-"] table,
      [id^="GlobalSearch-"] [id*="-Mol-RadioButtonGroup-"] tbody {
        display: block !important;
      }
      [id^="GlobalSearch-"] [id*="-Mol-RadioButtonGroup-"] tr {
        display: flex !important;
        flex-wrap: wrap;
        gap: 2px 8px;
      }
      [id^="GlobalSearch-"] [id*="-Mol-RadioButtonGroup-"] td {
        display: block !important;
      }
      /* What to search (three columns of check boxes, in groups): two columns. */
      [id^="GlobalSearch-"] td.m > div > table:has(> tbody > tr > td:nth-child(3) > [id*="-Mol-CheckButton-igs"]):not(:has(input[type="text"])) {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        column-gap: 6px;
      }
      [id^="GlobalSearch-"] td.m > div > table:has(> tbody > tr > td:nth-child(3) > [id*="-Mol-CheckButton-igs"]):not(:has(input[type="text"])) > tbody,
      [id^="GlobalSearch-"] td.m > div > table:has(> tbody > tr > td:nth-child(3) > [id*="-Mol-CheckButton-igs"]):not(:has(input[type="text"])) > tbody > tr {
        display: contents !important;
      }
      [id^="GlobalSearch-"] td.m > div > table:has(> tbody > tr > td:nth-child(3) > [id*="-Mol-CheckButton-igs"]):not(:has(input[type="text"])) > tbody > tr > td {
        display: block !important;
        width: auto !important;
        min-width: 0;
      }
      [id^="GlobalSearch-"] td.m > div > table:has(> tbody > tr > td:nth-child(3) > [id*="-Mol-CheckButton-igs"]):not(:has(input[type="text"])) > tbody > tr > td:only-child {
        grid-column: 1 / -1;
      }
      [id^="GlobalSearch-"] td.m > div > table:has(> tbody > tr > td:nth-child(3) > [id*="-Mol-CheckButton-igs"]):not(:has(input[type="text"])) > tbody > tr > td:empty {
        display: none !important;
      }
      [id^="GlobalSearch-"] [id$="-servicebodyframe_right"] [id*="-Mol-InputBox-"] table,
      [id^="GlobalSearch-"] [id$="-servicebodyframe_right"] [id*="-Mol-InputBox-"] input {
        width: 100% !important;
        box-sizing: border-box;
      }

      /*
       * Calendar, month: seven equal columns across the screen (the app sizes each day for a
       * desktop window), weekdays by their first letter, events as small chips.
       */
      table.c-month {
        table-layout: fixed;
        width: 100% !important;
      }
      table.c-month td.first,
      table.c-month tr > td:first-child:not(.border) {
        display: none !important;
      }
      table.c-month th,
      table.c-month td.border {
        width: auto !important;
        padding: 1px !important;
        overflow: hidden;
      }
      table.c-month th {
        font-size: 0 !important;
      }
      table.c-month th::first-letter {
        font-size: 12px;
      }
      table.c-month td.border {
        height: 56px !important;
        vertical-align: top;
      }
      /* Its title bar (month, today, back and forth, the view) on two lines. */
      .calendar-titlebar {
        width: auto !important;
      }
      .calendar-titlebar > table,
      .calendar-titlebar > table > tbody {
        display: block !important;
        width: auto !important;
      }
      .calendar-titlebar > table > tbody > tr {
        display: flex !important;
        flex-wrap: wrap;
        align-items: center;
      }
      .calendar-titlebar > table > tbody > tr > td:first-child {
        flex-basis: 100%;
        white-space: normal !important;
      }
      /* Day (and the days of a week): the day's column across the screen, not 1543 px. */
      table.c-day {
        width: 100% !important;
        table-layout: fixed;
      }
      /* A week's columns: a 1 px divider (spanning every row), then a day, seven times; laid out
         from its cells (a fixed layout ignores widths here), the days in equal shares. */
      table.c-day:has(td.header ~ td.header) {
        table-layout: auto;
      }
      table.c-day > tbody > tr:first-child > td[style*="width:1px"] {
        width: 1px !important;
      }
      table.c-day:has(td.header ~ td.header)
        > tbody
        > tr:first-child
        > td:not(.hour-small-spacer):not(.am-spacer):not([style*="width:1px"]) {
        width: 12.5% !important;
      }
      /* The row's last cell is an extra after the seventh day. */
      table.c-day:has(td.header ~ td.header)
        > tbody
        > tr:first-child
        > td:not(.hour-small-spacer):not(.am-spacer):not([style*="width:1px"]):last-child {
        width: 0 !important;
      }
      table.c-day td.hour-small-spacer {
        width: 20px !important;
      }
      table.c-day td.am-spacer {
        width: 13px !important;
      }
      table.c-day td:not(.hour-small-spacer):not(.am-spacer):not([style*="width:1px"])[style*="width"],
      table.c-day td:not(.hour-small-spacer):not(.am-spacer):not([width="1"])[width],
      table.c-day div[style*="width"] {
        width: auto !important;
      }
      .q-calendar .timeline {
        width: calc(100% - 40px) !important;
        max-width: none !important;
      }
      /* A week's days: by their first letter (the dates are in the title), and no "now" line,
         which the app places by an offset for desktop-wide columns. The letter by clipping the
         name to it (one monospaced letter, one line): a ::first-letter rule here made the browser check every link of every
         TinyGnomes page whenever it changed (seven windows: 100 times its style work). */
      table.c-day td[class*="header"] a.text {
        display: inline-block;
        width: 1ch;
        height: 1.25em;
        overflow: hidden;
        font: 600 12px/1.25 ui-monospace, Consolas, monospace !important;
        vertical-align: top;
      }
      .q-calendar:has(td.header ~ td.header) .timeline {
        display: none !important;
      }
      table.c-day .c-event {
        max-width: 100%;
        box-sizing: border-box;
        overflow: hidden;
      }
      /* Back and forth: the forth circle was placed 3 px into the back one, whose edge showed
         as a line on it; placed like the back one instead. */
      .calendar-titlebar .goright {
        left: 1px !important;
      }
      .calendar-titlebar > table > tbody > tr > td[width="100%"] {
        flex: 1 1 0;
      }
      /* The Welcome page (shown while the app loads): its 650 px card at the screen's width. */
      #quilt_loader > table,
      #quilt_loader > table > tbody,
      #quilt_loader > table > tbody > tr,
      #quilt_loader > table > tbody > tr > td {
        display: block !important;
        width: auto !important;
      }
      #quilt_loader [style*="width"] {
        max-width: 100% !important;
        box-sizing: border-box;
      }
      #quilt_loader center > table,
      #quilt_loader center > table > tbody,
      #quilt_loader center > table > tbody > tr,
      #quilt_loader center > table > tbody > tr > td {
        display: block !important;
        width: auto !important;
        height: auto !important;
        text-align: center;
      }
      #quilt_loader_welcome,
      #optionsrow td {
        height: auto !important;
        white-space: normal !important;
      }
      #quilt_loader img {
        max-width: 100%;
        height: auto;
      }
      /* Year: its months (six a row) as many a row as fit, in order. */
      table.c-year:not(.submonth),
      table.c-year:not(.submonth) > tbody {
        display: block !important;
        width: auto !important;
      }
      table.c-year:not(.submonth) > tbody > tr {
        display: flex !important;
        flex-wrap: wrap;
        justify-content: space-around;
      }
      table.c-year:not(.submonth) > tbody > tr > td {
        display: block !important;
        width: auto !important;
        margin-bottom: 8px;
        /* Two months side by side (each is 156 px). */
        zoom: 0.85;
      }
      /* In a day this small, an event's title rather than its time. */
      table.c-month .c-event .ce-time {
        display: none !important;
      }
      table.c-month .c-event .ce-top {
        border-left-width: 3px !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      table.c-month .c-event {
        width: auto !important;
        max-width: 100%;
        margin: 1px 0 !important;
        padding: 0 2px !important;
        font-size: 10px;
        line-height: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
    // The project list picks as many projects as its columns of them fit the window (its
    // _updateMenu: `(window width - 160) / 240`, up to 3): on a side monitor none. While it builds
    // the list on a narrow screen it is told the window is desktop width, so it lists the same
    // projects as on a desktop; the rules above stack its columns into one.
    script: (maxWidth) => {
      const DESKTOP_WIDTH = 1280;
      /** A narrow window, with the style on (it can be switched off to compare). */
      const adapted = () =>
        window.innerWidth <= maxWidth && !window.__virtuosSiteStyle?.off;
      /** Every jQuery on the page (the site may load more than one). */
      const jQueries = () => [
        ...new Set([window.jQuery, window.$].filter((j) => j?.fn)),
      ];
      const patch = () => {
        for (const $ of jQueries()) {
          const picker = $.ui?.projectPicker?.prototype;
          if (!picker || picker.__virtuosNarrow) continue;
          const update = picker._updateMenu;
          picker._updateMenu = function (...args) {
            if (!adapted()) return update.apply(this, args);
            // Told the window is desktop width, on whichever jQuery its code uses.
            const saved = jQueries().map((j) => [j, j.fn.width]);
            for (const [j, width] of saved) {
              j.fn.width = function (...a) {
                return this[0] === window && a.length === 0
                  ? DESKTOP_WIDTH
                  : width.apply(this, a);
              };
            }
            try {
              return update.apply(this, args);
            } finally {
              for (const [j, width] of saved) j.fn.width = width;
            }
          };
          picker.__virtuosNarrow = true;
        }
      };
      // The picker's script may load late, or be defined again: patched now, every half second
      // for a minute, and whenever the page is used (focus and clicks come before the list).
      patch();
      const timer = setInterval(patch, 500);
      setTimeout(() => clearInterval(timer), 60000);
      for (const type of ["focusin", "pointerdown"]) {
        document.addEventListener(type, patch, true);
      }

      // After any scroll of the menu strip the site snaps it to whole icons, assuming its own
      // icon height and a tall strip. On a side monitor the strip is short and the snap moved
      // it up, then back down, as the pointer moved over it. The strip keeps the plain scroll:
      // the event is stopped on its way down, before it reaches the site's handler.
      window.addEventListener(
        "scroll",
        (event) => {
          if (!adapted()) return;
          if (event.target?.classList?.contains("servicebar-scrollarea")) {
            event.stopImmediatePropagation();
          }
        },
        true,
      );
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

/** Whether the styles apply (the toolbar's switch); on until switched off. */
let enabled = true;

/**
 * Runs in the site's page: adds the style (once), and again if the page drops it; on or off as
 * the switch is (an off style stays in the page, for no media).
 */
function addStyleInPage(id, css, on) {
  const state = (window.__virtuosSiteStyle ??= {});
  state.off = !on;
  const add = () => {
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      style.textContent = css;
      (document.head ?? document.documentElement).appendChild(style);
    }
    const media = state.off ? "not all" : "";
    if (style.media !== media) style.media = media;
  };
  add();
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
 * Runs in the site's page: switches its style on or off, and has the site lay itself out again
 * (some of its parts are sized by its scripts, on a resize).
 */
function switchStyleInPage(id, on) {
  const state = (window.__virtuosSiteStyle ??= {});
  state.off = !on;
  const style = document.getElementById(id);
  if (style) style.media = on ? "" : "not all";
  window.dispatchEvent(new Event("resize"));
  return true;
}

const styleId = (style) => `virtuos-site-${style.name}`;

/**
 * The page's script for a style: its rules inside the narrow-window media query, then its own
 * script (once a page: it may patch the site's scripts).
 */
function scriptFor(style, on = enabled) {
  const css = `@media (max-width: ${style.maxWidth}px) {
${style.css}
}`;
  const add = `(${addStyleInPage.toString()})(${JSON.stringify(styleId(style))}, ${JSON.stringify(css)}, ${on});`;
  if (!style.script) return add;
  const run = `if (!window.__virtuosSiteScript) { window.__virtuosSiteScript = true; (${style.script.toString()})(${style.maxWidth}); }`;
  return `${add}
${run}
true;`;
}

/** Every frame on the screens showing a styled site, with its style. */
function styledFrames(webContents) {
  return webContents.mainFrame.framesInSubtree.flatMap((frame) => {
    if (frame === webContents.mainFrame) return [];
    const style = styleFor(frame.url);
    return style ? [{ frame, style }] : [];
  });
}

/** Only the configurator's own page (the window's top frame) may switch them. */
const fromPage = (event) => event.senderFrame === event.sender.mainFrame;

let switchHandled = false;

/**
 * Lets the configurator read and flip the switch (preload.js): its state and the sites it
 * covers, and switching every styled page on its screens.
 */
function handleSwitch() {
  if (switchHandled) return;
  switchHandled = true;
  ipcMain.handle("virtuos:site-styles", (event) =>
    fromPage(event)
      ? { enabled, hosts: SITE_STYLES.flatMap((style) => style.hosts) }
      : null,
  );
  ipcMain.handle("virtuos:set-site-styles", (event, on) => {
    if (!fromPage(event)) return enabled;
    enabled = Boolean(on);
    for (const { frame, style } of styledFrames(event.sender)) {
      const run = `(${switchStyleInPage.toString()})(${JSON.stringify(styleId(style))}, ${enabled});`;
      frame.executeJavaScript(run).catch(() => {
        // The frame navigated away or closed meanwhile.
      });
    }
    return enabled;
  });
}

/** Applies site styles to the pages on the configurator's screens (frames, not the window). */
function watchSiteStyles(webContents) {
  handleSwitch();
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

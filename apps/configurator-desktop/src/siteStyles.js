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

      /* Dialogs (the app's floating cards, placed and sized for a desktop window): across the screen. */
      .qfw-floatingcard {
        left: 4px !important;
        right: 4px !important;
        width: auto !important;
        max-width: calc(100vw - 8px) !important;
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
      [id^="card-TaskNew-dialog"] [id$="-rbar_tr"] {
        justify-content: flex-end;
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
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] table[width],
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] [id*="-Mol-InputBox-"] table {
        width: 100% !important;
        table-layout: fixed;
      }
      [id^="card-TaskNew-dialog"] [id$="-detailspane"] .input-border-box {
        width: auto !important;
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
         which the app places by an offset for desktop-wide columns. */
      table.c-day td[class*="header"] a.text {
        display: block;
        font-size: 0 !important;
      }
      table.c-day td[class*="header"] a.text::first-letter {
        font-size: 12px;
      }
      .q-calendar:has(td.header ~ td.header) .timeline {
        display: none !important;
      }
      table.c-day .c-event {
        max-width: 100%;
        box-sizing: border-box;
        overflow: hidden;
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
      table.c-year,
      table.c-year > tbody {
        display: block !important;
        width: auto !important;
      }
      table.c-year > tbody > tr {
        display: flex !important;
        flex-wrap: wrap;
        justify-content: space-around;
      }
      table.c-year > tbody > tr > td {
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
            if (window.innerWidth > maxWidth) return update.apply(this, args);
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

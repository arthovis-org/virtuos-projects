/**
 * Reflow (experimental): fits a desktop-only site to a narrow screen the way its mobile version
 * would, by showing one of its columns at a time. On a portrait side monitor a dashboard laid
 * out in columns (a menu, a feed, a side panel) is cut off at the edge, and zooming out to see
 * all of it makes the text too small to read. Reflow finds the page's columns, and shows the
 * one picked across the whole window, at a readable size; the page stays the live site.
 *
 * The configurator asks through preload.js (`virtuosDesktop.reflow`): the frame is found by
 * its name (the window's id) and the script below runs in it (webFrameMain.executeJavaScript,
 * which reaches any site's page in the app).
 */
const { ipcMain } = require('electron');

/**
 * Runs in the site's page. `command`: { action: 'analyse' } lists the columns, { action:
 * 'show', index } shows one, { action: 'reset' } puts the page back. Returns
 * { sections: [{ label, width }], shown, overflow } (overflow: the page's width over the
 * window's, after showing a column; above 1 it is still too wide).
 */
function reflowInPage(command) {
  const STYLE = 'virtuos-reflow-style';
  const ATTRS = ['data-vr-section', 'data-vr-hide', 'data-vr-show', 'data-vr-row', 'data-vr-fluid'];
  const state = (window.__virtuosReflow ??= { shown: null, observer: null });

  const clear = () => {
    for (const attr of ATTRS) {
      for (const element of document.querySelectorAll(`[${attr}]`)) element.removeAttribute(attr);
    }
  };
  const visible = (element) => {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  /** Children of `parent` laid out side by side: each tall enough, overlapping in height. */
  const columnsOf = (parent) => {
    const children = [...parent.children].filter((child) => {
      if (!visible(child)) return false;
      const rect = child.getBoundingClientRect();
      return rect.width >= 80 && rect.height >= Math.min(260, innerHeight * 0.35);
    });
    if (children.length < 2) return null;
    const rects = children.map((c) => c.getBoundingClientRect());
    const sorted = rects.map((r, i) => [r, children[i]]).sort((a, b) => a[0].left - b[0].left);
    for (let i = 1; i < sorted.length; i++) {
      const [previous] = sorted[i - 1];
      const [rect] = sorted[i];
      // Side by side: starts after the previous ends (a little overlap allowed), and they
      // share most of their height.
      if (rect.left < previous.right - 8) return null;
      const shared = Math.min(rect.bottom, previous.bottom) - Math.max(rect.top, previous.top);
      if (shared < Math.min(rect.height, previous.height) * 0.4) return null;
    }
    return sorted.map(([, child]) => child);
  };

  /** The page's columns: the widest row of side-by-side columns, nested rows opened up. */
  const findColumns = () => {
    const pageWidth = Math.max(document.documentElement.scrollWidth, document.documentElement.clientWidth);
    let best = null;
    let bestWidth = 0;
    const walk = (element, depth) => {
      if (depth > 14) return;
      const columns = columnsOf(element);
      if (columns) {
        const width = columns.reduce((sum, c) => sum + c.getBoundingClientRect().width, 0);
        if (width > bestWidth) {
          best = { row: element, columns };
          bestWidth = width;
        }
      }
      for (const child of element.children) {
        if (child.getBoundingClientRect().width >= pageWidth * 0.3) walk(child, depth + 1);
      }
    };
    walk(document.body, 0);
    // Fixed sidebars (a menu pinned to the left) are columns of their own.
    const pinned = [...document.body.querySelectorAll('*')].filter((element) => {
      const style = getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'sticky') return false;
      const rect = element.getBoundingClientRect();
      const page = document.documentElement.scrollWidth;
      return rect.height >= innerHeight * 0.6 && rect.width >= 80 && rect.width <= page * 0.4;
    });
    if (!best && pinned.length === 0) return null;
    const rows = [];
    const sections = [];
    const add = (row, columns, depth) => {
      rows.push(row);
      for (const column of columns) {
        // A column that is itself a row of columns: open it up (a content area holding a feed
        // and a side panel).
        const inner = depth < 2 ? findInnerRow(column) : null;
        if (inner) add(inner.row, inner.columns, depth + 1);
        else sections.push(column);
      }
    };
    if (best) add(best.row, best.columns, 0);
    for (const element of pinned) {
      if (!sections.some((s) => s.contains(element) || element.contains(s))) sections.unshift(element);
    }
    return { rows, sections };
  };
  const findInnerRow = (column) => {
    const width = column.getBoundingClientRect().width;
    let found = null;
    const walk = (element, depth) => {
      if (found || depth > 6) return;
      const columns = columnsOf(element);
      const total = columns ? columns.reduce((s, c) => s + c.getBoundingClientRect().width, 0) : 0;
      if (columns && total >= width * 0.75) {
        found = { row: element, columns };
        return;
      }
      for (const child of element.children) {
        if (child.getBoundingClientRect().width >= width * 0.75) walk(child, depth + 1);
      }
    };
    walk(column, 0);
    return found;
  };

  /** A column's name: its role, its first heading, or its first bit of text. */
  const labelOf = (element, index) => {
    const role = element.getAttribute('role') ?? '';
    if (element.matches('nav, [role=navigation]') || /nav|menu|sidebar/i.test(element.className)) {
      return 'Menu';
    }
    const aria = element.getAttribute('aria-label');
    if (aria) return aria.slice(0, 22);
    const heading = element.querySelector('h1, h2, h3, h4, [role=heading]');
    const text = (heading?.textContent ?? element.innerText ?? '').replace(/\s+/g, ' ').trim();
    if (text) return text.split(' ').slice(0, 3).join(' ').slice(0, 22);
    return role || `Section ${index + 1}`;
  };

  /**
   * The columns as the site lays them out on a desktop browser: on a narrow screen they are
   * squeezed (or cut off) out of recognition, so the page is measured at 1440 px wide.
   */
  const asDesktop = (measure) => {
    const html = document.documentElement;
    const before = html.style.minWidth;
    html.style.minWidth = '1440px';
    try {
      return measure();
    } finally {
      html.style.minWidth = before;
    }
  };

  const analyse = () => {
    clear();
    const found = asDesktop(findColumns);
    if (!found || found.sections.length < 2) return { sections: [], rows: [] };
    found.sections.forEach((section, i) => section.setAttribute('data-vr-section', String(i)));
    return found;
  };

  const style = () => {
    let element = document.getElementById(STYLE);
    if (!element) {
      element = document.createElement('style');
      element.id = STYLE;
      element.textContent = `
        [data-vr-hide] { display: none !important; }
        [data-vr-row] { display: block !important; }
        [data-vr-show], [data-vr-fluid] {
          width: auto !important; min-width: 0 !important; max-width: 100% !important;
          margin-left: 0 !important; margin-right: 0 !important;
          left: auto !important; right: auto !important; transform: none !important;
          flex: 1 1 auto !important;
        }
        [data-vr-show] { position: static !important; height: auto !important; }
        html, body { min-width: 0 !important; overflow-x: hidden !important; }`;
      document.head.append(element);
    }
  };

  const show = (index) => {
    const found = analyse();
    const section = found.sections?.[index];
    if (!section) return null;
    style();
    for (const other of found.sections) if (other !== section) other.setAttribute('data-vr-hide', '');
    for (const row of found.rows) row.setAttribute('data-vr-row', '');
    section.setAttribute('data-vr-show', '');
    // Its ancestors give up fixed widths and the margins that made room for hidden columns.
    for (let a = section.parentElement; a && a !== document.body; a = a.parentElement) {
      a.setAttribute('data-vr-fluid', '');
    }
    window.scrollTo(0, 0);
    return found;
  };

  const reset = () => {
    state.shown = null;
    state.observer?.disconnect();
    state.observer = null;
    clear();
    document.getElementById(STYLE)?.remove();
  };

  const describe = (found) => ({
    sections: (found.sections ?? []).map((s, i) => ({
      label: labelOf(s, i),
      width: Math.round(s.getBoundingClientRect().width),
    })),
    shown: state.shown,
    overflow: document.documentElement.scrollWidth / Math.max(1, document.documentElement.clientWidth),
  });

  if (command.action === 'reset') {
    reset();
    return { sections: [], shown: null, overflow: 1 };
  }
  if (command.action === 'show') {
    reset();
    const found = show(command.index);
    if (!found) return describe({ sections: [] });
    state.shown = command.index;
    // A single-page site re-renders: show the column again when it does.
    let timer = 0;
    state.observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (state.shown === null || document.querySelector('[data-vr-show]')) return;
        state.observer?.disconnect();
        show(state.shown);
        state.observer?.observe(document.body, { childList: true, subtree: true });
      }, 300);
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
    return describe(found);
  }
  // Analyse with the page as the site lays it out.
  const shown = state.shown;
  reset();
  const found = analyse();
  const result = describe(found);
  clear();
  if (shown !== null) {
    const again = show(shown);
    if (again) state.shown = shown;
  }
  return { ...result, shown: state.shown };
}

/** Only the configurator's own page (the window's top frame) may ask. */
const fromPage = (event) => event.senderFrame === event.sender.mainFrame;

function handleReflow() {
  ipcMain.handle('virtuos:reflow', async (event, request) => {
    if (!fromPage(event)) return null;
    const name = typeof request?.frame === 'string' ? request.frame : '';
    const command = request?.command ?? {};
    const frame = event.sender.mainFrame.framesInSubtree.find((f) => f.name === name);
    if (!frame) return { error: 'The page is not on a screen' };
    try {
      return await frame.executeJavaScript(`(${reflowInPage.toString()})(${JSON.stringify(command)})`);
    } catch (error) {
      return { error: String(error?.message ?? error).slice(0, 200) };
    }
  });
}

module.exports = { handleReflow, reflowInPage };

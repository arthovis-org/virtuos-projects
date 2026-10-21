/**
 * Where the sites in the configurator's windows go: each window's frame is named for its desk
 * and window (`windowFrameName` in the configurator), and whenever one goes to another page,
 * a load or a move within the page (TinyGnomes' tasks and wikis are #addresses), the page is
 * told, so a window coming back (another desk and back, a saved layout) shows that page
 * rather than the site's start page.
 */
const { webFrameMain } = require("electron");

/** The frame names the configurator gives its windows. */
const PREFIX = "virtuos-window:";

function watchWindowVisits(webContents) {
  const tell = (url, isMainFrame, processId, routingId) => {
    if (isMainFrame || !/^https?:\/\//i.test(url)) return;
    let frame;
    try {
      frame = webFrameMain.fromId(processId, routingId);
    } catch {
      return;
    }
    // Only a window's own frame (a site's frames within it have names of their own).
    if (
      !frame?.name?.startsWith(PREFIX) ||
      frame.parent !== webContents.mainFrame
    )
      return;
    webContents.send("virtuos:window-visit", frame.name, url);
  };
  webContents.on(
    "did-frame-navigate",
    (_event, url, _code, _status, isMainFrame, processId, routingId) =>
      tell(url, isMainFrame, processId, routingId),
  );
  webContents.on(
    "did-navigate-in-page",
    (_event, url, isMainFrame, processId, routingId) =>
      tell(url, isMainFrame, processId, routingId),
  );
}

module.exports = { watchWindowVisits };

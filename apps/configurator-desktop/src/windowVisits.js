/**
 * Where the sites in the configurator's windows go: each window's frame has a name of its own
 * (`windowFrameName` in the configurator, which knows the desk and window it is), and whenever
 * one goes to another page, a load or a move within the page (TinyGnomes' tasks and wikis are
 * #addresses), the page is told, so a window coming back (a saved layout, a desk whose frames
 * were let go) shows that page rather than the site's start page. And pauses the video and
 * audio in a window's frame when the configurator parks it (its desk away: framePool.ts
 * there): kept loaded, out of sight.
 */
const { ipcMain, webFrameMain } = require("electron");

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

/** Pauses every video and audio element in a frame. */
const PAUSE = `for (const media of document.querySelectorAll("video, audio")) media.pause(); true;`;

let pauseHandled = false;

/** The configurator asks (preload.js) to pause a parked window's media, by its frame's name. */
function handlePauseMedia() {
  if (pauseHandled) return;
  pauseHandled = true;
  ipcMain.on("virtuos:pause-media", (event, name) => {
    // Only the configurator's own page, and only its windows' frames (and those within them).
    if (
      event.senderFrame !== event.sender.mainFrame ||
      typeof name !== "string"
    )
      return;
    if (!name.startsWith(PREFIX)) return;
    const window = event.sender.mainFrame.frames.find(
      (frame) => frame.name === name,
    );
    for (const frame of window?.framesInSubtree ?? []) {
      frame.executeJavaScript(PAUSE).catch(() => {
        // Gone or navigating meanwhile.
      });
    }
  });
}

module.exports = { watchWindowVisits, handlePauseMedia };

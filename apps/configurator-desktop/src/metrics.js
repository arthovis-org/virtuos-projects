/**
 * The app's own processes' use of the computer, for the configurator's performance panel
 * (while developing): CPU and memory of every process (the window, each site's renderer, the
 * GPU). Nothing about the sites themselves.
 */
const { app, ipcMain } = require("electron");

let handled = false;

function handleMetrics() {
  if (handled) return;
  handled = true;
  ipcMain.handle("virtuos:metrics", (event) => {
    // Only the configurator's own page.
    if (event.senderFrame !== event.sender.mainFrame) return null;
    return app.getAppMetrics().map((process) => ({
      type: process.type,
      /** Percent of one core, since the last call. */
      cpu: process.cpu.percentCPUUsage,
      /** Kilobytes in use. */
      memory: process.memory.workingSetSize,
    }));
  });
}

/**
 * Ctrl+Shift+P shows or hides the panel, wherever the keyboard is: a site on a screen with
 * the focus gets the keys itself, so the configurator's page never saw them.
 */
function watchPerfShortcut(webContents) {
  webContents.on("before-input-event", (event, input) => {
    if (
      input.type === "keyDown" &&
      input.control &&
      input.shift &&
      !input.alt &&
      input.key.toLowerCase() === "p"
    ) {
      event.preventDefault();
      webContents.send("virtuos:toggle-perf");
    }
  });
}

module.exports = { handleMetrics, watchPerfShortcut };

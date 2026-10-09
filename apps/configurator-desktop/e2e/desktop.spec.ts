/**
 * The desktop app, end to end: it opens the bundled configurator, tells it it is the app,
 * and shows a page that refuses to be shown inside another page (both ways sites say so)
 * anyway. Needs the website built into web/ (`npm run build:web`). No internet needed.
 */
import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from "@playwright/test";

let server: Server;

/** A desktop-only dashboard in columns, like the sites reflow is for: a fixed menu, a feed, a panel, members. */
const DASHBOARD = `<!doctype html><title>Dashboard</title>
<style>
  body { margin: 0; font: 14px sans-serif; }
  nav { position: fixed; top: 0; bottom: 0; left: 0; width: 220px; background: #eee; }
  main { display: flex; gap: 16px; margin-left: 220px; padding: 16px; }
  .feed { width: 650px; min-height: 600px; }
  .panel { width: 320px; min-height: 600px; }
  .people { width: 90px; min-height: 600px; }
</style>
<nav><h3>Dashboard</h3><p>Calendar</p><p>Tasks</p></nav>
<main>
  <section class="feed"><h2>Activity</h2><p>Changed some attributes.</p></section>
  <aside class="panel"><h2>Project description</h2><p>No description.</p></aside>
  <div class="people"><h4>Team</h4></div>
</main>`;
let base = "";
let app: ElectronApplication;

test.beforeAll(async () => {
  // Pages that refuse frames, as real sites do, and set a login cookie.
  server = createServer((request, response) => {
    const headers: Record<string, string> = { "Content-Type": "text/html" };
    if (request.url === "/x-frame-options") headers["X-Frame-Options"] = "DENY";
    if (request.url === "/frame-ancestors") {
      headers["Content-Security-Policy"] =
        "default-src 'self' 'unsafe-inline'; frame-ancestors 'none'";
    }
    response.writeHead(200, headers);
    if (request.url === "/dashboard") {
      response.end(DASHBOARD);
      return;
    }
    response.end(
      `<title>Refusing page ${request.url}</title><p>Shown anyway</p>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  // A throwaway profile: the visitor's logins are untouched, and an open copy doesn't matter.
  app = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      VIRTUOS_USER_DATA: mkdtempSync(join(tmpdir(), "virtuos-test-")),
    },
  });
});

test.afterAll(async () => {
  await app.close();
  server.close();
});

test("opens the bundled configurator, which knows it is the app", async () => {
  const page = await app.firstWindow();
  await expect(page).toHaveURL(/^app:\/\/configurator\//);
  await expect(page.getByText(/^\d+\s*cm$/).first()).toBeVisible({
    timeout: 60_000,
  });
  const { version } = require("../package.json") as { version: string };
  expect(
    await page.evaluate(
      () => (window as { virtuosDesktop?: unknown }).virtuosDesktop,
    ),
  ).toMatchObject({
    framing: true,
    version,
  });
  // The page shows it, at the foot of the options.
  await expect(
    page.getByText(`Version ${version}`, { exact: false }),
  ).toBeAttached();
});

for (const kind of ["x-frame-options", "frame-ancestors"]) {
  test(`shows a page that refuses frames (${kind})`, async () => {
    const page = await app.firstWindow();
    const url = `${base}/${kind}`;
    await page.evaluate((src) => {
      const frame = document.createElement("iframe");
      frame.src = src;
      document.body.append(frame);
    }, url);
    await expect
      .poll(async () => {
        const frame = page.frames().find((f) => f.url() === url);
        return frame
          ? frame.evaluate(() => document.title).catch(() => "")
          : "";
      })
      .toBe(`Refusing page /${kind}`);
  });
}

test("plays YouTube videos on the screens in its embed player", () => {
  // youtube.com's own video page crashes inside a frame; its embed player doesn't (youtube.js).
  const { embedFor } = require("../src/youtube.js") as {
    embedFor: (link: string) => string | null;
  };
  expect(
    embedFor("https://www.youtube.com/watch?v=EMvk7OC4OeY&list=UUabc&t=42s"),
  ).toBe(
    "https://www.youtube.com/embed/EMvk7OC4OeY?autoplay=1&list=UUabc&start=42",
  );
  expect(embedFor("https://youtu.be/EMvk7OC4OeY")).toBe(
    "https://www.youtube.com/embed/EMvk7OC4OeY?autoplay=1",
  );
  expect(embedFor("https://m.youtube.com/shorts/abcdefghijk")).toBe(
    "https://www.youtube.com/embed/abcdefghijk?autoplay=1",
  );
  expect(embedFor("https://www.youtube.com/playlist?list=UUabc")).toBeNull();
  expect(embedFor("https://www.youtube.com/@NBA")).toBeNull();
  expect(embedFor("https://example.com/watch?v=EMvk7OC4OeY")).toBeNull();
});

test("reflows a page in columns to one column at a time (experimental)", async () => {
  const page = await app.firstWindow();
  const url = `${base}/dashboard`;
  // A side monitor's width, as the configurator names its site frames.
  await page.evaluate((src) => {
    const frame = document.createElement("iframe");
    frame.name = "vr-test";
    frame.src = src;
    frame.style.cssText = "width: 331px; height: 794px";
    document.body.append(frame);
  }, url);
  await expect
    .poll(() => page.frames().some((f) => f.url() === url))
    .toBe(true);
  const dashboard = page.frames().find((f) => f.url() === url)!;
  await dashboard.waitForLoadState();
  type Reflow = (
    frame: string,
    command: object,
  ) => Promise<{ sections: { label: string }[]; overflow: number }>;
  const reflow = (command: object) =>
    page.evaluate(
      (c) =>
        (
          window as unknown as { virtuosDesktop: { reflow: Reflow } }
        ).virtuosDesktop.reflow("vr-test", c),
      command,
    );

  const found = await reflow({ action: "analyse" });
  expect(found.sections.map((s) => s.label)).toEqual([
    "Menu",
    "Activity",
    "Project description",
    "Team",
  ]);

  // The feed alone, across the window: no longer cut off at the edge.
  const shown = await reflow({ action: "show", index: 1 });
  expect(shown.overflow).toBeLessThan(1.05);
  expect(
    await dashboard.evaluate(
      () => getComputedStyle(document.querySelector("nav")!).display,
    ),
  ).toBe("none");
  expect(
    await dashboard.evaluate(
      () => document.querySelector(".feed")!.getBoundingClientRect().width,
    ),
  ).toBeLessThanOrEqual(331);

  // The full page, as the site lays it out.
  await reflow({ action: "reset" });
  expect(
    await dashboard.evaluate(
      () => getComputedStyle(document.querySelector("nav")!).display,
    ),
  ).toBe("block");
});

/**
 * The desktop app, end to end: it opens the bundled configurator, tells it it is the app,
 * and shows a page that refuses to be shown inside another page (both ways sites say so)
 * anyway. Needs the website built into web/ (`npm run build:web`). No internet needed.
 */
import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

let server: Server;
let base = '';
let app: ElectronApplication;

test.beforeAll(async () => {
  // Pages that refuse frames, as real sites do, and set a login cookie.
  server = createServer((request, response) => {
    const headers: Record<string, string> = { 'Content-Type': 'text/html' };
    if (request.url === '/x-frame-options') headers['X-Frame-Options'] = 'DENY';
    if (request.url === '/frame-ancestors') {
      headers['Content-Security-Policy'] = "default-src 'self' 'unsafe-inline'; frame-ancestors 'none'";
    }
    response.writeHead(200, headers);
    response.end(`<title>Refusing page ${request.url}</title><p>Shown anyway</p>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  // A throwaway profile: the visitor's logins are untouched, and an open copy doesn't matter.
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VIRTUOS_USER_DATA: mkdtempSync(join(tmpdir(), 'virtuos-test-')) },
  });
});

test.afterAll(async () => {
  await app.close();
  server.close();
});

test('opens the bundled configurator, which knows it is the app', async () => {
  const page = await app.firstWindow();
  await expect(page).toHaveURL(/^app:\/\/configurator\//);
  await expect(page.getByText(/^\d+\s*cm$/).first()).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => (window as { virtuosDesktop?: unknown }).virtuosDesktop)).toMatchObject({
    framing: true,
  });
});

for (const kind of ['x-frame-options', 'frame-ancestors']) {
  test(`shows a page that refuses frames (${kind})`, async () => {
    const page = await app.firstWindow();
    const url = `${base}/${kind}`;
    await page.evaluate((src) => {
      const frame = document.createElement('iframe');
      frame.src = src;
      document.body.append(frame);
    }, url);
    await expect
      .poll(async () => {
        const frame = page.frames().find((f) => f.url() === url);
        return frame ? frame.evaluate(() => document.title).catch(() => '') : '';
      })
      .toBe(`Refusing page /${kind}`);
  });
}

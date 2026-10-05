/**
 * The app in a real browser, end to end: it loads and draws the desk, the panel configures
 * it, the room keeps every desk's own setup, and the command center sheet builds desks.
 * Live sites point at real websites, which are blocked: nothing here waits for them.
 */
import { expect, test, type Page } from '@playwright/test';

/** Page errors (uncaught exceptions and console errors) collected during a test. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // Embedded third-party sites log their own errors; only the app's count.
    if (message.type() === 'error' && message.location().url.includes('localhost')) {
      errors.push(message.text());
    }
  });
  return errors;
}

// Live sites are real websites: blocked here, so the test needs no network and stays light (in
// CI the browser draws the 3D in software, and four live widgets on top stalled it).
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!localhost[:/])/, (route) => route.abort());
});

/**
 * Clicks a desk in the desk bar. Sitting down flies the camera, and in CI's software-rendered
 * browser the bar never counts as "stable" while frames crawl; the test checks what the click
 * does, not the flight, so it doesn't wait for stillness.
 */
const clickDesk = (page: Page, name: string) =>
  deskBar(page).getByRole('button', { name, exact: true }).click({ force: true });

const deskBar = (page: Page) => page.getByRole('navigation', { name: 'Desks' });
const panelTitle = (page: Page) =>
  page.getByRole('region', { name: 'Desk', exact: true }).getByRole('heading');

test('loads, draws the desk and configures it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  // The height readout appears once the viewer has measured the model.
  await expect(page.getByText(/^\d+\s*cm$/).first()).toBeVisible();

  await page.getByRole('radio', { name: 'Walnut' }).click();
  await expect(page).toHaveURL(/material-desk-mat:walnut/);
  expect(errors).toEqual([]);
});

test('the room keeps each desk’s own setup', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('radio', { name: 'Unlimited desks' }).click();
  await expect(deskBar(page).locator('button[title^="Desk "]')).toHaveCount(4);

  // The single desk came along as desk 1; the others are new.
  await clickDesk(page, 'Crypto');
  await expect(panelTitle(page)).toHaveText('Desk 2 · Crypto');
  await page.getByRole('radio', { name: 'Walnut' }).click();
  await expect(page.getByRole('radio', { name: 'Walnut' })).toBeChecked();

  await clickDesk(page, 'NBA');
  await expect(panelTitle(page)).toHaveText('Desk 3 · NBA');
  await expect(page.getByRole('radio', { name: 'American oak' })).toBeChecked();

  await clickDesk(page, 'Crypto');
  await expect(page.getByRole('radio', { name: 'Walnut' })).toBeChecked();
  // The crypto desk's live sites are on its screens.
  await expect(page.locator('iframe').first()).toBeAttached();
  expect(errors).toEqual([]);
});

test('the command center sheet builds named desks', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Command center sheet' }).click();
  const csv = [
    'Desk,Theme,Screen,Site,URL,Height',
    'Morning trading,Crypto,Main,Chart,https://example.com/,74',
    'Morning trading,,Left,News,https://example.org/,',
    'Match night,Soccer,Main,Scores,https://example.net/,110',
  ].join('\n');
  // Paste the table into the sheet, as from a spreadsheet or an AI's answer.
  await page.getByRole('dialog').evaluate((sheet, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    sheet.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  }, csv);
  await expect(page.getByText('2 desks · 3 sites')).toBeVisible();
  // Desk by desk: opening one shows its sites.
  await page.getByRole('button', { name: /Morning trading/ }).click();
  await expect(page.getByRole('textbox', { name: 'URL' })).toHaveCount(2);
  await page.getByRole('button', { name: /Build the desks/ }).click();

  await expect(deskBar(page).getByRole('button', { name: 'Morning trading' })).toBeVisible();
  await expect(deskBar(page).getByRole('button', { name: 'Match night' })).toBeVisible();
  await clickDesk(page, 'Morning trading');
  await expect(panelTitle(page)).toHaveText('Desk 1 · Morning trading');
  // Only the screens with a site are switched on: no desk monitor.
  await expect(page.getByRole('switch', { name: /desk monitor/i })).not.toBeChecked();
  expect(errors).toEqual([]);
});

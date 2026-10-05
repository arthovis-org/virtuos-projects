/**
 * Where a command center sheet can come from besides typing it: a Google Sheet (read through
 * the layouts Worker, as Google's CSV can't be fetched from a page) and an AI assistant,
 * given a prompt that explains the sheet and this product's themes and screens.
 */
import type { ProductDefinition } from '@/catalog/schema';
import { LAYOUTS_URL } from '@/layouts/layoutsApi';
import { mainScreen } from './sheetPlan';
import { rowsFromSheet, type SheetRow } from './sheetTable';

export interface GoogleSheetRef {
  id: string;
  gid: string;
  /** "Publish to web" links (`/d/e/…`) have their own id. */
  published: boolean;
}

/** A Google Sheets link (or a bare sheet id) read as a reference, or null. */
export function parseGoogleSheet(link: string): GoogleSheetRef | null {
  const text = link.trim();
  if (/^[A-Za-z0-9_-]{30,}$/.test(text)) return { id: text, gid: '', published: false };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.hostname !== 'docs.google.com') return null;
  const match = /^\/spreadsheets\/d\/(e\/)?([A-Za-z0-9_-]{10,200})/.exec(url.pathname);
  if (!match?.[2]) return null;
  const gid = /(?:^|[#&?])gid=(\d+)/.exec(`${url.search}${url.hash}`)?.[1] ?? '';
  return { id: match[2], gid, published: !!match[1] };
}

/** Sheet support needs the layouts Worker. */
export const canReadGoogleSheets = !!LAYOUTS_URL;

export async function fetchGoogleSheet(ref: GoogleSheetRef): Promise<SheetRow[]> {
  if (!LAYOUTS_URL) throw new Error('Google Sheets are not set up on this site');
  const params = new URLSearchParams({ id: ref.id, gid: ref.gid });
  if (ref.published) params.set('published', '1');
  const response = await fetch(`${LAYOUTS_URL}/sheet?${params.toString()}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not read the sheet; try again');
  }
  const rows = rowsFromSheet(await response.text());
  if (rows.length === 0) throw new Error('The sheet is empty');
  return rows;
}

/** A prompt for an AI assistant to plan command centers as rows of this sheet. */
export function aiPrompt(product: ProductDefinition, workflow: string): string {
  const main = mainScreen(product);
  const screens = product.screens
    .map((s) => `- ${s.label}${s.id === main?.id ? ' (the big one in the middle)' : ''}`)
    .join('\n');
  const themes = product.workspaces
    .map((w) => `- ${w.label}${w.description ? `: ${w.description}` : ''}`)
    .join('\n');
  const motion = product.motions[0];
  return `Plan virtual command centers for me as a CSV table. Each command center is a ${product.name} with several screens, and each screen shows one or more live websites side by side.

My workflows:
${workflow.trim() || '(describe what you do, e.g. "I trade crypto and follow the NBA")'}

Columns, one row per website:
- Desk: the command center's name (e.g. "Morning research"); repeat it on every row of that desk.
- Theme: one of the themes below; it gives the desk its colour and icon.
- Screen: one of the screens below.
- Site: a short title for the window.
- URL: the https address of the page to show.
- Height: ${motion ? `desk height in ${motion.unit}, ${motion.min} to ${motion.max} (sit about 72, stand about 110); ` : ''}only on the desk's first row, or blank.

Screens on each desk:
${screens}

Themes:
${themes}

Rules:
- 1 to 3 websites per screen; screens without a website are switched off.
- Use https pages that can be shown inside another page (in an iframe). Many big sites refuse (Google, X/Twitter, Facebook, most banks); prefer embed or web-app pages (YouTube embed links, TradingView widgets, Wikipedia, Excalidraw, Google Calendar embed, news sites that allow it).
- Group desks by workflow; give each desk a clear purpose.

Reply with only the CSV, with this header row:
Desk,Theme,Screen,Site,URL,Height`;
}

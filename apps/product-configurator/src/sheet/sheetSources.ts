/**
 * Where a command center sheet can come from besides typing it: a Google Sheet (read through
 * the layouts Worker, as Google's CSV can't be fetched from a page) and an AI assistant,
 * given a prompt that explains the sheet and this product's themes and screens.
 */
import type { ProductDefinition } from '@/catalog/schema';
import { LAYOUTS_URL } from '@/layouts/layoutsApi';
import type { DeskSetup } from '@/state/setup';
import { deskGroups, mainScreen, planFromRows } from './sheetPlan';
import { checkEmbeddable } from '@/ui/workspace/embeddable';
import { TOOLS } from '@/ui/workspace/siteUrl';
import { parseDelimited, rowsFromSheet, type SheetRow } from './sheetTable';

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

/** The free AI planner (Workers AI behind the layouts Worker) is set up. */
export const canPlanWithAI = !!LAYOUTS_URL;

/** Sites known to work on the screens, by an id the AI answers with (`@crypto/btc-usdt`). */
export function knownSites(product: ProductDefinition) {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return [
    ...product.workspaces.flatMap((w) =>
      w.windows.map((site) => ({
        id: `${w.id}/${site.id}`,
        title: site.title,
        theme: w.label,
        url: site.url,
      })),
    ),
    ...TOOLS.map((tool) => ({
      id: `tools/${slug(tool.title)}`,
      title: tool.title,
      theme: '',
      url: tool.url,
    })),
  ];
}

/**
 * Rows from the AI's answer (`Desk,Theme,Screen,Sites,Height`, a screen per row with its sites
 * separated by spaces). Read loosely, since models drift: in each row the theme, the screen and
 * the height are whichever cells look like one, and every @id or https address is a site.
 * Known sites' ids become their addresses and titles.
 */
export function rowsFromAnswer(product: ProductDefinition, answer: string): SheetRow[] {
  const fenced = /```[\w-]*\n([\s\S]*?)```/.exec(answer)?.[1] ?? answer;
  const sites = new Map(knownSites(product).map((site) => [site.id, site]));
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const rows: SheetRow[] = [];
  for (const cells of parseDelimited(fenced.trim(), ',')) {
    const [desk = '', ...rest] = cells.map((c) => c.trim());
    if (!desk || /^desk$/i.test(desk)) continue;
    const theme = rest.find((c) => product.workspaces.some((w) => same(w.label, c))) ?? '';
    const screen = rest.find((c) => product.screens.some((sc) => same(sc.label, c))) ?? '';
    const height = rest.find((c) => /^\d{2,3}(\.\d+)?$/.test(c)) ?? '';
    const tokens = rest.flatMap((c) => c.split(/\s+/));
    const links = tokens.filter(
      (t) => /^@[a-z0-9-]+\/[a-z0-9-]+$/.test(t) || /^https?:\/\//.test(t),
    );
    // A cell that is none of these is a title, used when the row has a single site.
    const title = rest.find(
      (c) =>
        c &&
        c !== theme &&
        c !== screen &&
        c !== height &&
        !c.split(/\s+/).some((t) => links.includes(t)),
    );
    links.forEach((link) => {
      const known = sites.get(link.slice(1));
      const url = known?.url ?? link;
      let host = '';
      try {
        const address = new URL(url);
        host = address.hostname.replace(/^www\./, '');
        // A Wikipedia article is called by its title.
        const article = /^\/wiki\/([^/]+)$/.exec(address.pathname)?.[1];
        if (host.endsWith('wikipedia.org') && article) {
          host = decodeURIComponent(article).replace(/_/g, ' ');
        }
      } catch {
        // Not an address: the sheet points it out.
      }
      rows.push({
        desk,
        theme,
        screen,
        site: (links.length === 1 ? title : undefined) ?? known?.title ?? host,
        url,
        height,
      });
    });
  }
  return rows;
}

/** Rows in the AI's format (a screen per row, known sites as their ids), to change them. */
function answerFormat(product: ProductDefinition, rows: readonly SheetRow[]): string {
  const ids = new Map(knownSites(product).map((site) => [site.url, `@${site.id}`]));
  const lines = new Map<
    string,
    { desk: string; theme: string; screen: string; sites: string[]; height: string }
  >();
  let lastDesk = '';
  for (const row of rows) {
    const desk = row.desk.trim() || lastDesk;
    lastDesk = desk;
    if (!row.url.trim()) continue;
    const key = `${desk.toLowerCase()}|${row.screen.toLowerCase()}`;
    const line = lines.get(key) ?? { desk, theme: '', screen: row.screen, sites: [], height: '' };
    line.theme ||= row.theme;
    line.height ||= row.height;
    line.sites.push(ids.get(row.url.trim()) ?? row.url.trim());
    lines.set(key, line);
  }
  return [
    'Desk,Theme,Screen,Sites,Height',
    ...[...lines.values()].map((l) =>
      [l.desk, l.theme, l.screen, l.sites.join(' '), l.height]
        .map((c) => c.replace(/,/g, ' '))
        .join(','),
    ),
  ].join('\n');
}

/** Plans command centers with the free AI from a description of the visitor's work. */
export async function planWithAI(
  product: ProductDefinition,
  workflow: string,
  current?: readonly SheetRow[],
): Promise<{ rows: SheetRow[]; blocked: string[] }> {
  if (!LAYOUTS_URL) throw new Error('The AI is not set up on this site');
  const main = mainScreen(product);
  const motion = product.motions[0];
  // The current sheet goes in the AI's own format, which keeps it short.
  const currentText = current?.some((row) => row.url.trim())
    ? answerFormat(product, current)
    : undefined;
  const response = await fetch(`${LAYOUTS_URL}/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow,
      ...(currentText && { current: currentText }),
      product: {
        name: product.name,
        screens: product.screens.map((s) => ({ label: s.label, main: s.id === main?.id })),
        themes: product.workspaces.map((w) => ({ label: w.label, description: w.description })),
        height: motion && { unit: motion.unit, min: motion.min, max: motion.max },
        sites: knownSites(product).map(({ id, title, theme }) => ({ id, title, theme })),
      },
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { csv?: string; error?: string };
  if (!response.ok || !body.csv)
    throw new Error(body.error ?? 'The AI could not answer; try again');
  const rows = rowsFromAnswer(product, body.csv);
  if (rows.length === 0) throw new Error('The AI’s answer had no desks in it; try again');
  return withoutBlockedSites(rows);
}

/**
 * The rows without sites that refuse to be shown inside another page (checked for any site
 * the AI added beyond the known ones), and those sites' hosts. A desk left with no site keeps
 * a row, so it stays (with its theme's own sites).
 */
async function withoutBlockedSites(
  rows: readonly SheetRow[],
): Promise<{ rows: SheetRow[]; blocked: string[] }> {
  const urls = [...new Set(rows.map((r) => r.url.trim()).filter(Boolean))];
  const verdicts = await Promise.all(urls.map((url) => checkEmbeddable(url)));
  const blocked = new Set(urls.filter((_, i) => verdicts[i] === false));
  if (blocked.size === 0) return { rows: [...rows], blocked: [] };
  const kept: SheetRow[] = [];
  for (const row of rows) {
    if (!blocked.has(row.url.trim())) {
      kept.push(row);
      continue;
    }
    // A desk whose every site was blocked keeps one empty row.
    const desk = row.desk.trim().toLowerCase();
    const hasOther = rows.some(
      (r) => r.desk.trim().toLowerCase() === desk && !blocked.has(r.url.trim()),
    );
    if (!hasOther && !kept.some((r) => r.desk.trim().toLowerCase() === desk)) {
      kept.push({ ...row, screen: '', site: '', url: '' });
    }
  }
  const hosts = [...blocked].map((url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  });
  return { rows: kept, blocked: [...new Set(hosts)] };
}

/**
 * One desk planned by the free AI from a description of it, ready for the room: the first desk
 * of the answer, with its sites, theme and screens.
 */
export async function planOneDesk(
  product: ProductDefinition,
  description: string,
): Promise<DeskSetup> {
  const { rows } = await planWithAI(product, `Plan exactly one desk for: ${description.trim()}`);
  const first = deskGroups(rows)[0];
  const desk =
    first &&
    planFromRows(
      product,
      first.rows.flatMap((i) => rows[i] ?? []),
    ).desks[0];
  if (!desk) throw new Error('The AI’s answer had no desk in it; try again');
  return desk;
}

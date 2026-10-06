/**
 * Whether a site lets other pages show it in a frame (many refuse: the screen would show only
 * the browser's broken-page icon). Asked of the layouts Worker, which can read the site's
 * headers; known sites (every workspace's own and the tools) are taken as they are. Answers
 * are kept for the page and, for a day, in this browser.
 */
import { useEffect, useState } from 'react';
import { getProduct } from '@/catalog';
import { LAYOUTS_URL } from '@/layouts/layoutsApi';
import { screenUrl } from './embedUrls';
import { TOOLS } from './siteUrl';

const STORAGE_KEY = 'virtuos.embeddable';
const DAY = 24 * 60 * 60 * 1000;

type Stored = Record<string, { ok: boolean; at: number }>;

function readStored(): Stored {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

function writeStored(stored: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Private browsing: answers are kept for this page only.
  }
}

const answers = new Map<string, Promise<boolean>>();

/** Sites known to show inside the page: every product's workspace sites and the tools. */
function known(url: string): boolean {
  const product = getProduct(null);
  return (
    TOOLS.some((t) => t.url === url) ||
    product.workspaces.some((w) => w.windows.some((s) => s.url === url))
  );
}

/** Whether the site may be shown in a frame; true when it can't be told (let the browser try). */
export function checkEmbeddable(link: string): Promise<boolean> {
  // What a screen would show: the link's embeddable version when it has one.
  const url = screenUrl(link);
  if (!LAYOUTS_URL || known(url) || !url.startsWith('https://')) return Promise.resolve(true);
  const cached = answers.get(url);
  if (cached) return cached;
  const stored = readStored()[url];
  if (stored && Date.now() - stored.at < DAY) {
    const answer = Promise.resolve(stored.ok);
    answers.set(url, answer);
    return answer;
  }
  const answer = fetch(`${LAYOUTS_URL}/embed?url=${encodeURIComponent(url)}`)
    .then((r): Promise<{ embeddable?: boolean }> => (r.ok ? r.json() : Promise.resolve({})))
    .then((body) => {
      const ok = body.embeddable !== false;
      const all = readStored();
      all[url] = { ok, at: Date.now() };
      writeStored(all);
      return ok;
    })
    .catch(() => true);
  answers.set(url, answer);
  return answer;
}

/** A site's answer for a component: true until it is known to refuse. */
export function useEmbeddable(url: string): boolean {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    let live = true;
    void checkEmbeddable(url).then((answer) => {
      if (live) setOk(answer);
    });
    return () => {
      live = false;
    };
  }, [url]);
  return ok;
}

/** Which of these sites refuse to be shown inside the page (their addresses), as they come in. */
export function useBlockedSites(urls: readonly string[]): ReadonlySet<string> {
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(() => new Set());
  const key = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].sort().join('\n');
  useEffect(() => {
    let live = true;
    const list = key ? key.split('\n') : [];
    void Promise.all(list.map((url) => checkEmbeddable(url))).then((answers) => {
      if (live) setBlocked(new Set(list.filter((_, i) => answers[i] === false)));
    });
    return () => {
      live = false;
    };
  }, [key]);
  return blocked;
}

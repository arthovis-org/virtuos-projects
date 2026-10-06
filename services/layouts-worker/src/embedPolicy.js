/**
 * What is known about sites and frames without asking them:
 *
 * - BLOCKED_HOSTS: sites known to refuse being shown inside another page. The starting list;
 *   the Worker adds every site it finds refusing to the `blocked_sites` table, so the list
 *   grows as visitors try sites (see `blockedHosts`).
 * - EMBED_PAGES: pages made to be shown inside others, on sites that otherwise refuse
 *   (YouTube's embed player, Google Calendar's embed…). These win over a blocked site.
 *
 * A site is matched by its host or any parent domain: "notion.so" covers "www.notion.so".
 */

export const BLOCKED_HOSTS = [
  // Search, mail and productivity suites
  "google.com",
  "mail.google.com",
  "docs.google.com",
  "drive.google.com",
  "bing.com",
  "outlook.com",
  "outlook.live.com",
  "office.com",
  "microsoft.com",
  "live.com",
  "icloud.com",
  "yahoo.com",
  "duckduckgo.com",
  // Social and messaging
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "reddit.com",
  "tiktok.com",
  "pinterest.com",
  "threads.net",
  "discord.com",
  "slack.com",
  "web.whatsapp.com",
  "telegram.org",
  // Work tools and AI assistants
  "notion.so",
  "notion.com",
  "notion.site",
  "clickup.com",
  "asana.com",
  "monday.com",
  "atlassian.net",
  "github.com",
  "gitlab.com",
  "chat.openai.com",
  "chatgpt.com",
  "openai.com",
  "claude.ai",
  "gemini.google.com",
  "perplexity.ai",
  // Shopping, streaming, finance
  "amazon.com",
  "ebay.com",
  "netflix.com",
  "paypal.com",
  "coinbase.com",
  "binance.com",
  "robinhood.com",
];

/**
 * Pages made for embedding: host (or parent domain) and a pattern for the path and query.
 * The configurator turns ordinary links into these (src/ui/workspace/embedUrls.ts).
 */
export const EMBED_PAGES = [
  { host: "youtube.com", path: /^\/embed\// },
  { host: "youtube-nocookie.com", path: /^\/embed\// },
  { host: "player.vimeo.com", path: /^\/video\// },
  { host: "calendar.google.com", path: /^\/calendar\/embed/ },
  { host: "google.com", path: /^\/maps\/embed/ },
  { host: "google.com", path: /^\/maps.*[?&]output=embed/ },
  { host: "maps.google.com", path: /[?&]output=embed/ },
  // Docs, Sheets, Slides and Forms: published pages, previews and embeds.
  {
    host: "docs.google.com",
    path: /^\/(document|spreadsheets|presentation|forms)\/d\/e\//,
  },
  {
    host: "docs.google.com",
    path: /^\/(document|spreadsheets)\/d\/[^/]+\/preview/,
  },
  { host: "docs.google.com", path: /^\/presentation\/d\/[^/]+\/embed/ },
  {
    host: "docs.google.com",
    path: /^\/forms\/d\/[^/]+\/viewform.*embedded=true/,
  },
  { host: "drive.google.com", path: /^\/file\/d\/[^/]+\/preview/ },
  { host: "open.spotify.com", path: /^\/embed\// },
  { host: "figma.com", path: /^\/embed/ },
  { host: "platform.twitter.com", path: /^\/embed\// },
  { host: "embed.reddit.com", path: /^\// },
  { host: "codepen.io", path: /^\/[^/]+\/embed\// },
  { host: "loom.com", path: /^\/embed\// },
];

/** Whether `host` is `domain` or under it. */
export const onDomain = (host, domain) =>
  host === domain || host.endsWith(`.${domain}`);

/** The host as a list key: lowercase, without "www.". */
export const hostKey = (host) => host.toLowerCase().replace(/^www\./, "");

/** Whether an address is a page made for embedding. */
export function isEmbedPage(address) {
  const host = hostKey(address.hostname);
  const page = address.pathname + address.search;
  return EMBED_PAGES.some((p) => onDomain(host, p.host) && p.path.test(page));
}

/** Every site known to refuse frames: the starting list and those found since. */
export async function blockedHosts(env) {
  const found = env.DB
    ? (
        await env.DB.prepare(
          "SELECT host FROM blocked_sites ORDER BY host",
        ).all()
      ).results.map((r) => r.host)
    : [];
  return [...new Set([...BLOCKED_HOSTS, ...found])].sort();
}

/** Whether a host is on the list (itself or a parent domain), and which entry matched. */
export async function knownBlocked(env, host) {
  const key = hostKey(host);
  const listed = BLOCKED_HOSTS.find((d) => onDomain(key, d));
  if (listed) return listed;
  if (!env.DB) return null;
  // The host and each parent domain ("a.b.example.com", "b.example.com", "example.com").
  const parts = key.split(".");
  const candidates = parts.slice(0, -1).map((_, i) => parts.slice(i).join("."));
  const placeholders = candidates.map(() => "?").join(",");
  const row = await env.DB.prepare(
    `SELECT host FROM blocked_sites WHERE host IN (${placeholders}) LIMIT 1`,
  )
    .bind(...candidates)
    .first();
  return row ? row.host : null;
}

/** Adds a site found refusing frames to the list. */
export async function rememberBlocked(env, host, reason) {
  if (!env.DB) return;
  await env.DB.prepare(
    "INSERT INTO blocked_sites (host, reason, found_at) VALUES (?, ?, ?) ON CONFLICT(host) DO NOTHING",
  )
    .bind(hostKey(host), reason, Date.now())
    .run();
}

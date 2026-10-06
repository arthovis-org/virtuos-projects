/**
 * Whether a site lets other pages show it in a frame, for the configurator's screens: many
 * (Notion, ChatGPT, Google, X…) refuse, and the browser then shows only a broken-page icon.
 * A page can't read another site's headers; this Worker can.
 *
 *   GET /embed?url=<https address>  -> 200 { embeddable: boolean, reason? }
 *
 *   GET /embed/blocked              -> 200 { hosts: [...] }   (the list, for a look)
 *
 * Pages made for embedding (embedPolicy.js) are fine at once, and sites on the list of those
 * known to refuse are refused at once, without asking them. Others are asked: their response
 * headers `X-Frame-Options` (DENY / SAMEORIGIN) and Content-Security-Policy `frame-ancestors`
 * tell; a site found refusing joins the list for good. Sites that only refuse from script
 * can't be told this way and count as embeddable. Answers are cached for a day.
 */
import {
  blockedHosts,
  isEmbedPage,
  knownBlocked,
  rememberBlocked,
} from "./embedPolicy.js";

const TIMEOUT_MS = 5000;
const CACHE_SECONDS = 24 * 60 * 60;

/** Whether frame-ancestors (its sources, lowercase) lets `origins` frame the page. */
function ancestorsAllow(sources, origins) {
  if (sources.includes("*") || sources.includes("https:")) return true;
  if (sources.includes("'none'")) return false;
  return origins.some((origin) => {
    const host = new URL(origin).host;
    return sources.some((source) => {
      if (source === origin || source === host) return true;
      // Wildcard hosts: https://*.github.io
      const wild = /^(?:https?:\/\/)?\*\.(.+)$/.exec(source);
      return !!wild && host.endsWith(`.${wild[1]}`);
    });
  });
}

/** The verdict from a response's headers. */
export function frameVerdict(headers, origins) {
  const xfo = (headers.get("X-Frame-Options") ?? "").trim().toLowerCase();
  const csp = headers.get("Content-Security-Policy") ?? "";
  const directive = csp
    .split(";")
    .map((d) => d.trim().toLowerCase())
    .find((d) => d.startsWith("frame-ancestors"));
  // frame-ancestors, when there, takes precedence over X-Frame-Options in browsers.
  if (directive) {
    const sources = directive.split(/\s+/).slice(1);
    return ancestorsAllow(sources, origins)
      ? { embeddable: true }
      : { embeddable: false, reason: "frame-ancestors" };
  }
  if (xfo === "deny" || xfo === "sameorigin") {
    return { embeddable: false, reason: "x-frame-options" };
  }
  return { embeddable: true };
}

export async function embed(url, env, reply, ctx) {
  const target = url.searchParams.get("url") ?? "";
  let address;
  try {
    address = new URL(target);
  } catch {
    return reply(400, { error: "Not an address" });
  }
  if (address.protocol !== "https:" || target.length > 2048) {
    return reply(400, { error: "Only https addresses" });
  }

  if (isEmbedPage(address))
    return reply(200, { embeddable: true, reason: "embed-page" });
  const listed = await knownBlocked(env, address.hostname);
  if (listed)
    return reply(200, { embeddable: false, reason: "listed", host: listed });

  const cache = caches.default;
  const key = new Request(
    `https://embed-check.invalid/${encodeURIComponent(address.href)}`,
  );
  const cached = await cache.match(key);
  if (cached) return reply(200, await cached.json());

  const origins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  let verdict;
  try {
    const response = await fetch(address.href, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; virtuos-embed-check)",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    verdict = frameVerdict(response.headers, origins);
    await response.body?.cancel();
    // Refusing is a site-wide policy: the site joins the list. (Allowing can differ by page,
    // so that is only cached for this address.)
    if (!verdict.embeddable)
      ctx.waitUntil(rememberBlocked(env, address.hostname, verdict.reason));
  } catch {
    // Unreachable from here: let the browser try.
    return reply(200, { embeddable: true, reason: "unknown" });
  }
  ctx.waitUntil(
    cache.put(
      key,
      new Response(JSON.stringify(verdict), {
        headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` },
      }),
    ),
  );
  return reply(200, verdict);
}

/** The list of sites known to refuse frames. */
export async function blockedList(env, reply) {
  return reply(200, { hosts: await blockedHosts(env) });
}

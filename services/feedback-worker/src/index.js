/**
 * The feedback Worker: takes feedback sent from the VIRTUOS sites and files it as an issue in
 * a private GitHub repository, where the team (and Claude, through `gh`) can read, discuss
 * and close it. The sites are static, so this is the only part that holds a secret: a GitHub
 * token that can only create issues and files in that one repository.
 *
 *   POST /feedback  { message, kind?, name?, context?, screenshot?, website? }
 *                   -> 201 { ok: true, issue: 12 }
 *
 * Settings (wrangler.toml): REPO, ALLOWED_ORIGINS. Secret: GITHUB_TOKEN.
 */

const KINDS = ["bug", "idea", "other"];
const MAX_MESSAGE = 5000;
const MAX_NAME = 100;
/** Base64 of an attached picture, about 3 MB of image; the sites shrink pictures before sending. */
const MAX_SCREENSHOT = 4_000_000;
/** Feedback a visitor may send per window; the counts live in this Worker instance only. */
const RATE = { max: 8, windowMs: 10 * 60 * 1000 };
const sent = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
    const cors = allowed.includes(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : {};
    const reply = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...cors },
      });

    const url = new URL(request.url);
    if (url.pathname !== "/feedback")
      return reply(404, { ok: false, error: "Not found" });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST")
      return reply(405, { ok: false, error: "Use POST" });
    // Only the sites may send feedback (browsers enforce this; it also keeps casual abuse out).
    if (!allowed.includes(origin))
      return reply(403, { ok: false, error: "Origin not allowed" });

    const visitor = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const now = Date.now();
    const recent = (sent.get(visitor) ?? []).filter(
      (t) => now - t < RATE.windowMs,
    );
    if (recent.length >= RATE.max) {
      return reply(429, {
        ok: false,
        error: "Too much feedback at once; try again later",
      });
    }

    let input;
    try {
      input = await request.json();
    } catch {
      return reply(400, { ok: false, error: "Expected JSON" });
    }
    // A field people never see: forms that fill it in are bots. Pretend it worked.
    if (input.website) return reply(201, { ok: true });

    const message =
      typeof input.message === "string" ? input.message.trim() : "";
    if (!message) return reply(400, { ok: false, error: "Write a message" });
    if (message.length > MAX_MESSAGE) {
      return reply(400, {
        ok: false,
        error: `Keep it under ${MAX_MESSAGE} characters`,
      });
    }
    const kind = KINDS.includes(input.kind) ? input.kind : "other";
    const name =
      typeof input.name === "string"
        ? input.name.trim().slice(0, MAX_NAME)
        : "";
    const context =
      input.context && typeof input.context === "object" ? input.context : {};
    const screenshot = parseScreenshot(input.screenshot);
    if (screenshot && "error" in screenshot)
      return reply(400, { ok: false, error: screenshot.error });

    recent.push(now);
    sent.set(visitor, recent);

    const github = (path, init = {}) =>
      fetch(`https://api.github.com/repos/${env.REPO}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "virtuos-feedback-worker",
          "Content-Type": "application/json",
        },
      });

    // The picture goes into the repository next to the issues, so the issue can show it.
    let picture = "";
    if (screenshot) {
      const day = new Date(now).toISOString().slice(0, 10);
      const path = `screenshots/${day}/${now}-${crypto.randomUUID().slice(0, 8)}.${screenshot.ext}`;
      const stored = await github(`/contents/${path}`, {
        method: "PUT",
        body: JSON.stringify({
          message: `Screenshot for feedback (${day})`,
          content: screenshot.data,
        }),
      });
      if (stored.ok) {
        picture = `https://github.com/${env.REPO}/blob/main/${path}?raw=true`;
      } else {
        console.error(
          "screenshot upload failed",
          stored.status,
          await stored.text(),
        );
      }
    }

    const firstLine = message.split("\n")[0].slice(0, 70);
    const created = await github("/issues", {
      method: "POST",
      body: JSON.stringify({
        title: `${capitalize(kind)}: ${firstLine}${message.length > firstLine.length ? "…" : ""}`,
        body: issueBody({ message, kind, name, context, picture }),
        labels: ["feedback", kind],
      }),
    });
    if (!created.ok) {
      console.error(
        "issue creation failed",
        created.status,
        await created.text(),
      );
      return reply(502, {
        ok: false,
        error: "Could not save the feedback; try again later",
      });
    }
    const issue = await created.json();
    return reply(201, { ok: true, issue: issue.number });
  },
};

/** A data URL of a PNG, JPEG or WebP picture, as base64 and an extension. */
function parseScreenshot(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return { error: "Unreadable picture" };
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    value,
  );
  if (!match) return { error: "Pictures must be PNG, JPEG or WebP" };
  if (match[2].length > MAX_SCREENSHOT)
    return { error: "The picture is too large" };
  return { ext: match[1] === "jpeg" ? "jpg" : match[1], data: match[2] };
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** Keeps sent text from breaking out of its place in the issue's Markdown. */
const cell = (value) =>
  String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);

function issueBody({ message, kind, name, context, picture }) {
  const lines = [message, ""];
  if (picture) lines.push(`![Screenshot](${picture})`, "");
  lines.push("---", "", "| | |", "| --- | --- |");
  lines.push(`| Kind | ${cell(kind)} |`);
  if (name) lines.push(`| From | ${cell(name)} |`);
  if (context.url) lines.push(`| Page | ${cell(context.url)} |`);
  if (context.view) lines.push(`| View | ${cell(context.view)} |`);
  if (context.device) lines.push(`| Device | ${cell(context.device)} |`);
  if (context.userAgent) lines.push(`| Browser | ${cell(context.userAgent)} |`);
  if (context.time) lines.push(`| Sent | ${cell(context.time)} |`);
  if (Array.isArray(context.errors) && context.errors.length > 0) {
    const errors = context.errors
      .slice(-10)
      .map((e) => String(e).slice(0, 400).replace(/```/g, "'''"))
      .join("\n");
    lines.push(
      "",
      "<details><summary>Recent errors on the page</summary>",
      "",
      "```",
      errors,
      "```",
      "",
      "</details>",
    );
  }
  lines.push("", "<sub>Sent with the feedback button on the site.</sub>");
  return lines.join("\n");
}

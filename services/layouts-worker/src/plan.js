/**
 * Plans command centers with a free AI: Groq (GPT-OSS 120B, 1,000 requests a day free) when a
 * GROQ_API_KEY secret is set, and Cloudflare Workers AI (Llama 3.3 70B, a smaller free daily
 * allowance) otherwise or once Groq's daily limit is reached. Neither bills on its free plan:
 * past the limits, requests fail until the next day.
 *
 *   POST /plan  { workflow, product, current? }  -> 200 { csv, via: 'groq' | 'workers-ai' }
 *
 * The instructions are written here, from the product's screens and themes the page sends:
 * the page only says what the visitor does, so this can't be used as a general chatbot.
 */

import { blockedHosts } from "./embedPolicy.js";
import { ask, hasAi, rateLimiter } from "./ai.js";

/** Plans a visitor may ask for per window; counts live in this Worker instance only. */
const allowPlan = rateLimiter({ max: 12, windowMs: 10 * 60 * 1000 });
const MAX_WORKFLOW = 1500;
const MAX_CURRENT = 12 * 1024;

const text = (value, max) =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";

/** The page's description of the product, checked and trimmed. */
function readProduct(input) {
  const product = input && typeof input === "object" ? input : {};
  const screens = (Array.isArray(product.screens) ? product.screens : [])
    .slice(0, 8)
    .map((s) => ({ label: text(s?.label, 30), main: s?.main === true }))
    .filter((s) => s.label);
  const themes = (Array.isArray(product.themes) ? product.themes : [])
    .slice(0, 40)
    .map((t) => ({
      label: text(t?.label, 30),
      description: text(t?.description, 200),
    }))
    .filter((t) => t.label);
  const h = product.height;
  const height =
    h &&
    typeof h === "object" &&
    Number.isFinite(h.min) &&
    Number.isFinite(h.max)
      ? { unit: text(h.unit, 8) || "cm", min: h.min, max: h.max }
      : null;
  const sites = (Array.isArray(product.sites) ? product.sites : [])
    .slice(0, 150)
    .map((s) => ({
      id: text(s?.id, 60),
      title: text(s?.title, 50),
      theme: text(s?.theme, 30),
    }))
    .filter((s) => /^[a-z0-9-]+\/[a-z0-9-]+$/.test(s.id) && s.title);
  return {
    name: text(product.name, 60) || "desk",
    screens,
    themes,
    height,
    sites,
  };
}

function instructions(product, blocked, anySite) {
  const screens = product.screens
    .map((s) => `- ${s.label}${s.main ? " (the big one in the middle)" : ""}`)
    .join("\n");
  const themes = product.themes
    .map((t) => `- ${t.label}${t.description ? `: ${t.description}` : ""}`)
    .join("\n");
  const sites = product.sites
    .map((s) => `- @${s.id}: ${s.title}${s.theme ? ` (${s.theme})` : ""}`)
    .join("\n");
  return `You plan virtual command centers. Each command center is a ${product.name} with several screens; each screen shows one or more live websites side by side.

Answer with a CSV table only: no explanations, no code fences. The first row is exactly:
Desk,Theme,Screen,Sites

One row per website, or per screen with its websites:
- Desk: the command center's name (e.g. "Morning research"); repeat it on every row of that desk.
- Theme: the theme below closest to the desk's work (Crypto for crypto trading, Designer for design work); it gives the desk its colour and icon.
- Screen: leave it blank: the screens are arranged automatically by how many websites a desk has. Name one of the screens below only when I ask for a specific screen.
- Sites: known sites as their @id (see the list below), other pages as their full https address; several on one row are shown side by side.

Example:
Desk,Theme,Screen,Sites
Morning research,Finance,,@finance/s-p-500
Morning research,Finance,,@finance/markets
Morning research,Finance,,https://en.wikipedia.org/wiki/Stock_market

Screens on each desk:
${screens}

Themes:
${themes}

Known sites that work on the screens (prefer these; use their @id):
${sites}

Rules:
- Plan one desk per distinct workflow, with 2 to 5 websites each.
- Choose sites that fit the workflow; a site may appear on several desks.
- Other pages only when you are sure they are real and allow being shown inside another page (an iframe): Wikipedia articles (https://en.wikipedia.org/wiki/...) always work. Never invent addresses.
${
  anySite
    ? "- Any website works on the screens (the desktop app shows every site, logged in): use the best page for each task."
    : `- Links to YouTube videos, playlists and channels (/channel/UC…), Vimeo, Google Docs, Sheets, Slides, Drive files and Maps, Spotify, Figma, X posts, Twitch, Reddit posts, SoundCloud, CodePen, Loom and TradingView symbols are fine: they are shown through those services' own embed players.
- These sites refuse to be shown inside another page, so prefer others; use one only when I ask for it by name (it is then marked as blocked for me): ${blocked.join(", ")}.`
}
- Never put a comma inside a cell.`;
}

export async function plan(request, env, reply) {
  if (!hasAi(env)) {
    return reply(503, { error: "The AI is not set up on this site" });
  }
  if (!allowPlan(request)) {
    return reply(429, {
      error:
        "That's a lot of plans in a short time; try again in a few minutes",
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: "Expected JSON" });
  }
  const workflow =
    typeof body.workflow === "string"
      ? body.workflow.trim().slice(0, MAX_WORKFLOW)
      : "";
  if (!workflow) return reply(400, { error: "Say what you do first" });
  const product = readProduct(body.product);
  if (product.screens.length === 0 || product.themes.length === 0) {
    return reply(400, { error: "Unknown product" });
  }
  const current =
    typeof body.current === "string"
      ? body.current.trim().slice(0, MAX_CURRENT)
      : "";
  const ask = current
    ? `My current sheet:\n${current}\n\nChange it as I ask, keeping the rest, and answer with the whole updated sheet:\n${workflow}`
    : `My workflows:\n${workflow}`;
  const messages = [
    {
      role: "system",
      content: instructions(
        product,
        await blockedHosts(env),
        body.anySite === true,
      ),
    },
    { role: "user", content: ask },
  ];
  const { answer, via, limited } = await ask(env, messages);
  if (!answer.trim()) {
    return limited
      ? reply(429, {
          error:
            "The free AI has used up today's allowance. Try again tomorrow, or copy the prompt into another AI.",
        })
      : reply(502, { error: "The AI could not answer; try again" });
  }
  // Which service answered, for checking the fallback.
  return reply(200, { csv: answer, via });
}

/**
 * The layouts Worker: saves and opens configurator layouts (the room of desks, each desk's
 * setup, height and windows) in a Cloudflare D1 database, so a layout opens on any device
 * from its link. No accounts: whoever saves a layout gets a private edit key, which their
 * browser keeps, to update or delete it; anyone with the link can open it.
 *
 *   POST   /layouts          { name, product, data }   -> 201 { id, key, updatedAt }
 *   GET    /layouts/:id                                -> 200 { id, name, product, data, updatedAt }
 *   PUT    /layouts/:id      { name?, data? }  + key   -> 200 { id, updatedAt }
 *   DELETE /layouts/:id                       + key   -> 204
 *
 * The key goes in an `Authorization: Bearer <key>` header.
 *
 * It also reads Google Sheets for the configurator's command center sheet (a plan of which
 * site goes on which screen of which desk), since Google's CSV export can't be fetched from
 * a web page directly:
 *
 *   GET    /sheet?id=<sheet id>&gid=<tab id>[&published=1]  -> 200 text/csv
 *
 * Only sheets shared as "Anyone with the link" (or published to the web) can be read.
 *
 * And it plans command centers with Workers AI (see plan.js):
 *
 *   POST   /plan             { workflow, product, current? }       -> 200 { csv }
 */
import { plan } from "./plan.js";

const MAX_NAME = 80;
/** A room of 36 desks with all their windows is well under this. */
const MAX_DATA = 256 * 1024;
/** New layouts a visitor may save per window; the counts live in this Worker instance only. */
const RATE = { max: 30, windowMs: 10 * 60 * 1000 };
const created = new Map();
const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
/** A sheet of a few hundred rows is a few tens of KB. */
const MAX_SHEET = 512 * 1024;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
    const cors = allowed.includes(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : {};
    const reply = (status, body) =>
      status === 204
        ? new Response(null, { status, headers: cors })
        : new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json", ...cors },
          });

    const url = new URL(request.url);
    if (url.pathname === "/plan" || url.pathname === "/plan/") {
      if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers: cors });
      if (!allowed.includes(origin))
        return reply(403, { error: "Origin not allowed" });
      if (request.method !== "POST")
        return reply(405, { error: "Method not allowed" });
      try {
        return await plan(request, env, reply);
      } catch (error) {
        console.error(error);
        return reply(500, { error: "Something went wrong; try again" });
      }
    }
    if (url.pathname === "/sheet" || url.pathname === "/sheet/") {
      if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers: cors });
      if (!allowed.includes(origin))
        return reply(403, { error: "Origin not allowed" });
      if (request.method !== "GET")
        return reply(405, { error: "Method not allowed" });
      try {
        return await readSheet(url.searchParams, cors, reply);
      } catch (error) {
        console.error(error);
        return reply(502, { error: "Could not read the sheet; try again" });
      }
    }
    const match = /^\/layouts(?:\/([a-z0-9]{6,16}))?\/?$/.exec(url.pathname);
    if (!match) return reply(404, { error: "Not found" });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (!allowed.includes(origin))
      return reply(403, { error: "Origin not allowed" });
    const id = match[1];

    try {
      if (!id && request.method === "POST")
        return await create(request, env, reply);
      if (id && request.method === "GET") return await open(id, env, reply);
      if (id && request.method === "PUT")
        return await update(id, request, env, reply);
      if (id && request.method === "DELETE")
        return await remove(id, request, env, reply);
      return reply(405, { error: "Method not allowed" });
    } catch (error) {
      console.error(error);
      return reply(500, { error: "Something went wrong; try again" });
    }
  },
};

async function create(request, env, reply) {
  const visitor = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const now = Date.now();
  const recent = (created.get(visitor) ?? []).filter(
    (t) => now - t < RATE.windowMs,
  );
  if (recent.length >= RATE.max)
    return reply(429, { error: "Too many saves; try again later" });

  const input = await readInput(request);
  if ("error" in input) return reply(400, input);
  if (!input.name || !input.product || input.data === undefined) {
    return reply(400, {
      error: "A layout needs a name, a product and its data",
    });
  }
  recent.push(now);
  created.set(visitor, recent);

  const key = randomKey();
  const editHash = await sha256(key);
  // Ids are random; a clash is astronomically unlikely, but retry rather than overwrite.
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = randomId(10);
    const result = await env.DB.prepare(
      "INSERT OR IGNORE INTO layouts (id, edit_hash, name, product, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, editHash, input.name, input.product, input.data, now, now)
      .run();
    if (result.meta.changes === 1)
      return reply(201, { id, key, updatedAt: now });
  }
  return reply(500, { error: "Could not save; try again" });
}

async function open(id, env, reply) {
  const row = await env.DB.prepare(
    "SELECT id, name, product, data, updated_at FROM layouts WHERE id = ?",
  )
    .bind(id)
    .first();
  if (!row)
    return reply(404, { error: "This layout does not exist (any more)" });
  return reply(200, {
    id: row.id,
    name: row.name,
    product: row.product,
    data: JSON.parse(row.data),
    updatedAt: row.updated_at,
  });
}

async function update(id, request, env, reply) {
  const owned = await checkKey(id, request, env);
  if (owned !== true) return reply(owned.status, { error: owned.error });
  const input = await readInput(request);
  if ("error" in input) return reply(400, input);
  if (!input.name && input.data === undefined)
    return reply(400, { error: "Nothing to change" });
  const now = Date.now();
  await env.DB.prepare(
    "UPDATE layouts SET name = COALESCE(?, name), data = COALESCE(?, data), updated_at = ? WHERE id = ?",
  )
    .bind(input.name ?? null, input.data ?? null, now, id)
    .run();
  return reply(200, { id, updatedAt: now });
}

async function remove(id, request, env, reply) {
  const owned = await checkKey(id, request, env);
  if (owned !== true) return reply(owned.status, { error: owned.error });
  await env.DB.prepare("DELETE FROM layouts WHERE id = ?").bind(id).run();
  return reply(204);
}

/** True when the request carries the layout's edit key; else why not. */
async function checkKey(id, request, env) {
  const key = (request.headers.get("Authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!key)
    return {
      status: 401,
      error: "Only whoever saved this layout can change it",
    };
  const row = await env.DB.prepare("SELECT edit_hash FROM layouts WHERE id = ?")
    .bind(id)
    .first();
  if (!row)
    return { status: 404, error: "This layout does not exist (any more)" };
  if (!safeEqual(row.edit_hash, await sha256(key))) {
    return {
      status: 403,
      error: "Only whoever saved this layout can change it",
    };
  }
  return true;
}

/** Name, product and data from the body, checked; `data` comes back as JSON text. */
async function readInput(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: "Expected JSON" };
  }
  const out = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { error: "Give the layout a name" };
    out.name = name.slice(0, MAX_NAME);
  }
  if (body.product !== undefined) {
    if (
      typeof body.product !== "string" ||
      !/^[a-z0-9-]{1,64}$/.test(body.product)
    ) {
      return { error: "Unknown product" };
    }
    out.product = body.product;
  }
  if (body.data !== undefined) {
    if (!body.data || typeof body.data !== "object")
      return { error: "Unreadable layout" };
    const text = JSON.stringify(body.data);
    if (text.length > MAX_DATA)
      return { error: "This layout is too large to save" };
    out.data = text;
  }
  return out;
}

/** A Google Sheet's tab as CSV. Only Google's own addresses are ever fetched. */
async function readSheet(params, cors, reply) {
  const id = params.get("id") ?? "";
  const gid = params.get("gid") ?? "";
  const published = params.get("published") === "1";
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id) || !/^\d{0,20}$/.test(gid)) {
    return reply(400, { error: "That is not a Google Sheets link" });
  }
  const tab = gid ? `&gid=${gid}` : "";
  const source = published
    ? `https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv${tab}&single=true`
    : `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${tab}`;
  const response = await fetch(source, {
    redirect: "follow",
    cf: { cacheTtl: 0 },
  });
  const type = response.headers.get("Content-Type") ?? "";
  // A private sheet answers with Google's sign-in page instead of the CSV.
  if (!response.ok || !type.includes("text/csv")) {
    return reply(response.status === 404 ? 404 : 403, {
      error:
        "Google did not share this sheet. Set Share → General access to “Anyone with the link”.",
    });
  }
  const text = await response.text();
  if (text.length > MAX_SHEET)
    return reply(413, { error: "This sheet is too large" });
  return new Response(text, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      ...cors,
    },
  });
}

function randomId(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Compares two hex strings without returning early. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

-- Saved layouts of the configurator. Apply with:
--   npx wrangler d1 execute virtuos-layouts --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS layouts (
  -- Public id, in the layout's link (?layout=<id>).
  id TEXT PRIMARY KEY,
  -- SHA-256 of the private edit key the creator's browser keeps; the key itself is never stored.
  edit_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  -- Product folder the layout is for, e.g. smart-desk.
  product TEXT NOT NULL,
  -- The layout itself, as JSON (src/layouts in the configurator).
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Sites found refusing to be shown inside another page (X-Frame-Options / frame-ancestors),
-- added by GET /embed as visitors try them; the starting list is in src/embedPolicy.js.
CREATE TABLE IF NOT EXISTS blocked_sites (
  -- Lowercase host without "www.", e.g. notion.so; it covers its subdomains.
  host TEXT PRIMARY KEY,
  -- x-frame-options or frame-ancestors.
  reason TEXT NOT NULL,
  found_at INTEGER NOT NULL
);

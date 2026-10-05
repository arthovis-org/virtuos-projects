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

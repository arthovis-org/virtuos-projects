# Layouts Worker

Saves and opens the configurator's **layouts** (the single desk and the room of desks: every
desk's workspace, setup, height and windows) in a [Cloudflare D1](https://developers.cloudflare.com/d1/)
database, so a layout opens on any device from its link (`…/product-configurator/?layout=<id>`).

No accounts: whoever saves a layout gets a private **edit key**, which their browser keeps; only
it can rename, update or delete the layout. Anyone with the link can open it (and save a copy).
The database stores a SHA-256 of the key, never the key.

```
POST   /layouts          { name, product, data }  -> 201 { id, key, updatedAt }
GET    /layouts/:id                               -> 200 { id, name, product, data, updatedAt }
PUT    /layouts/:id      { name?, data? }   + key -> 200 { id, updatedAt }
DELETE /layouts/:id                         + key -> 204
```

It also reads Google Sheets for the configurator's command center sheet (Google's CSV export
can't be fetched from a web page directly):

```
GET    /sheet?id=<sheet id>&gid=<tab id>[&published=1]  -> 200 text/csv
```

Only Google's own export addresses are fetched, and only sheets shared as "Anyone with the link"
(or published to the web) can be read; a private sheet gets a 403 saying how to share it.

It also plans command centers with [Workers AI](https://developers.cloudflare.com/workers-ai/)
(`src/plan.js`):

```
POST   /plan   { workflow, product: { name, screens, themes, height, sites }, current? }  -> 200 { csv }
```

The Worker writes the instructions itself from the product's screens, themes and known sites, so
the route only plans desks; it is no general chatbot. Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
(set `AI_MODEL` in `wrangler.toml` to change it). The Workers free plan includes 10,000 neurons a
day, a few dozen plans; past that Workers AI refuses until the next day (the page says so), so it
never costs anything. 12 plans per visitor per 10 minutes.

The key goes in `Authorization: Bearer <key>`. Only the sites in `ALLOWED_ORIGINS`
(`wrangler.toml`) may call it. Limits: names up to 80 characters, layouts up to 256 KB, 30 new
layouts per visitor per 10 minutes.

## Setup (done once)

```bash
npx wrangler login
npx wrangler d1 create virtuos-layouts          # database_id goes in wrangler.toml
npx wrangler d1 execute virtuos-layouts --remote --file=schema.sql
npx wrangler deploy
```

The site reads the Worker's address from `VITE_LAYOUTS_URL` (`apps/product-configurator/.env`);
without it, the Layouts button is hidden.

## Looking at the data

```bash
npx wrangler d1 execute virtuos-layouts --remote --command "SELECT id, name, product, datetime(updated_at/1000, 'unixepoch') FROM layouts ORDER BY updated_at DESC LIMIT 20"
```

Free tier: 5 GB of storage, 100,000 writes and 5 million row reads a day; a layout is a few KB.

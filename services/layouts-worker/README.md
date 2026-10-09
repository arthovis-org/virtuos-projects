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

It also plans command centers with a free AI (`src/plan.js`):

```
POST   /plan   { workflow, product: { name, screens, themes, height, sites }, current? }  -> 200 { csv }
```

The Worker writes the instructions itself from the product's screens, themes and known sites, so
the route only plans desks; it is no general chatbot. The answer is a `Desk,Theme,Screen,Sites`
table with screens left blank (the page arranges them by how many sites a desk has) and no
height (new desks start at the default). 12 plans per visitor per 10 minutes.

It asks **Groq** first (`openai/gpt-oss-120b`, with low reasoning effort; about a second per plan;
free plan: 1,000 requests a day) when the `GROQ_API_KEY` secret is set, and **Cloudflare Workers
AI** (Llama 3.3 70B, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; 10,000 free neurons a day, a few dozen plans) when it
isn't or once Groq is over its limit. Neither charges on its free plan: past the limits the page
says the AI is done for the day. `GROQ_MODEL` and `AI_MODEL` vars change the models (Groq retired
Llama from free accounts in August 2026). The reply's `via` says which service answered.

To add Groq: make a free account at https://console.groq.com, create an API key, then in this
folder run `npx wrangler secret put GROQ_API_KEY` and paste it. Remove it with
`npx wrangler secret delete GROQ_API_KEY` to go back to Workers AI alone.

It runs the configurator's AI agents too (`src/agents.js`), with the same free AI (`src/ai.js`,
shared with `/plan`):

```
POST   /agents  { action: "plan", goal, team: [{ id, name, role }] }       -> 200 { summary, tasks }
POST   /agents  { action: "step", goal, agent, task, step, done?, context? } -> 200 { note, content, sources }
```

`plan` splits a goal into one task per agent, side by side where they can work in parallel,
with dependencies where a task needs another's result. `step` does one step of a task:
research steps are grounded in real Wikipedia articles (searched by the Worker, kept only when
their title matches the search), returned as `sources` that the agent opens on its screen. 120
requests per visitor per 10 minutes.

And it tells whether a site lets other pages show it in a frame (`src/embed.js`), so the
configurator can leave such sites out of AI plans and explain them on a screen instead of the
browser's broken-page icon:

```
GET    /embed?url=<https address>   -> 200 { embeddable, reason? }
```

It keeps a **list of sites that refuse frames**: a starting list in `src/embedPolicy.js`
(Google, social networks, Notion, ChatGPT…) plus every site it finds refusing since, in the
`blocked_sites` table. Listed sites are answered at once, without asking them; others are asked
(their `X-Frame-Options` and CSP `frame-ancestors` headers, cached a day) and join the list when
they refuse. Pages made for embedding on such sites (YouTube's embed player, Google Calendar and
Maps embeds, Spotify, Figma…) are allowed (`EMBED_PAGES`). The AI planner is given the list too.
Sites that refuse only from script, or answer servers differently from browsers, can't be told.

```
GET    /embed/blocked   -> 200 { hosts: [...] }   the whole list
npx wrangler d1 execute virtuos-layouts --remote --command "SELECT host, reason, datetime(found_at/1000,'unixepoch') FROM blocked_sites ORDER BY found_at DESC"
```

To take a site off the list (it changed its mind):
`npx wrangler d1 execute virtuos-layouts --remote --command "DELETE FROM blocked_sites WHERE host='example.com'"`.

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

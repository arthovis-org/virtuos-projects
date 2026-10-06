# Product Configurator

An interactive 3D product configurator for the browser. Each product is a folder with a Blender
export in it; object names such as `Toggle_SideMonitors`, `Variant_Legs_Straight` and
`Lift100_Top` become options, images in `materials/<Material>/` become finishes, and an optional
`product.json` adds names, prices and defaults. The viewer, option panel, pricing and shareable
links are all derived from that folder, so adding a product needs no code.

## Stack

- [Vite](https://vite.dev) + React 19 + TypeScript (strict)
- [Three.js](https://threejs.org) via [@react-three/fiber](https://r3f.docs.pmnd.rs) and
  [@react-three/drei](https://drei.docs.pmnd.rs)
- [zustand](https://zustand.docs.pmnd.rs) for state, [zod](https://zod.dev) for validation
- CSS Modules with CSS variables (light and dark via `prefers-color-scheme`)

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

| Script                    | Purpose                                                |
| ------------------------- | ------------------------------------------------------ |
| `npm run build`           | Type-check and produce a production build in `dist/`   |
| `npm run preview`         | Serve the production build locally                     |
| `npm run lint`            | ESLint (type-aware)                                    |
| `npm run typecheck`       | `tsc --noEmit` for app and config                      |
| `npm run format`          | Prettier                                               |
| `npm run inspect -- <id>` | Show what the configurator reads from `products/<id>/` |

Open a product with `?product=<id>`; the current configuration is kept in the URL
(`&c=group:option,...`) so the address bar is always a shareable link.

Products with screens get a **workspace demo** (live websites on the monitors). With several
workspaces, **Unlimited desks** opens a room of desks, one per workspace (finance, crypto, NBA,
soccer, developer and more), each with its own configuration; the room is in the URL too
(`&desks=finance,crypto,...`). See [`products/README.md`](products/README.md#unlimited-desks).

## Adding a product

1. Export the model from Blender as **glTF Binary** to `products/<id>/model.glb`
   (1 unit = 1 m, origin at the centre of the footprint on the floor, modifiers applied).
2. Name the objects that should be configurable, add finish images, and optionally a
   `product.json`. The conventions are in [`products/README.md`](products/README.md).
3. With `npm run dev` running, the page reloads whenever something in the folder changes. In
   development a "Setup check" card lists anything that did not match (a typo in
   `product.json`, a materials folder named after no Blender material, and so on).

Models and images are used exactly as exported; nothing rewrites them. Draco- or
meshopt-compressed exports load too.

## Project layout

```
products/<id>/             one folder per product (model.glb, product.json, materials/,
                           workspaces/*.json)
scripts/
  catalog/convention.ts    object names + product.json -> product definition
  catalog/gltf.ts          reads node and material names from a .glb/.gltf
  vite-plugin-catalog.ts   serves the catalog as `virtual:catalog`
  inspect.ts               `npm run inspect`
src/
  catalog/                 schema (zod) and registry of validated products
  state/                   the set-up (every desk's setup, height and windows), its store,
                           the view state, links, derived configuration, motions
  layouts/                 saved layouts (online)
  sheet/                   the command center sheet
  viewer/                  canvas, model loading, finishes, height motion
  ui/                      option panel, controls, header, price summary
e2e/                       browser smoke test (Playwright)
docs/ARCHITECTURE.md       data flow in more detail

`npm test` runs the unit tests and `npm run test:e2e` the browser smoke test (in an installed
Chrome or Edge; `PW_CHANNEL` picks another). CI runs both.
```

## Phones

Below 900 px wide the option panel is a bottom sheet, closed to a bar at first so the desk keeps
the screen; opened, it takes the lower part and the camera reframes the desk above it. Below
640 px the header fits one row, the live demo card starts folded into a pill, and the toolbars
use short labels. On touch screens a window's title bar is taller, and its row of small
buttons gives way to one ⋯ button (or a tap on the title bar) that opens a finger-sized menu. On a tall screen the room of desks uses tighter arcs with rows behind, so it
fills the height (`TALL_ARCS` in `src/viewer/deskLayout.ts`).

The header's title leads home (`goHome` in `src/state/actions.ts`): in the room, the overview of
every desk with none chosen; at the single desk, the desk with its workspace closed.

Each window's title bar holds its **page zoom** (`ZoomControl`): the percentage the page is
shown at, and **Fit**, "Fit desktop width" (the site laid out at 1440 px, a desktop browser,
and scaled to the window's width, so a narrow side monitor shows the whole page). Drag the
percentage sideways to zoom (a point per pixel, 10–500%), click it to type one, or use the
arrow keys (Shift for ten points) and Home for 100%. A zoom never reloads the site. It is saved
with the desk's windows in layouts (`zoom` in `DeskWindows`), and this browser remembers each
site's last zoom for windows without one of their own (`siteZoomStore.ts`). Windows move
between screens by dragging their title bar.

Dropping a window near the left or right end of its own place (top or bottom on a portrait
screen) **splits** it: it takes that half and a blank "New window" the other, with the same
site picker an empty screen has; picking a site fills it where it is (`splitWindow`,
`fillBlank` in `src/state/setup.ts`).

Held sideways (a landscape screen under 500 px tall, at any width), a phone gets the desktop layout instead:
the viewer at full height with the options in a narrow column beside it, a slim header, and the
same compact toolbars.

## Saved layouts

The header's **Layouts** button saves the whole set-up under a name: the single desk and the room
of desks, with every desk's workspace, setup, height and the windows on its screens. Layouts are
stored online by [`services/layouts-worker`](../../services/layouts-worker) (Cloudflare D1), so
they open on any device from their link (`?layout=<id>`). There are no accounts: the browser that
saved a layout keeps its edit key and the list of its layouts (local storage), and only it can
update, rename or delete them; anyone with the link can open one. The format is in
`src/layouts/layoutData.ts`; the Worker's address is `VITE_LAYOUTS_URL` in `.env`.

## Command center sheet

The header's **Sheet** button lists every desk as a card (name, theme, height, sites and the
screens they are on); a card opens to edit the desk and its sites, one per screen slot. Under the
cards it is a plain table, one row per site: **Desk, Theme, Screen, Site, URL, Height**, which is
what CSV files, Google Sheets and links hold.

- **Plan with AI**: describe what you want and a free AI (GPT-OSS 120B on Groq, with Llama 3.3
  on Cloudflare Workers AI as backup, through the layouts Worker's `/plan` route) plans it. What it may change is chosen first and
  said in words: **Add desks** (the default: new desks after yours, nothing else changes),
  **Change one desk** (only that desk; a desk card's **Ask AI** opens this), **Change all desks**,
  or **Start over** (replaces them all). Every change can be undone. It picks from the sites the
  workspaces already use (known to show inside the page) by id, which the page turns into
  addresses. Together the free plans allow about a thousand plans a day; past that the AI
  says so until the next day, and nothing is ever charged.
  **Copy a prompt** gives the same instructions to ChatGPT, Claude or Gemini instead.
- **Embeddable versions:** links to services that refuse to be shown inside a page but offer an
  official embed are shown through it (`src/ui/workspace/embedUrls.ts`): YouTube videos,
  playlists and channels, Vimeo, Google Docs, Sheets, Slides, Drive files and Maps, Spotify,
  Figma, X posts, Twitch, Reddit posts, SoundCloud, CodePen, Loom, TradingView symbols and
  OpenStreetMap views. The sheet says so on the site; "open in a new tab" opens the link as
  given. Sites still refusing are marked as blocked in the sheet and on the screens.
- Paste a table anywhere in the sheet (from a spreadsheet or an AI's answer; with a header row it
  replaces the sheet), open or download a CSV, or load a Google Sheet shared as "Anyone with the
  link". Whole-sheet changes can be undone.
- **Screens arranged by count:** a blank or **Auto** Screen leaves the screen to the sheet
  (`arrangeScreens` in `sheetPlan.ts`): one site goes on the main screen; two on the main and desk
  screens with the sides off; three with the main screen shared by two; four, one per screen;
  more share screens, the main one first. Sites with a chosen screen keep it, and Auto sites take
  the screens left free. The AI leaves screens blank, so its desks are arranged the same way.
- **Default height:** new desks (added here, from a pasted table or by the AI) start at the
  desk's default height; the AI never sets one.
- **Build the desks** turns it into the room: rows group into desks by name (a blank Desk
  continues the desk above), screens with a site are switched on and the others off, and a desk
  with no sites gets its theme's own. `?sheet=<Google Sheets link>` builds the room from the sheet
  for whoever opens the link.

The code is in `src/sheet/`: `sheetTable.ts` (CSV and pasted text), `sheetPlan.ts` (rows to desks
and back), `sheetEdit.ts` (desk-by-desk edits), `sheetSources.ts` (Google Sheets, the AI) and
`sheetStore.ts`.

## Desktop app

[`apps/configurator-desktop`](../configurator-desktop) bundles this configurator in a Windows app
that can show every website on the screens. The page knows it runs there through
`window.virtuosDesktop` (`src/desktop.ts`): sites are then never marked as blocked or swapped for
embed players (YouTube embed links are even turned back into youtube.com itself:
`nativeVersion` in `embedUrls.ts`), the AI may use any site, and shared links point to the public website. Develop
here as usual; `npm run dev` in the desktop folder shows this dev server in the app.

## Feedback

The **Feedback** button at the foot of the options panel sends a message (with an optional screenshot) to the feedback
Worker in [`services/feedback-worker`](../../services/feedback-worker), which files it as an issue
in the private `arthovis-org/virtuos-feedback` repository. Each report carries the exact page
link, the view the visitor was in, their device and browser, and recent page errors
(`src/feedback/errorLog.ts`). The Worker's address is `VITE_FEEDBACK_URL` in `.env`; without it
the button is hidden.

## Performance

- The viewer (Three.js is most of the bundle) loads lazily, so the panel renders first; the
  model download starts as soon as the viewer code arrives.
- The canvas renders on demand only: camera movement, a configuration change, or the height
  animation.
- Materials are cloned once per original material and shared by every mesh that used it.
- Model and image URLs are fingerprinted by Vite, so browsers can cache them long-term.

## Deployment

Every push to `main` builds the app and deploys it to GitHub Pages at
<https://arthovis-org.github.io/virtuos-projects/product-configurator/> through the
`.github/workflows/deploy-pages.yml` GitHub Actions workflow (build with
`--base=/ProductConfigurator/`, then `actions/deploy-pages`). The workflow can also be run by hand
from the repository's **Actions** tab via _Run workflow_. Product files are bundled from
`products/`, so whatever is committed there is what gets deployed.

## Known limitations

- Finish images are applied with the mesh's UV map as exported; there is no per-choice texture
  scale yet.
- Height is the only motion type (a linear move of tagged objects).

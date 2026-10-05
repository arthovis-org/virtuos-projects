# Architecture

The app is a thin pipeline from a product folder to pixels. Nothing in the UI or the viewer
knows about desks, legs or finishes; they only know about parts, option groups, motions and
Blender names.

```
 products/<id>/                scripts/vite-plugin-catalog.ts        src/catalog
  model.glb   ─ node names ─┐   (build time and dev server)           (browser)
  materials/  ─ images ─────┼─▶ convention.ts: names -> definition ─▶ zod validation ─▶ registry
  product.json ─ settings ──┘   emits `virtual:catalog` with                               │
                                asset URLs                                                  │
                                                                                            ▼
                                state/setupStore ─────────▶ state/derive ──▶ viewer/ProductModel
                                (the set-up: every desk's   (hidden nodes,     (visibility,
                                 setup, height, windows)     finishes, price)   finishes, height)
                                        │
                                        ▼
                                ui/ConfiguratorPanel (one control per group)
```

## Layers

**Catalog plugin (`scripts/`)**
`vite-plugin-catalog.ts` scans `products/` (or `CONFIGURATOR_PRODUCTS_DIR`). For each folder it
reads only the JSON part of the glTF (`catalog/gltf.ts`) to get node and material names; the
model's geometry and textures are never touched. `catalog/convention.ts` turns names, material
images and `product.json` into a product definition and collects problems as issues instead of
failing. The plugin serves the result as `virtual:catalog`: in a build, file references become
`?url` imports so Vite fingerprints and copies them; in development the plugin serves the files
itself under `@products/` and reloads the page when the folder changes. `npm run inspect` reuses
the same code.

**Catalog (`src/catalog`)**
`schema.ts` holds the zod schema and TypeScript types of a definition. `index.ts` validates every
product from the virtual module; a product that fails is left out and its problem reported, so
one broken folder never takes down the others. `catalogIssues` feeds the development-only setup
check in the panel.

**State (`src/state`)**
One source of truth, kept apart from how it is looked at:

- `setup.ts`: the **set-up** as plain data with pure functions. The product, the mode, the
  single desk and the room's desks, and the desk the visitor is at. Every desk (`DeskSetup`)
  holds its workspace, its own name, its selections (`groupId -> optionId`), where its motions
  (height) are set and the windows on its screens.
- `setupStore.ts`: the current set-up and every change to it; changes to "the current desk" go
  to the single desk or to the room desk the visitor is at. It starts from the page's link.
- `viewStore.ts`: how it is being looked at, never saved: sites on or off, seated or looking
  around, the screen zoomed to, window and desk drags, what the viewer reports about the screens.
- `motionStore.ts`: where each desk's height is right now while it animates (the viewer writes
  it every frame; the target is in the set-up), and the side view of the height control.
- `actions.ts`: what changes both (moving to a desk sits down at it, opening the room starts at
  the overview), as plain functions for event handlers.
- Converters, all pure functions of a set-up: `setupUrl.ts` (shareable links, kept in the
  address bar by `shareLink.ts`), `layouts/layoutData.ts` (saved layouts, a stored format that
  only grows optional fields; `src/test/fixtures/layout-v1.json` is one saved by an earlier
  version) and `sheet/sheetPlan.ts` (the command center sheet).

`derive.ts` turns selections into node-level instructions: which Blender objects to hide, which
finish each Blender material gets, and the price breakdown. `modelIssuesStore` collects names the
loaded model turned out to lack.

**Tests**
`npm test` runs the unit tests (`src/**/*.test.ts`, Vitest in a simulated page with the real
catalog): the set-up model, links, saved layouts (including the recorded fixture), the sheet and
the behaviour of the stores. `npm run test:e2e` runs the browser smoke test (`e2e/`,
Playwright) in an installed Chrome or Edge: the app loads and draws the desk, the room keeps
every desk's own setup, the sheet builds desks, and no page errors. CI runs both.

**Viewer (`src/viewer`)**
A lazily loaded chunk, so the panel renders while Three.js downloads. `models.ts` wraps
`useGLTF` and starts the download as soon as the chunk loads. `ProductModel` finds objects by
their original Blender name (three.js keeps it in `userData.name` even when it renames nodes),
applies visibility, and centres the model on its footprint once. `MaterialAppearance` re-finishes
one Blender material: each original material is cloned once and every mesh slot using it switches
to the clone, so meshes keep sharing materials. `motion.ts` animates the height: each tagged
object moves by its factor of the change, parented objects only by the difference to their
parent, and the camera is framed on the full range up front so it never refits mid-motion.

**Workspaces (`src/viewer/workspace`, `src/ui/workspace`)**
Live websites on the product's screens. The catalog lists screens (meshes using the `Screen`
material) and workspaces (windows with a URL and a screen). `screenFrame.ts` fits each display
surface: the plane from a least-squares fit of positions against UVs, the facing side from the
normals, and the top edge from the scene's up direction (or "away from the viewer" for a screen
lying almost flat), because UV layouts are often rotated. The sites live in a DOM layer under the transparent canvas
(`ScreenLayer`, one `ScreenSurface` per switched-on screen, sized at a fixed pixel density so
text is the same physical size on every screen). Each time the scene is drawn,
`cssProjection.ts` gives the layer the camera's perspective and every surface its screen's
world transform, like three's CSS3DRenderer but at 1000 CSS px per metre: browsers round 3D
layer positions to whole pixels, which at drei `<Html transform>`'s 1 px per metre put a screen
1.45 m up at 1 m. While the workspace is on, the screen meshes draw as transparent holes
that still write depth, so the sites show through them and the model hides them wherever it is
in front. The canvas lets the pointer through; the orbit controls listen on a surface under both
layers, so dragging a site's title bar never orbits.
`WorkspaceCamera` flies to a seated view (or one focused screen) and back, with the orbit
controls disabled meanwhile; `Scene` only refits `Bounds` on resize while the orbit camera is free. Window
drags start on a title bar and are followed on the whole window; the screen under the pointer
is found by raycasting the screen meshes, and `dropTarget.ts` turns the hit into a drop action
(side by side or swap) from the window layout on that screen. The windows belong to each desk in
the set-up; whether the sites are on and where the camera is are view state, and nothing loads
until a visitor turns the sites on.

**Unlimited desks**
A second mode: a room of desks, each a copy of the model (`deskModel` in `viewer/models.ts`,
cloned from an untouched copy taken before the configurator changes the loaded scene) with its
own selections, height and windows, all in the set-up; the panel edits the desk the visitor is
at. `ProductModel` lays the desks out on arcs facing one point (`deskLayout.ts`) and renders one
`DeskInstance` per desk; the single `WorkspaceLayer` follows the active desk (it is never
remounted, so the seated camera keeps its state while flying between desks). The other desks'
screens show posters (`DeskPosters` inside the canvas, `PosterSurface` in the screen layer): DOM
surfaces positioned by the same projection as the live sites, from a shared registry of frames
in `cssProjection`, but nothing loads. Back at the single desk, the room stays in the set-up for
coming back.

**Side view of the height (`viewer/HeightInset.tsx`)**
While the desk the visitor is at moves (or they are on the height control), a second camera
shows it from the side in a corner of the viewer. It draws into the same canvas: mounted only
while shown, it takes over the frame (main view, then the side view in a scissored corner) with
the other desks hidden and the screen holes made opaque, so the sites under the canvas don't
show through the inset. `HeightInsetFrame` (outside the canvas) decides when it shows and draws
its bezel and readout.

**UI (`src/ui`)**
`ConfiguratorPanel` shows motions first, then maps option groups to `OptionGroupControl`:
material -> `MaterialSwatches`, variant -> `SegmentedControl`, toggle -> `Switch`. Controls are
dumb: they receive items and a selected id and call back with an option id.

## Adding a naming convention

1. Recognise it in `parseTags` / `deriveProduct` (`scripts/catalog/convention.ts`) and emit parts
   and an option group (or motion).
2. If it needs a new option type: add a schema in `src/catalog/schema.ts`, handle it in
   `resolveConfiguration` (`src/state/derive.ts`) and in `OptionGroupControl`.
3. Document it in `products/README.md`.

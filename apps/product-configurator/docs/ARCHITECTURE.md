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
                                state/configuratorStore ──▶ state/derive ──▶ viewer/ProductModel
                                (product + selections,     (hidden nodes,     (visibility,
                                 URL sync)                  finishes, price)   finishes, height)
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
The configurator store keeps only `productId` and `selections` (`groupId -> optionId`),
initialised from the URL. `derive.ts` turns them into node-level instructions: which Blender
objects to hide, which finish each Blender material gets, and the price breakdown. Motions
(desk height) live in a separate store because they animate every frame and are not part of the
shared configuration. `modelIssuesStore` collects names the loaded model turned out to lack.

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
(side by side or swap) from the window layout on that screen. State lives in `src/state/workspaceStore.ts`, apart
from the configuration (never priced or shared), and nothing loads until a visitor enters
workspace mode.

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

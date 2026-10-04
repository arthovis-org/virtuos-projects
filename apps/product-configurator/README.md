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
products/<id>/             one folder per product (model.glb, product.json, materials/)
scripts/
  catalog/convention.ts    object names + product.json -> product definition
  catalog/gltf.ts          reads node and material names from a .glb/.gltf
  vite-plugin-catalog.ts   serves the catalog as `virtual:catalog`
  inspect.ts               `npm run inspect`
src/
  catalog/                 schema (zod) and registry of validated products
  state/                   configuration store, derived configuration, URL state, motions
  viewer/                  canvas, model loading, finishes, height motion
  ui/                      option panel, controls, header, price summary
docs/ARCHITECTURE.md       data flow in more detail
```

## Performance

- The viewer (Three.js is most of the bundle) loads lazily, so the panel renders first; the
  model download starts as soon as the viewer code arrives.
- The canvas renders on demand only: camera movement, a configuration change, or the height
  animation.
- Materials are cloned once per original material and shared by every mesh that used it.
- Model and image URLs are fingerprinted by Vite, so browsers can cache them long-term.

## Deployment

Every push to `main` builds the app and deploys it to GitHub Pages at
<https://arthovis-org.github.io/ProductConfigurator/> through the
`.github/workflows/deploy-pages.yml` GitHub Actions workflow (build with
`--base=/ProductConfigurator/`, then `actions/deploy-pages`). The workflow can also be run by hand
from the repository's **Actions** tab via _Run workflow_. Product files are bundled from
`products/`, so whatever is committed there is what gets deployed.

## Known limitations

- Finish images are applied with the mesh's UV map as exported; there is no per-choice texture
  scale yet.
- Height is the only motion type (a linear move of tagged objects).

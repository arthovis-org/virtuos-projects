/**
 * Builds the product catalog from the `products/` folder, one sub-folder per product:
 *
 *   products/<id>/model.glb        required (or model.gltf); used exactly as exported
 *   products/<id>/product.json     optional names, prices, defaults, height range
 *   products/<id>/materials/...    optional finish images
 *   products/<id>/workspaces/*.json optional workspaces (live websites on the screens)
 *
 * The catalog is served as the virtual module `virtual:catalog`. Model and image URLs
 * are emitted as asset imports, so Vite fingerprints them and resolves the deployment
 * base path. In development, any change under `products/` reloads the page.
 *
 * Set `CONFIGURATOR_PRODUCTS_DIR` to read products from another folder, for example to keep
 * large model files outside the repository. In development the plugin serves the folder's
 * files itself (under `@products/`), which also works for a folder on another drive.
 */
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { ASSET_PREFIX, deriveProduct, IMAGE_EXTENSIONS } from './catalog/convention.ts';
import { readGltfJson } from './catalog/gltf.ts';

const VIRTUAL_ID = 'virtual:catalog';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const MODEL_FILES = ['model.glb', 'model.gltf'];

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) =>
      entry.isDirectory()
        ? listFiles(join(dir, entry.name), base)
        : [relative(base, join(dir, entry.name)).split(sep).join('/')],
    ),
  );
  return nested.flat();
}

/** A texture set above this is heavy for a web page (the selected finish downloads in full). */
const HEAVY_SET_BYTES = 25 * 1024 * 1024;
const MB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

/** Warns about texture sets that would make the page slow to load. */
async function textureWeight(materialsDir: string, files: string[]) {
  const bySet = new Map<string, { total: number; largest: string; largestSize: number }>();
  for (const file of files) {
    const set = file.split('/').slice(0, -1).join('/') || file;
    const size = (await stat(join(materialsDir, file))).size;
    const entry = bySet.get(set) ?? { total: 0, largest: file, largestSize: 0 };
    entry.total += size;
    if (size > entry.largestSize) Object.assign(entry, { largest: file, largestSize: size });
    bySet.set(set, entry);
  }
  return [...bySet]
    .filter(([, entry]) => entry.total > HEAVY_SET_BYTES)
    .map(
      ([set, entry]) =>
        `materials/${set}: ${MB(entry.total)} of textures (largest ${entry.largest.split('/').pop() ?? ''}, ${MB(entry.largestSize)}); visitors download the selected set in full, so use 1K–2K JPG (a few MB per set)`,
    );
}

export async function loadCatalog(productsDir: string) {
  const products: unknown[] = [];
  const issues: Record<string, string[]> = {};
  const entries = (await exists(productsDir))
    ? await readdir(productsDir, { withFileTypes: true })
    : [];

  for (const entry of entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const id = entry.name;
    const dir = join(productsDir, id);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      issues[id] = [
        `folder name "${id}" must use lowercase letters, digits and dashes (it is the product id)`,
      ];
      continue;
    }
    let modelFile: string | undefined;
    for (const file of MODEL_FILES)
      if (!modelFile && (await exists(join(dir, file)))) modelFile = file;
    if (!modelFile) {
      issues[id] = ['no model.glb in the folder yet'];
      continue;
    }
    try {
      const configPath = join(dir, 'product.json');
      const materialFiles = (await listFiles(join(dir, 'materials'))).filter((file) =>
        IMAGE_EXTENSIONS.includes(extname(file).toLowerCase()),
      );
      const derived = deriveProduct({
        id,
        // Absolute file paths: Vite imports them wherever the folder lives.
        url: dir.split(sep).join('/'),
        modelFile,
        gltf: await readGltfJson(join(dir, modelFile)),
        configText: (await exists(configPath)) ? await readFile(configPath, 'utf8') : undefined,
        materialFiles,
        imageFiles: (await listFiles(join(dir, 'images'))).filter((file) =>
          IMAGE_EXTENSIONS.includes(extname(file).toLowerCase()),
        ),
        workspaceFiles: await Promise.all(
          (await listFiles(join(dir, 'workspaces')))
            .filter((file) => !file.includes('/') && extname(file).toLowerCase() === '.json')
            .map(async (name) => ({
              name,
              text: await readFile(join(dir, 'workspaces', name), 'utf8'),
            })),
        ),
      });
      derived.issues.push(...(await textureWeight(join(dir, 'materials'), materialFiles)));
      products.push(derived.definition);
      if (derived.issues.length > 0) issues[id] = derived.issues;
    } catch (error) {
      issues[id] = [`could not read ${modelFile}: ${(error as Error).message}`];
    }
  }
  return { products, issues };
}

/** Where the dev server serves product files, below the base URL. */
const DEV_ROUTE = '@products/';

const CONTENT_TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ktx2': 'image/ktx2',
};

/**
 * Emits the catalog as JavaScript. Asset markers become `?url` imports in a build (Vite
 * fingerprints and copies the files) or dev-route URLs when serving.
 */
function toModule(
  catalog: Awaited<ReturnType<typeof loadCatalog>>,
  productsDir: string,
  devBase: string | null,
) {
  const imports = new Map<string, string>();
  // JSON.stringify writes the marker's NUL character as the six characters `\u0000`.
  const marker = new RegExp(`"${ASSET_PREFIX.replace('\0', '\\\\u0000')}([^"]+)"`, 'g');
  const json = JSON.stringify(catalog.products, null, 2).replace(marker, (_, file: string) => {
    if (devBase !== null) {
      const path = relative(productsDir, file).split(sep).map(encodeURIComponent).join('/');
      return JSON.stringify(`${devBase}${DEV_ROUTE}${path}`);
    }
    let name = imports.get(file);
    if (!name) {
      name = `asset${imports.size}`;
      imports.set(file, name);
    }
    return name;
  });
  const lines = [...imports].map(
    ([file, name]) => `import ${name} from ${JSON.stringify(`${file}?url`)};`,
  );
  lines.push(`export const products = ${json};`);
  lines.push(`export const issues = ${JSON.stringify(catalog.issues, null, 2)};`);
  return lines.join('\n');
}

/** The products folder: `CONFIGURATOR_PRODUCTS_DIR`, else `products/` in the project. */
export function productsDirectory() {
  const root = resolve(import.meta.dirname, '..');
  return resolve(root, process.env.CONFIGURATOR_PRODUCTS_DIR ?? 'products');
}

export function catalog(): Plugin {
  const productsDir = productsDirectory();
  let devBase: string | null = null;

  return {
    name: 'catalog',
    configResolved(config) {
      devBase = config.command === 'serve' ? config.base : null;
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const result = await loadCatalog(productsDir);
      for (const [productId, problems] of Object.entries(result.issues)) {
        for (const problem of problems) this.warn(`${productId}: ${problem}`);
      }
      return toModule(result, productsDir, devBase);
    },
    configureServer(server) {
      const route = `${server.config.base}${DEV_ROUTE}`;
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith(route)) {
          next();
          return;
        }
        const file = resolve(productsDir, decodeURIComponent(url.slice(route.length)));
        const type = CONTENT_TYPES[extname(file).toLowerCase()];
        // Only known asset types, and only inside the products folder.
        if (!type || !file.startsWith(productsDir + sep)) {
          next();
          return;
        }
        stat(file).then(
          (info) => {
            res.setHeader('Content-Type', type);
            res.setHeader('Content-Length', info.size);
            res.setHeader('Cache-Control', 'no-cache');
            createReadStream(file).pipe(res);
          },
          () => {
            next();
          },
        );
      });

      server.watcher.add(productsDir);
      const onChange = (file: string) => {
        if (!resolve(file).startsWith(productsDir + sep)) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      for (const event of ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const) {
        server.watcher.on(event, onChange);
      }
    },
  };
}

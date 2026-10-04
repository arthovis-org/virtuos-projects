/**
 * Shows what the configurator makes of a product folder: the object tree with the tags
 * it recognised, the resulting options, and anything that needs fixing.
 *
 *   npm run inspect -- smart-desk
 */
import { join } from 'node:path';
import { humanize, parseTags } from './catalog/convention.ts';
import { readGltfJson, type GltfJson } from './catalog/gltf.ts';
import { loadCatalog, productsDirectory } from './vite-plugin-catalog.ts';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run inspect -- <product-id>');
  process.exit(1);
}

const productsDir = productsDirectory();

function tagLabel(name: string) {
  const tags = parseTags(name);
  const labels: string[] = [];
  if (tags.lift !== undefined) labels.push(`height ${Math.round(tags.lift * 100)} %`);
  if (tags.toggle) labels.push(`toggle "${humanize(tags.toggle)}"`);
  if (tags.variant)
    labels.push(`"${humanize(tags.variant.group)}" → ${humanize(tags.variant.choice)}`);
  return labels.length ? `  ← ${labels.join(', ')}` : '';
}

function printTree(gltf: GltfJson) {
  const nodes = gltf.nodes ?? [];
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? [];
  const walk = (index: number, prefix: string, last: boolean, depth: number) => {
    const node = nodes[index];
    if (!node) return;
    const materials =
      node.mesh === undefined
        ? []
        : [
            ...new Set(
              (gltf.meshes?.[node.mesh]?.primitives ?? []).map(
                (p) => gltf.materials?.[p.material ?? -1]?.name ?? '(none)',
              ),
            ),
          ];
    const detail = materials.length ? `  [${materials.join(', ')}]` : '';
    console.log(
      `${prefix}${depth ? (last ? '└─ ' : '├─ ') : ''}${node.name ?? '(unnamed)'}${detail}${tagLabel(node.name ?? '')}`,
    );
    const children = node.children ?? [];
    children.forEach((child, i) =>
      walk(
        child,
        depth ? prefix + (last ? '   ' : '│  ') : '',
        i === children.length - 1,
        depth + 1,
      ),
    );
  };
  roots.forEach((root, i) => walk(root, '', i === roots.length - 1, 0));
}

const { products, issues } = await loadCatalog(productsDir);
const product = products.find((p) => (p as { id: string }).id === id) as
  | {
      name: string;
      optionGroups: { type: string; label: string; options: { label: string }[] }[];
      motions: { label: string; min: number; max: number; unit: string }[];
      screens: { id: string; node: string; label: string }[];
      workspaces: {
        label: string;
        windows: { title: string; url: string; screen: string }[];
      }[];
    }
  | undefined;

if (!product && !issues[id]) {
  console.error(`No folder products/${id}/.`);
  process.exit(1);
}

if (product) {
  const modelPath = ['model.glb', 'model.gltf'].map((file) => join(productsDir, id, file));
  const gltf = await readGltfJson(modelPath[0] ?? '').catch(() => readGltfJson(modelPath[1] ?? ''));
  console.log(`products/${id}: ${product.name}\n`);
  printTree(gltf);

  console.log('\nConfigurator');
  for (const motion of product.motions) {
    console.log(`  ${motion.label}: ${motion.min}–${motion.max} ${motion.unit} (live demo)`);
  }
  for (const group of product.optionGroups) {
    console.log(
      `  ${group.label} (${group.type}): ${group.options.map((o) => o.label).join(' / ')}`,
    );
  }

  if (product.screens.length > 0) {
    console.log('\nScreens');
    for (const screen of product.screens) console.log(`  ${screen.label}: ${screen.node}`);
  }
  for (const workspace of product.workspaces) {
    console.log(`\nWorkspace "${workspace.label}"`);
    for (const window of workspace.windows) {
      const screen = product.screens.find((s) => s.id === window.screen);
      console.log(`  ${window.title} on ${screen?.label ?? window.screen}: ${window.url}`);
    }
  }
}

const problems = issues[id] ?? [];
console.log(
  problems.length
    ? `\nTo fix\n${problems.map((p) => `  • ${p}`).join('\n')}`
    : '\nNo problems found.',
);

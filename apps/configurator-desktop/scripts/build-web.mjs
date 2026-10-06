// Builds the website (apps/product-configurator) into web/, the copy the app bundles. Served
// from the app's own origin (app://configurator/), so the base path is the root.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', '..', 'product-configurator');
const out = join(here, '..', 'web');

const result = spawnSync(
  'npm',
  ['run', 'build', '--', '--base=/', `--outDir=${out}`, '--emptyOutDir'],
  { cwd: site, stdio: 'inherit', shell: true },
);
process.exit(result.status ?? 1);

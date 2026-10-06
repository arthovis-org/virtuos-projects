// Development: the website's dev server (live reload) in the app's window. Starts the dev
// server unless one is already running on its port, waits for it, then opens Electron.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', '..', 'product-configurator');
const url = process.env.VIRTUOS_DEV_URL ?? 'http://localhost:5173/';
const electron = createRequire(import.meta.url)('electron');

const reachable = async () => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};

let server = null;
if (!(await reachable())) {
  server = spawn('npm', ['run', 'dev'], { cwd: site, stdio: 'inherit', shell: true });
  for (let i = 0; i < 120 && !(await reachable()); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

const app = spawn(electron, [join(here, '..')], {
  stdio: 'inherit',
  env: { ...process.env, VIRTUOS_DEV_URL: url },
});
app.on('exit', (code) => {
  server?.kill();
  process.exit(code ?? 0);
});

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { catalog } from './scripts/vite-plugin-catalog.ts';

/** The commit being built, short, shown next to the version. '' when git can't tell. */
function buildId(): string {
  const fromCi = process.env.GITHUB_SHA?.slice(0, 7);
  if (fromCi) return fromCi;
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

/**
 * The version, shared with the desktop app: its package.json holds it (installed apps update
 * by it), and the website shows the same number.
 */
const version = (
  JSON.parse(
    readFileSync(new URL('../configurator-desktop/package.json', import.meta.url), 'utf8'),
  ) as { version: string }
).version;

export default defineConfig({
  // `catalog` turns every products/<id>/ folder into a configurator (virtual:catalog).
  plugins: [react(), catalog()],
  define: { __VERSION__: JSON.stringify(version), __BUILD__: JSON.stringify(buildId()) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // The three/drei chunk is ~1.2 MB minified by nature; warn only if it grows past that.
    chunkSizeWarningLimit: 1400,
    // Three.js is large and changes rarely; keep it in its own long-lived chunk.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/](three|@react-three)[\\/]/ }],
        },
      },
    },
  },
});

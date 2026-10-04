import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { catalog } from './scripts/vite-plugin-catalog.ts';

export default defineConfig({
  // `catalog` turns every products/<id>/ folder into a configurator (virtual:catalog).
  plugins: [react(), catalog()],
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

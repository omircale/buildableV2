/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // model-viewer ships its own bundled three and asks for an older version than the app uses.
    // Without pinning one copy, the dev optimizer re-scans and invalidates already-loaded chunks,
    // which showed up as "Failed to fetch dynamically imported module" on the GLTF exporter.
    dedupe: ['three'],
  },
  optimizeDeps: {
    // Pre-bundle the exporters that are imported lazily, so a first AR export does not trigger a
    // re-optimisation in the middle of the session.
    include: ['three/examples/jsm/exporters/GLTFExporter.js', 'three/examples/jsm/exporters/USDZExporter.js'],
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    setupFiles: ['src/test-setup.ts'],
  },
});

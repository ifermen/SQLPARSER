import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Últimas dos versiones de Chrome, Firefox, Safari y Edge (ES2020+).
    target: 'es2020',
  },
  worker: {
    // El pipeline de core/ podrá ejecutarse en un Web Worker como módulo ES.
    format: 'es',
  },
  test: {
    // Entorno Node por defecto: core/ debe ser TS puro, sin DOM.
    // Los tests de UI activan jsdom con el docblock `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    passWithNoTests: true,
    restoreMocks: true,
  },
});

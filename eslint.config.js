import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// ---------------------------------------------------------------------------
// Reglas de arquitectura (ver AGENTS.md → "Reglas de dependencia").
// ESLint no fusiona las opciones de una misma regla entre bloques: cada bloque
// debe declarar la lista completa de restricciones que le aplica.
// ---------------------------------------------------------------------------

const layer = (name) => ({
  group: [`**/${name}`, `**/${name}/**`],
  message: `Import prohibido por las reglas de dependencia de AGENTS.md (${name}).`,
});

const SQL_LIB = {
  group: ['@khanakia/*'],
  message: 'La librería de parseo solo puede importarse desde src/core/parser/.',
};

const REACT = {
  group: ['react', 'react/**', 'react-dom', 'react-dom/**'],
  message: 'Esta capa debe ser TypeScript puro, sin React.',
};

const restrictImports = (...patterns) => ['error', { patterns: [SQL_LIB, ...patterns] }];

// Privacidad: ninguna llamada de red en tiempo de ejecución.
const NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
  name,
  message: 'Prohibido: el script SQL nunca sale del equipo del usuario (AGENTS.md → Privacidad).',
}));

// core/ debe poder ejecutarse en un Web Worker: sin DOM ni APIs de navegador.
const DOM_GLOBALS = ['window', 'document', 'navigator', 'localStorage', 'sessionStorage'].map(
  (name) => ({ name, message: 'core/ debe ser TypeScript puro, sin DOM ni APIs de navegador.' }),
);

export default defineConfig([
  globalIgnores(['dist', 'coverage']),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Configuración de herramientas (Node).
  {
    files: ['*.config.{js,ts}', 'vitest.setup.ts'],
    languageOptions: { globals: globals.node },
  },

  // Privacidad en todo src/.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', ...NETWORK_GLOBALS],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: 'Prohibido: sin telemetría.' },
      ],
      'no-restricted-imports': restrictImports(),
    },
  },

  // components ► utils, types
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictImports(
        layer('core'),
        layer('features'),
        layer('hooks'),
        layer('context'),
      ),
    },
  },

  // hooks ► core, utils, types
  {
    files: ['src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictImports(
        layer('components'),
        layer('features'),
        layer('context'),
      ),
    },
  },

  // utils ► types
  {
    files: ['src/utils/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictImports(
        REACT,
        layer('core'),
        layer('components'),
        layer('features'),
        layer('hooks'),
        layer('context'),
      ),
    },
  },

  // core/* ► core/model, utils, types
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...NETWORK_GLOBALS, ...DOM_GLOBALS],
      'no-restricted-imports': restrictImports(
        REACT,
        layer('components'),
        layer('features'),
        layer('hooks'),
        layer('context'),
      ),
    },
  },

  // core/parser: único punto de entrada de la librería de parseo.
  // Se permite `any` en el adaptador, siempre con comentario que lo justifique.
  {
    files: ['src/core/parser/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            REACT,
            layer('components'),
            layer('features'),
            layer('hooks'),
            layer('context'),
            layer('inference'),
            layer('generators'),
          ],
        },
      ],
    },
  },

  // core/model no depende de ningún otro módulo de core.
  {
    files: ['src/core/model/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictImports(
        REACT,
        layer('components'),
        layer('features'),
        layer('hooks'),
        layer('context'),
        layer('parser'),
        layer('inference'),
        layer('generators'),
      ),
    },
  },

  // core/inference no conoce ni el parser ni los generadores.
  {
    files: ['src/core/inference/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictImports(
        REACT,
        layer('components'),
        layer('features'),
        layer('hooks'),
        layer('context'),
        layer('parser'),
        layer('generators'),
      ),
    },
  },

  // core/generators solo consume el modelo enriquecido.
  {
    files: ['src/core/generators/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictImports(
        REACT,
        layer('components'),
        layer('features'),
        layer('hooks'),
        layer('context'),
        layer('parser'),
        layer('inference'),
      ),
    },
  },

  // Los tests pueden usar APIs de navegador (jsdom) sin restricciones de privacidad.
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },
]);

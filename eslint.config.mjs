import { defineConfig } from 'eslint/config';
import grafanaI18nPlugin from '@grafana/i18n/eslint-plugin';
import baseConfig from './.config/eslint.config.mjs';

export default defineConfig([
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/coverage/',
      '**/artifacts/',
      'test-results/',
      'playwright-report/',
      '**/.eslintcache',
    ],
  },
  ...baseConfig,
  {
    plugins: {
      '@grafana/i18n': grafanaI18nPlugin,
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
    },
  },
]);

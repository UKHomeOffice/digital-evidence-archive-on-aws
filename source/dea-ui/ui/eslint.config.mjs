import path from 'node:path';
import { fileURLToPath } from 'node:url';
import globals from 'globals';
import nextPlugin from '@next/eslint-plugin-next';
import importPlugin from 'eslint-plugin-import';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import securityPlugin from 'eslint-plugin-security';
import testingLibraryPlugin from 'eslint-plugin-testing-library';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testingLibraryFlatReact = testingLibraryPlugin.configs['flat/react'];

const config = [
  {
    ignores: [
      'babel.config.js',
      'jest.config.js',
      'jest.setup.js',
      'next.config.js',
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'next-i18next.config.js',
      'temp/**',
      'out/**',
      'component-mock.js',
      'cypress.config.ts',
      'cypress/**',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
        ...globals.jest,
        React: 'readonly',
        JSX: 'readonly',
      },
    },
    plugins: {
      '@next/next': nextPlugin,
      '@typescript-eslint': tsEslintPlugin,
      import: importPlugin,
      'react-hooks': reactHooksPlugin,
      security: securityPlugin,
      'testing-library': testingLibraryPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      '@typescript-eslint/consistent-type-assertions': [
        'warn',
        {
          assertionStyle: 'never',
        },
      ],
      'import/no-unresolved': ['off'],
      'import/named': ['off'],
      'import/order': [
        'error',
        {
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          groups: ['builtin', 'external', 'parent', 'sibling'],
        },
      ],
      'import/newline-after-import': ['error'],
      curly: ['error'],
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
    rules: {
      ...testingLibraryFlatReact.rules,
      'testing-library/render-result-naming-convention': 'off',
      'testing-library/no-manual-cleanup': 'off',
      'testing-library/await-async-queries': 'off',
      'testing-library/await-async-utils': 'off',
      'testing-library/no-await-sync-queries': 'off',
      'testing-library/prefer-find-by': 'off',
      'testing-library/no-container': 'off',
      'testing-library/no-node-access': 'off',
      'testing-library/prefer-presence-queries': 'off',
      'testing-library/prefer-screen-queries': 'off',
      'testing-library/no-unnecessary-act': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react/no-children-prop': 'off',
      'import/order': 'off',
      'import/newline-after-import': 'off',
      curly: 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/await-thenable': 'off',
    },
  },
];

export default config;

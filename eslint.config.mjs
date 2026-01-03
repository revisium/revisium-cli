// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'src/__generated__/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  sonarjs.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
    },
  },
  {
    files: ['**/__tests__/**/*.ts', '**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    rules: {
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
      'sonarjs/no-misleading-array-reverse': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['e2e/**/*.ts'],
    rules: {
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/no-os-command-from-path': 'off',
      'sonarjs/os-command': 'off',
      'sonarjs/pseudo-random': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
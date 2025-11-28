import eslint from '@eslint/js';
import eslintImport from 'eslint-plugin-import';
import eslintConfigPrettier from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tsEslint from 'typescript-eslint';

export default [
  eslint.configs.recommended,
  ...tsEslint.configs.recommendedTypeChecked,
  eslintConfigPrettier,
  eslintImport.flatConfigs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2018,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
      },
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-member-accessibility': 'error',
      '@typescript-eslint/member-ordering': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          custom: {
            match: true,
            regex: '^I[A-Z]',
          },
          format: ['PascalCase'],
          selector: ['interface'],
        },
        {
          format: ['camelCase'],
          modifiers: ['static'],
          selector: ['method'],
        },
        {
          format: ['UPPER_CASE'],
          modifiers: ['static', 'readonly'],
          selector: ['variable'],
        },
      ],
      'import/extensions': ['error', 'ignorePackages'],
      'import/no-unresolved': 'off',
      'import/order': [
        'error',
        {
          alphabetize: { caseInsensitive: true, order: 'asc' },
          groups: ['builtin', 'external', 'internal'],
          'newlines-between': 'always',
        },
      ],
      'require-await': 'error',
      'sort-keys': ['error', 'asc', { minKeys: 2, natural: true }],
    },
  },
];

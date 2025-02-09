import eslintPluginPrettier from "eslint-plugin-prettier"; // Import the plugins
import eslintPluginUnusedImports from "eslint-plugin-unused-imports"
import typescriptEslintPlugin from "@typescript-eslint/eslint-plugin"
import js from '@eslint/js'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import eslintConfigPrettier from 'eslint-config-prettier'
import typescriptParser from '@typescript-eslint/parser'
import tseslint from 'typescript-eslint'
import eslintPluginImports from 'eslint-plugin-import'
import eslintPluginPaths from 'eslint-plugin-paths'


const config = tseslint.config([
  
  {
    files: ['src/**/*.ts', 'src/**/*.mts', 'tests/**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      eslintPluginPrettierRecommended,
      eslintConfigPrettier,
    ],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        project: './tsconfig.json',
        sourceType: 'module',
      },
    },
    plugins: {
      paths: eslintPluginPaths,
      prettier: eslintPluginPrettier,
      "unused-imports": eslintPluginUnusedImports,
      "@typescript-eslint": typescriptEslintPlugin,
      'import': eslintPluginImports,
    },
    rules: {
      "paths/alias": "error",
      "object-curly-spacing": "off",
      "import/no-relative-parent-imports": "error",
      "import/order": "off",
      "prettier/prettier": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_",
          "destructuredArrayIgnorePattern": "^_",
        }
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "args": "all",
          "argsIgnorePattern": "^_",
          "caughtErrors": "all",
          "caughtErrorsIgnorePattern": "^_",
          "destructuredArrayIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "ignoreRestSiblings": true
        }
      ]
    },
  },
])
export default config

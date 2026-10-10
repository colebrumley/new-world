import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// C3: the engine (and the AI that drives it) is pure. No UI/app imports, no DOM, no ambient
// time or randomness. test/unit/boundaries.test.ts asserts these rules stay in place.
export const PURE_GLOBS = ['src/engine/**/*.ts', 'src/ai/**/*.ts'];
export const PURE_FORBIDDEN_IMPORTS = ['**/ui/**', '**/app/**', '**/ui', '**/app'];
export const PURE_FORBIDDEN_GLOBALS = ['window', 'document', 'fetch', 'localStorage', 'navigator'];

export default tseslint.config(
  { ignores: ['.claude', 'dist', 'node_modules', 'ref', 'test-results', 'playwright-report', 'test/fixtures/lint'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: PURE_GLOBS,
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: PURE_FORBIDDEN_IMPORTS, message: 'C3: engine/ai must not import from ui or app.' }] }],
      'no-restricted-globals': ['error', ...PURE_FORBIDDEN_GLOBALS.map((name) => ({ name, message: 'C3: engine/ai must not touch the DOM or network.' }))],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'C3: use the seeded RNG.' },
        { object: 'Date', property: 'now', message: 'C3: engine must be deterministic.' },
      ],
      'no-restricted-syntax': ['error', { selector: "NewExpression[callee.name='Date']", message: 'C3: engine must be deterministic.' }],
    },
  },
);

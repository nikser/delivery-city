import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.config.*'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Turns off any ESLint rule that would conflict with Prettier's own
  // formatting output — formatting is Prettier's job (see `npm run
  // format:check`), not ESLint's, so the two tools never fight.
  eslintConfigPrettier,
  {
    rules: {
      // Pre-existing code already has unused vars in a few places; warn
      // rather than error so this doesn't become a second, unplanned
      // "fix all the game logic" task — tighten to 'error' once the
      // backlog is cleared.
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      // OrderManager.ts uses `do { ... } while (true)` with a `break`
      // inside as an intentional retry-until-valid loop — a legitimate,
      // common pattern the default rule flags as a false positive.
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
);

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    // Register plugins as objects (ESLint 10 flat-config requirement) and pull
    // in the react-hooks recommended rules directly, since the plugin's own
    // config object still ships `plugins` as an array.
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // React-Compiler rule: forbids setState inside effects. We intentionally
      // fetch initial data in effects and setState with the result (a pattern
      // React's docs bless for data loading), so this one is off. The essential
      // rules-of-hooks / exhaustive-deps / purity checks stay on.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  // Turn off ESLint formatting rules that would fight Prettier. Keep last.
  prettier,
)

// eslint.config.js
import antfu from '@antfu/eslint-config'

export default antfu({
  // Type of the project. 'lib' for libraries, the default is 'app'
  type: 'lib',

  // `.eslintignore` is no longer supported in Flat config, use `ignores` instead
  // The `ignores` option in the option (first argument) is specifically treated to always be global ignores
  // And will **extend** the config's default ignores, not override them
  // You can also pass a function to modify the default ignores
  ignores: [
    '**/fixtures',
    // Plasmo-generated entrypoints. Ignored by the app's own .gitignore, but that
    // only applies when eslint runs with the app as cwd — this makes the root
    // `pnpm lint` work too.
    '**/.plasmo/**',
    // ...globs
  ],

  // Parse the `.gitignore` file to get the ignores, on by default
  gitignore: true,

  // Or customize the stylistic rules
  stylistic: {
    indent: 2, // 4, or 'tab'
    quotes: 'single', // or 'double'
  },

  // TypeScript and Vue are autodetected, you can also explicitly enable them:
  typescript: true,
  vue: true,

  // Disable jsonc and yaml support
  jsonc: false,
  yaml: false,
}, {
  files: ['apps/smart-favorite/**/*.{ts,tsx}'],
  name: 'smart-favorite/browser',
  rules: {
    // Plasmo statically replaces process.env.PLASMO_PUBLIC_* at build time; there
    // is no `node:process` to import in a browser bundle.
    // `node/prefer-global/buffer` is deliberately left on: it is what keeps the
    // base64url helpers from regressing to Buffer, which does not exist here.
    'node/prefer-global/process': 'off',
  },
})

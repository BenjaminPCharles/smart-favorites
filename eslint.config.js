import antfu from '@antfu/eslint-config'

export default antfu({
  // Type of the project. 'lib' for libraries, the default is 'app'
  type: 'lib',

  // `.eslintignore` is gone in flat config, this extends the defaults rather than
  // overriding them
  ignores: [
    '**/fixtures',
    // Plasmo-generated entrypoints. The app's own .gitignore covers them, but only
    // when eslint runs with the app as cwd, so this is for the root `pnpm lint`.
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
    // Plasmo replaces process.env.PLASMO_PUBLIC_* at build time, no `node:process`
    // to import in a browser bundle. Leaving prefer-global/buffer on though, it's
    // what stops the base64url helpers drifting back to Buffer.
    'node/prefer-global/process': 'off',
  },
})

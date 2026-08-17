import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Mirrors tsconfig `paths: { "~*": ["./*"] }`, vitest doesn't read tsconfig.
    // Regex form and not the object shorthand, the shorthand isn't applied to a
    // bare-looking specifier like `~helpers/…`.
    alias: [{ find: /^~/, replacement: fileURLToPath(new URL('./', import.meta.url)) }],
  },
  test: {
    // Node 20+ has WebCrypto, btoa/atob and TextEncoder as globals. jsdom would buy
    // a slower boot and still no indexedDB, the one thing actually missing.
    environment: 'node',
    include: ['**/*.test.ts'],
  },
})

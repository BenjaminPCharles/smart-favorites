import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Mirrors tsconfig `paths: { "~*": ["./*"] }` — vitest does not read tsconfig.
    // Regex form, not the object shorthand: the shorthand is not applied to a
    // bare-looking specifier like `~helpers/…`.
    alias: [{ find: /^~/, replacement: fileURLToPath(new URL('./', import.meta.url)) }],
  },
  test: {
    // Node 20+ ships full WebCrypto, btoa/atob and TextEncoder as globals, and
    // every module under test is either pure or WebCrypto. jsdom would cost a
    // slower boot for nothing — and still not provide indexedDB, the one thing
    // actually missing (see device-key-store.helper.ts).
    environment: 'node',
    include: ['**/*.test.ts'],
  },
})

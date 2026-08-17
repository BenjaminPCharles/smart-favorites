import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Tests live next to the code so `test:ts` (which only globs src/**)
    // typechecks them too
    include: ['src/**/*.test.ts'],
  },
})

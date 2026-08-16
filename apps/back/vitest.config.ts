import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Colocated with the code, so the existing `test:ts` (which only includes
    // src/**) typechecks the tests too
    include: ['src/**/*.test.ts'],
  },
})

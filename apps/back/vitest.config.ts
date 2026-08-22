import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      // Pure unit tests, unchanged: parallel across files, no external dependency.
      {
        test: {
          name: 'unit',
          environment: 'node',
          // Tests live next to the code so `test:ts` (which only globs src/**) types them too
          include: ['src/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'src/**/*.db.test.ts'],
        },
      },

      // Tests that talk to PostgreSQL. Still under src/**, so `test:ts` types them as well.
      {
        test: {
          name: 'db',
          environment: 'node',
          include: ['src/**/*.db.test.ts'],
          globalSetup: ['./src/test/db.global-setup.ts'],
          // One file at a time: they share a database and empty it, so parallel files collide.
          poolOptions: {
            forks: { singleFork: true },
          },
        },
      },
    ],
  },
})

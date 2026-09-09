import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'src/**/*.db.test.ts'],
        },
      },

      {
        test: {
          name: 'db',
          environment: 'node',
          include: ['src/**/*.db.test.ts'],
          globalSetup: ['./src/test/db.global-setup.ts'],
          poolOptions: {
            forks: { singleFork: true },
          },
        },
      },
    ],
  },
})

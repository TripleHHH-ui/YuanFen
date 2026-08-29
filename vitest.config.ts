import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'packages/shared/src/**/*.{test,spec}.ts',
      'apps/api/src/**/*.{test,spec}.ts',
    ],
  },
})

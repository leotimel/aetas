import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // tests live at packages/game-engine/*.test.ts (siblings of src/)
    include: ['*.test.ts', 'src/**/*.test.ts'],
  },
})

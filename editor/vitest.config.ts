import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
  },
  // Мок-адаптеры в тестах всегда включены: сид подгружается динамическим импортом.
  define: { __EDITOR_MOCK__: 'true' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})

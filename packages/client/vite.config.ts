import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset URLs: production is served under imnixer.net/delivery-city/.
  base: './',
  server: { port: 5173 },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1600 },
})

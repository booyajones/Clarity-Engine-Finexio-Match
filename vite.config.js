const { defineConfig } = require('vite')
const path = require('path')

module.exports = defineConfig({
  plugins: [],
  root: './client',
  build: {
    outDir: '../server/public',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './client/src'),
      '@assets': path.resolve(process.cwd(), './attached_assets'),
      '@/components': path.resolve(process.cwd(), './client/src/components'),
      '@/hooks': path.resolve(process.cwd(), './client/src/hooks'),
      '@/lib': path.resolve(process.cwd(), './client/src/lib'),
      '@shared': path.resolve(process.cwd(), './shared')
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0'
  }
})
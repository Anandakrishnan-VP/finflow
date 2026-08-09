import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react-force-graph-2d', 'react-force-graph-3d', 'three', 'd3-selection', 'd3-transition', 'd3-zoom', 'd3-force']
  },
  server: {
    port: 3000,
    proxy: {
      '/api':  { target: 'http://localhost:8000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/auth': { target: 'http://localhost:8000', changeOrigin: true },
      '/ws':   { target: 'ws://localhost:8000',   changeOrigin: true, ws: true }
    }
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: {
      plugins: [
        require('@tailwindcss/postcss'),
        require('autoprefixer'),
      ],
    },
  },
  build: {
    outDir: 'build',
    assetsDir: 'static',
  },
  server: {
    port: 3000,
    open: true,
  },
})

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { fs: { allow: ['..'] }, proxy: { '/api': 'http://localhost:3001' } },
})
